import { useEffect, useState, useMemo } from "react";
import { adminGetChallenges, adminCreateChallenge, adminUpdateChallenge, adminDeleteChallenge, adminGetLessons } from "../../api/client";
import AdminLayout from "./AdminLayout";
import { useToast, ToastContainer } from "../../components/Toast";

const PAGE_SIZE = 10;
const EMPTY_FORM = { title: "", description: "", xp_reward: "", lesson: "", start_date: "", end_date: "" };

export default function AdminChallenges() {
  const { toasts, toast } = useToast();
  const [items, setItems]     = useState([]);
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [search, setSearch]   = useState("");
  const [page, setPage]       = useState(1);
  const [modal, setModal]     = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm]       = useState(EMPTY_FORM);
  const [saving, setSaving]   = useState(false);
  const [formErr, setFormErr] = useState("");
  const [confirmDel, setConfirmDel] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([adminGetChallenges(), adminGetLessons()])
      .then(([chals, les]) => { setItems(chals); setLessons(les); })
      .catch((err) => setError(err.data?.error || "Couldn't load challenges."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => items.filter((c) => c.title.toLowerCase().includes(search.toLowerCase())), [items, search]);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openCreate = () => { setForm(EMPTY_FORM); setEditing(null); setFormErr(""); setModal("create"); };
  const openEdit = (item) => {
    setForm({ title: item.title, description: item.description, xp_reward: item.xp_reward, lesson: item.lesson || "", start_date: item.start_date?.slice(0, 16) || "", end_date: item.end_date?.slice(0, 16) || "" });
    setEditing(item); setFormErr(""); setModal("edit");
  };
  const closeModal = () => setModal(null);

  const validate = () => {
    if (!form.title || !form.xp_reward || !form.start_date || !form.end_date) { setFormErr("Title, XP, start and end dates are required."); return false; }
    if (new Date(form.end_date) <= new Date(form.start_date)) { setFormErr("End date must be after start date."); return false; }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true); setFormErr("");
    const body = { title: form.title, description: form.description, xp_reward: Number(form.xp_reward), lesson: form.lesson || null, start_date: form.start_date, end_date: form.end_date };
    try {
      if (modal === "edit") { await adminUpdateChallenge(editing.id, body); toast("Challenge updated!"); }
      else                  { await adminCreateChallenge(body);              toast("Challenge created!"); }
      closeModal(); load();
    } catch (err) { setFormErr(err.data?.error || "Save failed."); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirmDel) return;
    try { await adminDeleteChallenge(confirmDel.id); toast("Challenge deleted."); setConfirmDel(null); load(); }
    catch (err) { toast(err.data?.error || "Delete failed.", "error"); setConfirmDel(null); }
  };

  const now = new Date();

  return (
    <AdminLayout title="⚡ Challenges">
      <div className="a-action-bar">
        <input className="a-search" placeholder="Search challenges..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <button className="btn btn-primary" onClick={openCreate} style={{ padding: "12px 22px", fontSize: "0.9rem" }}>+ New Challenge</button>
      </div>

      {loading && <div className="a-loading"><span className="spinner spinner-dark" /><span>Loading...</span></div>}
      {error   && <div className="a-error">⚠️ {error}</div>}

      {!loading && !error && (
        <>
          <div className="a-table-wrap">
            <table className="a-table">
              <thead><tr><th>Title</th><th>XP</th><th>Lesson</th><th>Start</th><th>End</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {paged.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", padding: "40px", color: "var(--color-text-soft)" }}>No challenges found.</td></tr>}
                {paged.map((c) => {
                  const isActive = new Date(c.start_date) <= now && new Date(c.end_date) >= now;
                  return (
                    <tr key={c.id}>
                      <td><strong>{c.title}</strong></td>
                      <td><span className="a-badge a-badge-green">+{c.xp_reward}</span></td>
                      <td>{lessons.find((l) => l.id === c.lesson)?.title || "—"}</td>
                      <td style={{ fontSize: "0.82rem", color: "var(--color-text-soft)" }}>{c.start_date ? new Date(c.start_date).toLocaleDateString() : "—"}</td>
                      <td style={{ fontSize: "0.82rem", color: "var(--color-text-soft)" }}>{c.end_date ? new Date(c.end_date).toLocaleDateString() : "—"}</td>
                      <td><span className={`a-badge ${isActive ? "a-badge-green" : "a-badge-orange"}`}>{isActive ? "Active" : "Inactive"}</span></td>
                      <td>
                        <button className="btn btn-secondary" style={{ padding: "7px 14px", fontSize: "0.82rem", marginRight: 8 }} onClick={() => openEdit(c)}>Edit</button>
                        <button className="btn btn-danger"    style={{ padding: "7px 14px", fontSize: "0.82rem" }} onClick={() => setConfirmDel(c)}>Delete</button>
                      </td>
                    </tr>
                  );
                })}
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
        <div className="a-modal-overlay" onClick={closeModal}>
          <div className="a-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{modal === "edit" ? "Edit Challenge" : "New Challenge"}</h2>
            <div className="form-group"><label>Title *</label><input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Challenge title" /></div>
            <div className="form-group"><label>Description</label><textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} style={{ resize: "vertical" }} /></div>
            <div className="form-group">
              <label>Lesson</label>
              <select value={form.lesson} onChange={(e) => setForm((f) => ({ ...f, lesson: e.target.value }))}>
                <option value="">— None —</option>
                {lessons.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
              </select>
            </div>
            <div className="form-group"><label>XP Reward *</label><input type="number" min="0" value={form.xp_reward} onChange={(e) => setForm((f) => ({ ...f, xp_reward: e.target.value }))} placeholder="100" /></div>
            <div className="form-row">
              <div className="form-group"><label>Start Date *</label><input type="datetime-local" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} /></div>
              <div className="form-group"><label>End Date *</label><input type="datetime-local" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} /></div>
            </div>
            {formErr && <div className="error-text" style={{ marginBottom: 12 }}>⚠️ {formErr}</div>}
            <div className="a-modal-actions">
              <button className="btn btn-secondary" onClick={closeModal}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? <span className="spinner" /> : "Save"}</button>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <div className="a-modal-overlay" onClick={() => setConfirmDel(null)}>
          <div className="a-modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <h2>Delete Challenge?</h2>
            <div className="a-confirm"><p>Permanently delete <strong>"{confirmDel.title}"</strong>?</p></div>
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
