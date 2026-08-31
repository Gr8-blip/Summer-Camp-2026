import { useEffect, useState, useMemo } from "react";
import { adminGetQAQuestions, adminUpdateQAQuestion, adminDeleteQAQuestion } from "../../api/client";
import AdminLayout from "./AdminLayout";
import { useToast, ToastContainer } from "../../components/Toast";

const PAGE_SIZE = 10;
const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "answered", label: "Answered" },
  { key: "hidden", label: "Hidden" },
];

export default function AdminQA() {
  const { toasts, toast } = useToast();
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [search, setSearch]   = useState("");
  const [status, setStatus]   = useState("all");
  const [page, setPage]       = useState(1);
  const [confirmDel, setConfirmDel] = useState(null);
  const [spotlight, setSpotlight]   = useState(null); // question the teacher is walking through live

  const load = () => {
    setLoading(true);
    adminGetQAQuestions()
      .then(setItems)
      .catch((err) => setError(err.data?.error || "Couldn't load questions."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return items
      .filter((q) => status === "all" || q.status === status)
      .filter((q) => q.text.toLowerCase().includes(search.toLowerCase()));
  }, [items, search, status]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const updateStatus = async (item, newStatus) => {
    try {
      await adminUpdateQAQuestion(item.id, { status: newStatus });
      toast(
        newStatus === "answered" ? "Marked as answered." :
        newStatus === "hidden"   ? "Hidden from the inbox." :
        "Moved back to pending."
      );
      load();
    } catch (err) {
      toast(err.data?.error || "Couldn't update.", "error");
    }
  };

  const handleDelete = async () => {
    if (!confirmDel) return;
    try {
      await adminDeleteQAQuestion(confirmDel.id);
      toast("Question deleted.");
      setConfirmDel(null);
      load();
    } catch (err) {
      toast(err.data?.error || "Delete failed.", "error");
      setConfirmDel(null);
    }
  };

  const pendingCount = items.filter((q) => q.status === "pending").length;

  return (
    <AdminLayout title="❓ Week 6 Q&A">
      <div className="a-action-bar" style={{ flexWrap: "wrap", gap: 10 }}>
        <input
          className="a-search"
          placeholder="Search questions..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <div style={{ display: "flex", gap: 6 }}>
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              className={`a-badge ${status === f.key ? "a-badge-green" : ""}`}
              style={{ border: "1px solid var(--color-border)", cursor: "pointer" }}
              onClick={() => { setStatus(f.key); setPage(1); }}
            >
              {f.label}{f.key === "pending" && pendingCount > 0 ? ` (${pendingCount})` : ""}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="a-loading"><span className="spinner spinner-dark" /><span>Loading...</span></div>}
      {error   && <div className="a-error">⚠️ {error}</div>}

      {!loading && !error && (
        <>
          <div className="a-table-wrap">
            <table className="a-table">
              <thead>
                <tr>
                  <th>Question</th>
                  <th>From</th>
                  <th>Lesson</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paged.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: "center", padding: "40px", color: "var(--color-text-soft)" }}>No questions yet.</td></tr>
                )}
                {paged.map((q) => (
                  <tr key={q.id}>
                    <td style={{ maxWidth: 360 }}>{q.text}</td>
                    <td><strong>{q.student_name}</strong></td>
                    <td>{q.lesson_title || "—"}</td>
                    <td>{q.category || "—"}</td>
                    <td>
                      <span className={`a-badge ${q.status === "answered" ? "a-badge-green" : q.status === "hidden" ? "" : "a-badge-orange"}`}>
                        {q.status === "answered" ? "✅ Answered" : q.status === "hidden" ? "🙈 Hidden" : "🟡 Pending"}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-secondary" style={{ padding: "7px 12px", fontSize: "0.8rem", marginRight: 6 }} onClick={() => setSpotlight(q)}>
                        🔦 Spotlight
                      </button>
                      {q.status !== "answered" && (
                        <button className="btn btn-secondary" style={{ padding: "7px 12px", fontSize: "0.8rem", marginRight: 6 }} onClick={() => updateStatus(q, "answered")}>
                          ✅ Answered
                        </button>
                      )}
                      {q.status !== "hidden" ? (
                        <button className="btn btn-secondary" style={{ padding: "7px 12px", fontSize: "0.8rem", marginRight: 6 }} onClick={() => updateStatus(q, "hidden")}>
                          🙈 Hide
                        </button>
                      ) : (
                        <button className="btn btn-secondary" style={{ padding: "7px 12px", fontSize: "0.8rem", marginRight: 6 }} onClick={() => updateStatus(q, "pending")}>
                          ↩️ Unhide
                        </button>
                      )}
                      <button className="btn btn-danger" style={{ padding: "7px 12px", fontSize: "0.8rem" }} onClick={() => setConfirmDel(q)}>
                        Delete
                      </button>
                    </td>
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

      {/* Full-screen "put it on the projector" view for reading a question
          out loud without the whole admin table showing on screen. */}
      {spotlight && (
        <div className="a-modal-overlay" onClick={() => setSpotlight(null)}>
          <div className="a-modal" style={{ maxWidth: 640, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.1em", color: "var(--color-text-soft)", marginBottom: 14 }}>
              {spotlight.category || "QUESTION"}
            </div>
            <h2 style={{ fontSize: "1.5rem", lineHeight: 1.4 }}>{spotlight.text}</h2>
            <div className="a-modal-actions" style={{ justifyContent: "center", marginTop: 24 }}>
              <button className="btn btn-secondary" onClick={() => setSpotlight(null)}>Close</button>
              {spotlight.status !== "answered" && (
                <button className="btn btn-primary" onClick={() => { updateStatus(spotlight, "answered"); setSpotlight(null); }}>
                  ✅ Mark Answered
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <div className="a-modal-overlay" onClick={() => setConfirmDel(null)}>
          <div className="a-modal a-modal-sm" onClick={(e) => e.stopPropagation()}>
            <h2>Delete Question?</h2>
            <div className="a-confirm"><p>Permanently delete this question? This can't be undone.</p></div>
            <div className="a-modal-actions">
              <button className="btn btn-secondary" onClick={() => setConfirmDel(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDelete}>Yes, Delete</button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} />
    </AdminLayout>
  );
}