import { useEffect, useState, useMemo } from "react";
import { adminGetXP, adminAwardXP } from "../../api/client";
import AdminLayout from "./AdminLayout";
import { useToast, ToastContainer } from "../../components/Toast";

const PAGE_SIZE = 15;

export default function AdminXP() {
  const { toasts, toast } = useToast();
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [search, setSearch]   = useState("");
  const [page, setPage]       = useState(1);
  const [modal, setModal]     = useState(false);
  const [form, setForm]       = useState({ student: "", amount: "", reason: "" });
  const [saving, setSaving]   = useState(false);
  const [formErr, setFormErr] = useState("");

  const load = () => {
    setLoading(true);
    adminGetXP()
      .then(setItems)
      .catch((err) => setError(err.data?.error || "Couldn't load XP logs."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => items.filter((x) => (x.reason || "").toLowerCase().includes(search.toLowerCase())), [items, search]);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleAward = async () => {
    if (!form.student || !form.amount || !form.reason) { setFormErr("All fields are required."); return; }
    setSaving(true); setFormErr("");
    try {
      await adminAwardXP({ student: Number(form.student), amount: Number(form.amount), reason: form.reason });
      toast(`+${form.amount} XP awarded!`);
      setModal(false); setForm({ student: "", amount: "", reason: "" }); load();
    } catch (err) { setFormErr(err.data?.error || "Award failed."); }
    finally { setSaving(false); }
  };

  const total = items.reduce((sum, x) => sum + (x.amount || 0), 0);

  return (
    <AdminLayout title="✨ XP Logs">
      <div className="a-grid" style={{ marginBottom: 24 }}>
        <div className="a-stat-card">
          <div className="a-stat-label">✨ Total XP Awarded</div>
          <div className="a-stat-value">{total.toLocaleString()}</div>
        </div>
        <div className="a-stat-card green">
          <div className="a-stat-label">📋 Total Entries</div>
          <div className="a-stat-value">{items.length}</div>
        </div>
      </div>

      <div className="a-action-bar">
        <input className="a-search" placeholder="Search by reason..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <button className="btn btn-primary" onClick={() => setModal(true)} style={{ padding: "12px 22px", fontSize: "0.9rem" }}>+ Award XP</button>
      </div>

      {loading && <div className="a-loading"><span className="spinner spinner-dark" /><span>Loading...</span></div>}
      {error   && <div className="a-error">⚠️ {error}</div>}

      {!loading && !error && (
        <>
          <div className="a-table-wrap">
            <table className="a-table">
              <thead><tr><th>Student</th><th>Amount</th><th>Reason</th></tr></thead>
              <tbody>
                {paged.length === 0 && <tr><td colSpan={3} style={{ textAlign: "center", padding: "40px", color: "var(--color-text-soft)" }}>No XP logs found.</td></tr>}
                {paged.map((x, i) => (
                  <tr key={i}>
                    <td>{x.student?.full_name || x.student || "—"}</td>
                    <td><span className="a-badge a-badge-green">+{x.amount} XP</span></td>
                    <td style={{ color: "var(--color-text-soft)", fontSize: "0.9rem" }}>{x.reason}</td>
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

      {modal && (
        <div className="a-modal-overlay" onClick={() => setModal(false)}>
          <div className="a-modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <h2>✨ Award XP</h2>
            <div className="form-group"><label>Student ID *</label><input type="number" value={form.student} onChange={(e) => setForm((f) => ({ ...f, student: e.target.value }))} placeholder="Student ID" /></div>
            <div className="form-group"><label>Amount *</label><input type="number" min="1" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="100" /></div>
            <div className="form-group"><label>Reason *</label><input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Weekly MVP" /></div>
            {formErr && <div className="error-text" style={{ marginBottom: 12 }}>⚠️ {formErr}</div>}
            <div className="a-modal-actions">
              <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAward} disabled={saving}>{saving ? <span className="spinner" /> : "Award XP 🚀"}</button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} />
    </AdminLayout>
  );
}
