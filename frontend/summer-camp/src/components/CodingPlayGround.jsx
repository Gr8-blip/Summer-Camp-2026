import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./codingplayground.css";

/**
 *   {question.question_type === "interactive_coding" && (
 *     <CodingPlayground
 *       key={question.id}
 *       content={content}
 *       onResult={(results) => answer(results)}
 *       storageKey={`coding-${question.id}`}
 *     />
 *   )}
 *
 * Behavior notes (v2):
 * - Fullscreen by default (portaled to document.body, position:fixed) so it
 *   always renders correctly regardless of what shell/game it's nested
 *   inside — DungeonCrawler, EscapeRoom, whatever. Pass fullscreen={false}
 *   for the inline admin "Test Quest" preview.
 * - The student's draft is only kept if it was made against the SAME
 *   starter config the admin currently has published. If the admin edits or
 *   deletes a file, the signature changes and the draft resets to the new
 *   starter files. If nothing changed, drafts survive refresh.
 * - Checks run silently in the background every time the preview reloads
 *   (mount + every "Run") and are pushed up via onResult so the quest's
 *   normal submit/score flow always has an up-to-date answer — but nothing
 *   about pass/fail is shown to the student here. That only happens on the
 *   post-submit results screen your quest flow already renders. In
 *   testMode (admin builder), results ARE shown inline so admins can verify
 *   their own checks.
 */

const EXT_LANG = { html: "html", css: "css", js: "javascript" };
function extOf(path) { return path.split(".").pop().toLowerCase(); }

const VALIDATOR_SCRIPT = `
<script>
(function () {
  function normColor(v) {
    if (!v) return "";
    var probe = document.createElement("span");
    probe.style.color = v;
    document.body.appendChild(probe);
    var computed = getComputedStyle(probe).color;
    probe.remove();
    return computed.replace(/\\s+/g, "");
  }
  function runCheck(check) {
    try {
      if (check.type === "document_title") {
        return document.title.trim() === String(check.expected || "").trim();
      }
      if (check.type === "js_variable") {
        // Handled before any selector/element logic below — this check has
        // no DOM target at all, it reads a variable out of the student's
        // own script.js. eval() here (not Function/new Function) is
        // deliberate: it resolves through the normal scope chain, which is
        // the only way to see a top-level let/const declared in the
        // student's separate <script> tag — those bindings live in the
        // shared global LEXICAL environment, not on window, so bracket
        // access (window[name]) would silently miss anything the student
        // declared with let/const instead of var.
        var val;
        try { val = eval(check.variable); } catch (e) { return false; }
        var expected = check.expected;
        if (typeof val === "object" && val !== null) {
          try { return JSON.stringify(val) === JSON.stringify(JSON.parse(expected)); }
          catch (e2) { return JSON.stringify(val) === String(expected || "").trim(); }
        }
        return String(val).trim() === String(expected || "").trim();
      }
      var el = check.selector ? document.querySelector(check.selector) : null;
      if (check.type === "element_exists") return !!el;
      if (!el) return false;
      if (check.type === "element_text") {
        return el.textContent.trim() === String(check.expected || "").trim();
      }
      if (check.type === "css_property") {
        // Custom properties (--foo) don't resolve through bracket-notation
        // style access — getPropertyValue is required, and works equally
        // well on :root (document.querySelector(":root") already returns
        // document.documentElement, so no special-casing needed there).
        var isVar = check.property && check.property.indexOf("--") === 0;
        var got = isVar
          ? getComputedStyle(el).getPropertyValue(check.property)
          : getComputedStyle(el)[check.property];
        got = String(got || "").trim();
        var expected = String(check.expected || "").trim();
        // Try a plain match first — covers non-color values (numbers,
        // keywords, font stacks, custom property values of any kind).
        // Only fall back to color-aware comparison when that fails, so
        // "16px" vs "16px" or "Poppins, sans-serif" vs itself doesn't get
        // incorrectly routed through color parsing (which would silently
        // fail on anything that isn't a real color).
        if (got === expected) return true;
        var gotColor = normColor(got);
        return gotColor !== "" && gotColor === normColor(expected);
      }
      if (check.type === "element_attribute") {
        return (el.getAttribute(check.attribute) || "") === String(check.expected || "");
      }
    } catch (e) { return false; }
    return false;
  }
  window.addEventListener("message", function (e) {
    if (!e.data || e.data.type !== "run-checks") return;
    var results = (e.data.checks || []).map(runCheck);
    window.parent.postMessage({ type: "check-results", results: results }, "*");
  });

  // Live title sim — post the tab title immediately and on every change,
  // so the student sees it update in real time as their code runs.
  function postTitle() {
    window.parent.postMessage({ type: "title-update", title: document.title }, "*");
  }
  postTitle();
  var titleEl = document.querySelector("title");
  if (titleEl) {
    new MutationObserver(postTitle).observe(titleEl, { childList: true, characterData: true, subtree: true });
  }
  new MutationObserver(postTitle).observe(document, { subtree: true, childList: true }); // catches document.title = "..." too, cheap enough for a sandboxed toy project

  window.parent.postMessage({ type: "preview-ready" }, "*");
})();
<\/script>
`;

