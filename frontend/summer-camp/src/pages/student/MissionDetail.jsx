import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getMissionDetail } from "../../api/client";
import StudentLayout from "./StudentLayout";
import "./student.css";

function fmt(dur) {
  if (!dur) return "";
  const [h, m] = dur.split(":").map(Number);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

export default function MissionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [mission, setMission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => {
    getMissionDetail(id)
      .then(setMission)
      .catch((err) => setError(err.data?.error || "Couldn't load mission."))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <StudentLayout title={mission ? `Week ${mission.week}: ${mission.title}` : "Mission"}>
      <button className="s-back-btn" onClick={() => navigate("/missions")}>← Back to Missions</button>
      {loading && <div className="s-loading"><span className="spinner spinner-dark" /><span>Loading...</span></div>}
      {error   && <div className="s-error">⚠️ {error}</div>}
      {!loading && !error && mission && (
        <>
          <div className="s-card s-mission-hero">
            <p className="s-mission-desc">{mission.description}</p>
            <span className="s-badge s-badge-purple">+{mission.xp_reward} XP</span>
          </div>
          <h2 className="s-section-heading">Lessons ({mission.lessons?.length || 0})</h2>
          {mission.lessons?.length === 0 && <div className="s-empty"><div className="s-empty-icon">📖</div><p>No lessons yet.</p></div>}
          {mission.lessons?.map((l, i) => (
            <div key={l.id} className="s-card s-card-clickable" onClick={() => navigate(`/lessons/${l.id}`)}>
              <div className="s-card-header">
                <div><h3>{i + 1}. {l.title}</h3><p>{l.description}</p></div>
                <span className="s-meta-text">⏱ {fmt(l.duration)}</span>
              </div>
            </div>
          ))}
        </>
      )}
    </StudentLayout>
  );
}