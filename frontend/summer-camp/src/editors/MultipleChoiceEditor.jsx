export default function MultipleChoiceEditor({ content, onChange }) {
  const set = (patch) => onChange({ ...content, ...patch });
  const setOption = (i, value) =>
    set({ options: content.options.map((o, n) => (n === i ? value : o)) });

  return (
    <>
      <div className="cb-field">
        <label>Question</label>
        <input
          type="text"
          placeholder="Which one of these is AI?"
          value={content.question}
          onChange={(e) => set({ question: e.target.value })}
        />
      </div>

      <div className="cb-field">
        <label>Options — mark the correct one</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {content.options.map((opt, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                type="button"
                onClick={() => set({ answer: i })}
                title="Mark correct"
                style={{
                  width: 26, height: 26, borderRadius: "50%", flexShrink: 0, cursor: "pointer",
                  border: content.answer === i ? "2px solid var(--cb-mc)" : "2px solid var(--cb-line)",
                  background: content.answer === i ? "var(--cb-mc)" : "white",
                  color: "white", fontSize: ".7rem", fontWeight: 800,
                }}
              >
                {content.answer === i ? "✓" : ""}
              </button>
              <input
                type="text"
                placeholder={`Option ${"ABCD"[i]}`}
                value={opt}
                onChange={(e) => setOption(i, e.target.value)}
              />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
