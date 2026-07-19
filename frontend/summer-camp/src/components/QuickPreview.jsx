import StudentPreview from "./StudentPreview";
import { activityMeta } from "./activityTypes";

export default function QuickPreview({ question, onClose }) {
  const meta = activityMeta(question.question_type);
  return (
    <div className="cb-quickpreview-overlay" onClick={onClose}>
      <div className="cb-quickpreview" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span className="cb-chip" style={{ "--tint": meta.tint }}>{meta.icon} {meta.label}</span>
          <button className="cb-close" onClick={onClose}>✕</button>
        </div>
        <StudentPreview type={question.question_type} content={question.content} />
      </div>
    </div>
  );
}
