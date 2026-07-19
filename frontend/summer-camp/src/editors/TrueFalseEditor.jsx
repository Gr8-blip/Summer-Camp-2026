export default function TrueFalseEditor({ content, onChange }) {
  const set = (patch) => onChange({ ...content, ...patch });

  return (
    <>
      <div className="cb-field">
        <label>Statement</label>
        <input
          type="text"
          placeholder="Chatbots always tell the truth."
          value={content.question}
          onChange={(e) => set({ question: e.target.value })}
        />
      </div>

      <div className="cb-field">
        <label>Correct answer</label>
        <div style={{ display: "flex", gap: 10 }}>
          {[true, false].map((val) => (
            <button
              key={String(val)}
              type="button"
              onClick={() => set({ answer: val })}
              className="cb-btn"
              style={{
                flex: 1, padding: "18px 0", fontSize: "1rem",
                background: content.answer === val ? "var(--cb-tf)" : "var(--cb-line)",
                color: content.answer === val ? "white" : "#55503f",
              }}
            >
              {val ? "True" : "False"}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
