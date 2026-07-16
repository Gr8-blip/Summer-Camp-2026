import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getLessonDetail, submitAssignment } from "../../api/client";
import StudentLayout from "./StudentLayout";
import "./student.css";

function AssignmentCard({ assignment }) {
  const [open, setOpen]         = useState(false);
  const [text, setText]         = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [err, setErr]           = useState("");

  const handleSubmit = async () => {
    if (!text.trim()) { setErr("Write something first!"); return; }
    setSubmitting(true); setErr("");
    try { await submitAssignment(assignment.id, text); setSubmitted(true); setOpen(false); }
    catch (e) { setErr(e.data?.error || "Submission failed."); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="s-card">
      <div className="s-card-header">
        <div><h3>{assignment.title}</h3><p>{assignment.description}</p><span className="s-meta-text">Due: {new Date(assignment.deadline).toLocaleDateString()}</span></div>
        <span className="s-badge s-badge-orange">+{assignment.xp_reward} XP</span>
      </div>
      {submitted
        ? <div className="s-submit-success">✅ Submitted!</div>
        : <>
            <button className="s-toggle-btn" onClick={() => setOpen((o) => !o)}>{open ? "Cancel" : "📝 Submit Answer"}</button>
            {open && <div className="s-submit-form">
              <textarea rows={5} placeholder="Write your answer here..." value={text} onChange={(e) => setText(e.target.value)} className="s-textarea" />
              {err && <span className="error-text">{err}</span>}
              <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>{submitting ? <span className="spinner" /> : "Submit →"}</button>
            </div>}
          </>
      }
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
          {lesson.assignments?.length > 0 && <><h2 className="s-section-heading">📝 Assignments</h2>{lesson.assignments.map((a) => <AssignmentCard key={a.id} assignment={a} />)}</>}
          {lesson.challenges?.length > 0 && (
            <><h2 className="s-section-heading">⚡ Challenges</h2>
            {lesson.challenges.map((c) => (
              <div key={c.id} className="s-card">
                <div className="s-card-header">
                  <div><h3>{c.title}</h3><p>{c.description}</p><span className="s-meta-text">{new Date(c.start_date).toLocaleDateString()} – {new Date(c.end_date).toLocaleDateString()}</span></div>
                  <span className="s-badge s-badge-pink">+{c.xp_reward} XP</span>
                </div>
              </div>
            ))}</>
          )}
        </>
      )}
    </StudentLayout>
  );
}