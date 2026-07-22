import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAssignments, submitAssignment } from "../../api/client";
import StudentLayout from "./StudentLayout";
import "./student.css";

function QuestStatusPill({ locked, completed }) {
  if (locked) return <span className="s-pill s-pill-locked">🔒 Locked</span>;
  if (completed) return <span className="s-pill s-pill-done">✅ Completed</span>;
  return <span className="s-pill s-pill-open">🟢 Open</span>;
}

function AssignmentRow({ assignment }) {
  const navigate = useNavigate();
  const isQuest = assignment.has_questions; // add this bool to AssignmentSerializer (obj.questions.exists())

  if (isQuest) {
    const locked = assignment.locked;
    const completed = assignment.already_submitted;
    return (
      <div className={`s-quest-tile ${locked ? "s-quest-tile-locked" : ""} ${completed ? "s-quest-tile-done" : ""}`}>
        <div className="s-quest-tile-icon">🗺️</div>
        <div className="s-quest-tile-body">
          <div className="s-quest-tile-top">
            <h3>{assignment.title}</h3>
            <QuestStatusPill locked={locked} completed={completed} />
          </div>
          <p>{assignment.description}</p>
          <div className="s-quest-tile-meta">
            <span className="s-meta-text">📅 Due {new Date(assignment.deadline).toLocaleDateString()}</span>
            <span className="s-badge s-badge-orange">+{assignment.xp_reward} XP</span>
          </div>
          {!locked && !completed && (
            <button className="btn btn-primary s-start-btn" onClick={() => navigate(`/quests/${assignment.id}`)}>
              🗺️ Start Quest
            </button>
          )}
          {locked && (
            <div className="s-quest-lock-banner">
              <span>🔑 Enter today's attendance code to unlock this quest</span>
              <button className="s-toggle-btn s-quest-lock-btn" onClick={() => navigate("/attendance")}>
                Go to Attendance →
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return <LegacyAssignmentRow assignment={assignment} />;
}

function LegacyAssignmentRow({ assignment }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(!!assignment.already_submitted);
  const [err, setErr] = useState("");

  const handleSubmit = async () => {
    if (!text.trim()) { setErr("Write something first!"); return; }
    setSubmitting(true); setErr("");
    try {
      await submitAssignment(assignment.id, text);
      setSubmitted(true);
      setOpen(false);
    } catch (e) {
      if (e.status === 400 && e.data?.error?.toLowerCase().includes("already")) {
        setSubmitted(true);
        setOpen(false);
      } else {
        setErr(e.data?.error || "Submission failed. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) return null; // completed legacy assignments are hidden from this list too

  return (
    <div className="s-quest-tile">
      <div className="s-quest-tile-icon">📝</div>
      <div className="s-quest-tile-body">
        <div className="s-quest-tile-top">
          <h3>{assignment.title}</h3>
        </div>
        <p>{assignment.description}</p>
        <div className="s-quest-tile-meta">
          <span className="s-meta-text">📅 Due {new Date(assignment.deadline).toLocaleDateString()}</span>
          <span className="s-badge s-badge-orange">+{assignment.xp_reward} XP</span>
        </div>

        <button className="s-toggle-btn" onClick={() => setOpen((o) => !o)}>
          {open ? "Cancel" : "📝 Submit Answer"}
        </button>
        {open && (
          <div className="s-submit-form">
            <textarea
              rows={5}
              placeholder="Write your answer here..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="s-textarea"
            />
            {err && <span className="error-text">{err}</span>}
            <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
              {submitting ? <span className="spinner" /> : "Submit →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Assignments() {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getAssignments()
      .then(setAssignments)
      .catch((err) => setError(err.data?.error || "Couldn't load assignments."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <StudentLayout title="🗺️ Quests">
      {loading && <div className="s-loading"><span className="spinner spinner-dark" /><span>Loading quests...</span></div>}
      {error && <div className="s-error">⚠️ {error}</div>}
      {!loading && !error && assignments.length === 0 && (
        <div className="s-empty"><div className="s-empty-icon">🗺️</div><p>No quests yet.</p></div>
      )}
      {!loading && !error && <div className="s-quest-grid">{assignments.map((a) => <AssignmentRow key={a.id} assignment={a} />)}</div>}
    </StudentLayout>
  );
}