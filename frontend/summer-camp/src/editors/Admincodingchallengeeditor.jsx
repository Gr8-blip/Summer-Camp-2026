import { useState } from "react";
import CodingChallengePlayground from "../components/CodingChallengePlayground";
// Reuses the same visual language as InteractiveCodingEditor (ice-*
// classes) so it doesn't look bolted on — no new CSS file needed.
import "./interactivecodingeditor.css";

// Fits the same {content, onChange} contract every other editor in
// editors/ uses. Separate from InteractiveCodingEditor — coding_challenge
// checks are NOT exact-value checks, they detect meaningful customization,
// so the fields/options are intentionally different.

const CHALLENGE_CHECK_TYPES = [
  { value: "title_changed", label: "Page title substantially changed", icon: "🔖", fields: [] },
  { value: "element_text_changed", label: "Element text substantially changed", icon: "🔤", fields: ["selector"] },
  { value: "attribute_changed", label: "Attribute meaningfully changed", icon: "🏷️", fields: ["selector", "attribute"] },
  { value: "prompt_changed", label: "AI prompt substantially changed", icon: "🤖", fields: ["variable"] },
  { value: "css_changed", label: "CSS property meaningfully changed", icon: "🎨", fields: ["selector", "property"] },
  { value: "functionality", label: "Project still works", icon: "⚙️", fields: [] },
];

function blankCheck() {
  return { type: "element_text_changed", selector: "", attribute: "", property: "", variable: "PROMPT", points: 10 };
}

export default function AdminCodingChallengeEditor({ content, onChange }) {
  const [testing, setTesting] = useState(false);
  const files = content.files || [];
  const checks = content.checks || [];
  const [activePath, setActivePath] = useState(files[0]?.path);
  const activeFile = files.find((f) => f.path === activePath) || files[0];

  const updateFile = (path, val) =>
    onChange({ ...content, files: files.map((f) => (f.path === path ? { ...f, content: val } : f)) });

  const addFile = () => {
    const path = prompt("Filename (e.g. extra.js)");
    if (!path || files.some((f) => f.path === path)) return;
    onChange({ ...content, files: [...files, { path, content: "" }] });
    setActivePath(path);
  };

  const removeFile = (path) => {
    const next = files.filter((f) => f.path !== path);
    onChange({ ...content, files: next });
    if (activePath === path) setActivePath(next[0]?.path);
  };

  const updateCheck = (i, patch) =>
    onChange({ ...content, checks: checks.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) });

  const addCheck = () => onChange({ ...content, checks: [...checks, blankCheck()] });
  const removeCheck = (i) => onChange({ ...content, checks: checks.filter((_, idx) => idx !== i) });

  const totalPoints = checks.reduce((sum, c) => sum + (Number(c.points) || 0), 0);

  return (
    <div className="ice">
      <div className="ice-field">
        <label>Challenge Instruction <span className="ice-hint">— open-ended, don't give exact values to copy</span></label>
        <textarea
          rows={3}
          value={content.instruction || ""}
          onChange={(e) => onChange({ ...content, instruction: e.target.value })}
          placeholder="e.g. Customize this AI assistant using everything you've learned. Change its content, appearance, and personality while keeping it functional."
        />
      </div>

      <div className="ice-field">
        <label>Starter Project <span className="ice-hint">— the complete project students will explore and customize</span></label>
        <div className="ice-file-editor">
          <div className="ice-file-tabs">
            {files.map((f) => (
              <button
                key={f.path}
                type="button"
                className={`ice-file-tab ${f.path === activePath ? "active" : ""}`}
                onClick={() => setActivePath(f.path)}
              >
                {f.path}
                {files.length > 1 && (
                  <span
                    className="ice-file-tab-close"
                    onClick={(e) => { e.stopPropagation(); removeFile(f.path); }}
                  >
                    ✕
                  </span>
                )}
              </button>
            ))}
            <button type="button" className="ice-file-tab ice-file-tab-add" onClick={addFile}>+ File</button>
          </div>
          <textarea
            className="ice-code-area"
            spellCheck={false}
            value={activeFile?.content || ""}
            onChange={(e) => updateFile(activePath, e.target.value)}
            placeholder="// starter code for this file"
          />
        </div>
      </div>

      <div className="ice-field">
        <label>
          Scoring Checks{" "}
          <span className="ice-hint">
            — optional/non-blocking: a check only counts if that element/attribute/variable actually
            exists in YOUR starter project above. Total: {totalPoints} pts across {checks.length} check{checks.length === 1 ? "" : "s"}.
          </span>
        </label>
        <div className="ice-checks">
          {checks.map((c, i) => {
            const def = CHALLENGE_CHECK_TYPES.find((t) => t.value === c.type) || CHALLENGE_CHECK_TYPES[0];
            return (
              <div key={i} className="ice-check-card">
                <div className="ice-check-head">
                  <select value={c.type} onChange={(e) => updateCheck(i, { type: e.target.value })}>
                    {CHALLENGE_CHECK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                  </select>
                  <input
                    type="number"
                    min="0"
                    style={{ width: 70, flexShrink: 0 }}
                    value={c.points ?? 10}
                    onChange={(e) => updateCheck(i, { points: Number(e.target.value) })}
                    title="Points for this check"
                  />
                  <button type="button" className="ice-check-remove" onClick={() => removeCheck(i)}>✕</button>
                </div>
                <div className="ice-check-body">
                  {def.fields.includes("selector") && (
                    <input placeholder="CSS selector — e.g. h1, h2" value={c.selector || ""} onChange={(e) => updateCheck(i, { selector: e.target.value })} />
                  )}
                  {def.fields.includes("attribute") && (
                    <input placeholder="Attribute — e.g. alt" value={c.attribute || ""} onChange={(e) => updateCheck(i, { attribute: e.target.value })} />
                  )}
                  {def.fields.includes("property") && (
                    <input placeholder="CSS property — e.g. backgroundColor, fontFamily" value={c.property || ""} onChange={(e) => updateCheck(i, { property: e.target.value })} />
                  )}
                  {def.fields.includes("variable") && (
                    <input placeholder="JS variable name — e.g. PROMPT" value={c.variable || ""} onChange={(e) => updateCheck(i, { variable: e.target.value })} />
                  )}
                </div>
              </div>
            );
          })}
          <button type="button" className="ice-add-check" onClick={addCheck}>+ Add check</button>
        </div>
      </div>

      <button type="button" className="ice-test-toggle" onClick={() => setTesting((t) => !t)}>
        {testing ? "Hide Test Challenge" : "🧪 Test Challenge"}
      </button>

      {testing && (
        <div className="ice-test-frame">
          <CodingChallengePlayground content={content} testMode fullscreen={false} onResult={() => {}} />
        </div>
      )}
    </div>
  );
}