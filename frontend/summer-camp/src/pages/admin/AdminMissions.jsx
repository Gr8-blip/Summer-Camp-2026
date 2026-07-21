import { useEffect, useState, useMemo } from "react";
import { adminGetMissions, adminCreateMission, adminUpdateMission, adminDeleteMission } from "../../api/client";
import AdminLayout from "./AdminLayout";
import { useToast, ToastContainer } from "../../components/Toast";

const PAGE_SIZE = 10;
const EMPTY_FORM = { week: "", title: "", description: "", xp_reward: "" };

export default function AdminMissions() {
  const { toasts, toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null); // null | "create" | "edit"
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [confirmDel, setConfirmDel] = useState(null);

  const load = () => {
    setLoading(true);
    adminGetMissions()
      .then(setItems)
      .catch((err) => setError(err.data?.error || "Couldn't load missions."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() =>
    items.filter((m) => m.title.toLowerCase().includes(search.toLowerCase()) || String(m.week).includes(search)),
    [items, search]
  );
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openCreate = () => { setForm(EMPTY_FORM); setEditing(null); setFormErr(""); setModal("create"); };
  const openEdit = (item) => { setForm({ week: item.week, title: item.title, description: item.description, xp_reward: item.xp_reward }); setEditing(item); setFormErr(""); setModal("edit"); };
  const closeModal = () => setModal(null);

  const validate = () => {
    if (!form.week || !form.title || !form.xp_reward) { setFormErr("Week, title and XP reward are required."); return false; }
    if (isNaN(Number(form.week)) || Number(form.week) < 1) { setFormErr("Week must be a positive number."); return false; }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true); setFormErr("");
    const body = { week: Number(form.week), title: form.title, description: form.description, xp_reward: Number(form.xp_reward) };
    try {
      if (modal === "edit") { await adminUpdateMission(editing.id, body); toast("Mission updated!"); }
      else { await adminCreateMission(body); toast("Mission created!"); }
      closeModal(); load();
    } catch (err) { setFormErr(err.data?.error || "Save failed."); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirmDel) return;
    try {
      await adminDeleteMission(confirmDel.id);
      toast("Mission deleted."); setConfirmDel(null); load();
    } catch (err) { toast(err.data?.error || "Delete failed.", "error"); setConfirmDel(null); }
  };

  const togglePublish = async (item) => {
    const updatedStatus = !item.is_published;

    // 1. Optimistically update local state so the badge text changes INSTANTLY
    setItems((prev) =>
      prev.map((m) => (m.id === item.id ? { ...m, is_published: updatedStatus } : m))
    );

    try {
      // 2. Send full payload (or just status) depending on backend API structure
      await adminUpdateMission(item.id, {
        ...item,
        is_published: updatedStatus,
      });
      toast(updatedStatus ? "Mission published!" : "Mission unpublished.");
    } catch (e) {
      // Revert state back if backend failed
      setItems((prev) =>
        prev.map((m) => (m.id === item.id ? { ...m, is_published: item.is_published } : m))
      );
      toast(e.data?.detail || e.data?.error || "Couldn't update status.", "error");
    }
  };

  return (
    <AdminLayout title="🎯 Missions">
      <div className="a-action-bar">
        <input className="a-search" placeholder="Search missions..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <button className="btn btn-primary" onClick={openCreate} style={{ padding: "12px 22px", fontSize: "0.9rem" }}>+ New Mission</button>
      </div>

      {loading && <div className="a-loading"><span className="spinner spinner-dark" /><span>Loading...</span></div>}
      {error && <div className="a-error">⚠️ {error}</div>}

      {!loading && !error && (
        <>
          <div className="a-table-wrap">
            <table className="a-table">
              <thead>
                <tr>
                  <th>Week</th>
                  <th>Title</th>
                  <th>Description</th>
                  <th>XP</th>
                  <th>Published</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paged.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: "center", padding: "40px", color: "var(--color-text-soft)" }}>No missions found.</td></tr>
                )}
                {paged.map((m) => (
                  <tr key={m.id}>
                    <td><span className="a-badge a-badge-purple">Wk {m.week}</span></td>
                    <td><strong>{m.title}</strong></td>
                    <td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--color-text-soft)" }}>{m.description}</td>
                    <td><span className="a-badge a-badge-green">+{m.xp_reward} XP</span></td>
                    <td>
                      <button
                        className={`a-badge ${m.is_published ? "a-badge-green" : "a-badge-orange"}`}
                        style={{ border: "none", cursor: "pointer" }}
                        onClick={() => togglePublish(m)}
                      >
                        {m.is_published ? "Published" : "Draft"}
                      </button>
                    </td>
                    <td>
                      <button className="btn btn-secondary" style={{ padding: "7px 14px", fontSize: "0.82rem", marginRight: 8 }} onClick={() => openEdit(m)}>Edit</button>
                      <button className="btn btn-danger" style={{ padding: "7px 14px", fontSize: "0.82rem" }} onClick={() => setConfirmDel(m)}>Delete</button>
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

      {/* Create/Edit Modal */}
      {modal && (
        <div className="a-modal-overlay" onClick={closeModal}>
          <div className="a-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{modal === "edit" ? "Edit Mission" : "New Mission"}</h2>
            <div className="form-group"><label>Week *</label><input type="number" min="1" value={form.week} onChange={(e) => setForm((f) => ({ ...f, week: e.target.value }))} placeholder="1" /></div>
            <div className="form-group"><label>Title *</label><input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Mission title" /></div>
            <div className="form-group"><label>Description</label><textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Mission description" style={{ resize: "vertical" }} /></div>
            <div className="form-group"><label>XP Reward *</label><input type="number" min="0" value={form.xp_reward} onChange={(e) => setForm((f) => ({ ...f, xp_reward: e.target.value }))} placeholder="100" /></div>
            {formErr && <div className="error-text" style={{ marginBottom: 12 }}>⚠️ {formErr}</div>}
            <div className="a-modal-actions">
              <button className="btn btn-secondary" onClick={closeModal}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? <span className="spinner" /> : "Save"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete */}
      {confirmDel && (
        <div className="a-modal-overlay" onClick={() => setConfirmDel(null)}>
          <div className="a-modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <h2>Delete Mission?</h2>
            <div className="a-confirm"><p>This will permanently delete <strong>"{confirmDel.title}"</strong>. This can't be undone.</p></div>
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