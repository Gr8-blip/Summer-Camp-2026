import { useEffect, useMemo, useState } from "react";
import AdminLayout from "./AdminLayout";
import {
  adminGetAwards,
  adminAssignAward,
  adminRevokeAward,
  adminGetAwardTypes,
  adminGetStudents,
} from "../../api/client";
import "./AdminAwards.css";

export default function AdminAwards() {
  const [awards, setAwards] = useState([]);
  const [awardTypes, setAwardTypes] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedStudent, setSelectedStudent] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [assigning, setAssigning] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [awardsRes, typesRes, studentsRes] = await Promise.all([
        adminGetAwards(),
        adminGetAwardTypes(),
        adminGetStudents(),
      ]);
      setAwards(Array.isArray(awardsRes) ? awardsRes : awardsRes?.results || []);
      setAwardTypes(Array.isArray(typesRes) ? typesRes : []);
      setStudents(Array.isArray(studentsRes) ? studentsRes : studentsRes?.results || []);
    } catch (e) {
      setError(e?.message || "Couldn't load awards.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAssign = async (e) => {
    e.preventDefault();
    if (!selectedStudent || !selectedType) return;
    setAssigning(true);
    setError("");
    try {
      const created = await adminAssignAward({ student: Number(selectedStudent), award_type: selectedType });
      setAwards((prev) => [created, ...prev]);
      setSelectedType("");
    } catch (e) {
      setError(e?.message || "Couldn't assign that award — maybe they already have it.");
    } finally {
      setAssigning(false);
    }
  };

  const handleRevoke = async (id) => {
    if (!window.confirm("Revoke this award?")) return;
    try {
      await adminRevokeAward(id);
      setAwards((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      setError(e?.message || "Couldn't revoke that award.");
    }
  };

  const grouped = useMemo(() => {
    const byStudent = {};
    for (const a of awards) {
      const key = a.student_name || `Student #${a.student}`;
      byStudent[key] = byStudent[key] || [];
      byStudent[key].push(a);
    }
    return byStudent;
  }, [awards]);

  return (
    <AdminLayout title="🏆 Awards">
      <div className="aw-panel">
        <h2 className="aw-panel-title">Assign an Award</h2>
        <form className="aw-assign-form" onSubmit={handleAssign}>
          <select value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)} required>
            <option value="">Select student…</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.full_name || s.name}</option>
            ))}
          </select>

          <select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} required>
            <option value="">Select award…</option>
            {awardTypes.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>

          <button type="submit" disabled={assigning}>
            {assigning ? "Assigning…" : "Assign Award"}
          </button>
        </form>
        {error && <p className="aw-error">{error}</p>}
      </div>

      <div className="aw-panel">
        <h2 className="aw-panel-title">Assigned Awards</h2>
        {loading ? (
          <p className="aw-muted">Loading…</p>
        ) : awards.length === 0 ? (
          <p className="aw-muted">No awards assigned yet.</p>
        ) : (
          Object.entries(grouped).map(([name, list]) => (
            <div className="aw-student-block" key={name}>
              <h3 className="aw-student-name">{name}</h3>
              <div className="aw-award-chips">
                {list.map((a) => (
                  <span className={`aw-chip ${a.claimed ? "aw-chip-claimed" : ""}`} key={a.id}>
                    {a.award_label} {a.claimed ? "✓" : "· unclaimed"}
                    <button className="aw-chip-remove" onClick={() => handleRevoke(a.id)} title="Revoke">✕</button>
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </AdminLayout>
  );
}