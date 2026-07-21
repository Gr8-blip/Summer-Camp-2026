import { useEffect, useState, useMemo } from "react";
import { adminGetChallenges, adminCreateChallenge, adminUpdateChallenge, adminDeleteChallenge, adminGetMissions } from "../../api/client";
import AdminLayout from "./AdminLayout";
import { useToast, ToastContainer } from "../../components/Toast";
import ChallengeQuestionBuilder from "./ChallengeQuestionBuilder";
import "./AdminChallenges.css";

const PAGE_SIZE = 10;
const EMPTY_FORM = { title: "", description: "", xp_reward: "", mission: "", start_date: "", end_date: "" };

export default function AdminChallenges() {
  const { toasts, toast } = useToast();
  const [items, setItems]     = useState([]);
  const [missions, setMissions] = useState([]);
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
  const [building, setBuilding] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([adminGetChallenges(), adminGetMissions()])
      .then(([chals, les]) => { setItems(chals); setMissions(les); })
      .catch((err) => setError(err.data?.error || "Couldn't load challenges."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => items.filter((c) => c.title.toLowerCase().includes(search.toLowerCase())), [items, search]);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openCreate = () => { setForm(EMPTY_FORM); setEditing(null); setFormErr(""); setModal("create"); };
  const openEdit = (item) => {
    setForm({ title: item.title, description: item.description, xp_reward: item.xp_reward, mission: item.mission || "", start_date: item.start_date?.slice(0, 16) || "", end_date: item.end_date?.slice(0, 16) || "" });
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
    const body = { title: form.title, description: form.description, xp_reward: Number(form.xp_reward), mission: form.mission || null, start_date: form.start_date, end_date: form.end_date };
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

  const handleTogglePublish = async (item) => {
    setTogglingId(item.id);
    try {
      await adminUpdateChallenge(item.id, { is_published: !item.is_published });
      setItems((prev) => prev.map((c) => (c.id === item.id ? { ...c, is_published: !c.is_published } : c)));
      toast(item.is_published ? "Challenge unpublished." : "Challenge published!");
    } catch (err) {
      toast(err.data?.error || "Couldn't update status.", "error");
    } finally {
      setTogglingId(null);
    }
  };

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
          <div className="a-table-wrap ac-table-wrap">
            <table className="a-table">
              <thead><tr><th>Title</th><th>XP</th><th>Lesson</th><th>Start</th><th>End</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {paged.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", padding: "40px", color: "var(--color-text-soft)" }}>No challenges found.</td></tr>}
                {paged.map((c) => {
                  return (
                    <tr key={c.id} className={c.is_published ? "ac-row-active" : ""}>
                      <td data-label="Title"><strong>{c.title}</strong></td>
                      <td data-label="XP"><span className="a-badge a-badge-green">+{c.xp_reward}</span></td>
                      <td data-label="Lesson">{missions.find((m) => m.id === c.mission)?.title || "—"}</td>
                      <td data-label="Start" style={{ fontSize: "0.82rem", color: "var(--color-text-soft)" }}>{c.start_date ? new Date(c.start_date).toLocaleDateString() : "—"}</td>
                      <td data-label="End" style={{ fontSize: "0.82rem", color: "var(--color-text-soft)" }}>{c.end_date ? new Date(c.end_date).toLocaleDateString() : "—"}</td>
                      <td data-label="Status">
                        <button
                          className={`a-badge ac-status-toggle ${c.is_published ? "a-badge-green" : "a-badge-orange"}`}
                          onClick={() => handleTogglePublish(c)}
                          disabled={togglingId === c.id}
                          title="Click to toggle published status"
                        >
                          {togglingId === c.id ? <span className="spinner" /> : c.is_published ? "True" : "False"}
                        </button>
                      </td>
                      <td data-label="Actions">
                        <div className="ac-row-actions">
                          <button className="btn btn-secondary ac-questions-btn" onClick={() => setBuilding(c)}>🧩 Questions</button>
                          <button className="btn btn-secondary" style={{ padding: "7px 14px", fontSize: "0.82rem" }} onClick={() => openEdit(c)}>Edit</button>
                          <button className="btn btn-danger"    style={{ padding: "7px 14px", fontSize: "0.82rem" }} onClick={() => setConfirmDel(c)}>Delete</button>
                        </div>
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
          <div className="a-modal ac-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{modal === "edit" ? "Edit Challenge" : "New Challenge"}</h2>
            <div className="form-group"><label>Title *</label><input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Challenge title" /></div>
            <div className="form-group"><label>Description</label><textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} style={{ resize: "vertical" }} /></div>
            <div className="form-row">
              <div className="form-group">
                <label>Mission</label>
                <select value={form.mission} onChange={(e) => setForm((f) => ({ ...f, mission: e.target.value }))}>
                  <option value="">— None —</option>
                  {missions.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
                </select>
              </div>
              <div className="form-group"><label>XP Reward *</label><input type="number" min="0" value={form.xp_reward} onChange={(e) => setForm((f) => ({ ...f, xp_reward: e.target.value }))} placeholder="100" /></div>
            </div>
            <div className="form-row ac-date-row">
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

      {building && <ChallengeQuestionBuilder challenge={building} toast={toast} onClose={() => setBuilding(null)} />}

      <ToastContainer toasts={toasts} />
    </AdminLayout>
  );
}