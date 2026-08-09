import { useState } from "react";
import CodingPlayground from "../components/CodingPlayGround";
import "./interactivecodingeditor.css";

// Fits the same {content, onChange} contract every other editor in editors/
// uses — QuestionEditorPanel already owns points, save/cancel, and the
// StudentPreview pane.

const CHECK_TYPES = [
  { value: "element_exists", label: "Element exists", icon: "🔎", fields: ["selector"] },
  { value: "element_text", label: "Text equals", icon: "🔤", fields: ["selector", "expected"] },
  { value: "css_property", label: "CSS property equals", icon: "🎨", fields: ["selector", "property", "expected"] },
  { value: "element_attribute", label: "Attribute equals", icon: "🏷️", fields: ["selector", "attribute", "expected"] },
  { value: "document_title", label: "Page title equals", icon: "🔖", fields: ["expected"] },
];

function blankCheck() {
  return { type: "element_exists", selector: "", property: "", attribute: "", expected: "" };
}

export default function InteractiveCodingEditor({ content, onChange }) {
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

  return (
    <div className="ice">
      <div className="ice-field">
        <label>Instruction</label>
        <textarea
          rows={2}
          value={content.instruction || ""}
          onChange={(e) => onChange({ ...content, instruction: e.target.value })}
          placeholder="e.g. Change the <h1> text to 'Mission Control' and make it blue."
        />
      </div>

      <div className="ice-field">
        <label>Starter Files</label>
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
        <label>Validation Checks <span className="ice-hint">— the student never sees pass/fail until they hit Finish Quest</span></label>
        <div className="ice-checks">
          {checks.map((c, i) => {
            const def = CHECK_TYPES.find((t) => t.value === c.type);
            return (
              <div key={i} className="ice-check-card">
                <div className="ice-check-head">
                  <select value={c.type} onChange={(e) => updateCheck(i, { type: e.target.value })}>
                    {CHECK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                  </select>
                  <button type="button" className="ice-check-remove" onClick={() => removeCheck(i)}>✕</button>
                </div>
                <div className="ice-check-body">
                  {def.fields.includes("selector") && (
                    <input placeholder="CSS selector — e.g. h1" value={c.selector} onChange={(e) => updateCheck(i, { selector: e.target.value })} />
                  )}
                  {def.fields.includes("property") && (
                    <input placeholder="CSS property — e.g. color" value={c.property} onChange={(e) => updateCheck(i, { property: e.target.value })} />
                  )}
                  {def.fields.includes("attribute") && (
                    <input placeholder="Attribute — e.g. alt" value={c.attribute} onChange={(e) => updateCheck(i, { attribute: e.target.value })} />
                  )}
                  {def.fields.includes("expected") && (
                    <input placeholder="Expected value" value={c.expected} onChange={(e) => updateCheck(i, { expected: e.target.value })} />
                  )}
                </div>
              </div>
            );
          })}
          <button type="button" className="ice-add-check" onClick={addCheck}>+ Add check</button>
        </div>
      </div>

      <button type="button" className="ice-test-toggle" onClick={() => setTesting((t) => !t)}>
        {testing ? "Hide Test Quest" : "🧪 Test Quest"}
      </button>

      {testing && (
        <div className="ice-test-frame">
          <CodingPlayground content={content} testMode fullscreen={false} onResult={() => {}} />
        </div>
      )}
    </div>
  );
}