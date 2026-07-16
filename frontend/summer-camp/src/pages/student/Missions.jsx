import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMissions } from "../../api/client";
import StudentLayout from "./StudentLayout";
import "./student.css";

export default function Missions() {
  const navigate = useNavigate();
  const [missions, setMissions] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");

  useEffect(() => {
    getMissions()
      .then(setMissions)
      .catch((err) => setError(err.data?.error || "Couldn't load missions."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <StudentLayout title="🎯 Missions">
      {loading && <div className="s-loading"><span className="spinner spinner-dark" /><span>Loading missions...</span></div>}
      {error   && <div className="s-error">⚠️ {error}</div>}
      {!loading && !error && missions.length === 0 && <div className="s-empty"><div className="s-empty-icon">🎯</div><p>No missions yet — check back soon!</p></div>}
      {!loading && !error && missions.map((m) => (
        <div key={m.id} className="s-card s-card-clickable" onClick={() => navigate(`/missions/${m.id}`)}>
          <div className="s-card-header">
            <div><h3>Week {m.week}: {m.title}</h3><p>{m.description}</p></div>
            <div className="s-card-badges">
              <span className="s-badge s-badge-purple">+{m.xp_reward} XP</span>
              <span className="s-meta-text">{m.lesson_count} lesson{m.lesson_count !== 1 ? "s" : ""}</span>
            </div>
          </div>
        </div>
      ))}
    </StudentLayout>
  );
}