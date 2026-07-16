import { useEffect, useState } from "react";
import { getChallenges } from "../../api/client";
import StudentLayout from "./StudentLayout";
import "./student.css";

export default function Challenges() {
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
      {!loading && !error && challenges.length === 0 && <div className="s-empty"><div className="s-empty-icon">⚡</div><p>No challenges yet — check back soon!</p></div>}
      {!loading && !error && challenges.map((c) => {
        const isActive = new Date(c.start_date) <= now && new Date(c.end_date) >= now;
        return (
          <div key={c.id} className="s-card">
            <div className="s-card-header">
              <div>
                <h3>{c.title}</h3><p>{c.description}</p>
                <span className="s-meta-text">{new Date(c.start_date).toLocaleDateString()} – {new Date(c.end_date).toLocaleDateString()}</span>
              </div>
              <div className="s-card-badges">
                <span className="s-badge s-badge-pink">+{c.xp_reward} XP</span>
                {isActive && <span className="s-badge s-badge-green">🟢 Active</span>}
              </div>
            </div>
          </div>
        );
      })}
    </StudentLayout>
  );
}