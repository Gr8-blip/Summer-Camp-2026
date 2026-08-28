"""
Verifier for `project_submission` questions.

Two entry points:
  - safe_extract_zip(uploaded_file) -> (tmp_dir, [relative_paths])
  - run_checks(content, zip_dir=None, zip_files=None, url=None) -> (results, fraction)

`run_checks` is the only thing callers outside this module should need.
Everything else (zip safety, HTML/CSS parsing, SSRF guard, browser
rendering, individual check handlers) is an implementation detail behind
CHECK_HANDLERS, kept modular so new check types are a one-function,
one-registry-entry addition.

Supported check types:
  url_status, file_exists, same_directory, text_exists, element_exists,
  element_text, element_attribute, css_property, computed_style,
  css_variable.

Scoring model: each check returns a SCORE in [0.0, 1.0], not just a
pass/fail bool. Foundational checks (a file either exists or it doesn't)
stay all-or-nothing. Checks that depend on something loading first
(text_exists, element_exists, element_text, element_attribute,
css_property, computed_style, css_variable) award PARTIAL_CREDIT when the
page/file loaded but the specific thing being checked wasn't there or
didn't match — reaching the resource at all is real progress, so one
small miss doesn't wipe the whole check to zero.

All messages returned to students are written in plain, kid-friendly
language — no "archive", "target", "element", etc.
"""
import ipaddress
import os
import posixpath
import re
import socket
import tempfile
import zipfile
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

# ── ZIP safety limits ───────────────────────────────────────────────────
MAX_ZIP_MEMBERS = 500
MAX_UNCOMPRESSED_TOTAL_BYTES = 25 * 1024 * 1024       # 25 MB extracted
MAX_UNCOMPRESSED_FILE_BYTES = 10 * 1024 * 1024        # 10 MB per file
MAX_COMPRESSION_RATIO = 100                            # zip-bomb guard

# ── URL fetch limits ────────────────────────────────────────────────────
URL_FETCH_TIMEOUT = 8
URL_MAX_RESPONSE_BYTES = 5 * 1024 * 1024

# Partial credit awarded when a page/file loaded successfully but the
# specific thing being checked for wasn't found/matching in it.
PARTIAL_CREDIT = 0.5


class VerifierError(Exception):
    """Raised for input problems (bad zip, unreachable url) — caller turns
    this into a 400, not a 500. Messages here are shown directly to
    students, so keep them plain and friendly."""


# ─────────────────────────────────────────────────────────────────────────
# ZIP extraction — temp storage, path-traversal / zip-bomb / oversize guards
# ─────────────────────────────────────────────────────────────────────────

def _is_safe_member_path(name):
    if not name or name.startswith("/") or name.startswith("\\"):
        return False
    normalized = posixpath.normpath(name.replace("\\", "/"))
    if normalized.startswith("..") or normalized.startswith("/"):
        return False
    # Windows drive letters, e.g. "C:/..."
    if len(normalized) >= 2 and normalized[1] == ":":
        return False
    return True


