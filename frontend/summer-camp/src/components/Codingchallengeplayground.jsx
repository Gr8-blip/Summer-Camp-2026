import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
// Reuses the SAME visual language/classes as the interactive_coding
// playground (cp-*) — same file tree / editor / preview grid — just a
// different component so the quest system is never touched.
import "./codingplayground.css";

/**
 * CodingChallengePlayground — open-ended "customize this project" mode.
 *
 * IMPORTANT: this is a completely separate component from
 * CodingPlayGround.jsx (the interactive_coding quest player). It is NOT a
 * drop-in replacement and does not share grading logic — interactive_coding
 * checks exact values, this checks whether the student MEANINGFULLY
 * changed something, and never penalizes them for elements that don't
 * exist in their specific starter project.
 *
 * Props mirror CodingPlayground's shape so it slots into the same
 * question_type dispatch pattern in QuestPlay.jsx:
 *   <CodingChallengePlayground
 *     key={question.id}
 *     content={content}
 *     onResult={(payload) => answer(payload)}   // payload = { results }
 *     storageKey={`challenge-${question.id}`}
 *     ...
 *   />
 */

function extOf(path) { return (path || "").split(".").pop().toLowerCase(); }

// ── "Substantial change" — deterministic, no AI call ─────────────────
// Normalized text + edit-distance similarity + length-delta ratio.
// Rejects trivial edits ("my boring site" -> "my boring sites"),
// accepts genuinely different content ("my boring site" -> "Nova AI Hub").
function normalizeText(s) {
  return (s || "").toString().replace(/\s+/g, " ").trim().toLowerCase();
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

function isSubstantiallyDifferent(a, b) {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (na === nb) return false;
  if (!na || !nb) {
    // one side is empty — only substantial if the other side has real content
    return Math.max(na.length, nb.length) >= 3;
  }
  const maxLen = Math.max(na.length, nb.length);
  const dist = levenshtein(na, nb);
  const similarity = 1 - dist / maxLen;
  const lenDiffRatio = Math.abs(na.length - nb.length) / maxLen;
  // reject near-identical strings (one-char edits etc) unless the length
  // itself shifted a lot
  return similarity < 0.75 || lenDiffRatio > 0.3;
}

function parseHtmlDoc(files) {
  const htmlFile = (files || []).find((f) => extOf(f.path) === "html");
  const parser = new DOMParser();
  return parser.parseFromString(
    htmlFile ? htmlFile.content : "<!doctype html><html><head></head><body></body></html>",
    "text/html"
  );
}

function jsSyntaxOk(files) {
  try {
    (files || []).filter((f) => extOf(f.path) === "js").forEach((f) => {
      // eslint-disable-next-line no-new-func
      new Function(f.content || "");
    });
    return true;
  } catch (e) {
    return false;
  }
}

function extractVarValue(files, varName) {
  const js = (files || []).filter((f) => extOf(f.path) === "js").map((f) => f.content).join("\n");
  const re = new RegExp(varName + "\\s*=\\s*(`([\\s\\S]*?)`|'([^']*)'|\"([^\"]*)\")");
  const m = js.match(re);
  if (!m) return null;
  return m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : m[4]);
}

// ── CSS computed-value probing (needs a real render, so this is the one
// check type that goes through a sandboxed iframe — same sandbox="allow-scripts"
// no-allow-same-origin model the quest player already uses, so student JS
// never runs with page access). ──────────────────────────────────────
function buildProbeSrcDoc(files, token) {
  const html = (files || []).find((f) => extOf(f.path) === "html");
  const cssBlocks = (files || []).filter((f) => extOf(f.path) === "css")
    .map((f) => `<style>\n${f.content}\n</style>`).join("\n");
  let doc = html ? html.content : "<!doctype html><html><head></head><body></body></html>";
  if (!/<\/head>/i.test(doc)) doc = doc.replace(/<html[^>]*>/i, (m) => `${m}<head></head>`);
  if (!/<\/body>/i.test(doc)) doc = doc.replace(/<\/html>/i, `</body></html>`);
  doc = doc.replace(/<\/head>/i, `${cssBlocks}\n</head>`);
  const script = `<script>
(function(){
  var TOKEN = ${JSON.stringify(token)};
  window.addEventListener("message", function(e){
    if(!e.data || e.data.token !== TOKEN) return;
    var out = (e.data.items || []).map(function(item){
      try {
        var el = document.querySelector(item.selector);
        if(!el) return null;
        var val = getComputedStyle(el)[item.property];
        return String(val || "").replace(/\\s+/g, "");
      } catch(err) { return null; }
    });
    window.parent.postMessage({ type: "probe-results", token: TOKEN, values: out }, "*");
  });
  window.parent.postMessage({ type: "probe-ready", token: TOKEN }, "*");
})();
<\/script>`;
  return doc.replace(/<\/body>/i, `${script}\n</body>`);
}

