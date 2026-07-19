import { useState } from "react";
import { activityMeta } from "../components/activityTypes";
import StudentPreview from "../components/StudentPreview";
import MultipleChoiceEditor from "../editors/MultipleChoiceEditor";
import TrueFalseEditor from "../editors/TrueFalseEditor";
import DragOrderEditor from "../editors/DragOrderEditor";
import MatchPairsEditor from "../editors/MatchPairsEditor";
import FillBlankEditor from "../editors/FillBlankEditor";
import PromptBuildEditor from "../editors/PromptBuildEditor";
import MemoryTilesEditor from "../editors/MemoryTilesEditor";
import WordSearchEditor from "../editors/WordSearchEditor";
import ImageRevealEditor from "../editors/ImageRevealEditor";

const EDITORS = {
  multiple_choice: MultipleChoiceEditor,
  true_false: TrueFalseEditor,
  drag_order: DragOrderEditor,
  match_pairs: MatchPairsEditor,
  fill_blank: FillBlankEditor,
  prompt_build: PromptBuildEditor,
  memory_tiles: MemoryTilesEditor,
  word_search: WordSearchEditor,
  image_reveal: ImageRevealEditor,
};

export default function QuestionEditorPanel({ type, initialContent, initialPoints, isEditing, onBack, onSave, saving }) {
  const meta = activityMeta(type);
  const Editor = EDITORS[type];
  const [content, setContent] = useState(initialContent);
  const [points, setPoints] = useState(initialPoints);

  const isFilled = (() => {
    if (type === "memory_tiles") return (content.pairs || []).length >= 2;
    if (type === "word_search") return (content.words || []).length >= 1;
    if (type === "image_reveal") return !!content.image && !!content.answer;
    return (content.question || content.task || "").trim().length > 0;
  })();

  return (
    <div className="cb-editor-layout">
      <div className="cb-editor-panel" style={{ "--tint": meta.tint }}>
        <button className="cb-back" onClick={onBack}>← Back to activities</button>

        <span className="cb-chip" style={{ "--tint": meta.tint }}>
          {meta.icon} {meta.label}
        </span>
        <h2 style={{ margin: "10px 0 16px" }}>
          {isEditing ? "Edit activity" : "New activity"}
        </h2>

        <Editor content={content} onChange={setContent} />

        <div className="cb-field" style={{ maxWidth: 140 }}>
          <label>Points</label>
          <input
            type="number"
            min="1"
            value={points}
            onChange={(e) => setPoints(Number(e.target.value))}
          />
        </div>

        <div className="cb-editor-actions">
          <button className="cb-btn cb-btn-ghost" onClick={onBack}>Cancel</button>
          <button
            className="cb-btn cb-btn-primary"
            style={{ "--tint": meta.tint }}
            disabled={!isFilled || saving}
            onClick={() => onSave({ question_type: type, content, points })}
          >
            {saving ? "Saving…" : isEditing ? "Save changes" : "Add to level"}
          </button>
        </div>
      </div>

      <StudentPreview type={type} content={content} />
    </div>
  );
}
