export default function PromptBuildEditor({ content, onChange }) {
  const set = (patch) => onChange({ ...content, ...patch });

  return (
    <>
      <div className="cb-field">
        <label>Task</label>
        <textarea
          placeholder="Write a prompt that makes the AI act like a football coach."
          value={content.task}
          onChange={(e) => set({ task: e.target.value })}
        />
      </div>
      <div className="cb-field">
        <label>Example solution (optional — for grading reference only)</label>
        <textarea
          placeholder="You are an energetic football coach. Motivate the user and…"
          value={content.answer}
          onChange={(e) => set({ answer: e.target.value })}
        />
      </div>
    </>
  );
}
