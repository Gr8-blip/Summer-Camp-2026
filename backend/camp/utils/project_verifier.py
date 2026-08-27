"""
Verifier for `project_submission` questions.

Two entry points:
  - safe_extract_zip(uploaded_file) -> (tmp_dir, [relative_paths])
  - run_checks(content, zip_dir=None, zip_files=None, url=None) -> (results, fraction)

`run_checks` is the only thing callers outside this module should need.
Everything else (zip safety, HTML parsing, SSRF guard, individual check
handlers) is an implementation detail behind CHECK_HANDLERS, kept modular
so new check types are a one-function, one-registry-entry addition — see
the bottom of this file for how to add e.g. `css_property` or
`document_title` later.

All messages returned to students are written in plain, kid-friendly
language — no "archive", "target", "element", etc.
"""
import ipaddress
import os
import posixpath
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
# URL fetching — basic SSRF guard + size cap
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
    Fetches `url` for URL-target checks. Returns (status_code, html_text
    or None, BeautifulSoup or None). Raises VerifierError for disallowed
    or unreachable URLs.
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
# Check handlers — each takes (check_dict, ctx) and returns (passed, detail)
# ─────────────────────────────────────────────────────────────────────────

class _Ctx:
    """Bundles everything a check handler might need. Built once per
    run_checks() call and passed to every handler."""

    def __init__(self, zip_dir, zip_files, url, url_status, url_html, url_soup):
        self.zip_dir = zip_dir
        self.zip_files = zip_files or []          # relative paths, forward-slash
        self.url = url
        self.url_status = url_status
        self.url_html = url_html
        self.url_soup = url_soup
        self._file_soup_cache = {}

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


def _check_url_status(check, ctx):
    if ctx.url_status is None:
        return False, "You didn't submit a link to check yet."
    expected = check.get("expected", 200)
    passed = ctx.url_status == expected
    if passed:
        return True, "Your website is up and loading! 🎉"
    return False, f"Your website gave an error when we tried to load it (code {ctx.url_status})."


def _check_file_exists(check, ctx):
    if check.get("target") != "zip":
        return False, "This check only works with a zip file."
    path = check.get("path", "")
    found = ctx.resolve(path) is not None
    if found:
        return True, f"Found '{path}' in your zip file. 🎉"
    return False, f"Couldn't find '{path}' in your zip file."


def _check_same_directory(check, ctx):
    files = check.get("files", [])
    resolved = {f: ctx.resolve(f) for f in files}
    missing = [f for f, r in resolved.items() if r is None]
    if missing:
        return False, f"These files should be in your zip file: {', '.join(missing)}."

    dirnames = {posixpath.dirname(r) for r in resolved.values()}
    if len(dirnames) > 1:
        return False, "All these files should be in the same folder."
    return True, "All your files are in the same folder. Nice! 🎉"


def _check_text_exists(check, ctx):
    text = check.get("text", "")
    target = check.get("target")
    if target == "zip":
        path = check.get("path", "")
        content = ctx.zip_file_text(path)
        if content is None:
            return False, f"Couldn't find '{path}' in your zip file to check."
        found = text in content
        return found, (f"Found the text '{text}' in {path}. 🎉" if found else f"Couldn't find the text '{text}' in {path}.")
    elif target == "url":
        if ctx.url_html is None:
            return False, "We couldn't load your page to check it."
        found = text in ctx.url_html
        return found, (f"Found the text '{text}' on your page. 🎉" if found else f"Couldn't find the text '{text}' on your page.")
    return False, "This check needs a zip file or a link to work with."


def _check_element_exists(check, ctx):
    selector = check.get("selector", "")
    target = check.get("target")
    if target == "zip":
        path = check.get("path", "")
        soup = ctx.zip_file_soup(path)
        if soup is None:
            return False, f"Couldn't find '{path}' in your zip file to check."
        found = soup.select_one(selector) is not None
        return found, (f"Found '{selector}' in {path}. 🎉" if found else f"Couldn't find '{selector}' in {path}.")
    elif target == "url":
        if ctx.url_soup is None:
            return False, "We couldn't load your page to check it."
        found = ctx.url_soup.select_one(selector) is not None
        return found, (f"Found '{selector}' on your page. 🎉" if found else f"Couldn't find '{selector}' on your page.")
    return False, "This check needs a zip file or a link to work with."


# Registry — add new check types here + a matching handler function above.
# Handlers stay small and single-purpose so extending this list later
# (css_property, element_attribute, file_content, document_title, links,
# ...) never touches run_checks() itself.
CHECK_HANDLERS = {
    "url_status": _check_url_status,
    "file_exists": _check_file_exists,
    "same_directory": _check_same_directory,
    "text_exists": _check_text_exists,
    "element_exists": _check_element_exists,
}


def run_checks(content, zip_dir=None, zip_files=None, url=None):
    """
    Runs every check in content["checks"] and returns (results, fraction):
      results  -> list of {"type", "target", "passed", "detail"} dicts,
                  one per check, in the original order.
      fraction -> passed_count / total_count, 0.0 if there are no checks.

    A check whose `target` wasn't actually submitted (e.g. target=url but
    no URL was given) simply fails with an explanatory detail — it's never
    skipped, so a required-but-missing submission always costs credit.
    """
    url_status = url_html = url_soup = None
    if url:
        url_status, url_html, url_soup = fetch_url(url)

    ctx = _Ctx(zip_dir, zip_files, url, url_status, url_html, url_soup)

    results = []
    checks = content.get("checks", [])
    for check in checks:
        check_type = check.get("type")
        handler = CHECK_HANDLERS.get(check_type)
        if handler is None:
            results.append({
                "type": check_type, "target": check.get("target"),
                "passed": False, "detail": "This check couldn't run.",
            })
            continue
        try:
            passed, detail = handler(check, ctx)
        except Exception:  # pragma: no cover - defensive, never 500 on a bad check
            passed, detail = False, "Something went wrong running this check."
        results.append({
            "type": check_type, "target": check.get("target"),
            "passed": bool(passed), "detail": detail,
        })

    if not results:
        return results, 0.0
    fraction = sum(1 for r in results if r["passed"]) / len(results)
    return results, fraction