def safe_extract_zip(uploaded_file):
    """
    Extracts `uploaded_file` (a Django UploadedFile) into a fresh temp
    directory. Returns (tmp_dir_path, [relative_file_paths]).

    Caller is responsible for cleaning up tmp_dir (shutil.rmtree) once
    done — the check view does this in a try/finally.

    Guards against:
      - path traversal / absolute paths / symlink members
      - too many members
      - oversized members / oversized total (zip bombs)
      - suspicious compression ratios (zip bombs)
    """
    tmp_dir = tempfile.mkdtemp(prefix="proj_submission_")
    try:
        with zipfile.ZipFile(uploaded_file) as zf:
            infolist = zf.infolist()
            if len(infolist) > MAX_ZIP_MEMBERS:
                raise VerifierError(f"Your zip file has too many files inside it (max {MAX_ZIP_MEMBERS}).")

            total_uncompressed = 0
            extracted_paths = []

            for info in infolist:
                # Directory entries just get created, not size-checked.
                if info.is_dir():
                    continue

                if not _is_safe_member_path(info.filename):
                    raise VerifierError("That zip file has something in it we can't accept — try zipping just your project files.")

                # Reject symlinks (unix mode bits stashed in external_attr).
                mode = (info.external_attr >> 16) & 0xFFFF
                is_symlink = bool(mode) and zipfile.stat.S_ISLNK(mode)
                if is_symlink:
                    raise VerifierError("That zip file has something in it we can't accept — try zipping just your project files.")

                if info.file_size > MAX_UNCOMPRESSED_FILE_BYTES:
                    raise VerifierError(f"'{info.filename}' is too big to check.")

                if info.compress_size > 0:
                    ratio = info.file_size / max(info.compress_size, 1)
                    if ratio > MAX_COMPRESSION_RATIO:
                        raise VerifierError("That zip file couldn't be opened safely — try zipping just your project files.")

                total_uncompressed += info.file_size
                if total_uncompressed > MAX_UNCOMPRESSED_TOTAL_BYTES:
                    raise VerifierError("Your zip file is too big once unpacked. Try removing extra files (like images or videos) and zip again.")

                dest_path = os.path.normpath(os.path.join(tmp_dir, info.filename))
                if not dest_path.startswith(os.path.abspath(tmp_dir) + os.sep):
                    raise VerifierError("That zip file has something in it we can't accept — try zipping just your project files.")

                os.makedirs(os.path.dirname(dest_path), exist_ok=True)
                with zf.open(info) as src, open(dest_path, "wb") as dst:
                    # Read in chunks so a single-member bomb can't blow
                    # memory even if it slipped past the ratio check.
                    remaining = MAX_UNCOMPRESSED_FILE_BYTES
                    while True:
                        chunk = src.read(65536)
                        if not chunk:
                            break
                        remaining -= len(chunk)
                        if remaining < 0:
                            raise VerifierError(f"'{info.filename}' is too big to check.")
                        dst.write(chunk)

                extracted_paths.append(info.filename.replace("\\", "/"))

            return tmp_dir, extracted_paths
    except zipfile.BadZipFile:
        _cleanup_dir(tmp_dir)
        raise VerifierError("That doesn't look like a valid zip file. Make sure you're uploading a .zip.")
    except VerifierError:
        _cleanup_dir(tmp_dir)
        raise
    except Exception:  # pragma: no cover - defensive
        _cleanup_dir(tmp_dir)
        raise VerifierError("We couldn't open that zip file. Try zipping your project again.")


def _cleanup_dir(path):
    import shutil
    shutil.rmtree(path, ignore_errors=True)


# ─────────────────────────────────────────────────────────────────────────
# Tolerant path lookup — handles the single-wrapper-folder case
# ─────────────────────────────────────────────────────────────────────────
#
# When a student right-click-compresses a folder (Windows "Compress to
# ZIP" / Mac "Compress"), the tool very often wraps everything in one
# folder inside the zip — so a file the student sees as "index.html" is
# actually stored as "my-website/index.html". A strict path match would
# fail every one of those zips even though the file is clearly there, so
# every zip-based check resolves through this first: exact path, then
# case-insensitive, then "is this the only file in the zip with that
# name" (which also transparently unwraps a single containing folder).

def resolve_zip_path(want_path, zip_files):
    want_path = (want_path or "").strip().lstrip("/")
    if not want_path:
        return None
    if want_path in zip_files:
        return want_path

    lower_map = {f.lower(): f for f in zip_files}
    if want_path.lower() in lower_map:
        return lower_map[want_path.lower()]

    want_base = posixpath.basename(want_path).lower()
    candidates = [f for f in zip_files if posixpath.basename(f).lower() == want_base]
    if not candidates:
        return None
    # Prefer the one closest to the root — handles the common
    # single-wrapper-folder case cleanly, and stays predictable if a
    # student's zip happens to contain two files with the same name.
    return min(candidates, key=lambda f: f.count("/"))


# ─────────────────────────────────────────────────────────────────────────
# URL fetching (static) — basic SSRF guard + size cap
# ─────────────────────────────────────────────────────────────────────────

def _is_public_hostname(hostname):
    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        return False
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            return False
    return True


