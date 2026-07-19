export default function FillBlankEditor({ content, onChange }) {
  const set = (patch) => onChange({ ...content, ...patch });

  return (
    <>
      <div className="cb-field">
        <label>Question, with a ___ where the blank goes</label>
        <input
          type="text"
          placeholder="A ___ is what you type to instruct an AI model."
          value={content.question}
          onChange={(e) => set({ question: e.target.value })}
        />
      </div>
      <div className="cb-field">
        <label>Correct answer</label>
        <input
          type="text"
          placeholder="prompt"
          value={content.answer}
          onChange={(e) => set({ answer: e.target.value })}
        />
      </div>
    </>
  );
}
