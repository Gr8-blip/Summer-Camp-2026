import { useEffect, useState, useMemo } from "react";
import { adminGetSubmissions, adminGradeSubmission } from "../../api/client";
import AdminLayout from "./AdminLayout";
import { useToast, ToastContainer } from "../../components/Toast";

const PAGE_SIZE = 10;

export default function AdminSubmissions() {
  const { toasts, toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all"); // all | pending | graded
  const [page, setPage] = useState(1);
  const [grading, setGrading] = useState(null); // selected submission
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    adminGetSubmissions()
      .then(setItems)
      .catch((err) => setError(err.data?.error || "Couldn't load submissions."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => items.filter((s) => {
    const matchSearch = (s.assignment?.title || "").toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || s.status === filter;
    return matchSearch && matchFilter;
  }), [items, search, filter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openGrading = (sub) => { setGrading(sub); setFeedback(sub.feedback || ""); };
  const closeGrading = () => { setGrading(null); setFeedback(""); };

  const handleGrade = async () => {
    setSaving(true);
    try {
      console.log(grading)
      console.log(grading.id)
      await adminGradeSubmission(grading.id, { feedback, status: "graded" });
      toast("Submission graded!");
      closeGrading(); load();
    } catch (err) { toast(err.data?.error || "Grading failed.", "error"); }
    finally { setSaving(false); }
  };

  return (
    <AdminLayout title="📬 Submissions">
      <div className="a-action-bar">
        <input className="a-search" placeholder="Search by assignment..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }} style={{ padding: "10px 14px", border: "2px solid var(--color-border)", borderRadius: "var(--radius-pill)", fontFamily: "var(--font-body)", fontWeight: 600, background: "white" }}>
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="graded">Graded</option>
        </select>
      </div>

      {loading && <div className="a-loading"><span className="spinner spinner-dark" /><span>Loading...</span></div>}
      {error && <div className="a-error">⚠️ {error}</div>}

      {!loading && !error && (
        <>
          <div className="a-table-wrap">
            <table className="a-table">
              <thead><tr><th>Assignment</th><th>Student</th><th>Submitted</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {paged.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", padding: "40px", color: "var(--color-text-soft)" }}>No submissions found.</td></tr>}
                {paged.map((s, i) => (
                  <tr key={i}>
                    <td><strong>{s.assignment?.title || "—"}</strong></td>
                    <td>{s.student?.full_name || s.student || "—"}</td>
                    <td style={{ fontSize: "0.82rem", color: "var(--color-text-soft)" }}>{s.submitted_at ? new Date(s.submitted_at).toLocaleDateString() : "—"}</td>
                    <td><span className={`a-badge ${s.status === "graded" ? "a-badge-green" : "a-badge-orange"}`}>{s.status}</span></td>
                    <td><button className="btn btn-secondary" style={{ padding: "7px 14px", fontSize: "0.82rem" }} onClick={() => openGrading(s)}>Grade</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="a-pagination">
              {Array.from({ length: totalPages }, (_, i) => (
                <button key={i} className={`a-page-btn ${page === i + 1 ? "active" : ""}`} onClick={() => setPage(i + 1)}>{i + 1}</button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Grading Modal */}
      {grading && (
        <div className="a-modal-overlay" onClick={closeGrading}>
          <div className="a-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Grade Submission</h2>
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontWeight: 700, marginBottom: 4 }}>Assignment: {grading.assignment?.title}</p>
              <span className={`a-badge ${grading.status === "graded" ? "a-badge-green" : "a-badge-orange"}`}>{grading.status}</span>
            </div>

            {grading.submission_text && (
              <div style={{ background: "var(--color-bg)", borderRadius: "var(--radius-sm)", padding: "14px 16px", marginBottom: 16 }}>
                <p style={{ fontWeight: 700, marginBottom: 6, fontSize: "0.85rem" }}>Student's Answer:</p>
                <p style={{ fontSize: "0.9rem", color: "var(--color-text-soft)", whiteSpace: "pre-wrap" }}>{grading.submission_text}</p>
              </div>
            )}

            <div className="form-group">
              <label>Feedback</label>
              <textarea rows={4} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Leave feedback for the student..." style={{ resize: "vertical" }} />
            </div>

            <div className="a-modal-actions">
              <button className="btn btn-secondary" onClick={closeGrading}>Cancel</button>
              <button className="btn btn-primary" onClick={handleGrade} disabled={saving}>{saving ? <span className="spinner" /> : "Mark as Graded ✅"}</button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} />
    </AdminLayout>
  );
}