def fetch_url(url):
    """
    Fetches `url` for static URL-target checks (url_status, text_exists,
    element_exists, element_text, element_attribute). Returns
    (status_code, html_text or None, BeautifulSoup or None). Raises
    VerifierError for disallowed or unreachable URLs.

    This is a plain HTTP GET — it sees the HTML exactly as the server
    sent it, same as "View Source". It does NOT see anything that only
    exists after CSS/JS runs (computed colors, cascade, external
    stylesheets) — that's what computed_style/css_variable use
    _render_page() for instead, below.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise VerifierError("Please enter a web address that starts with http:// or https://.")
    if not parsed.hostname:
        raise VerifierError("That doesn't look like a full web address. Try something like https://yoursite.com.")
    if not _is_public_hostname(parsed.hostname):
        raise VerifierError("We can't reach that web address. Make sure it's a real, published website.")

    try:
        resp = requests.get(
            url, timeout=URL_FETCH_TIMEOUT, stream=True,
            headers={"User-Agent": "RavMaths-ProjectVerifier/1.0"},
            allow_redirects=True,
        )
    except requests.RequestException:
        raise VerifierError("We couldn't load that website. Double-check the link and try again.")

    content = b""
    for chunk in resp.iter_content(65536):
        content += chunk
        if len(content) > URL_MAX_RESPONSE_BYTES:
            break

    html_text = None
    soup = None
    content_type = resp.headers.get("Content-Type", "")
    if "html" in content_type or not content_type:
        try:
            html_text = content.decode(resp.encoding or "utf-8", errors="replace")
            soup = BeautifulSoup(html_text, "html.parser")
        except Exception:
            html_text, soup = None, None

    return resp.status_code, html_text, soup


# ─────────────────────────────────────────────────────────────────────────
# Rendered-page fetching — for computed_style / css_variable(target=url)
# ─────────────────────────────────────────────────────────────────────────
#
# These two check types need REAL computed CSS: the cascade, external
# stylesheets, inherited custom properties, browser defaults — none of
# which the plain requests-based fetch_url() above can see, since it only
# ever looks at the raw HTML text. Getting that right requires an actual
# browser engine, so these use Playwright (headless Chromium) instead.
# Kept as its own small layer, only ever invoked when a check that
# actually needs it is present, so every other check type's behavior and
# performance is completely unaffected.

class _RenderedPage:
    """Thin wrapper around a loaded Playwright page. Exists so run_checks
    only has to know about .eval_on_selector()/.close() — and so tests
    can substitute a fake instance without needing a real browser."""

    def __init__(self, status, page, browser, playwright):
        self.status = status
        self._page = page
        self._browser = browser
        self._playwright = playwright

    def eval_on_selector(self, selector, prop):
        """Returns getComputedStyle(el).getPropertyValue(prop) for the
        first element matching `selector`. Raises if nothing matches —
        callers treat that as "selector not found on the page"."""
        return self._page.eval_on_selector(
            selector, "(el, p) => getComputedStyle(el).getPropertyValue(p)", prop
        )

    def close(self):
        try:
            self._browser.close()
        finally:
            self._playwright.stop()


def _render_page(url):
    """
    Launches one headless browser, navigates to `url` once, and returns a
    _RenderedPage — reused across every computed_style/css_variable(url)
    check in the same run_checks() call, so the render cost is only paid
    once no matter how many such checks a question has. Returns None if
    the page couldn't be loaded at all (same "unreachable" tier as any
    other URL check).

    Split out as its own function (rather than inlined) specifically so
    tests can monkeypatch it with a fake _RenderedPage instead of
    requiring a real browser to be installed.
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise VerifierError(
            "This project can't be checked right now — ask your teacher to set up browser checks."
        )
    playwright = sync_playwright().start()
    browser = playwright.chromium.launch()
    try:
        page = browser.new_page()
        response = page.goto(url, wait_until="load", timeout=URL_FETCH_TIMEOUT * 1000)
        status = response.status if response else None
        return _RenderedPage(status, page, browser, playwright)
    except Exception:
        browser.close()
        playwright.stop()
        return None


def _needs_rendered_page(checks):
    return any(
        c.get("type") in ("computed_style", "css_variable") and c.get("target") == "url"
        for c in checks
    )


