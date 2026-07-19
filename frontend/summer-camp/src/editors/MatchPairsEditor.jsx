export default function MatchPairsEditor({ content, onChange }) {
  const pairs = Object.entries(content.pairs || {});
  const set = (patch) => onChange({ ...content, ...patch });

  const setPairs = (nextPairs) => set({ pairs: Object.fromEntries(nextPairs) });

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
        <label>Instruction</label>
        <input
          type="text"
          placeholder="Match each term to what it means"
          value={content.question}
          onChange={(e) => set({ question: e.target.value })}
        />
      </div>

      <div className="cb-field">
        <label>Pairs</label>
        <div className="cb-pairs">
          {pairs.map(([left, right], i) => (
            <div className="cb-pair-row" key={i}>
              <input placeholder="Prompt" value={left} onChange={(e) => updateLeft(i, e.target.value)} />
              <span className="cb-pair-link">↔</span>
              <input placeholder="Question" value={right} onChange={(e) => updateRight(i, e.target.value)} />
              <button className="cb-drag-remove" onClick={() => removePair(i)} title="Remove pair">✕</button>
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
