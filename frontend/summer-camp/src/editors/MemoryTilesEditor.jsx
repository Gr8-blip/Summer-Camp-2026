export default function MemoryTilesEditor({ content, onChange }) {
  const pairs = content.pairs || [];
  const set = (patch) => onChange({ ...content, ...patch });

  const setPairs = (next) => set({ pairs: next });
  const updateLeft = (i, value) => {
    const next = [...pairs];
    next[i] = [value, next[i][1]];
    setPairs(next);
  };
  const updateRight = (i, value) => {
    const next = [...pairs];
    next[i] = [next[i][0], value];
    setPairs(next);
  };
  const addPair = () => setPairs([...pairs, ["", ""]]);
  const removePair = (i) => setPairs(pairs.filter((_, n) => n !== i));

  return (
    <>
      <div className="cb-field">
        <label>Instruction (optional)</label>
        <input
          type="text"
          placeholder="Find the matching pairs"
          value={content.question || ""}
          onChange={(e) => set({ question: e.target.value })}
        />
      </div>

      <div className="cb-field">
        <label>Pairs — Left Card ↔ Right Card</label>
        <div className="cb-pairs">
          {pairs.map(([leftVal, rightVal], i) => (
            <div className="cb-pair-row" key={i}>
              <input placeholder="Prompt" value={leftVal} onChange={(e) => updateLeft(i, e.target.value)} />
              <span className="cb-pair-link">↔</span>
              <input placeholder="Instructions given to AI" value={rightVal} onChange={(e) => updateRight(i, e.target.value)} />
              <button className="cb-drag-remove" onClick={() => removePair(i)} title="Delete pair">✕</button>
            </div>
          ))}
        </div>
        <button type="button" className="cb-btn-add" onClick={addPair} style={{ marginTop: pairs.length ? 10 : 0 }}>
          + Add pair
        </button>
      </div>
    </>
  );
}
