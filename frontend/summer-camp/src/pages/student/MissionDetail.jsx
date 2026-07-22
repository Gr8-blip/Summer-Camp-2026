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

  const progress = mission?.progress; // { total, completed, is_complete }
  const pct = progress?.total ? Math.round((progress.completed / progress.total) * 100) : 0;

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

          {progress && (
            <div className="s-progress-wrap">
              <div className="s-progress-labels">
                <span>{progress.is_complete ? "🎉 Mission complete!" : "Progress"}</span>
                <span>{progress.completed}/{progress.total} lessons completed</span>
              </div>
              <div className="s-progress-track">
                <div className="s-progress-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}

          <h2 className="s-section-heading">Lessons ({mission.lessons?.length || 0})</h2>
          {mission.lessons?.length === 0 && <div className="s-empty"><div className="s-empty-icon">📖</div><p>No lessons yet.</p></div>}
          {mission.lessons?.map((l, i) => {
            const locked = l.locked;
            const completed = l.completed; // attendance recorded for this lesson (LessonSerializer)
            return (
              <div
                key={l.id}
                className={`s-card s-card-clickable ${completed ? "s-lesson-completed" : ""}`}
                style={locked ? { opacity: 0.5, filter: "grayscale(1)", cursor: "not-allowed" } : undefined}
                onClick={() => !locked && navigate(`/lessons/${l.id}`)}
              >
                <div className="s-card-header">
                  <div><h3>{locked && "🔒 "}{i + 1}. {l.title}</h3><p>{l.description}</p></div>
                  <div className="s-card-badges">
                    {completed && <span className="s-badge s-badge-green">✅ Attended</span>}
                    <span className="s-meta-text">⏱ {fmt(l.duration)}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {mission.challenges?.length > 0 && (
            <>
              <h2 className="s-section-heading">⚡ Mission Challenge</h2>
              {mission.challenges.map((c) => {
                const locked = c.locked;
                const completed = c.already_completed; // ChallengeSerializer
                return (
                  <div key={c.id} className={`s-quest-tile ${locked ? "s-quest-tile-locked" : ""} ${completed ? "s-quest-tile-done" : ""}`}>
                    <div className="s-quest-tile-icon">{completed ? "🏆" : "⚡"}</div>
                    <div className="s-quest-tile-body">
                      <div className="s-quest-tile-top">
                        <h3>{c.title}</h3>
                        {completed
                          ? <span className="s-pill s-pill-done">✅ Completed</span>
                          : locked
                            ? <span className="s-pill s-pill-locked">🔒 Locked</span>
                            : <span className="s-pill s-pill-open">🟢 Open</span>}
                      </div>
                      <p>{c.description}</p>
                      <div className="s-quest-tile-meta">
                        <span className="s-meta-text">📅 {new Date(c.start_date).toLocaleDateString()} – {new Date(c.end_date).toLocaleDateString()}</span>
                        <span className="s-badge s-badge-pink">+{c.xp_reward} XP</span>
                      </div>
                      {!locked && !completed && (
                        <button className="btn btn-primary s-start-btn" onClick={() => navigate(`/challenges/${c.id}`)}>
                          ⚡ Start Challenge
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </>
      )}
    </StudentLayout>
  );
}