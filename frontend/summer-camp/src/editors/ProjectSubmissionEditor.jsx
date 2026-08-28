import "./projectsubmissioneditor.css";

// Fits the same {content, onChange} contract as every other editor in
// editors/ (see InteractiveCodingEditor.jsx) — QuestionEditorPanel already
// owns points, save/cancel, and the StudentPreview pane.
//
// Mirrors project_verifier.py's CHECK_HANDLERS registry — every `value`
// below must match a key there exactly, and the `fields` list controls
// which inputs get shown so an admin can't build a check the backend
// doesn't know what to do with. If a new check type gets added to
// CHECK_HANDLERS, add its entry here too.

const CHECK_TYPES = [
  { value: "url_status", label: "URL responds with status", icon: "📡", fields: ["expected"], targets: ["url"] },
  { value: "file_exists", label: "File exists in ZIP", icon: "📄", fields: ["path"], targets: ["zip"] },
  { value: "same_directory", label: "Files share a directory", icon: "🗂️", fields: ["files"], targets: ["zip"] },
  { value: "text_exists", label: "Text appears anywhere on page", icon: "🔤", fields: ["path", "text"], targets: ["zip", "url"] },
  { value: "element_exists", label: "Element exists", icon: "🔎", fields: ["path", "selector"], targets: ["zip", "url"] },
  { value: "element_text", label: "Element contains text", icon: "📝", fields: ["path", "selector", "expected"], targets: ["zip", "url"] },
  { value: "element_attribute", label: "Element attribute equals", icon: "🏷️", fields: ["path", "selector", "attribute", "expected"], targets: ["zip", "url"] },
  { value: "css_property", label: "CSS property equals (source)", icon: "🎨", fields: ["path", "selector", "property", "expected"], targets: ["zip"] },
  { value: "computed_style", label: "CSS property equals (rendered)", icon: "🖌️", fields: ["selector", "property", "expected"], targets: ["url"] },
  { value: "css_variable", label: "CSS variable equals", icon: "🧩", fields: ["path", "selector", "variable", "expected"], targets: ["zip", "url"] },
];

// Placeholders + labels per field key, since the same key (e.g.
// "expected") means something different depending on the check type.
const FIELD_META = {
  path: { placeholder: "e.g. index.html (leave blank for top-level)" },
  selector: { placeholder: "e.g. h1, .card, #main" },
  attribute: { placeholder: "e.g. href, src, alt" },
  property: { placeholder: "e.g. color, font-size" },
  variable: { placeholder: "e.g. --primary-color" },
  text: { placeholder: "Text to search for" },
  files: { placeholder: "e.g. index.html, style.css" },
};

function expectedPlaceholder(type) {
  if (type === "url_status") return "e.g. 200";
  if (type === "element_text") return "e.g. I AM LIVE 🚀";
  if (type === "element_attribute") return "e.g. /home";
  if (type === "css_property" || type === "computed_style" || type === "css_variable") return "e.g. #ff00ff";
  return "";
}

function blankCheck(target, type = "url_status") {
  return {
    type,
    target,
    path: "",
    selector: type === "css_variable" ? ":root" : "",
    attribute: "",
    property: "",
    variable: "",
    text: "",
    expected: type === "url_status" ? 200 : "",
    files: [],
  };
}

// When switching a check's type, keep any field values that are still
// meaningful for the new type instead of wiping the card back to blank —
// e.g. going from element_exists -> element_text keeps the selector.
function pickCarryOver(oldCheck, newDef) {
  const carry = {};
  for (const field of newDef.fields) {
    if (field === "expected") continue; // meaning changes too much between types
    if (oldCheck[field] !== undefined && oldCheck[field] !== "") {
      carry[field] = oldCheck[field];
    }
  }
  return carry;
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
            return (
              <div key={i} className="pse-check-card">
                <div className="pse-check-head">
                  <select
                    value={c.type}
                    onChange={(e) => {
                      const newDef = CHECK_TYPES.find((t) => t.value === e.target.value);
                      const validTarget = newDef.targets.includes(c.target) ? c.target : newDef.targets[0];
                      const fresh = blankCheck(validTarget, e.target.value);
                      updateCheck(i, { ...fresh, ...pickCarryOver(c, newDef) });
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
                    <input
                      placeholder={FIELD_META.path.placeholder}
                      value={c.path}
                      onChange={(e) => updateCheck(i, { path: e.target.value })}
                    />
                  )}
                  {def.fields.includes("selector") && (
                    <input
                      placeholder={c.type === "css_variable" ? ":root (default)" : FIELD_META.selector.placeholder}
                      value={c.selector}
                      onChange={(e) => updateCheck(i, { selector: e.target.value })}
                    />
                  )}
                  {def.fields.includes("attribute") && (
                    <input
                      placeholder={FIELD_META.attribute.placeholder}
                      value={c.attribute}
                      onChange={(e) => updateCheck(i, { attribute: e.target.value })}
                    />
                  )}
                  {def.fields.includes("property") && (
                    <input
                      placeholder={FIELD_META.property.placeholder}
                      value={c.property}
                      onChange={(e) => updateCheck(i, { property: e.target.value })}
                    />
                  )}
                  {def.fields.includes("variable") && (
                    <input
                      placeholder={FIELD_META.variable.placeholder}
                      value={c.variable}
                      onChange={(e) => updateCheck(i, { variable: e.target.value })}
                    />
                  )}
                  {def.fields.includes("text") && (
                    <input
                      placeholder={FIELD_META.text.placeholder}
                      value={c.text}
                      onChange={(e) => updateCheck(i, { text: e.target.value })}
                    />
                  )}
                  {def.fields.includes("expected") && (
                    c.type === "url_status" ? (
                      <input
                        type="number"
                        placeholder={expectedPlaceholder(c.type)}
                        value={c.expected}
                        onChange={(e) => updateCheck(i, { expected: Number(e.target.value) })}
                      />
                    ) : (
                      <input
                        placeholder={expectedPlaceholder(c.type)}
                        value={c.expected}
                        onChange={(e) => updateCheck(i, { expected: e.target.value })}
                      />
                    )
                  )}
                  {def.fields.includes("files") && (
                    <input
                      placeholder={FIELD_META.files.placeholder}
                      value={(c.files || []).join(", ")}
                      onChange={(e) => updateCheck(i, { files: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                    />
                  )}
                </div>
                {(c.type === "css_property" || c.type === "computed_style" || c.type === "css_variable") && (
                  <p className="pse-hint pse-check-note">
                    Colors are compared loosely — <code>#ff00ff</code> and <code>rgb(255, 0, 255)</code> count as a match.
                  </p>
                )}
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