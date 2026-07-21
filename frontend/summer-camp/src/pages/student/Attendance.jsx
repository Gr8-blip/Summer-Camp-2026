import { useEffect, useState } from "react";
import { getAttendance, checkInAttendance } from "../../api/client";
import StudentLayout from "./StudentLayout";
import MissionCompleteCelebration from "../../components/MissionCompleteCelebration"; 
import "./student.css";

function CheckInModal({ onClose, onSuccess }) {
  const [code, setCode]       = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!code.trim()) { setError("Enter a code first!"); return; }
    setLoading(true); setError("");
    try {
      const res = await checkInAttendance(code.trim().toUpperCase());
      onSuccess(res); // pass the full response up (xp_gained, new_badges, mission_complete)
    }
    catch (err) { setError(err.data?.error || "Check-in failed. Double-check the code!"); }
    finally { setLoading(false); }
  };

  return (
    <div className="s-modal-overlay" onClick={onClose}>
      <div className="s-modal" onClick={(e) => e.stopPropagation()}>
        <h2>📅 Attendance Check-In</h2>
        <p>Enter today's attendance code from your instructor.</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group"><label>Attendance Code</label><input className="code-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. ABC123" required /></div>
          {error && <div className="error-text" style={{ marginBottom: 12 }}>⚠️ {error}</div>}
          <div className="s-modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? <span className="spinner" /> : "Check In ✅"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Attendance() {
  const [records, setRecords]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [showModal, setShowModal]     = useState(false);
  const [success, setSuccess]         = useState(false);
  const [celebration, setCelebration] = useState(null); // { mission_title, xp_awarded, badges }

  const load = () => {
    setLoading(true);
    getAttendance()
      .then(setRecords)
      .catch((err) => setError(err.data?.error || "Couldn't load attendance."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const handleSuccess = (res) => {
    setShowModal(false); setSuccess(true); load();
    setTimeout(() => setSuccess(false), 3000);

    if (res?.mission_complete) {
      // Delay slightly so the "Attendance recorded!" toast isn't fighting
      // the celebration modal for attention on the same frame.
      setTimeout(() => {
        setCelebration({ ...res.mission_complete, badges: res.new_badges || [] });
      }, 400);
    }
  };

  return (
    <StudentLayout title="📅 Attendance">
      <div className="s-attendance-header">
        <p className="s-attendance-count">{records.length} session{records.length !== 1 ? "s" : ""} attended</p>
        <button className="btn btn-primary s-checkin-btn" onClick={() => setShowModal(true)}>+ Check In Today</button>
      </div>
      {success && <div className="s-checkin-success">✅ Attendance recorded!</div>}
      {loading && <div className="s-loading"><span className="spinner spinner-dark" /><span>Loading...</span></div>}
      {error   && <div className="s-error">⚠️ {error}</div>}
      {!loading && !error && records.length === 0 && <div className="s-empty"><div className="s-empty-icon">📅</div><p>No attendance yet. Check in to your first class!</p></div>}
      {!loading && !error && records.map((r, i) => (
        <div key={i} className="s-card s-attendance-row">✅ {r.lesson?.title || "Class session"}</div>
      ))}
      {showModal && <CheckInModal onClose={() => setShowModal(false)} onSuccess={handleSuccess} />}

      {celebration && (
        <MissionCompleteCelebration
          missionTitle={celebration.mission_title}
          xpAwarded={celebration.xp_awarded}
          newBadges={celebration.badges}
          onDone={() => setCelebration(null)}
        />
      )}
    </StudentLayout>
  );
}