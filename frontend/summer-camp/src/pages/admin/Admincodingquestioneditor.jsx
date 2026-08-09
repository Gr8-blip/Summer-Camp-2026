import { useState } from "react";
import CodingPlayground from "../../components/CodingPlayGround"; // adjust path to wherever you land it

/**
 * Wire into QuestionEditorPanel: when `type === "interactive_coding"`,
 * render this instead of the normal field form, e.g.:
 *
 *   if (type === "interactive_coding") {
 *     return (
 *       <AdminCodingQuestionEditor
 *         initialContent={initialContent}
 *         initialPoints={initialPoints}
 *         saving={saving}
 *         onBack={onBack}
 *         onSave={onSave}   // same ({question_type, content, points}) => {} contract
 *       />
 *     );
 *   }
 *
 * Also add one card to ActivityTypePicker's list of pickable types:
 *   { type: "interactive_coding", label: "Interactive Coding", icon: "💻",
 *     blurb: "Students edit a real HTML/CSS/JS project and we check the result." }
 */

const DEFAULT_FILES = [
  { path: "index.html", content: "<!doctype html>\n<html>\n<head>\n  <title>My Page</title>\n</head>\n<body>\n  <h1>Hello</h1>\n</body>\n</html>" },
  { path: "styles.css", content: "h1 {\n  color: #333;\n}" },
  { path: "script.js", content: "// optional" },
];

const CHECK_TYPES = [
  { value: "element_exists", label: "Element exists", fields: ["selector"] },
  { value: "element_text", label: "Element text equals", fields: ["selector", "expected"] },
  { value: "css_property", label: "CSS property equals", fields: ["selector", "property", "expected"] },
  { value: "element_attribute", label: "Attribute equals", fields: ["selector", "attribute", "expected"] },
  { value: "document_title", label: "Document title equals", fields: ["expected"] },
];

function blankCheck() {
  return { type: "element_exists", selector: "", property: "", attribute: "", expected: "" };
}

export default function AdminCodingQuestionEditor({ initialContent, initialPoints, saving, onBack, onSave }) {
  const [instruction, setInstruction] = useState(initialContent?.instruction || "");
  const [files, setFiles] = useState(initialContent?.files?.length ? initialContent.files : DEFAULT_FILES);
  const [checks, setChecks] = useState(initialContent?.checks?.length ? initialContent.checks : [blankCheck()]);
  const [points, setPoints] = useState(initialPoints ?? 10);
  const [testing, setTesting] = useState(false);
  const [err, setErr] = useState("");

  const updateFile = (path, content) => setFiles((fs) => fs.map((f) => (f.path === path ? { ...f, content } : f)));
  const addFile = () => {
    const path = prompt("Filename (e.g. extra.js)");
    if (!path) return;
    if (files.some((f) => f.path === path)) return;
    setFiles((fs) => [...fs, { path, content: "" }]);
  };
  const removeFile = (path) => setFiles((fs) => fs.filter((f) => f.path !== path));

  const updateCheck = (i, patch) => setChecks((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const addCheck = () => setChecks((cs) => [...cs, blankCheck()]);
  const removeCheck = (i) => setChecks((cs) => cs.filter((_, idx) => idx !== i));

  const validate = () => {
    if (!instruction.trim()) return "Instruction is required.";
    if (!files.some((f) => f.path.endsWith(".html"))) return "Need at least one .html file.";
    if (!checks.length) return "Add at least one validation check.";
    for (const c of checks) {
      const def = CHECK_TYPES.find((t) => t.value === c.type);
      for (const field of def.fields) {
        if (!String(c[field] || "").trim()) return `Check "${def.label}" is missing ${field}.`;
      }
    }
    return "";
  };

  const save = () => {
    const problem = validate();
    if (problem) { setErr(problem); return; }
    setErr("");
    onSave({
      question_type: "interactive_coding",
      content: { instruction, languages: ["html", "css", "js"], files, checks },
      points: Number(points),
    });
  };

  return (
    <div className="cb-edit-panel">
      <h2>💻 Interactive Coding Question</h2>

      <div className="form-group">
        <label>Instruction</label>
        <textarea rows={2} value={instruction} onChange={(e) => setInstruction(e.target.value)}
          placeholder="e.g. Change the <h1> text to 'Mission Control' and make it blue." />
      </div>

      <div className="form-group">
        <label>Starter Files</label>
        {files.map((f) => (
          <div key={f.path} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".78rem", fontWeight: 700 }}>
              <span>{f.path}</span>
              {files.length > 1 && <button className="btn btn-secondary" style={{ padding: "2px 8px" }} onClick={() => removeFile(f.path)}>✕</button>}
            </div>
            <textarea
              rows={6}
              style={{ fontFamily: "monospace", fontSize: ".8rem", width: "100%" }}
              value={f.content}
              onChange={(e) => updateFile(f.path, e.target.value)}
            />
          </div>
        ))}
        <button className="btn btn-secondary" onClick={addFile}>+ Add file</button>
      </div>

      <div className="form-group">
        <label>Validation Checks</label>
        {checks.map((c, i) => {
          const def = CHECK_TYPES.find((t) => t.value === c.type);
          return (
            <div key={i} className="form-row" style={{ alignItems: "flex-end", marginBottom: 8 }}>
              <select value={c.type} onChange={(e) => updateCheck(i, { type: e.target.value })}>
                {CHECK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {def.fields.includes("selector") && (
                <input placeholder="CSS selector (e.g. h1)" value={c.selector} onChange={(e) => updateCheck(i, { selector: e.target.value })} />
              )}
              {def.fields.includes("property") && (
                <input placeholder="CSS property (e.g. color)" value={c.property} onChange={(e) => updateCheck(i, { property: e.target.value })} />
              )}
              {def.fields.includes("attribute") && (
                <input placeholder="Attribute (e.g. alt)" value={c.attribute} onChange={(e) => updateCheck(i, { attribute: e.target.value })} />
              )}
              {def.fields.includes("expected") && (
                <input placeholder="Expected value" value={c.expected} onChange={(e) => updateCheck(i, { expected: e.target.value })} />
              )}
              <button className="btn btn-secondary" onClick={() => removeCheck(i)}>✕</button>
            </div>
          );
        })}
        <button className="btn btn-secondary" onClick={addCheck}>+ Add check</button>
      </div>

      <div className="form-group">
        <label>Points</label>
        <input type="number" min="1" value={points} onChange={(e) => setPoints(e.target.value)} style={{ maxWidth: 120 }} />
      </div>

      <button className="btn btn-secondary" onClick={() => setTesting((t) => !t)} style={{ marginBottom: 12 }}>
        {testing ? "Hide Test Quest" : "🧪 Test Quest"}
      </button>

      {testing && (
        <div style={{ marginBottom: 16, border: "2px dashed var(--color-border)", borderRadius: 12, padding: 12 }}>
          <CodingPlayground
            content={{ instruction, files, checks }}
            testMode
            onResult={() => {}}
          />
        </div>
      )}

      {err && <div className="error-text" style={{ marginBottom: 12 }}>⚠️ {err}</div>}

      <div className="a-modal-actions">
        <button className="btn btn-secondary" onClick={onBack}>Back</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? <span className="spinner" /> : "Save"}</button>
      </div>
    </div>
  );
}