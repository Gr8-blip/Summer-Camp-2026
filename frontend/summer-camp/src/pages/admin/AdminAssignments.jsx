import { useEffect, useState, useMemo } from "react";
import { adminGetAssignments, adminCreateAssignment, adminUpdateAssignment, adminDeleteAssignment, adminGetLessons } from "../../api/client";
import AdminLayout from "./AdminLayout";
import { useToast, ToastContainer } from "../../components/Toast";

const PAGE_SIZE = 10;
const EMPTY_FORM = { lesson: "", title: "", description: "", xp_reward: "", deadline: "" };

export default function AdminAssignments() {
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
    Promise.all([adminGetAssignments(), adminGetLessons()])
      .then(([asgn, les]) => { setItems(asgn); setLessons(les); })
      .catch((err) => setError(err.data?.error || "Couldn't load assignments."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => items.filter((a) => a.title.toLowerCase().includes(search.toLowerCase())), [items, search]);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openCreate = () => { setForm(EMPTY_FORM); setEditing(null); setFormErr(""); setModal("create"); };
  const openEdit = (item) => {
    const dl = item.deadline ? item.deadline.slice(0, 16) : "";
    setForm({ lesson: item.lesson || "", title: item.title, description: item.description, xp_reward: item.xp_reward, deadline: dl });
    setEditing(item); setFormErr(""); setModal("edit");
  };
  const closeModal = () => setModal(null);

  const validate = () => {
    if (!form.title || !form.xp_reward || !form.deadline) { setFormErr("Title, XP reward and deadline are required."); return false; }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true); setFormErr("");
    const body = { lesson: form.lesson || null, title: form.title, description: form.description, xp_reward: Number(form.xp_reward), deadline: form.deadline };
    try {
      if (modal === "edit") { await adminUpdateAssignment(editing.id, body); toast("Assignment updated!"); }
      else                  { await adminCreateAssignment(body);              toast("Assignment created!"); }
      closeModal(); load();
    } catch (err) { setFormErr(err.data?.error || "Save failed."); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirmDel) return;
    try { await adminDeleteAssignment(confirmDel.id); toast("Assignment deleted."); setConfirmDel(null); load(); }
    catch (err) { toast(err.data?.error || "Delete failed.", "error"); setConfirmDel(null); }
  };

  return (
    <AdminLayout title="📝 Assignments">
      <div className="a-action-bar">
        <input className="a-search" placeholder="Search assignments..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <button className="btn btn-primary" onClick={openCreate} style={{ padding: "12px 22px", fontSize: "0.9rem" }}>+ New Assignment</button>
      </div>

      {loading && <div className="a-loading"><span className="spinner spinner-dark" /><span>Loading...</span></div>}
      {error   && <div className="a-error">⚠️ {error}</div>}

      {!loading && !error && (
        <>
          <div className="a-table-wrap">
            <table className="a-table">
              <thead><tr><th>Title</th><th>Lesson</th><th>XP</th><th>Deadline</th><th>Actions</th></tr></thead>
              <tbody>
                {paged.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", padding: "40px", color: "var(--color-text-soft)" }}>No assignments found.</td></tr>}
                {paged.map((a) => (
                  <tr key={a.id}>
                    <td><strong>{a.title}</strong></td>
                    <td>{lessons.find((l) => l.id === a.lesson)?.title || "—"}</td>
                    <td><span className="a-badge a-badge-green">+{a.xp_reward} XP</span></td>
                    <td style={{ fontSize: "0.85rem", color: "var(--color-text-soft)" }}>{a.deadline ? new Date(a.deadline).toLocaleDateString() : "—"}</td>
                    <td>
                      <button className="btn btn-secondary" style={{ padding: "7px 14px", fontSize: "0.82rem", marginRight: 8 }} onClick={() => openEdit(a)}>Edit</button>
                      <button className="btn btn-danger"    style={{ padding: "7px 14px", fontSize: "0.82rem" }} onClick={() => setConfirmDel(a)}>Delete</button>
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

      {modal && (
        <div className="a-modal-overlay" onClick={closeModal}>
          <div className="a-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{modal === "edit" ? "Edit Assignment" : "New Assignment"}</h2>
            <div className="form-group">
              <label>Lesson</label>
              <select value={form.lesson} onChange={(e) => setForm((f) => ({ ...f, lesson: e.target.value }))}>
                <option value="">— None —</option>
                {lessons.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Title *</label><input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Assignment title" /></div>
            <div className="form-group"><label>Description</label><textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} style={{ resize: "vertical" }} /></div>
            <div className="form-row">
              <div className="form-group"><label>XP Reward *</label><input type="number" min="0" value={form.xp_reward} onChange={(e) => setForm((f) => ({ ...f, xp_reward: e.target.value }))} placeholder="50" /></div>
              <div className="form-group"><label>Deadline *</label><input type="datetime-local" value={form.deadline} onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))} /></div>
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
            <h2>Delete Assignment?</h2>
            <div className="a-confirm"><p>Permanently delete <strong>"{confirmDel.title}"</strong>? This can't be undone.</p></div>
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
