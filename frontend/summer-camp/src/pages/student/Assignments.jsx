import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAssignments } from "../../api/client";
import StudentLayout from "./StudentLayout";
import "./student.css";

function QuestStatusPill({ locked, completed }) {
  if (locked)    return <span className="s-pill s-pill-locked">🔒 Locked</span>;
  if (completed) return <span className="s-pill s-pill-done">✅ Completed</span>;
  return <span className="s-pill s-pill-open">🟢 Open</span>;
}

function QuestCard({ assignment }) {
  const navigate = useNavigate();
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

        {locked ? (
          <div className="s-empty" style={{ padding: 16 }}>
            <p>🔒 Quest Locked</p>
            <span className="s-meta-text">Complete required items to unlock.</span>
          </div>
        ) : completed ? (
          <div className="s-submit-success">✅ Quest complete — nice work!</div>
        ) : (
          <button className="btn btn-primary s-start-btn" onClick={() => navigate(`/quests/${assignment.id}`)}>
            🗺️ Start Quest
          </button>
        )}
      </div>
    </div>
  );
}

export default function Assignments() {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");

  useEffect(() => {
    getAssignments()
      .then(setAssignments)
      .catch((err) => setError(err.data?.error || "Couldn't load assignments."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <StudentLayout title="🗺️ Quests">
      {loading && <div className="s-loading"><span className="spinner spinner-dark" /><span>Loading quests...</span></div>}
      {error   && <div className="s-error">⚠️ {error}</div>}
      {!loading && !error && assignments.length === 0 && (
        <div className="s-empty"><div className="s-empty-icon">🗺️</div><p>No quests yet.</p></div>
      )}
      {!loading && !error && (
        <div className="s-quest-grid">
          {assignments.map((a) => (
            <QuestCard key={a.id} assignment={a} />
          ))}
        </div>
      )}
    </StudentLayout>
  );
}