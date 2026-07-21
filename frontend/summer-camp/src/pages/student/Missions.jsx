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
      {!loading && !error && missions.map((m) => {
        const locked = m.locked; // add to MissionListSerializer: !is_published or !camp_started
        const progress = m.progress; // { total, completed, is_complete } from mission_progress()
        const pct = progress?.total ? Math.round((progress.completed / progress.total) * 100) : 0;
        return (
          <div
            key={m.id}
            className="s-card s-card-clickable"
            style={locked ? { opacity: 0.5, filter: "grayscale(1)", cursor: "not-allowed" } : undefined}
            onClick={() => !locked && navigate(`/missions/${m.id}`)}
          >
            <div className="s-card-header">
              <div>
                <h3>{locked && "🔒 "}Week {m.week}: {m.title}</h3>
                <p>{m.description}</p>
                {progress && (
                  <div style={{ marginTop: 8 }}>
                    <span className="s-meta-text">{progress.completed} / {progress.total} Lessons Completed</span>
                    <div style={{ height: 6, background: "var(--color-border)", borderRadius: 99, marginTop: 4, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: "var(--gradient-cta)", borderRadius: 99 }} />
                    </div>
                  </div>
                )}
              </div>
              <div className="s-card-badges">
                <span className="s-badge s-badge-purple">+{m.xp_reward} XP</span>
                <span className="s-meta-text">{m.lesson_count} lesson{m.lesson_count !== 1 ? "s" : ""}</span>
              </div>
            </div>
          </div>
        );
      })}
    </StudentLayout>
  );
}