import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getChallengeStats } from "../../api/client";
import StudentLayout from "./StudentLayout";
import "./challenge.css";

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
      <StudentLayout title="Challenge Stats">
        <div className="s-error">{error}</div>
      </StudentLayout>
    );
  }

  if (!stats) {
    return (
      <StudentLayout title="Challenge Stats">
        <div className="s-loading">Loading your battle record...</div>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout title="Challenge Stats">
      <section className="challenge-stats-grid">
        <article>
          <strong>{stats.completed}</strong>
          <small>Boss battles won</small>
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

      <section className="s-card">
        <div className="s-card-header">
          <div>
            <h3>Recent battles</h3>
            <p>Your latest boss-battle results.</p>
          </div>
          <button 
            className="btn btn-primary" 
            onClick={() => navigate("/challenges")}
          >
            Play a challenge
          </button>
        </div>

        {stats.recent_attempts.length ? (
          <div className="battle-history">
            {stats.recent_attempts.map((item) => (
              <div key={item.id}>
                <strong>Challenge #{item.challenge}</strong>
                <span>
                  {item.score} pts · {item.accuracy}% · +{item.xp_earned} XP
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="sd-empty-inline">
            Your completed battles will appear here.
          </p>
        )}
      </section>
    </StudentLayout>
  );
}