# ─────────────────────────────────────────────────────────────────────────
# CSS parsing — for css_property / css_variable(target=zip)
# ─────────────────────────────────────────────────────────────────────────
#
# A student's plain stylesheet is simple enough that we don't need a full
# browser to check it — a lightweight CSS parser (tinycss2) is enough to
# read declared property/variable values straight out of the file. Only
# top-level qualified rules are parsed (rules inside @media/@supports are
# skipped, since correctly matching those needs real media-query
# evaluation) — fine for the flat, beginner-level stylesheets this is
# built for.

def _parse_css_rules(css_text):
    """
    Returns a list of (selector_list, declarations) for every top-level
    qualified rule in `css_text`. `selector_list` is the comma-separated
    list of individual selectors (e.g. "h1, h2" -> ["h1", "h2"]),
    `declarations` is {property_name: value} using the LAST declaration
    when a property repeats within one rule (later wins, same as real
    CSS). Custom properties (--name) keep their exact case; standard
    property names are lowercased for matching.
    """
    try:
        import tinycss2
    except ImportError:
        raise VerifierError(
            "This project can't be checked right now — ask your teacher to set up CSS checks."
        )

    rules = []
    for node in tinycss2.parse_stylesheet(css_text, skip_comments=True, skip_whitespace=True):
        if node.type != "qualified-rule":
            continue
        selector_text = tinycss2.serialize(node.prelude).strip()
        selectors = [s.strip() for s in selector_text.split(",") if s.strip()]

        declarations = {}
        for decl in tinycss2.parse_declaration_list(node.content, skip_comments=True, skip_whitespace=True):
            if decl.type != "declaration":
                continue
            key = decl.name if decl.name.startswith("--") else decl.lower_name
            declarations[key] = tinycss2.serialize(decl.value).strip()

        rules.append((selectors, declarations))
    return rules


def _lookup_css_declaration(rules, selector, prop_or_var):
    """
    Finds `prop_or_var`'s value for `selector` across parsed `rules`, in
    source order — a later matching rule overrides an earlier one for the
    same property (specificity itself isn't modeled, which is fine for
    flat student stylesheets). Returns None if nothing declares it.
    """
    selector = (selector or "").strip()
    found = None
    for selectors, declarations in rules:
        if selector in selectors and prop_or_var in declarations:
            found = declarations[prop_or_var]
    return found


# ─────────────────────────────────────────────────────────────────────────
# Value comparison — normalizes equivalent colors (hex/rgb/named), falls
# back to a case/whitespace-insensitive string compare for everything else
# ─────────────────────────────────────────────────────────────────────────

_NAMED_COLORS = {
    "black": (0, 0, 0), "white": (255, 255, 255), "red": (255, 0, 0),
    "green": (0, 128, 0), "blue": (0, 0, 255), "yellow": (255, 255, 0),
    "purple": (128, 0, 128), "orange": (255, 165, 0), "pink": (255, 192, 203),
    "gray": (128, 128, 128), "grey": (128, 128, 128), "cyan": (0, 255, 255),
    "magenta": (255, 0, 255), "lime": (0, 255, 0), "navy": (0, 0, 128),
    "teal": (0, 128, 128), "maroon": (128, 0, 0), "olive": (128, 128, 0),
    "silver": (192, 192, 192), "transparent": (0, 0, 0, 0.0),
}

_RGB_RE = re.compile(
    r"^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$"
)


