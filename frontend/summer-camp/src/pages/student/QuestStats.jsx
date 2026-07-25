import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getQuestStats } from "../../api/client";
import StudentLayout from "./StudentLayout";
import "./student.css";
import "./challenge.css";

export default function QuestStats() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    getQuestStats()
      .then(setStats)
      .catch(() => setError("Couldn’t load your quest stats."));
  }, []);

  if (error) {
    return (
      <StudentLayout title="🗺️ Quest Stats">
        <div className="s-error">{error}</div>
      </StudentLayout>
    );
  }

  if (!stats) {
    return (
      <StudentLayout title="🗺️ Quest Stats">
        <div className="s-loading"><span className="spinner spinner-dark" /><span>Loading your quest record...</span></div>
      </StudentLayout>
    );
  }

  const hasCompleted = stats.completed > 0;

  return (
    <StudentLayout title="🗺️ Quest Stats">
      <div className="lb-wrapper">
        {/* Hero card, same visual language as Challenge Stats */}
        <div className="s-card lb-header-card">
          <span className="lb-subtitle">YOUR QUEST RECORD</span>
          <h3 className="lb-title">Quest Stats</h3>

          {hasCompleted ? (
            <div className="lb-banner lb-banner-champion">
              <span className="lb-banner-icon">🗺️</span>
              <div>
                <strong>{stats.completed} Quest{stats.completed !== 1 ? "s" : ""} Completed!</strong>
                <p>You've mapped out {stats.completed} quest{stats.completed !== 1 ? "s" : ""} so far. Keep exploring the missions!</p>
              </div>
            </div>
          ) : (
            <div className="lb-banner lb-banner-live">
              <span className="lb-banner-icon">🔥</span>
              <div>
                <strong>No quests completed yet — go explore!</strong>
                <p>Quests are retryable, so take your time and nail every question for full XP.</p>
              </div>
            </div>
          )}

          <section className="challenge-stats-grid">
            <article>
              <strong>{stats.completed}</strong>
              <small>Quests completed</small>
            </article>
            <article>
              <strong>{stats.average_attempts}</strong>
              <small>Avg. tries per quest</small>
            </article>
            <article>
              <strong>+{stats.xp_earned}</strong>
              <small>Quest XP</small>
            </article>
            <article>
              <strong>{stats.total_attempts}</strong>
              <small>Total attempts</small>
            </article>
          </section>
        </div>

        {/* Recent quests, styled as a leaderboard-style table */}
        <div className="s-card lb-table-card">
          <div className="s-card-top" style={{ padding: "18px 18px 0" }}>
            <div>
              <span className="lb-subtitle">RECENT QUESTS</span>
              <h3 className="lb-title" style={{ fontSize: "1.1rem" }}>Your latest quest completions</h3>
            </div>
            <button className="btn btn-primary s-start-btn" onClick={() => navigate("/assignments")}>
              🗺️ Explore Quests
            </button>
          </div>

          {stats.recent_attempts.length === 0 ? (
            <div className="s-empty">
              <div className="s-empty-icon">🗺️</div>
              <p>Your completed quests will appear here.</p>
            </div>
          ) : (
            <div className="lb-table-responsive">
              <table className="lb-table">
                <thead>
                  <tr>
                    <th>Quest</th>
                    <th>Tries</th>
                    <th>XP</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recent_attempts.map((item) => (
                    <tr key={item.id} className="lb-tr">
                      <td>
                        <div className="lb-cell-stack">
                          <span className="lb-student-name">{item.assignment_title || `Quest #${item.assignment}`}</span>
                          {item.mission_title && <span className="lb-mission-badge">🎯 {item.mission_title}</span>}
                        </div>
                      </td>
                      <td><div className="lb-acc-pill">{item.attempt_count} {item.attempt_count === 1 ? "try" : "tries"}</div></td>
                      <td><span className="lb-score-val">+{item.xp_earned}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </StudentLayout>
  );
}