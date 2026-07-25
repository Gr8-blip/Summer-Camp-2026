import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getChallengeStats } from "../../api/client";
import StudentLayout from "./StudentLayout";
import "./student.css";
import "./challenge.css";

function tierBadge(accuracy) {
  if (accuracy >= 90) return { cls: "lb-rank-1", label: "🏆 Elite" };
  if (accuracy >= 70) return { cls: "lb-rank-2", label: "🥈 Strong" };
  if (accuracy >= 50) return { cls: "lb-rank-3", label: "🥉 Solid" };
  return { cls: "lb-rank-other", label: "Rookie" };
}

export default function ChallengeStats() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    getChallengeStats()
      .then(setStats)
      .catch(() => setError("Couldn’t load your challenge stats."));
  }, []);

  if (error) {
    return (
      <StudentLayout title="🏆 Challenge Stats">
        <div className="s-error">{error}</div>
      </StudentLayout>
    );
  }

  if (!stats) {
    return (
      <StudentLayout title="🏆 Challenge Stats">
        <div className="s-loading"><span className="spinner spinner-dark" /><span>Loading your challenge record...</span></div>
      </StudentLayout>
    );
  }

  const hasWins = stats.challenges_won > 0;

  return (
    <StudentLayout title="🏆 Challenge Stats">
      <div className="lb-wrapper">
        {/* Hero card, styled exactly like the real leaderboard header */}
        <div className="s-card lb-header-card">
          <span className="lb-subtitle">YOUR CHALLENGE RECORD</span>
          <h3 className="lb-title">Challenge Stats</h3>

          {hasWins ? (
            <div className="lb-banner lb-banner-champion">
              <span className="lb-banner-icon">👑</span>
              <div>
                <strong>{stats.challenges_won} Challenge{stats.challenges_won !== 1 ? "s" : ""} Won!</strong>
                <p>You've claimed the Hall of Fame crown on {stats.challenges_won} challenge{stats.challenges_won !== 1 ? "s" : ""}. Keep defending your spot!</p>
              </div>
            </div>
          ) : (
            <div className="lb-banner lb-banner-live">
              <span className="lb-banner-icon">🔥</span>
              <div>
                <strong>No crowns yet — go claim one!</strong>
                <p>Finish #1 on a challenge's frozen leaderboard to become its permanent Champion.</p>
              </div>
            </div>
          )}

          <section className="challenge-stats-grid">
            <article>
              <strong>{stats.completed}</strong>
              <small>Challenges fought</small>
            </article>
            <article>
              <strong>{stats.average_accuracy}%</strong>
              <small>Average accuracy</small>
            </article>
            <article>
              <strong>+{stats.xp_earned}</strong>
              <small>Challenge XP</small>
            </article>
            <article>
              <strong>{stats.score_total}</strong>
              <small>Total score</small>
            </article>
          </section>
        </div>

        {/* Recent battles, styled as a leaderboard table */}
        <div className="s-card lb-table-card">
          <div className="s-card-top" style={{ padding: "18px 18px 0" }}>
            <div>
              <span className="lb-subtitle">RECENT CHALLENGES</span>
              <h3 className="lb-title" style={{ fontSize: "1.1rem" }}>Your latest challenge results</h3>
            </div>
            <button className="btn btn-primary s-start-btn" onClick={() => navigate("/challenges")}>
              ⚡ Play a Challenge
            </button>
          </div>

          {stats.recent_attempts.length === 0 ? (
            <div className="s-empty">
              <div className="s-empty-icon">⚔️</div>
              <p>Your completed challenges will appear here.</p>
            </div>
          ) : (
            <div className="lb-table-responsive">
              <table className="lb-table">
                <thead>
                  <tr>
                    <th>Tier</th>
                    <th>Challenge</th>
                    <th>Score</th>
                    <th>XP</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recent_attempts.map((item) => {
                    const tier = tierBadge(item.accuracy);
                    return (
                      <tr
                        key={item.id}
                        className="lb-tr"
                        style={{ cursor: "pointer" }}
                        onClick={() => navigate(`/challenges/${item.challenge}/leaderboard`)}
                      >
                        <td><span className={`lb-rank-badge ${tier.cls}`}>{tier.label}</span></td>
                        <td>
                          <div className="lb-cell-stack">
                            <span className="lb-student-name">{item.challenge_title || `Challenge #${item.challenge}`}</span>
                            {item.mission_title && <span className="lb-mission-badge">🎯 {item.mission_title}</span>}
                          </div>
                        </td>
                        <td><div className="lb-acc-pill">{item.accuracy}%</div></td>
                        <td><span className="lb-score-val">+{item.xp_earned}</span></td>
                        <td>
                          <button
                            className="sd-link"
                            onClick={(e) => { e.stopPropagation(); navigate(`/challenges/${item.challenge}/leaderboard`); }}
                          >
                            View Leaderboard →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </StudentLayout>
  );
}