import { activityMeta } from "./activityTypes";

export default function QuestionCard({
  question, index, dragging,
  onDragStart, onDragOver, onDrop, onDragEnd,
  onPreview, onEdit, onDuplicate, onDelete,
}) {
  const meta = activityMeta(question.question_type);
  const label = question.content?.question || question.content?.task || "Untitled activity";

  return (
    <div
      className={`cb-qcard ${dragging ? "dragging" : ""}`}
      style={{ "--tint": meta.tint }}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <span className="cb-drag-handle">⠿</span>
      <span className="cb-lvl-tag">LVL {String(index + 1).padStart(2, "0")}</span>
      <span className="cb-qcard-icon">{meta.icon}</span>

      <div className="cb-qcard-main">
        <strong>{label}</strong>
        <div className="cb-qcard-meta">
          <span className="cb-chip" style={{ "--tint": meta.tint }}>{meta.label}</span>
          <span style={{ fontSize: ".76rem", color: "#9a9384" }}>{question.points} pts</span>
        </div>
      </div>

      <div className="cb-qcard-actions">
        <button className="cb-icon-btn" title="Preview" onClick={onPreview}>👁</button>
        <button className="cb-icon-btn" title="Edit" onClick={onEdit}>✎</button>
        <button className="cb-icon-btn" title="Duplicate" onClick={onDuplicate}>⧉</button>
        <button className="cb-icon-btn danger" title="Delete" onClick={onDelete}>🗑</button>
      </div>
    </div>
  );
}
