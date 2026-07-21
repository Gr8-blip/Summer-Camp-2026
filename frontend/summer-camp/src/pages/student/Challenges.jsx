import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getChallenges } from "../../api/client";
import StudentLayout from "./StudentLayout";
import "./student.css";

function ChallengeStatusPill({ locked, completed, isActive }) {
  if (locked)    return <span className="s-pill s-pill-locked">🔒 Locked</span>;
  if (completed) return <span className="s-pill s-pill-done">✅ Completed</span>;
  if (isActive)  return <span className="s-pill s-pill-open">🟢 Active</span>;
  return <span className="s-pill s-pill-upcoming">🕒 Upcoming</span>;
}

export default function Challenges() {
  const navigate = useNavigate();
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");

  useEffect(() => {
    getChallenges()
      .then(setChallenges)
      .catch((err) => setError(err.data?.error || "Couldn't load challenges."))
      .finally(() => setLoading(false));
  }, []);

  const now = new Date();

  return (
    <StudentLayout title="⚡ Challenges">
      {loading && <div className="s-loading"><span className="spinner spinner-dark" /><span>Loading...</span></div>}
      {error   && <div className="s-error">⚠️ {error}</div>}
      {!loading && !error && challenges.length === 0 && (
        <div className="s-empty">
          <div className="s-empty-icon">⚡</div>
          <p>No challenges yet — check back soon!</p>
        </div>
      )}
      {!loading && !error && (
        <div className="s-quest-grid">
          {challenges.map((c) => {
            const isActive = new Date(c.start_date) <= now && new Date(c.end_date) >= now;
            const locked = c.locked;
            const completed = c.already_completed;
            const clickable = !locked && !completed;

            return (
              <div
                key={c.id}
                className={`s-quest-tile ${locked ? "s-quest-tile-locked" : ""} ${completed ? "s-quest-tile-done" : ""}`}
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={() => clickable && navigate(`/challenges/${c.id}`)}
                onKeyDown={(e) => clickable && e.key === "Enter" && navigate(`/challenges/${c.id}`)}
                style={clickable ? { cursor: "pointer" } : undefined}
              >
                <div className="s-quest-tile-icon">{completed ? "🏆" : "⚡"}</div>
                <div className="s-quest-tile-body">
                  <div className="s-quest-tile-top">
                    <h3>{locked && "🔒 "}{c.title}</h3>
                    <ChallengeStatusPill locked={locked} completed={completed} isActive={isActive} />
                  </div>
                  <p>{c.description}</p>
                  <div className="s-quest-tile-meta">
                    <span className="s-meta-text">
                      📅 {new Date(c.start_date).toLocaleDateString()} – {new Date(c.end_date).toLocaleDateString()}
                    </span>
                    <span className="s-badge s-badge-pink">+{c.xp_reward} XP</span>
                  </div>

                  {locked ? (
                    <div className="s-empty" style={{ padding: 16 }}>
                      <p>🔒 Challenge Locked</p>
                      <span className="s-meta-text">Complete required items to unlock.</span>
                    </div>
                  ) : completed ? (
                    <div className="s-submit-success">✅ Challenge complete — nice work!</div>
                  ) : (
                    <button
                      className="btn btn-primary s-start-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/challenges/${c.id}`);
                      }}
                    >
                      ⚡ {isActive ? "Enter Challenge" : "View Challenge"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </StudentLayout>
  );
}