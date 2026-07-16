import { useEffect, useState } from "react";
import { getAssignments, submitAssignment } from "../../api/client";
import StudentLayout from "./StudentLayout";
import "./student.css";

function AssignmentRow({ assignment }) {
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

export default function Assignments() {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");

  useEffect(() => {
    getAssignments()
      .then(setAssignments)
      .catch((err) => setError(err.data?.error || "Couldn't load assignments."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <StudentLayout title="📝 Assignments">
      {loading && <div className="s-loading"><span className="spinner spinner-dark" /><span>Loading...</span></div>}
      {error   && <div className="s-error">⚠️ {error}</div>}
      {!loading && !error && assignments.length === 0 && <div className="s-empty"><div className="s-empty-icon">📝</div><p>No assignments yet.</p></div>}
      {!loading && !error && assignments.map((a) => <AssignmentRow key={a.id} assignment={a} />)}
    </StudentLayout>
  );
}