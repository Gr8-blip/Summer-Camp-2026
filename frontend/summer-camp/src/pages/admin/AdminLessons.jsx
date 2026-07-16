import { useEffect, useState, useMemo } from "react";
import { adminGetLessons, adminCreateLesson, adminUpdateLesson, adminDeleteLesson, adminGetMissions } from "../../api/client";
import AdminLayout from "./AdminLayout";
import { useToast, ToastContainer } from "../../components/Toast";

const PAGE_SIZE = 10;
const EMPTY_FORM = { mission: "", title: "", description: "", order: "", duration: "" };

export default function AdminLessons() {
  const { toasts, toast } = useToast();
  const [items, setItems]       = useState([]);
  const [missions, setMissions] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [search, setSearch]     = useState("");
  const [page, setPage]         = useState(1);
  const [modal, setModal]       = useState(null);
  const [editing, setEditing]   = useState(null);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [saving, setSaving]     = useState(false);
  const [formErr, setFormErr]   = useState("");
  const [confirmDel, setConfirmDel] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([adminGetLessons(), adminGetMissions()])
      .then(([lessons, ms]) => { setItems(lessons); setMissions(ms); })
      .catch((err) => setError(err.data?.error || "Couldn't load lessons."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => items.filter((l) => l.title.toLowerCase().includes(search.toLowerCase())), [items, search]);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openCreate = () => { setForm(EMPTY_FORM); setEditing(null); setFormErr(""); setModal("create"); };
  const openEdit = (item) => {
    setForm({ mission: item.mission || "", title: item.title, description: item.description, order: item.order, duration: item.duration });
    setEditing(item); setFormErr(""); setModal("edit");
  };
  const closeModal = () => setModal(null);

  const validate = () => {
    if (!form.title || !form.order) { setFormErr("Title and order are required."); return false; }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true); setFormErr("");
    const body = { mission: form.mission || null, title: form.title, description: form.description, order: Number(form.order), duration: form.duration };
    try {
      if (modal === "edit") { await adminUpdateLesson(editing.id, body); toast("Lesson updated!"); }
      else                  { await adminCreateLesson(body);              toast("Lesson created!"); }
      closeModal(); load();
    } catch (err) { setFormErr(err.data?.error || "Save failed."); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirmDel) return;
    try { await adminDeleteLesson(confirmDel.id); toast("Lesson deleted."); setConfirmDel(null); load(); }
    catch (err) { toast(err.data?.error || "Delete failed.", "error"); setConfirmDel(null); }
  };

  return (
    <AdminLayout title="📖 Lessons">
      <div className="a-action-bar">
        <input className="a-search" placeholder="Search lessons..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <button className="btn btn-primary" onClick={openCreate} style={{ padding: "12px 22px", fontSize: "0.9rem" }}>+ New Lesson</button>
      </div>

      {loading && <div className="a-loading"><span className="spinner spinner-dark" /><span>Loading...</span></div>}
      {error   && <div className="a-error">⚠️ {error}</div>}

      {!loading && !error && (
        <>
          <div className="a-table-wrap">
            <table className="a-table">
              <thead><tr><th>#</th><th>Title</th><th>Mission</th><th>Duration</th><th>Actions</th></tr></thead>
              <tbody>
                {paged.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", padding: "40px", color: "var(--color-text-soft)" }}>No lessons found.</td></tr>}
                {paged.map((l) => (
                  <tr key={l.id}>
                    <td><span className="a-badge a-badge-purple">{l.order}</span></td>
                    <td><strong>{l.title}</strong><div style={{ fontSize: "0.8rem", color: "var(--color-text-soft)" }}>{l.description?.slice(0, 60)}...</div></td>
                    <td>{missions.find((m) => m.id === l.mission)?.title || "—"}</td>
                    <td>{l.duration}</td>
                    <td>
                      <button className="btn btn-secondary" style={{ padding: "7px 14px", fontSize: "0.82rem", marginRight: 8 }} onClick={() => openEdit(l)}>Edit</button>
                      <button className="btn btn-danger"    style={{ padding: "7px 14px", fontSize: "0.82rem" }} onClick={() => setConfirmDel(l)}>Delete</button>
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
            <h2>{modal === "edit" ? "Edit Lesson" : "New Lesson"}</h2>
            <div className="form-group">
              <label>Mission</label>
              <select value={form.mission} onChange={(e) => setForm((f) => ({ ...f, mission: e.target.value }))}>
                <option value="">— None —</option>
                {missions.map((m) => <option key={m.id} value={m.id}>Week {m.week}: {m.title}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Title *</label><input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Lesson title" /></div>
            <div className="form-group"><label>Description</label><textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} style={{ resize: "vertical" }} /></div>
            <div className="form-row">
              <div className="form-group"><label>Order *</label><input type="number" min="1" value={form.order} onChange={(e) => setForm((f) => ({ ...f, order: e.target.value }))} placeholder="1" /></div>
              <div className="form-group"><label>Duration (HH:MM:SS)</label><input value={form.duration} onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))} placeholder="01:00:00" /></div>
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
            <h2>Delete Lesson?</h2>
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
