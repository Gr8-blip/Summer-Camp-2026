import { useState } from "react";

export default function WordSearchEditor({ content, onChange }) {
  const words = content.words || [];
  const [draft, setDraft] = useState("");
  const set = (patch) => onChange({ ...content, ...patch });

  const addWord = () => {
    const val = draft.trim().toUpperCase();
    if (!val || words.includes(val)) return;
    set({ words: [...words, val] });
    setDraft("");
  };
  const removeWord = (i) => set({ words: words.filter((_, n) => n !== i) });

  return (
    <>
      <div className="cb-field">
        <label>Instructions (optional)</label>
        <input
          type="text"
          placeholder="Find these AI terms hidden in the grid"
          value={content.question || ""}
          onChange={(e) => set({ question: e.target.value })}
        />
      </div>

      <div className="cb-field">
        <label>Words to hide — the puzzle grid is generated automatically</label>
        <div style={{ display: "flex", gap: 8, marginBottom: words.length ? 10 : 0 }}>
          <input
            type="text"
            placeholder="e.g. PROMPT"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addWord())}
            style={{ flex: 1, border: "2px solid var(--cb-line)", borderRadius: 10, padding: "8px 10px" }}
          />
          <button type="button" className="cb-btn" style={{ background: "var(--cb-search)", color: "white" }} onClick={addWord}>
            + Add word
          </button>
        </div>

        {words.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {words.map((w, i) => (
              <span
                key={w + i}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  background: "color-mix(in srgb, var(--cb-search) 14%, white)",
                  color: "var(--cb-search)", fontWeight: 700, fontSize: ".8rem",
                  padding: "6px 10px", borderRadius: 999,
                }}
              >
                {w}
                <button
                  onClick={() => removeWord(i)}
                  style={{ border: "none", background: "none", cursor: "pointer", color: "inherit", fontWeight: 800 }}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
