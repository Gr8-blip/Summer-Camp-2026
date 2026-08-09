import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAssignments, submitAssignment } from "../../api/client";
import StudentLayout from "./StudentLayout";
import "./student.css";

function QuestStatusPill({ locked, completed, inProgress, isExpired }) {
  if (locked) return <span className="s-pill s-pill-locked">🔒 Locked</span>;
  if (completed) return <span className="s-pill s-pill-done">✅ Completed</span>;
  if (isExpired) return <span className="s-pill s-pill-ended">⏰ Ended</span>;
  if (inProgress) return <span className="s-pill" style={{ background: "rgba(245,158,11,.15)", color: "#B45309", border: "1px solid rgba(245,158,11,.35)" }}>🔄 In Progress</span>;
  return <span className="s-pill s-pill-open">🟢 Open</span>;
}

function AssignmentRow({ assignment }) {
  const navigate = useNavigate();
  const isQuest = assignment.has_questions;

  const lessonName = assignment.lesson_title || assignment.lesson?.title;

  if (isQuest) {
    const locked = assignment.locked;
    const completed = assignment.already_submitted;
    const isExpired = assignment.is_expired ?? (new Date(assignment.deadline) < new Date());
    const attempted = assignment.attempted;
    const inProgress = attempted && !completed && !isExpired;
    return (
      <div className={`s-quest-tile ${locked ? "s-quest-tile-locked" : ""} ${completed ? "s-quest-tile-done" : ""} ${isExpired && !locked && !completed ? "s-quest-tile-ended" : ""}`}>
        <div className="s-quest-tile-icon">🗺️</div>
        <div className="s-quest-tile-body">
          <div className="s-quest-tile-top">
            <h3>{assignment.title}</h3>
            <QuestStatusPill locked={locked} completed={completed} inProgress={inProgress} isExpired={isExpired} />
          </div>
          <p>
            {locked
              ? assignment.description
              : isExpired && !completed
              ? "This quest's deadline has passed — it can no longer be started."
              : inProgress && assignment.best_accuracy != null
              ? `You scored ${Math.round(assignment.best_accuracy)}% last time — try again for 100%.`
              : assignment.description}
          </p>
          <div className="s-quest-tile-meta">
            {lessonName && (
              <span className="s-badge s-badge-purple">📖 {lessonName}</span>
            )}
            <span className="s-meta-text">📅 Due {new Date(assignment.deadline).toLocaleDateString()}</span>
            <span className="s-badge s-badge-orange">+{assignment.xp_reward} XP</span>
          </div>
          {!locked && !completed && !isExpired && (
            <button className="btn btn-primary s-start-btn" onClick={() => navigate(`/quests/${assignment.id}`)}>
              {inProgress ? "🔁 Retry Quest" : "🗺️ Start Quest"}
            </button>
          )}
          {locked && (
            <div className="s-quest-lock-banner">
              <span>
                🔑 Enter attendance code for this lesson to unlock this quest
              </span>
              <button className="s-toggle-btn s-quest-lock-btn" onClick={() => navigate("/attendance")}>
                Go to Attendance →
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return <LegacyAssignmentRow assignment={assignment} lessonName={lessonName} />;
}

function LegacyAssignmentRow({ assignment, lessonName }) {
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

  if (submitted) return null;

  return (
    <div className="s-quest-tile">
      <div className="s-quest-tile-icon">📝</div>
      <div className="s-quest-tile-body">
        <div className="s-quest-tile-top">
          <h3>{assignment.title}</h3>
        </div>
        <p>{assignment.description}</p>
        <div className="s-quest-tile-meta">
          <div className="s-quest-tile-info">
            {lessonName && (
              <span className="s-badge s-badge-lesson">
                📖 {lessonName}
              </span>
            )}
            <span className="s-meta-text">
              📅 Due {new Date(assignment.deadline).toLocaleDateString()}
            </span>
          </div>

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

function MissedQuestRow({ assignment }) {
  const lessonName = assignment.lesson_title || assignment.lesson?.title;
  return (
    <div
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        padding: "14px 16px", borderRadius: 14,
        background: "var(--color-bg-alt)", border: "1px solid var(--color-border)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: ".92rem", color: "var(--color-text)" }}>{assignment.title}</div>
        <div className="s-meta-text" style={{ marginTop: 2 }}>
          {lessonName ? `📖 ${lessonName} · ` : ""}📅 Was due {new Date(assignment.deadline).toLocaleDateString()}
        </div>
      </div>
      <span className="s-pill s-pill-ended" style={{ flexShrink: 0 }}>⏰ Missed</span>
    </div>
  );
}

function MissedQuestsModal({ quests, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,.5)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-bg-alt)", borderRadius: 22, padding: 24,
          maxWidth: 480, width: "100%", maxHeight: "80vh", overflowY: "auto",
          boxShadow: "var(--shadow-card, 0 20px 50px rgba(0,0,0,.3))",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h2 style={{ margin: 0, fontSize: "1.15rem" }}>⏰ Missed Deadlines</h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.1rem", color: "var(--color-text-soft)" }}
          >
            ✕
          </button>
        </div>
        <p className="s-meta-text" style={{ margin: "0 0 16px" }}>
          These quests' deadlines passed before you completed them — they can't be started anymore.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {quests.map((a) => <MissedQuestRow key={a.id} assignment={a} />)}
        </div>
      </div>
    </div>
  );
}

export default function Assignments() {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showMissed, setShowMissed] = useState(false);

  useEffect(() => {
    getAssignments()
      .then(setAssignments)
      .catch((err) => setError(err.data?.error || "Couldn't load assignments."))
      .finally(() => setLoading(false));
  }, []);

  // Quests whose deadline passed before they were completed clutter the
  // main list without being actionable — pulled into a modal instead so
  // the active/retryable quests aren't fighting them for space.
  const isMissed = (a) => {
    if (!a.has_questions) return false;
    const expired = a.is_expired ?? (new Date(a.deadline) < new Date());
    return expired && !a.already_submitted;
  };
  const missedQuests = assignments.filter(isMissed);
  const visibleAssignments = assignments.filter((a) => !isMissed(a));

  return (
    <StudentLayout title="🗺️ Quests">
      <div
        className="chal-stats-banner"
        role="button"
        tabIndex={0}
        onClick={() => navigate("/quests/stats")}
        onKeyDown={(e) => e.key === "Enter" && navigate("/quests/stats")}
      >
        <div className="chal-stats-banner-left">
          <span className="chal-stats-banner-icon">🗺️</span>
          <div>
            <div className="chal-stats-banner-title">Quest Stats</div>
            <div className="chal-stats-banner-sub">See your completions, XP, and quest history</div>
          </div>
        </div>
        <span className="chal-stats-banner-cta">View Stats →</span>
      </div>

      {missedQuests.length > 0 && (
        <button
          onClick={() => setShowMissed(true)}
          style={{
            display: "flex", alignItems: "center", gap: 10, width: "100%",
            padding: "12px 16px", marginTop: 12, marginBottom: 10,
            background: "var(--color-bg-alt)", border: "1px dashed var(--color-border)",
            borderRadius: 14, cursor: "pointer", textAlign: "left",
          }}
        >
          <span style={{ fontSize: "1.1rem" }}>⏰</span>
          <span style={{ flex: 1, fontSize: ".85rem", color: "var(--color-text-soft)", fontWeight: 600 }}>
            {missedQuests.length} quest{missedQuests.length === 1 ? "" : "s"} missed their deadline
          </span>
          <span style={{ fontSize: ".8rem", color: "var(--color-purple)", fontWeight: 700 }}>View →</span>
        </button>
      )}

      {loading && <div className="s-loading"><span className="spinner spinner-dark" /><span>Loading quests...</span></div>}
      {error && <div className="s-error">⚠️ {error}</div>}
      {!loading && !error && visibleAssignments.length === 0 && (
        <div className="s-empty"><div className="s-empty-icon">🗺️</div><p>No quests yet.</p></div>
      )}
      {!loading && !error && (
        <div className="s-quest-grid">
          {visibleAssignments.map((a) => (
            <AssignmentRow key={a.id} assignment={a} />
          ))}
        </div>
      )}

      {showMissed && <MissedQuestsModal quests={missedQuests} onClose={() => setShowMissed(false)} />}
    </StudentLayout>
  );
}