let probeCounter = 0;
function probeComputedStyles(files, items) {
  return new Promise((resolve) => {
    if (!items.length) { resolve([]); return; }
    const token = `probe-${++probeCounter}-${Date.now()}`;
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.setAttribute("sandbox", "allow-scripts");

    let settled = false;
    function cleanup() {
      window.removeEventListener("message", onMsg);
      iframe.remove();
    }
    function onMsg(e) {
      if (!e.data || e.data.token !== token) return;
      if (e.data.type === "probe-ready") {
        iframe.contentWindow?.postMessage({ token, items }, "*");
      } else if (e.data.type === "probe-results") {
        settled = true;
        resolve(e.data.values);
        cleanup();
      }
    }
    window.addEventListener("message", onMsg);
    iframe.srcdoc = buildProbeSrcDoc(files, token);
    document.body.appendChild(iframe);
    setTimeout(() => {
      if (!settled) { resolve(items.map(() => null)); cleanup(); }
    }, 2500);
  });
}

// ── Main grading pass: starter files vs the student's current draft ──
async function evaluateChallenge(checks, starterFiles, draftFiles) {
  const starterDoc = parseHtmlDoc(starterFiles);
  const studentDoc = parseHtmlDoc(draftFiles);
  const funcOk = jsSyntaxOk(draftFiles);

  const cssChecks = checks.filter((c) => c.type === "css_changed");
  let starterCss = [], studentCss = [];
  if (cssChecks.length) {
    const items = cssChecks.map((c) => ({ selector: c.selector, property: c.property }));
    [starterCss, studentCss] = await Promise.all([
      probeComputedStyles(starterFiles, items),
      probeComputedStyles(draftFiles, items),
    ]);
  }

  let cssIdx = 0;
  return checks.map((check) => {
    const points = Math.max(0, Number(check.points) || 0);

    if (check.type === "title_changed") {
      const sTitle = (starterDoc.title || "").trim();
      const tTitle = (studentDoc.title || "").trim();
      return { type: check.type, points, status: isSubstantiallyDifferent(sTitle, tTitle) ? "pass" : "fail" };
    }

    if (check.type === "element_text_changed") {
      const starterEl = starterDoc.querySelector(check.selector);
      if (!starterEl) return { type: check.type, points, status: "not_applicable" };
      const studentEl = studentDoc.querySelector(check.selector);
      const sText = starterEl.textContent || "";
      const tText = studentEl ? (studentEl.textContent || "") : "";
      return { type: check.type, points, status: isSubstantiallyDifferent(sText, tText) ? "pass" : "fail" };
    }

    if (check.type === "attribute_changed") {
      const starterEl = starterDoc.querySelector(check.selector);
      if (!starterEl || !starterEl.hasAttribute(check.attribute)) {
        return { type: check.type, points, status: "not_applicable" };
      }
      const studentEl = studentDoc.querySelector(check.selector);
      const sVal = starterEl.getAttribute(check.attribute) || "";
      const tVal = studentEl ? (studentEl.getAttribute(check.attribute) || "") : "";
      return { type: check.type, points, status: isSubstantiallyDifferent(sVal, tVal) ? "pass" : "fail" };
    }

    if (check.type === "prompt_changed") {
      const varName = check.variable || "PROMPT";
      const sVal = extractVarValue(starterFiles, varName);
      if (sVal === null) return { type: check.type, points, status: "not_applicable" };
      const tVal = extractVarValue(draftFiles, varName);
      return { type: check.type, points, status: isSubstantiallyDifferent(sVal, tVal || "") ? "pass" : "fail" };
    }

    if (check.type === "css_changed") {
      const i = cssIdx++;
      const sVal = starterCss[i];
      const tVal = studentCss[i];
      if (sVal === null || sVal === undefined) return { type: check.type, points, status: "not_applicable" };
      return { type: check.type, points, status: (tVal && tVal !== sVal) ? "pass" : "fail" };
    }

    if (check.type === "functionality") {
      // Deterministic proxy for "still works": the student's JS must at
      // least be syntactically valid. We never execute untrusted student
      // JS with page access, so this intentionally stays simple rather
      // than trying to prove runtime behavior.
      return { type: check.type, points, status: funcOk ? "pass" : "fail" };
    }

    return { type: check.type, points, status: "not_applicable" };
  });
}

