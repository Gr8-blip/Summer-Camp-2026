import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getLessonDetail } from "../../api/client";
import StudentLayout from "./StudentLayout";
import "./student.css";

function QuestCard({ assignment }) {
  const navigate = useNavigate();
  const locked = assignment.locked;

  return (
    <div className="s-card s-quest-card">
      <div className="s-card-header">
        <div>
          <h3>{assignment.title}</h3>
          <p>{assignment.description}</p>
          <span className="s-meta-text">Due: {new Date(assignment.deadline).toLocaleDateString()}</span>
        </div>
        <span className="s-badge s-badge-orange">+{assignment.xp_reward} XP</span>
      </div>
      {locked ? (
        <div className="s-empty" style={{ padding: 16 }}>
          <p>🔒 Quest Locked</p>
          <span className="s-meta-text">Complete required items to unlock.</span>
        </div>
      ) : assignment.already_submitted ? (
        <div className="s-submit-success">✅ Quest complete — nice work!</div>
      ) : (
        <button className="btn btn-primary s-start-btn" onClick={() => navigate(`/quests/${assignment.id}`)}>
          🗺️ Start Quest
        </button>
      )}
    </div>
  );
}

export default function LessonDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lesson, setLesson]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => {
    getLessonDetail(id)
      .then(setLesson)
      .catch((err) => setError(err.data?.error || "Couldn't load lesson."))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <StudentLayout title={lesson?.title || "Lesson"}>
      <button className="s-back-btn" onClick={() => navigate(-1)}>← Back</button>

      {loading && <div className="s-loading"><span className="spinner spinner-dark" /><span>Loading...</span></div>}
      {error   && <div className="s-error">⚠️ {error}</div>}

      {!loading && !error && lesson && (
        <>
          <div className="s-card"><p>{lesson.description}</p></div>

          {lesson.assignments?.length > 0 && (
            <>
              <h2 className="s-section-heading">🗺️ Mission Quests</h2>
              {lesson.assignments.map((a) => <QuestCard key={a.id} assignment={a} />)}
            </>
          )}
        </>
      )}
    </StudentLayout>
  );
}