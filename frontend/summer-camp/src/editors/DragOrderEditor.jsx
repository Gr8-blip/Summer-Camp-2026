import { useState } from "react";

export default function DragOrderEditor({ content, onChange }) {
  const items = content.items || [];
  const [dragIndex, setDragIndex] = useState(null);
  const [draft, setDraft] = useState("");

  const set = (patch) => onChange({ ...content, ...patch });

  const addItem = () => {
    if (!draft.trim()) return;
    set({ items: [...items, draft.trim()] });
    setDraft("");
  };

  const updateItem = (i, value) =>
    set({ items: items.map((it, n) => (n === i ? value : it)) });

  const removeItem = (i) => set({ items: items.filter((_, n) => n !== i) });

  const reorder = (from, to) => {
    if (from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    set({ items: next });
  };

  return (
    <>
      <div className="cb-field">
        <label>Instruction</label>
        <input
          type="text"
          placeholder="Arrange the AI pipeline in order"
          value={content.question}
          onChange={(e) => set({ question: e.target.value })}
        />
      </div>

      <div className="cb-field">
        <label>Cards, in the correct order — drag to rearrange</label>
        <div className="cb-drag-list">
          {items.map((item, i) => (
            <div
              key={i}
              className={`cb-drag-item ${dragIndex === i ? "dragging" : ""}`}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { reorder(dragIndex, i); setDragIndex(null); }}
              onDragEnd={() => setDragIndex(null)}
            >
              <span className="cb-drag-handle">⠿</span>
              <span className="cb-order-num">{i + 1}</span>
              <input
                value={item}
                onChange={(e) => updateItem(i, e.target.value)}
              />
              <button className="cb-drag-remove" onClick={() => removeItem(i)} title="Remove">✕</button>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            placeholder="New card text…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addItem())}
            style={{ flex: 1, border: "2px solid var(--cb-line)", borderRadius: 10, padding: "8px 10px" }}
          />
          <button type="button" className="cb-btn" style={{ background: "var(--cb-drag)", color: "white" }} onClick={addItem}>
            + Add card
          </button>
        </div>
      </div>
    </>
  );
}
