import { useEffect, useState, useMemo } from "react";
import { adminGetBadges, adminCreateBadge, adminUpdateBadge, adminDeleteBadge } from "../../api/client";
import AdminLayout from "./AdminLayout";
import { useToast, ToastContainer } from "../../components/Toast";

const RARITY_OPTIONS = ["common", "rare", "epic", "legendary"];
const RARITY_STYLE = { common: "a-badge-common", rare: "a-badge-rare", epic: "a-badge-epic", legendary: "a-badge-legendary" };
const EMPTY_FORM = { name: "", icon: "", rarity: "common" };

export default function AdminBadges() {
  const { toasts, toast } = useToast();
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [search, setSearch]   = useState("");
  const [modal, setModal]     = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm]       = useState(EMPTY_FORM);
  const [saving, setSaving]   = useState(false);
  const [formErr, setFormErr] = useState("");
  const [confirmDel, setConfirmDel] = useState(null);

  const load = () => {
    setLoading(true);
    adminGetBadges()
      .then(setItems)
      .catch((err) => setError(err.data?.error || "Couldn't load badges."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => items.filter((b) => b.name.toLowerCase().includes(search.toLowerCase())), [items, search]);

  const openCreate = () => { setForm(EMPTY_FORM); setEditing(null); setFormErr(""); setModal("create"); };
  const openEdit = (item) => { setForm({ name: item.name, icon: item.icon || "", rarity: item.rarity }); setEditing(item); setFormErr(""); setModal("edit"); };
  const closeModal = () => setModal(null);

  const handleSave = async () => {
    if (!form.name) { setFormErr("Name is required."); return; }
    setSaving(true); setFormErr("");
    const body = { name: form.name, icon: form.icon, rarity: form.rarity };
    try {
      if (modal === "edit") { await adminUpdateBadge(editing.id, body); toast("Badge updated!"); }
      else                  { await adminCreateBadge(body);              toast("Badge created!"); }
      closeModal(); load();
    } catch (err) { setFormErr(err.data?.error || "Save failed."); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirmDel) return;
    try { await adminDeleteBadge(confirmDel.id); toast("Badge deleted."); setConfirmDel(null); load(); }
    catch (err) { toast(err.data?.error || "Delete failed.", "error"); setConfirmDel(null); }
  };

  return (
    <AdminLayout title="🏅 Badges">
      <div className="a-action-bar">
        <input className="a-search" placeholder="Search badges..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn btn-primary" onClick={openCreate} style={{ padding: "12px 22px", fontSize: "0.9rem" }}>+ New Badge</button>
      </div>

      {loading && <div className="a-loading"><span className="spinner spinner-dark" /><span>Loading...</span></div>}
      {error   && <div className="a-error">⚠️ {error}</div>}

      {!loading && !error && filtered.length === 0 && (
        <div className="a-empty"><div className="a-empty-icon">🏅</div><p>No badges yet.</p></div>
      )}

      <div className="badges-admin-grid">
        {!loading && !error && filtered.map((b) => (
          <div key={b.id} className="badge-admin-card">
            <div className="badge-admin-icon">{b.icon || "🏅"}</div>
            <h3>{b.name}</h3>
            <span className={`a-badge ${RARITY_STYLE[b.rarity] || "a-badge-common"}`}>{b.rarity}</span>
            <div className="badge-admin-actions">
              <button className="btn btn-secondary" style={{ padding: "7px 12px", fontSize: "0.8rem" }} onClick={() => openEdit(b)}>Edit</button>
              <button className="btn btn-danger"    style={{ padding: "7px 12px", fontSize: "0.8rem" }} onClick={() => setConfirmDel(b)}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <div className="a-modal-overlay" onClick={closeModal}>
          <div className="a-modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <h2>{modal === "edit" ? "Edit Badge" : "New Badge"}</h2>
            <div className="form-group"><label>Name *</label><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Badge name" /></div>
            <div className="form-group"><label>Icon (emoji)</label><input value={form.icon} onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))} placeholder="🏅" /></div>
            <div className="form-group">
              <label>Rarity</label>
              <select value={form.rarity} onChange={(e) => setForm((f) => ({ ...f, rarity: e.target.value }))}>
                {RARITY_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
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
            <h2>Delete Badge?</h2>
            <div className="a-confirm"><p>Permanently delete <strong>"{confirmDel.name}"</strong>?</p></div>
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