def _parse_color(value):
    """
    Parses a CSS color (#hex in 3/4/6/8-digit form, rgb()/rgba(), or a
    common named color) into an (r, g, b, a) tuple, or None if `value`
    doesn't look like a color at all. Lets hex/rgb/named forms of the
    same color compare as equal.
    """
    if value is None:
        return None
    v = value.strip().lower()

    if v in _NAMED_COLORS:
        c = _NAMED_COLORS[v]
        return (c[0], c[1], c[2], c[3] if len(c) == 4 else 1.0)

    if v.startswith("#"):
        hexpart = v[1:]
        try:
            if len(hexpart) == 3:
                r, g, b = (int(ch * 2, 16) for ch in hexpart)
                return (r, g, b, 1.0)
            if len(hexpart) == 4:
                r, g, b, a = (int(ch * 2, 16) for ch in hexpart)
                return (r, g, b, round(a / 255, 3))
            if len(hexpart) == 6:
                r, g, b = int(hexpart[0:2], 16), int(hexpart[2:4], 16), int(hexpart[4:6], 16)
                return (r, g, b, 1.0)
            if len(hexpart) == 8:
                r, g, b, a = int(hexpart[0:2], 16), int(hexpart[2:4], 16), int(hexpart[4:6], 16), int(hexpart[6:8], 16)
                return (r, g, b, round(a / 255, 3))
        except ValueError:
            return None
        return None

    m = _RGB_RE.match(v)
    if m:
        r, g, b = (round(float(m.group(i))) for i in (1, 2, 3))
        a = float(m.group(4)) if m.group(4) is not None else 1.0
        return (r, g, b, round(a, 3))

    return None


def _normalize_text(s):
    return " ".join((s or "").split())


def _values_equal(a, b):
    ca, cb = _parse_color(a), _parse_color(b)
    if ca is not None and cb is not None:
        return ca == cb
    # Fallback for everything that isn't a color: font sizes, keywords,
    # etc. — case/whitespace-insensitive string compare.
    return _normalize_text(a).lower() == _normalize_text(b).lower()


# ─────────────────────────────────────────────────────────────────────────
# Check handlers — each takes (check_dict, ctx) and returns (score, detail)
# where score is a float in [0.0, 1.0].
# ─────────────────────────────────────────────────────────────────────────

