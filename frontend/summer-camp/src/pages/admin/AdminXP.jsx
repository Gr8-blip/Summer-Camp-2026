import { useEffect, useState, useMemo } from "react";
import { adminGetXP, adminAwardXP, adminGetStudents } from "../../api/client";
import AdminLayout from "./AdminLayout";
import { useToast, ToastContainer } from "../../components/Toast";

const PAGE_SIZE = 15;

export default function AdminXP() {
  const { toasts, toast } = useToast();
  const [items, setItems]       = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [search, setSearch]     = useState("");
  const [page, setPage]         = useState(1);
  const [modal, setModal]       = useState(false);
  const [form, setForm]         = useState({ student: "", amount: "", reason: "" });
  const [saving, setSaving]     = useState(false);
  const [formErr, setFormErr]   = useState("");
  const [studentSearch, setStudentSearch] = useState("");

  const load = () => {
    setLoading(true);
    Promise.all([adminGetXP(), adminGetStudents()])
      .then(([xpData, studentData]) => {
        setItems(xpData);
        // backend may return { students: [...] } or plain array
        setStudents(Array.isArray(studentData) ? studentData : studentData.students || []);
      })
      .catch((err) => setError(err.data?.error || "Couldn't load XP logs."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() =>
    items.filter((x) => (x.reason || "").toLowerCase().includes(search.toLowerCase())),
    [items, search]
  );
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Filter students in the modal by search term
  const filteredStudents = useMemo(() =>
    students.filter((s) =>
      (s.full_name || s.name || "").toLowerCase().includes(studentSearch.toLowerCase())
    ),
    [students, studentSearch]
  );

  const selectedStudent = students.find((s) => String(s.id) === String(form.student));

  const handleAward = async () => {
    if (!form.student || !form.amount || !form.reason) {
      setFormErr("Please select a student, enter an amount, and provide a reason.");
      return;
    }
    setSaving(true); setFormErr("");
    try {
      await adminAwardXP({
        student: Number(form.student),
        amount: Number(form.amount),
        reason: form.reason,
      });
      toast(`✨ +${form.amount} XP awarded to ${selectedStudent?.full_name || selectedStudent?.name}!`);
      setModal(false);
      setForm({ student: "", amount: "", reason: "" });
      setStudentSearch("");
      load();
    } catch (err) {
      setFormErr(err.data?.error || "Award failed.");
    } finally {
      setSaving(false);
    }
  };

  const openModal = () => {
    setForm({ student: "", amount: "", reason: "" });
    setStudentSearch("");
    setFormErr("");
    setModal(true);
  };

  const total = items.reduce((sum, x) => sum + (x.amount || 0), 0);

  return (
    <AdminLayout title="✨ XP Logs">

      {/* Summary cards */}
      <div className="a-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)", marginBottom: 28 }}>
        <div className="a-stat-card">
          <div className="a-stat-label">✨ Total XP Awarded</div>
          <div className="a-stat-value">{total.toLocaleString()}</div>
        </div>
        <div className="a-stat-card green">
          <div className="a-stat-label">📋 Log Entries</div>
          <div className="a-stat-value">{items.length}</div>
        </div>
      </div>

      <div className="a-action-bar">
        <input
          className="a-search"
          placeholder="Search by reason…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <button className="btn btn-primary" onClick={openModal} style={{ padding: "12px 22px", fontSize: "0.9rem" }}>
          + Award XP
        </button>
      </div>

      {loading && <div className="a-loading"><span className="spinner spinner-dark" /><span>Loading…</span></div>}
      {error   && <div className="a-error">⚠️ {error}</div>}

      {!loading && !error && (
        <>
          <div className="a-table-wrap">
            <table className="a-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Amount</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {paged.length === 0 && (
                  <tr><td colSpan={3} className="a-table-empty">No XP logs yet.</td></tr>
                )}
                {paged.map((x, i) => (
                  <tr key={i}>
                    <td><strong>{x.student?.full_name || x.student?.name || x.student || "—"}</strong></td>
                    <td><span className="a-badge a-badge-green">+{x.amount} XP</span></td>
                    <td className="a-td-muted">{x.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="a-pagination">
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  className={`a-page-btn ${page === i + 1 ? "active" : ""}`}
                  onClick={() => setPage(i + 1)}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Award XP Modal */}
      {modal && (
        <div className="a-modal-overlay" onClick={() => setModal(false)}>
          <div className="a-modal" onClick={(e) => e.stopPropagation()}>
            <h2>✨ Award XP</h2>

            {/* Student picker */}
            <div className="form-group">
              <label>Select Student *</label>
              <input
                className="a-search"
                style={{ width: "100%", marginBottom: 10, borderRadius: "var(--radius-sm)" }}
                placeholder="Search students…"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
              />

              {/* Selected chip */}
              {selectedStudent && (
                <div className="xp-selected-student">
                  <span>✅ {selectedStudent.full_name || selectedStudent.name}</span>
                  <button className="xp-clear-btn" onClick={() => setForm((f) => ({ ...f, student: "" }))}>✕</button>
                </div>
              )}

              {/* Student list — only show when no student is selected yet */}
              {!selectedStudent && (
                <div className="xp-student-list">
                  {filteredStudents.length === 0 && (
                    <div className="xp-student-empty">
                      {students.length === 0 ? "Loading students…" : "No students match your search."}
                    </div>
                  )}
                  {filteredStudents.map((s) => (
                    <button
                      key={s.id}
                      className="xp-student-row"
                      onClick={() => { setForm((f) => ({ ...f, student: s.id })); setStudentSearch(""); }}
                    >
                      <span className="xp-student-name">{s.full_name || s.name}</span>
                      <span className="xp-student-id">#{s.id}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="form-group">
              <label>XP Amount *</label>
              <input
                type="number" min="1"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="e.g. 100"
              />
            </div>

            <div className="form-group">
              <label>Reason *</label>
              <input
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="e.g. Weekly MVP"
              />
            </div>

            {formErr && <div className="error-text" style={{ marginBottom: 12 }}>⚠️ {formErr}</div>}

            <div className="a-modal-actions">
              <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAward} disabled={saving}>
                {saving ? <span className="spinner" /> : "Award XP 🚀"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} />
    </AdminLayout>
  );
}
