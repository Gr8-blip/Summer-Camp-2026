import { useEffect, useState } from "react";
import { getSubmissions } from "../../api/client";
import StudentLayout from "./StudentLayout";
import "./student.css";

export default function Submissions() {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");

  useEffect(() => {
    getSubmissions()
      .then(setSubmissions)
      .catch((err) => setError(err.data?.error || "Couldn't load submissions."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <StudentLayout title="📬 My Submissions">
      {loading && <div className="s-loading"><span className="spinner spinner-dark" /><span>Loading...</span></div>}
      {error   && <div className="s-error">⚠️ {error}</div>}
      {!loading && !error && submissions.length === 0 && <div className="s-empty"><div className="s-empty-icon">📬</div><p>No submissions yet.</p></div>}
      {!loading && !error && submissions.map((sub, i) => (
        <div key={i} className="s-card">
          <div className="s-card-header">
            <div><h3>{sub.assignment?.title || "Assignment"}</h3><span className="s-meta-text">Submitted: {new Date(sub.submitted_at).toLocaleDateString()}</span></div>
            <span className={`s-badge ${sub.status === "graded" ? "s-badge-green" : "s-badge-orange"}`}>{sub.status}</span>
          </div>
          {sub.submission_text && <div className="s-submission-text"><strong>Your answer:</strong><p>{sub.submission_text}</p></div>}
          {sub.feedback && <div className="s-feedback-box"><strong>💬 Teacher Feedback</strong><p>{sub.feedback}</p></div>}
        </div>
      ))}
    </StudentLayout>
  );
}