class _Ctx:
    """Bundles everything a check handler might need. Built once per
    run_checks() call and passed to every handler."""

    def __init__(self, zip_dir, zip_files, url, url_status, url_html, url_soup, rendered_page=None):
        self.zip_dir = zip_dir
        self.zip_files = zip_files or []          # relative paths, forward-slash
        self.url = url
        self.url_status = url_status
        self.url_html = url_html
        self.url_soup = url_soup
        self.rendered_page = rendered_page         # _RenderedPage or None
        self._file_soup_cache = {}
        self._css_rules_cache = {}

    def resolve(self, rel_path):
        return resolve_zip_path(rel_path, self.zip_files)

    def zip_file_text(self, rel_path):
        resolved = self.resolve(rel_path)
        if not resolved:
            return None
        full_path = os.path.join(self.zip_dir, resolved.replace("/", os.sep))
        if not os.path.isfile(full_path):
            return None
        with open(full_path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()

    def zip_file_soup(self, rel_path):
        resolved = self.resolve(rel_path)
        if not resolved:
            return None
        if resolved in self._file_soup_cache:
            return self._file_soup_cache[resolved]
        text = self.zip_file_text(resolved)
        soup = BeautifulSoup(text, "html.parser") if text is not None else None
        self._file_soup_cache[resolved] = soup
        return soup

    def css_rules(self, rel_path):
        resolved = self.resolve(rel_path)
        if not resolved:
            return None
        if resolved in self._css_rules_cache:
            return self._css_rules_cache[resolved]
        text = self.zip_file_text(resolved)
        rules = _parse_css_rules(text) if text is not None else None
        self._css_rules_cache[resolved] = rules
        return rules

    def computed_property(self, selector, prop):
        """Returns (value, found) from the rendered page. `found` is
        False if `selector` doesn't match any element on the page."""
        if self.rendered_page is None:
            return None, False
        try:
            value = self.rendered_page.eval_on_selector(selector, prop)
            return value, True
        except Exception:
            return None, False

    def computed_variable(self, selector, variable):
        # :root's computed style lives on the <html> element.
        target_selector = "html" if selector.strip() == ":root" else selector
        return self.computed_property(target_selector, variable)


def _check_url_status(check, ctx):
    if ctx.url_status is None:
        return 0.0, "You didn't submit a link to check yet."
    expected = check.get("expected", 200)
    if ctx.url_status == expected:
        return 1.0, "Your website is up and loading! 🎉"
    return 0.0, f"Your website gave an error when we tried to load it (code {ctx.url_status})."


def _check_file_exists(check, ctx):
    if check.get("target") != "zip":
        return 0.0, "This check only works with a zip file."
    path = check.get("path", "")
    found = ctx.resolve(path) is not None
    if found:
        return 1.0, f"Found '{path}' in your zip file. 🎉"
    return 0.0, f"Couldn't find '{path}' in your zip file."


def _check_same_directory(check, ctx):
    files = check.get("files", [])
    resolved = {f: ctx.resolve(f) for f in files}
    missing = [f for f, r in resolved.items() if r is None]
    if missing:
        return 0.0, f"These files should be in your zip file: {', '.join(missing)}."

    dirnames = {posixpath.dirname(r) for r in resolved.values()}
    if len(dirnames) > 1:
        return 0.0, "All these files should be in the same folder."
    return 1.0, "All your files are in the same folder. Nice! 🎉"


def _check_text_exists(check, ctx):
    text = check.get("text", "")
    target = check.get("target")
    if target == "zip":
        path = check.get("path", "")
        content = ctx.zip_file_text(path)
        if content is None:
            return 0.0, f"Couldn't find '{path}' in your zip file to check."
        if text in content:
            return 1.0, f"Found the text '{text}' in {path}. 🎉"
        return PARTIAL_CREDIT, f"We opened '{path}', but couldn't find the text '{text}' in it. You're halfway there!"
    elif target == "url":
        if ctx.url_html is None:
            return 0.0, "We couldn't load your page to check it."
        if text in ctx.url_html:
            return 1.0, f"Found the text '{text}' on your page. 🎉"
        return PARTIAL_CREDIT, f"Your website loaded, but we couldn't find the text '{text}' on it. You're halfway there!"
    return 0.0, "This check needs a zip file or a link to work with."


def _check_element_exists(check, ctx):
    selector = check.get("selector", "")
    target = check.get("target")
    if target == "zip":
        path = check.get("path", "")
        soup = ctx.zip_file_soup(path)
        if soup is None:
            return 0.0, f"Couldn't find '{path}' in your zip file to check."
        if soup.select_one(selector) is not None:
            return 1.0, f"Found '{selector}' in {path}. 🎉"
        return PARTIAL_CREDIT, f"We opened '{path}', but couldn't find '{selector}' in it. You're halfway there!"
    elif target == "url":
        if ctx.url_soup is None:
            return 0.0, "We couldn't load your page to check it."
        if ctx.url_soup.select_one(selector) is not None:
            return 1.0, f"Found '{selector}' on your page. 🎉"
        return PARTIAL_CREDIT, f"Your website loaded, but we couldn't find '{selector}' on it. You're halfway there!"
    return 0.0, "This check needs a zip file or a link to work with."


# ── NEW: element_text — like element_exists, but also checks the text
# inside it matches exactly (whitespace-normalized). Use this instead of
# text_exists when you want to pin down a SPECIFIC element's wording
# rather than "this text appears somewhere on the page". ─────────────────

def _check_element_text(check, ctx):
    selector = check.get("selector", "")
    expected = check.get("expected", "")
    target = check.get("target")

    if target == "zip":
        path = check.get("path", "")
        soup = ctx.zip_file_soup(path)
        if soup is None:
            return 0.0, f"Couldn't find '{path}' in your zip file to check."
        el = soup.select_one(selector)
    elif target == "url":
        if ctx.url_soup is None:
            return 0.0, "We couldn't load your page to check it."
        el = ctx.url_soup.select_one(selector)
    else:
        return 0.0, "This check needs a zip file or a link to work with."

    where = f"in {check.get('path')}" if target == "zip" else "on your page"
    loaded_msg = "We opened your file" if target == "zip" else "Your website loaded"

    if el is None:
        return PARTIAL_CREDIT, f"{loaded_msg}, but couldn't find '{selector}' {where}. You're halfway there!"

    got = _normalize_text(el.get_text())
    want = _normalize_text(expected)
    if got == want:
        return 1.0, f"'{selector}' says exactly what it should. 🎉"
    return PARTIAL_CREDIT, f"We found '{selector}', but it says '{got}' instead of '{want}'. You're halfway there!"


# ── NEW: element_attribute — checks a specific attribute's value on an
# element (e.g. an <img alt="...">, an <a href="...">). ─────────────────

def _check_element_attribute(check, ctx):
    selector = check.get("selector", "")
    attribute = check.get("attribute", "")
    expected = (check.get("expected") or "").strip()
    target = check.get("target")

    if target == "zip":
        path = check.get("path", "")
        soup = ctx.zip_file_soup(path)
        if soup is None:
            return 0.0, f"Couldn't find '{path}' in your zip file to check."
        el = soup.select_one(selector)
    elif target == "url":
        if ctx.url_soup is None:
            return 0.0, "We couldn't load your page to check it."
        el = ctx.url_soup.select_one(selector)
    else:
        return 0.0, "This check needs a zip file or a link to work with."

    where = f"in {check.get('path')}" if target == "zip" else "on your page"
    loaded_msg = "We opened your file" if target == "zip" else "Your website loaded"

    if el is None:
        return PARTIAL_CREDIT, f"{loaded_msg}, but couldn't find '{selector}' {where}. You're halfway there!"

    got = (el.get(attribute) or "").strip()
    if got == expected:
        return 1.0, f"'{attribute}' on '{selector}' is set correctly. 🎉"
    shown = got or "(empty)"
    return PARTIAL_CREDIT, f"We found '{selector}', but its '{attribute}' is '{shown}' instead of '{expected}'. You're halfway there!"


# ── NEW: css_property — reads a declared property straight out of a CSS
# file in the zip (e.g. "h1 { color: ... }"). Zip-only: for the live,
# rendered version of this, use computed_style instead. ─────────────────

def _check_css_property(check, ctx):
    if check.get("target") != "zip":
        return 0.0, "Use a computed_style check for live links — css_property only works with your project's CSS file."

    path = check.get("path", "")
    selector = check.get("selector", "")
    prop = (check.get("property") or "").strip().lower()
    expected = check.get("expected", "")

    rules = ctx.css_rules(path)
    if rules is None:
        return 0.0, f"Couldn't find '{path}' in your zip file to check."

    value = _lookup_css_declaration(rules, selector, prop)
    if value is None:
        return PARTIAL_CREDIT, f"We opened '{path}', but couldn't find a '{prop}' rule for '{selector}'. You're halfway there!"
    if _values_equal(value, expected):
        return 1.0, f"'{selector}' has the right '{prop}'. 🎉"
    return PARTIAL_CREDIT, f"'{selector}' has '{prop}: {value}', but it should be '{expected}'. You're halfway there!"


# ── NEW: computed_style — the live, rendered version of css_property.
# Loads the real page in a headless browser and reads
# getComputedStyle(el)[property], so it reflects the actual cascade
# (external stylesheets, inherited values, browser defaults) rather than
# just what one CSS file says in isolation. URL-only: for a zip file, use
# css_property instead. ───────────────────────────────────────────────

def _check_computed_style(check, ctx):
    if check.get("target") != "url":
        return 0.0, "Use a css_property check for zip files — computed_style only works with a live link."
    if ctx.rendered_page is None:
        return 0.0, "We couldn't load your page to check it."

    selector = check.get("selector", "")
    prop = check.get("property", "")
    expected = check.get("expected", "")

    value, found = ctx.computed_property(selector, prop)
    if not found:
        return PARTIAL_CREDIT, f"Your website loaded, but we couldn't find '{selector}' on it. You're halfway there!"
    value = (value or "").strip()
    if not value:
        return PARTIAL_CREDIT, f"Your website loaded, but '{prop}' isn't set on '{selector}'. You're halfway there!"
    if _values_equal(value, expected):
        return 1.0, f"'{selector}' has the right '{prop}'. 🎉"
    return PARTIAL_CREDIT, f"'{selector}' has '{prop}: {value}', but it should be '{expected}'. You're halfway there!"


# ── NEW: css_variable — checks a custom property (--name) declared on a
# selector (":root" by default). Supports both a zip stylesheet (parsed
# directly) and a live URL (read via computed style, so it reflects
# whatever the cascade actually resolves the variable to). ──────────────

def _check_css_variable(check, ctx):
    target = check.get("target")
    variable = check.get("variable", "")
    expected = check.get("expected", "")
    selector = (check.get("selector") or ":root").strip()

    if target == "zip":
        path = check.get("path", "")
        rules = ctx.css_rules(path)
        if rules is None:
            return 0.0, f"Couldn't find '{path}' in your zip file to check."
        value = _lookup_css_declaration(rules, selector, variable)
        if value is None:
            return PARTIAL_CREDIT, f"We opened '{path}', but couldn't find '{variable}' declared on '{selector}'. You're halfway there!"
        if _values_equal(value, expected):
            return 1.0, f"'{variable}' is set correctly. 🎉"
        return PARTIAL_CREDIT, f"'{variable}' is '{value}', but it should be '{expected}'. You're halfway there!"

    elif target == "url":
        if ctx.rendered_page is None:
            return 0.0, "We couldn't load your page to check it."
        value, found = ctx.computed_variable(selector, variable)
        if not found:
            return PARTIAL_CREDIT, f"Your website loaded, but we couldn't find '{selector}' on it. You're halfway there!"
        value = (value or "").strip()
        if not value:
            return PARTIAL_CREDIT, f"Your website loaded, but '{variable}' isn't set on '{selector}'. You're halfway there!"
        if _values_equal(value, expected):
            return 1.0, f"'{variable}' is set correctly. 🎉"
        return PARTIAL_CREDIT, f"'{variable}' is '{value}', but it should be '{expected}'. You're halfway there!"

    return 0.0, "This check needs a zip file or a link to work with."


# Registry — add new check types here + a matching handler function above.
# Handlers stay small and single-purpose so extending this list later
# never touches run_checks() itself.
CHECK_HANDLERS = {
    "url_status": _check_url_status,
    "file_exists": _check_file_exists,
    "same_directory": _check_same_directory,
    "text_exists": _check_text_exists,
    "element_exists": _check_element_exists,
    "element_text": _check_element_text,
    "element_attribute": _check_element_attribute,
    "css_property": _check_css_property,
    "computed_style": _check_computed_style,
    "css_variable": _check_css_variable,
}


def run_checks(content, zip_dir=None, zip_files=None, url=None):
    """
    Runs every check in content["checks"] and returns (results, fraction):
      results  -> list of {"type", "target", "passed", "score", "detail"}
                  dicts, one per check, in the original order. `passed` is
                  True only for a full 1.0 — treat a partial (e.g. 0.5) as
                  "close but not quite" if you need a three-state display.
      fraction -> average score across all checks (0.0–1.0), so a
                  partially-credited check pulls the overall score toward
                  the middle instead of an all-or-nothing pass/fail would.

    A check whose `target` wasn't actually submitted (e.g. target=url but
    no URL was given) simply scores 0.0 with an explanatory detail — it's
    never skipped, so a required-but-missing submission always costs
    credit.

    A real browser is only launched if at least one check actually needs
    it (computed_style or css_variable with target=url) — every other
    question's checks run exactly as before, with no added cost.
    """
    checks = content.get("checks", [])

    url_status = url_html = url_soup = None
    if url:
        url_status, url_html, url_soup = fetch_url(url)

    rendered_page = None
    if url and _needs_rendered_page(checks):
        rendered_page = _render_page(url)

    ctx = _Ctx(zip_dir, zip_files, url, url_status, url_html, url_soup, rendered_page)

    try:
        results = []
        for check in checks:
            check_type = check.get("type")
            handler = CHECK_HANDLERS.get(check_type)
            if handler is None:
                results.append({
                    "type": check_type, "target": check.get("target"),
                    "passed": False, "score": 0.0, "detail": "This check couldn't run.",
                })
                continue
            try:
                score, detail = handler(check, ctx)
                score = max(0.0, min(1.0, float(score)))
            except Exception:  # pragma: no cover - defensive, never 500 on a bad check
                score, detail = 0.0, "Something went wrong running this check."
            results.append({
                "type": check_type, "target": check.get("target"),
                "passed": score >= 1.0, "score": score, "detail": detail,
            })
    finally:
        if rendered_page is not None:
            rendered_page.close()

    if not results:
        return results, 0.0
    fraction = sum(r["score"] for r in results) / len(results)
    return results, fraction