function buildSrcDoc(files) {
  const html = files.find((f) => extOf(f.path) === "html");
  const cssBlocks = files.filter((f) => extOf(f.path) === "css").map((f) => `<style>\n${f.content}\n</style>`).join("\n");
  const jsBlocks = files.filter((f) => extOf(f.path) === "js").map((f) => `<script>\n${f.content}\n<\/script>`).join("\n");

  let doc = html ? html.content : "";

  // Guarantee a full <html><head>...</head><body>...</body></html>
  // skeleton exists no matter what shape the starter file is in — a bare
  // fragment with no <html> tag at all (e.g. an admin just pastes
  // "<h1>Hello</h1>"), a body-only snippet, or a complete document are
  // all things an admin might type in. Previously the repair steps below
  // only fired off an existing <html>/</html> match, so a plain fragment
  // matched neither branch and silently ended up with no </head> and no
  // </body> in the string at all — which meant the CSS/JS AND the
  // injected validator script never made it in either, so checks just
  // stayed unresolved forever with no visible error.
  if (!/<html[\s\S]*<\/html>/i.test(doc)) {
    doc = `<!doctype html><html><head></head><body>${doc}</body></html>`;
  }
  if (!/<head[\s\S]*<\/head>/i.test(doc)) {
    doc = doc.replace(/<html([^>]*)>/i, `<html$1><head></head>`);
  }
  if (!/<\/body>/i.test(doc)) {
    doc = doc.replace(/<\/html>/i, `</body></html>`);
  }

  doc = doc.replace(/<\/head>/i, `${cssBlocks}\n</head>`);
  doc = doc.replace(/<\/body>/i, `${jsBlocks}\n${VALIDATOR_SCRIPT}\n</body>`);
  return doc;
}

