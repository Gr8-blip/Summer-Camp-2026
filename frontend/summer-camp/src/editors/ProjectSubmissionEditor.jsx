import "./projectsubmissioneditor.css";

// Fits the same {content, onChange} contract as every other editor in
// editors/ (see InteractiveCodingEditor.jsx) — QuestionEditorPanel already
// owns points, save/cancel, and the StudentPreview pane.

const CHECK_TYPES = [
  { value: "url_status", label: "URL responds with status", icon: "📡", fields: ["expected"], targets: ["url"] },
  { value: "file_exists", label: "File exists in ZIP", icon: "📄", fields: ["path"], targets: ["zip"] },
  { value: "same_directory", label: "Files share a directory", icon: "🗂️", fields: ["files"], targets: ["zip"] },
  { value: "text_exists", label: "Text appears on page", icon: "🔤", fields: ["path", "text"], targets: ["zip", "url"] },
  { value: "element_exists", label: "Element exists", icon: "🔎", fields: ["path", "selector"], targets: ["zip", "url"] },
];

function blankCheck(target) {
  return { type: "url_status", target, path: "", selector: "", text: "", expected: 200, files: [] };
}

export default function ProjectSubmissionEditor({ content, onChange }) {
  const submission = content.submission || { url: false, zip: false };
  const checks = content.checks || [];

  const toggleSubmission = (key) =>
    onChange({ ...content, submission: { ...submission, [key]: !submission[key] } });

  const updateCheck = (i, patch) =>
    onChange({ ...content, checks: checks.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) });

  const addCheck = () => {
    const defaultTarget = submission.url ? "url" : "zip";
    onChange({ ...content, checks: [...checks, blankCheck(defaultTarget)] });
  };
  const removeCheck = (i) => onChange({ ...content, checks: checks.filter((_, idx) => idx !== i) });

  const availableTargets = [
    submission.url && "url",
    submission.zip && "zip",
  ].filter(Boolean);

  return (
    <div className="pse">
      <div className="pse-field">
        <label>Instruction</label>
        <textarea
          rows={2}
          value={content.instruction || ""}
          onChange={(e) => onChange({ ...content, instruction: e.target.value })}
          placeholder="e.g. Prepare your website for launch."
        />
      </div>

      <div className="pse-field">
        <label>What students submit</label>
        <div className="pse-submission-toggles">
          <label className="pse-toggle">
            <input type="checkbox" checked={!!submission.url} onChange={() => toggleSubmission("url")} />
            Live URL
          </label>
          <label className="pse-toggle">
            <input type="checkbox" checked={!!submission.zip} onChange={() => toggleSubmission("zip")} />
            ZIP upload
          </label>
        </div>
        {!submission.url && !submission.zip && (
          <p className="pse-hint">Turn on at least one so students have something to submit.</p>
        )}
      </div>

      <div className="pse-field">
        <label>Validation Checks <span className="pse-hint">— run server-side against whatever the student submits</span></label>
        <div className="pse-checks">
          {checks.map((c, i) => {
            const def = CHECK_TYPES.find((t) => t.value === c.type);
            const targetOptions = def.targets.filter((t) => availableTargets.includes(t));
            return (
              <div key={i} className="pse-check-card">
                <div className="pse-check-head">
                  <select
                    value={c.type}
                    onChange={(e) => {
                      const newDef = CHECK_TYPES.find((t) => t.value === e.target.value);
                      const validTarget = newDef.targets.includes(c.target) ? c.target : newDef.targets[0];
                      updateCheck(i, { type: e.target.value, target: validTarget });
                    }}
                  >
                    {CHECK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                  </select>
                  <select value={c.target} onChange={(e) => updateCheck(i, { target: e.target.value })}>
                    {def.targets.map((t) => (
                      <option key={t} value={t} disabled={!availableTargets.includes(t)}>
                        target: {t}{!availableTargets.includes(t) ? " (not enabled above)" : ""}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="pse-check-remove" onClick={() => removeCheck(i)}>✕</button>
                </div>
                <div className="pse-check-body">
                  {def.fields.includes("path") && c.target === "zip" && (
                    <input placeholder="File path in ZIP — e.g. index.html" value={c.path} onChange={(e) => updateCheck(i, { path: e.target.value })} />
                  )}
                  {def.fields.includes("selector") && (
                    <input placeholder="CSS selector — e.g. h1" value={c.selector} onChange={(e) => updateCheck(i, { selector: e.target.value })} />
                  )}
                  {def.fields.includes("text") && (
                    <input placeholder="Text that must appear" value={c.text} onChange={(e) => updateCheck(i, { text: e.target.value })} />
                  )}
                  {def.fields.includes("expected") && (
                    <input type="number" placeholder="Expected status — e.g. 200" value={c.expected} onChange={(e) => updateCheck(i, { expected: Number(e.target.value) })} />
                  )}
                  {def.fields.includes("files") && (
                    <input
                      placeholder="Filenames, comma separated — e.g. index.html, style.css"
                      value={(c.files || []).join(", ")}
                      onChange={(e) => updateCheck(i, { files: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                    />
                  )}
                </div>
              </div>
            );
          })}
          <button type="button" className="pse-add-check" onClick={addCheck} disabled={availableTargets.length === 0}>
            + Add check
          </button>
        </div>
      </div>
    </div>
  );
}