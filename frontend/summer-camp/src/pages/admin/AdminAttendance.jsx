import { useEffect, useState, useMemo } from "react";
import {
  adminGetAttendance, adminGetSessions,
  adminCreateSession, adminUpdateSession, adminDeleteSession,
  adminGetLessons,
} from "../../api/client";
import AdminLayout from "./AdminLayout";
import { useToast, ToastContainer } from "../../components/Toast";

const PAGE_SIZE  = 10;
const EMPTY_FORM = { lesson: "", code: "", expires_at: "", xp_reward: "" };

export default function AdminAttendance() {
  const { toasts, toast } = useToast();
  const [tab, setTab]           = useState("records");
  const [records, setRecords]   = useState([]);
  const [sessions, setSessions] = useState([]);
  const [lessons, setLessons]   = useState([]);
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
    Promise.all([adminGetAttendance(), adminGetSessions(), adminGetLessons()])
      .then(([recs, sess, les]) => { setRecords(recs); setSessions(sess); setLessons(les); })
      .catch((err) => setError(err.data?.error || "Couldn't load attendance."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  // Helper: resolve lesson name from an attendance session.
  // The session may return lesson as an id (number) or a nested object.
  const lessonName = (lessonField) => {
    if (!lessonField) return "—";
    if (typeof lessonField === "object") return lessonField.title || "—";
    const found = lessons.find((l) => l.id === lessonField);
    return found ? found.title : `Lesson #${lessonField}`;
  };

  const filteredRecords  = useMemo(() => records.filter((r)  => (r.lesson?.title || "").toLowerCase().includes(search.toLowerCase())), [records, search]);
  const filteredSessions = useMemo(() => sessions.filter((s) => s.code.toLowerCase().includes(search.toLowerCase()) || lessonName(s.lesson).toLowerCase().includes(search.toLowerCase())), [sessions, search, lessons]);
  const activeList  = tab === "records" ? filteredRecords : filteredSessions;
  const totalPages  = Math.ceil(activeList.length / PAGE_SIZE);
  const paged       = activeList.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openCreate = () => { setForm(EMPTY_FORM); setEditing(null); setFormErr(""); setModal("create"); };
  const openEdit   = (item) => {
    setForm({
      lesson:     item.lesson?.id ?? item.lesson ?? "",
      code:       item.code,
      expires_at: item.expires_at?.slice(0, 16) || "",
      xp_reward:  item.xp_reward,
    });
    setEditing(item); setFormErr(""); setModal("edit");
  };
  const closeModal = () => setModal(null);

  const validate = () => {
    if (!form.code || !form.expires_at || !form.xp_reward) {
      setFormErr("Code, expiry and XP reward are required."); return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true); setFormErr("");
    const body = {
      lesson:     form.lesson || null,
      code:       form.code.toUpperCase(),
      expires_at: form.expires_at,
      xp_reward:  Number(form.xp_reward),
      is_active:  true,
    };
    try {
      if (modal === "edit") { await adminUpdateSession(editing.id, body); toast("Session updated!"); }
      else                  { await adminCreateSession(body);              toast("Session created!"); }
      closeModal(); load();
    } catch (err) { setFormErr(err.data?.error || "Save failed."); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirmDel) return;
    try { await adminDeleteSession(confirmDel.id); toast("Session deleted."); setConfirmDel(null); load(); }
    catch (err) { toast(err.data?.error || "Delete failed.", "error"); setConfirmDel(null); }
  };

  return (
    <AdminLayout title="📅 Attendance">

      {/* Tab switcher */}
      <div className="at-tabs">
        {[
          { key: "records",  label: "📋 Records"  },
          { key: "sessions", label: "🔑 Sessions" },
        ].map((t) => (
          <button
            key={t.key}
            className={`at-tab ${tab === t.key ? "active" : ""}`}
            onClick={() => { setTab(t.key); setPage(1); setSearch(""); }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Action bar */}
      <div className="a-action-bar">
        <input
          className="a-search"
          placeholder={tab === "records" ? "Search by lesson name…" : "Search by code or lesson…"}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        {tab === "sessions" && (
          <button className="btn btn-primary" onClick={openCreate} style={{ padding: "12px 22px", fontSize: "0.9rem" }}>
            + New Session
          </button>
        )}
      </div>

      {loading && <div className="a-loading"><span className="spinner spinner-dark" /><span>Loading…</span></div>}
      {error   && <div className="a-error">⚠️ {error}</div>}

      {!loading && !error && (
        <>
          <div className="a-table-wrap">

            {/* ── Records ── */}
            {tab === "records" && (
              <table className="a-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Lesson</th>
                    <th>Checked In</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.length === 0 && (
                    <tr><td colSpan={3} className="a-table-empty">No attendance records found.</td></tr>
                  )}
                  {paged.map((r, i) => (
                    <tr key={i}>
                      <td><strong>{r.student?.full_name || r.student || "—"}</strong></td>
                      {/* lesson can be nested object or just a title string */}
                      <td>{r.lesson?.title || r.lesson || "—"}</td>
                      <td className="a-td-muted">
                        {r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* ── Sessions ── */}
            {tab === "sessions" && (
              <table className="a-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Lesson</th>
                    <th>XP</th>
                    <th>Expires</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.length === 0 && (
                    <tr><td colSpan={6} className="a-table-empty">No sessions found.</td></tr>
                  )}
                  {paged.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <span className="at-code">{s.code}</span>
                      </td>
                      {/* ← Fixed: resolve lesson name properly */}
                      <td>{lessonName(s.lesson)}</td>
                      <td><span className="a-badge a-badge-green">+{s.xp_reward} XP</span></td>
                      <td className="a-td-muted">
                        {s.expires_at ? new Date(s.expires_at).toLocaleString() : "—"}
                      </td>
                      <td>
                        <span className={`a-badge ${s.is_active ? "a-badge-green" : "a-badge-orange"}`}>
                          {s.is_active ? "Active" : "Expired"}
                        </span>
                      </td>
                      <td>
                        <div className="a-row-actions">
                          <button className="a-btn-sm a-btn-edit"   onClick={() => openEdit(s)}>Edit</button>
                          <button className="a-btn-sm a-btn-delete" onClick={() => setConfirmDel(s)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
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

      {/* Create / Edit modal */}
      {modal && (
        <div className="a-modal-overlay" onClick={closeModal}>
          <div className="a-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{modal === "edit" ? "Edit Session" : "New Attendance Session"}</h2>

            <div className="form-group">
              <label>Lesson</label>
              <select value={form.lesson} onChange={(e) => setForm((f) => ({ ...f, lesson: e.target.value }))}>
                <option value="">— None —</option>
                {lessons.map((l) => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Code * <span className="a-label-hint">(auto-uppercased)</span></label>
              <input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="e.g. ABC123"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Expires At *</label>
                <input
                  type="datetime-local"
                  value={form.expires_at}
                  onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>XP Reward *</label>
                <input
                  type="number" min="0"
                  value={form.xp_reward}
                  onChange={(e) => setForm((f) => ({ ...f, xp_reward: e.target.value }))}
                  placeholder="50"
                />
              </div>
            </div>

            {formErr && <div className="error-text" style={{ marginBottom: 12 }}>⚠️ {formErr}</div>}

            <div className="a-modal-actions">
              <button className="btn btn-secondary" onClick={closeModal}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <span className="spinner" /> : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirmDel && (
        <div className="a-modal-overlay" onClick={() => setConfirmDel(null)}>
          <div className="a-modal a-modal-sm" onClick={(e) => e.stopPropagation()}>
            <h2>Delete Session?</h2>
            <p style={{ color: "var(--color-text-soft)", marginBottom: 20 }}>
              Permanently delete session <strong>{confirmDel.code}</strong>
              {lessonName(confirmDel.lesson) !== "—" && <> for <strong>{lessonName(confirmDel.lesson)}</strong></>}? This can't be undone.
            </p>
            <div className="a-modal-actions">
              <button className="btn btn-secondary" onClick={() => setConfirmDel(null)}>Cancel</button>
              <button className="btn btn-danger"    onClick={handleDelete}>Yes, Delete</button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} />
    </AdminLayout>
  );
}