export default function CodingChallengePlayground({
  content, onResult, storageKey, testMode = false, fullscreen = !testMode,
  onBack, onNext, canGoBack = false, isLast = false, onExit,
  // Same context-label pattern as CodingPlayground — this component is
  // used from Quests and Boss Battles, which want different button copy.
  exitLabel = "Exit Challenge ✕",
  finishLabel = "Finish Quest",
  // Boss Battles' countdown — see CodingPlayground for why this needs to
  // be rendered inside the portal instead of relying on the parent
  // screen's own timer (it's covered by the fullscreen overlay).
  timeLeft = null,
}) {
  const starterFiles = content.files || [];
  const checks = content.checks || [];
  const configSignature = useMemo(() => JSON.stringify(starterFiles), [starterFiles]);

  const [draftFiles, setDraftFiles] = useState(() => {
    if (!storageKey) return starterFiles;
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (stored && stored.signature === configSignature) return stored.files;
    } catch { /* corrupt draft, fall through */ }
    return starterFiles;
  });

  const [activePath, setActivePath] = useState(draftFiles[0]?.path);
  const [previewDoc, setPreviewDoc] = useState(() => buildPreviewDoc(draftFiles));
  const [runCounter, setRunCounter] = useState(0);
  const [results, setResults] = useState(Array(checks.length).fill(null));
  const [grading, setGrading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [themeAttr, setThemeAttr] = useState(null);

  function buildPreviewDoc(files) {
    const html = files.find((f) => extOf(f.path) === "html");
    const cssBlocks = files.filter((f) => extOf(f.path) === "css").map((f) => `<style>\n${f.content}\n</style>`).join("\n");
    const jsBlocks = files.filter((f) => extOf(f.path) === "js").map((f) => `<script>\n${f.content}\n<\/script>`).join("\n");
    let doc = html ? html.content : "<!doctype html><html><head></head><body></body></html>";
    if (!/<\/head>/i.test(doc)) doc = doc.replace(/<html[^>]*>/i, (m) => `${m}<head></head>`);
    if (!/<\/body>/i.test(doc)) doc = doc.replace(/<\/html>/i, `</body></html>`);
    doc = doc.replace(/<\/head>/i, `${cssBlocks}\n</head>`);
    doc = doc.replace(/<\/body>/i, `${jsBlocks}\n</body>`);
    return doc;
  }

  useLayoutEffect(() => {
    if (!fullscreen) return;
    const themedEl = document.querySelector("[data-theme]");
    setThemeAttr(themedEl ? themedEl.getAttribute("data-theme") : null);
  }, [fullscreen]);

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
    setPreviewDoc(buildPreviewDoc(draftFiles));
    setRunCounter((n) => n + 1);
  };

  // Grades silently in the background (mirrors interactive_coding's
  // pattern) so `answers` always has a fresh result, but nothing about
  // pass/fail/points is ever shown to the student mid-play — only in
  // testMode (admin builder) do results render inline.
  const grade = async () => {
    setGrading(true);
    const fresh = await evaluateChallenge(checks, starterFiles, draftFiles);
    setResults(fresh);
    const payload = { results: fresh };
    onResult?.(payload);
    setGrading(false);
    return payload;
  };

  useEffect(() => { if (checks.length) grade(); /* eslint-disable-next-line */ }, []);

  const handleNext = async () => {
    if (!onNext) return;
    setSubmitting(true);
    runProject();
    const fresh = await grade();
    setSubmitting(false);
    onNext?.(fresh);
  };

  const passedCount = results.filter((r) => r && r.status === "pass").length;
  const applicableCount = results.filter((r) => r && r.status !== "not_applicable").length;

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
            <div className="cp-title-tab" title="This is your starter project — explore and customize it">
              <span className="cp-title-tab-dot" />
              Make it yours
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
              className="cp-editor"
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
              key={runCounter}
              title="student-challenge-preview"
              className="cp-iframe"
              sandbox="allow-scripts"
              srcDoc={previewDoc}
            />
          </div>
        </div>

        {testMode && (
          <div className="cp-footer">
            <div className="cp-checks">
              {results.map((r, i) => (
                <span
                  key={i}
                  className={`cp-check-pill ${r?.status === "pass" ? "pass" : r?.status === "fail" ? "fail" : ""}`}
                >
                  {r?.status === "pass" ? "✅" : r?.status === "fail" ? "❌" : r?.status === "not_applicable" ? "⊘" : "•"}{" "}
                  {r?.type || `Check ${i + 1}`}
                </span>
              ))}
            </div>
            {results.some((r) => r) && (
              <p className="cp-summary">
                {grading ? "Grading…" : `${passedCount} / ${applicableCount} applicable checks passing (admin preview only)`}
              </p>
            )}
            <button type="button" className="btn btn-secondary cp-run-btn" onClick={grade} disabled={grading}>
              {grading ? "Grading…" : "🧪 Re-grade"}
            </button>
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