export default function CodingPlayground({
  content, onResult, storageKey, testMode = false, fullscreen = !testMode,
  onBack, onNext, canGoBack = false, isLast = false, onExit,
  // Same component is now used from both Quests and Boss Battles (and
  // admin's own "Test Quest" preview), which want different copy on the
  // exit/finish buttons ("Exit Quest" vs "Exit Challenge", "Finish Quest"
  // vs "Finish Battle") — callers pass their own labels instead of this
  // component guessing which context it's in.
  exitLabel = "Exit Quest ✕",
  finishLabel = "Finish Quest",
  // Boss Battles run on a countdown; Quests don't. When the caller passes
  // a number of seconds here, a timer badge renders in the topbar — this
  // component is portaled fullscreen over everything (including whatever
  // timer the parent screen renders), so without this the clock would be
  // invisible the entire time a student is inside a coding question.
  timeLeft = null,
}) {
  const files = content.files || [];
  const checks = content.checks || [];

  // Signature of the CURRENT admin-published starter config. If this
  // doesn't match what the draft was saved against, the admin changed
  // something (edited or deleted a file) — discard the stale draft.
  const configSignature = useMemo(() => JSON.stringify(files), [files]);

  const [draftFiles, setDraftFiles] = useState(() => {
    if (!storageKey) return files;
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (stored && stored.signature === configSignature) return stored.files;
    } catch { /* corrupt draft, fall through to fresh */ }
    return files;
  });

  const [activePath, setActivePath] = useState(draftFiles[0]?.path);
  const [previewDoc, setPreviewDoc] = useState(() => buildSrcDoc(draftFiles));
  const [runCounter, setRunCounter] = useState(0); // forces a fresh iframe remount every Run, even if the code is byte-identical to last time
  const [liveTitle, setLiveTitle] = useState("");
  const [results, setResults] = useState(Array(checks.length).fill(null));
  const [submitting, setSubmitting] = useState(false);
  const [themeAttr, setThemeAttr] = useState(null);
  const iframeRef = useRef(null);
  const pendingNavRef = useRef(false);
  const pendingTimeoutRef = useRef(null);

  // Match whatever theme the student currently has equipped — the portal
  // renders to document.body, which sits OUTSIDE the ThemeProvider's
  // data-theme wrapper, so without this the overlay always fell back to
  // the default light theme regardless of what the rest of the app looked
  // like. useLayoutEffect (not a lazy initial state) because on a fresh
  // page load the themed wrapper may not exist in the DOM yet during this
  // component's own render pass — it's guaranteed present by the time any
  // layout effect fires, since the whole initial tree commits together.
  useLayoutEffect(() => {
    if (!fullscreen) return;
    const themedEl = document.querySelector("[data-theme]");
    setThemeAttr(themedEl ? themedEl.getAttribute("data-theme") : null);
  }, [fullscreen]);

  // Lock background scroll while the fullscreen playground is open so it
  // reads as a true takeover of the page, not a layer floating on top of
  // scrollable content behind it.
  useEffect(() => {
    if (!fullscreen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prevOverflow; };
  }, [fullscreen]);

  useEffect(() => {
    if (!storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify({ signature: configSignature, files: draftFiles }));
  }, [draftFiles, storageKey, configSignature]);

  const activeFile = draftFiles.find((f) => f.path === activePath);
  const updateActive = (v) => setDraftFiles((prev) => prev.map((f) => (f.path === activePath ? { ...f, content: v } : f)));

  const runProject = () => {
    setPreviewDoc(buildSrcDoc(draftFiles));
    setRunCounter((n) => n + 1);
  };

  useEffect(() => {
    function onMsg(e) {
      if (!e.data) return;
      if (e.data.type === "title-update") { setLiveTitle(e.data.title); return; }
      if (e.data.type === "preview-ready") {
        // Silently validate every time the preview (re)loads — mount and
        // every Run — so the answer stays current without ever showing
        // pass/fail to the student mid-play.
        iframeRef.current?.contentWindow?.postMessage({ type: "run-checks", checks }, "*");
        return;
      }
      if (e.data.type === "check-results") {
        setResults(e.data.results);
        const fresh = { results: e.data.results };
        onResult?.(fresh);
        if (pendingNavRef.current) {
          pendingNavRef.current = false;
          clearTimeout(pendingTimeoutRef.current);
          setSubmitting(false);
          // Pass the fresh value directly rather than trusting that the
          // onResult() state update above has flushed by the time the
          // parent reads its `answers` state — this handler runs outside
          // a React synthetic event (it's a postMessage listener), so
          // that was never guaranteed and was the cause of "correct
          // answer submits as 0%".
          onNext?.(fresh);
        }
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checks]);

  // Whatever the student typed only ever reaches the grader once the
  // preview iframe rebuilds from the current editor contents — so Next /
  // Finish Quest always force one last rebuild+validate against the LATEST
  // code first, instead of trusting whatever the iframe happened to be
  // showing from the last manual "Run" (which could be stale, or never
  // clicked at all — that mismatch was scoring correct answers as 0%).
  const handleNext = () => {
    if (!onNext) return;
    setSubmitting(true);
    pendingNavRef.current = true;
    runProject();
    // Safety valve: if the iframe never reports back (e.g. malformed
    // student HTML broke the injected script), don't strand them on a
    // spinner forever — proceed with whatever the last known results were.
    clearTimeout(pendingTimeoutRef.current);
    pendingTimeoutRef.current = setTimeout(() => {
      if (!pendingNavRef.current) return;
      pendingNavRef.current = false;
      setSubmitting(false);
      onNext?.();
    }, 2500);
  };

  useEffect(() => () => clearTimeout(pendingTimeoutRef.current), []);

  const passedCount = results.filter((r) => r === true).length;

  const body = (
    <div className={fullscreen ? "cp-fullscreen-overlay" : "cp-inline"} data-theme={fullscreen ? themeAttr || undefined : undefined}>
      {submitting && (
        <div className="cp-submit-overlay">
          <span className="spinner" />
          <p>Checking your work…</p>
        </div>
      )}
      <div className="cp-shell">
        <div className="cp-topbar">
          <div className="cp-topbar-controls">
            {fullscreen && onExit && (
              <button type="button" className="cp-exit-btn" onClick={onExit}>{exitLabel}</button>
            )}
            {timeLeft !== null && (
              <span className="cp-timer-badge">
                ⏱ {`${String(Math.max(0, Math.floor(timeLeft / 60))).padStart(2, "0")}:${String(Math.max(0, timeLeft % 60)).padStart(2, "0")}`}
              </span>
            )}
            <div className="cp-title-tab" title="Live browser tab title">
              <span className="cp-title-tab-dot" />
              {liveTitle || "(untitled page)"}
            </div>
          </div>
          {content.instruction && <p className="cp-instruction">{content.instruction}</p>}
        </div>

        <div className="cp-grid">
          <div className="cp-filetree">
            {draftFiles.map((f) => (
              <button key={f.path} className={`cp-file-btn ${f.path === activePath ? "active" : ""}`} onClick={() => setActivePath(f.path)}>
                {f.path}
              </button>
            ))}
          </div>

          <div className="cp-editor-wrap">
            <textarea
              className={`cp-editor cp-lang-${EXT_LANG[extOf(activePath || "")] || "text"}`}
              spellCheck={false}
              value={activeFile?.content || ""}
              onChange={(e) => updateActive(e.target.value)}
              aria-label={`Editing ${activePath}`}
            />
          </div>

          <div className="cp-preview-wrap">
            <div className="cp-preview-bar">
              <span>Preview</span>
              <button className="btn btn-secondary cp-run-btn" onClick={runProject}>▶ Run</button>
            </div>
            <iframe
              ref={iframeRef}
              key={runCounter}
              title="student-project-preview"
              className="cp-iframe"
              sandbox="allow-scripts"
              srcDoc={previewDoc}
            />
          </div>
        </div>

        {testMode && (
          <div className="cp-footer">
            <div className="cp-checks">
              {checks.map((c, i) => (
                <span key={i} className={`cp-check-pill ${results[i] === true ? "pass" : results[i] === false ? "fail" : "pending"}`}>
                  {results[i] === true ? "✅" : results[i] === false ? "❌" : "•"} Check {i + 1}
                </span>
              ))}
            </div>
            {results.some((r) => r !== null) && <p className="cp-summary">{passedCount} / {checks.length} checks passing (admin preview only)</p>}
          </div>
        )}

        {fullscreen && (onBack || onNext) && (
          <div className="cp-nav-footer">
            <button className="btn btn-secondary" disabled={!canGoBack || submitting} onClick={onBack}>Back</button>
            <button className="btn btn-primary" onClick={handleNext} disabled={submitting}>
              {submitting ? <span className="spinner" /> : isLast ? finishLabel : "Next"}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return fullscreen ? createPortal(body, document.body) : body;
}