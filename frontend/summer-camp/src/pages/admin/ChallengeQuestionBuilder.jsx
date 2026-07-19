import { useEffect, useState } from "react";
import {
  adminCreateChallengeQuestion,
  adminDeleteChallengeQuestion,
  adminGetChallengeQuestions,
  adminUpdateChallengeQuestion,
} from "./../../api/client";
import ActivityTypePicker from "./../../components/ActivityTypePicker";
import QuestionEditorPanel from "../../editors/QuestionEditorPanel";
import QuestionCard from "./../../components/QuestionCard";
import QuickPreview from "./../../components/QuickPreview";
import { blankContent } from "./../../components/activityTypes";
import "./../../components/builder.css";

// view = "map" | "pick" | "edit"
export default function ChallengeQuestionBuilder({ challenge, onClose, toast }) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("map");
  const [draftType, setDraftType] = useState(null);
  const [editingQuestion, setEditingQuestion] = useState(null); // null = creating new
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);

  const load = () =>
    adminGetChallengeQuestions(challenge.id)
      .then((data) => setQuestions([...data].sort((a, b) => a.order - b.order)))
      .catch(() => toast("Could not load questions.", "error"))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, [challenge.id]);

  const openPicker = () => { setEditingQuestion(null); setDraftType(null); setView("pick"); };
  const pickType = (type) => { setDraftType(type); setView("edit"); };
  const openEdit = (q) => { setEditingQuestion(q); setDraftType(q.question_type); setView("edit"); };
  const backToMap = () => { setView("map"); setDraftType(null); setEditingQuestion(null); };

  const handleSave = async ({ question_type, content, points }) => {
    setSaving(true);
    try {
      if (editingQuestion) {
        await adminUpdateChallengeQuestion(editingQuestion.id, { question_type, content, points });
        toast("Activity updated.");
      } else {
        await adminCreateChallengeQuestion(challenge.id, {
          question_type, content, points, order: questions.length,
        });
        toast("Activity added to the level.");
      }
      await load();
      backToMap();
    } catch {
      toast("Could not save this activity.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async (q) => {
    try {
      await adminCreateChallengeQuestion(challenge.id, {
        question_type: q.question_type,
        content: q.content,
        points: q.points,
        order: questions.length,
      });
      toast("Activity duplicated.");
      load();
    } catch {
      toast("Could not duplicate this activity.", "error");
    }
  };

  const handleDelete = async (q) => {
    if (!window.confirm("Remove this activity from the level?")) return;
    try {
      await adminDeleteChallengeQuestion(q.id);
      toast("Activity removed.");
      load();
    } catch {
      toast("Could not remove this activity.", "error");
    }
  };

  const reorder = async (from, to) => {
    if (from === to || from == null) return;
    const next = [...questions];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setQuestions(next); // optimistic — feels instant

    try {
      await Promise.all(
        next.map((q, i) => (q.order === i ? null : adminUpdateChallengeQuestion(q.id, { order: i })))
      );
    } catch {
      toast("Could not save the new order.", "error");
      load();
    }
  };

  return (
    <div className="cb-overlay" onClick={onClose}>
      <div className="cb cb-shell" onClick={(e) => e.stopPropagation()}>
        <div className="cb-topbar">
          <div>
            <span className="cb-eyebrow">Level editor</span>
            <h1>{challenge.title}</h1>
          </div>
          <button className="cb-close" onClick={onClose}>✕</button>
        </div>

        <div className="cb-body">
          {view === "map" && (
            <>
              <div className="cb-levelmap-head">
                <h2>Activities ({questions.length})</h2>
                <button className="cb-add-btn" onClick={openPicker}>+ Add activity</button>
              </div>

              {loading && <p style={{ color: "#a09a89" }}>Loading level…</p>}

              {!loading && questions.length === 0 && (
                <div className="cb-empty-state">
                  <div style={{ fontSize: "2rem", marginBottom: 8 }}>🗺️</div>
                  <p>This level is empty. Add the first activity to build the boss battle.</p>
                  <button className="cb-add-btn" onClick={openPicker} style={{ marginTop: 10 }}>+ Add activity</button>
                </div>
              )}

              {!loading && questions.length > 0 && (
                <div className="cb-levelmap">
                  {questions.map((q, i) => (
                    <QuestionCard
                      key={q.id}
                      question={q}
                      index={i}
                      dragging={dragIndex === i}
                      onDragStart={() => setDragIndex(i)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => { reorder(dragIndex, i); setDragIndex(null); }}
                      onDragEnd={() => setDragIndex(null)}
                      onPreview={() => setPreviewing(q)}
                      onEdit={() => openEdit(q)}
                      onDuplicate={() => handleDuplicate(q)}
                      onDelete={() => handleDelete(q)}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {view === "pick" && <ActivityTypePicker onPick={pickType} />}

          {view === "edit" && (
            <QuestionEditorPanel
              type={draftType}
              isEditing={!!editingQuestion}
              initialContent={editingQuestion ? editingQuestion.content : blankContent(draftType)}
              initialPoints={editingQuestion ? editingQuestion.points : 10}
              saving={saving}
              onBack={backToMap}
              onSave={handleSave}
            />
          )}
        </div>
      </div>

      {previewing && <QuickPreview question={previewing} onClose={() => setPreviewing(null)} />}
    </div>
  );
}
