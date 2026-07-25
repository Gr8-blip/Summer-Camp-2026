import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getChallenges } from "../../api/client";
import StudentLayout from "./StudentLayout";
import "./student.css";

function ChallengeStatusPill({ locked, isActive, isExpired }) {
  if (locked)    return <span className="s-pill s-pill-locked">🔒 Locked</span>;
  if (isExpired) return <span className="s-pill s-pill-ended">⏰ Ended</span>;
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
  const visible = challenges.filter((c) => !c.already_completed); // hide completed challenges entirely

  return (
    <StudentLayout title="⚡ Challenges">
      <div
        className="chal-stats-banner"
        role="button"
        tabIndex={0}
        onClick={() => navigate("/challenges/stats")}
        onKeyDown={(e) => e.key === "Enter" && navigate("/challenges/stats")}
      >
        <div className="chal-stats-banner-left">
          <span className="chal-stats-banner-icon">🏆</span>
          <div>
            <div className="chal-stats-banner-title">Challenge Stats</div>
            <div className="chal-stats-banner-sub">See your wins, accuracy, and battle history</div>
          </div>
        </div>
        <span className="chal-stats-banner-cta">View Stats →</span>
      </div>

      {loading && <div className="s-loading"><span className="spinner spinner-dark" /><span>Loading...</span></div>}
      {error   && <div className="s-error">⚠️ {error}</div>}
      {!loading && !error && visible.length === 0 && <div className="s-empty"><div className="s-empty-icon">⚡</div><p>No challenges yet — check back soon!</p></div>}
      {!loading && !error && (
        <div className="s-quest-grid">
          {visible.map((c) => {
            const isActive = new Date(c.start_date) <= now && new Date(c.end_date) >= now;
            const isExpired = c.is_expired ?? (new Date(c.end_date) < now);
            const locked = c.locked;
            const clickable = !locked && !isExpired;
            return (
              <div
                key={c.id}
                className={`s-quest-tile ${locked ? "s-quest-tile-locked" : ""} ${isExpired && !locked ? "s-quest-tile-ended" : ""}`}
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={() => clickable && navigate(`/challenges/${c.id}`)}
                onKeyDown={(e) => clickable && e.key === "Enter" && navigate(`/challenges/${c.id}`)}
                style={clickable ? { cursor: "pointer" } : undefined}
              >
                <div className="s-quest-tile-icon">⚡</div>
                <div className="s-quest-tile-body">
                  <div className="s-quest-tile-top">
                    <h3>{c.title}</h3>
                    <ChallengeStatusPill locked={locked} isActive={isActive} isExpired={isExpired} />
                  </div>
                  <p>
                    {locked
                      ? "Complete this mission to unlock."
                      : isExpired
                      ? "This challenge's deadline has passed — it can no longer be entered."
                      : c.description}
                  </p>
                  <div className="s-quest-tile-meta">
                    <span className="s-meta-text">📅 {new Date(c.start_date).toLocaleDateString()} – {new Date(c.end_date).toLocaleDateString()}</span>
                    <span className="s-badge s-badge-pink">+{c.xp_reward} XP</span>
                  </div>
                  {!locked && !isExpired && (
                    <button className="btn btn-primary s-start-btn" onClick={(e) => { e.stopPropagation(); navigate(`/challenges/${c.id}`); }}>
                      ⚡ {isActive ? "Enter Challenge" : "View Challenge"}
                    </button>
                  )}
                  {!locked && isExpired && (
                    <button className="btn s-start-btn" disabled style={{ opacity: 0.6, cursor: "not-allowed" }}>
                      ⏰ Deadline Passed
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