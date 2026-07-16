import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getParentDashboard, getParentStudents } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { BOOTCAMP_START_DATE, ANNOUNCEMENTS, getDaysUntil } from "../bootcampConfig";
import "./ParentDashboard.css";

function CopyableCode({ code }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button className={`pd-login-chip ${copied ? "pd-login-chip-copied" : ""}`} onClick={handleCopy} title="Click to copy student login code">
      {copied ? "✅ Copied!" : `🔑 ${code}`}
    </button>
  );
}

export default function ParentDashboard() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [family, setFamily]     = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");

  useEffect(() => {
    Promise.all([getParentDashboard(), getParentStudents()])
      .then(([dashData, studentsData]) => {
        setFamily(dashData);
        setStudents(studentsData.students || []);
      })
      .catch((err) => setError(err.data?.error || "Couldn't load dashboard data."))
      .finally(() => setLoading(false));
  }, []);

  const daysLeft = getDaysUntil(BOOTCAMP_START_DATE);
  const isActive = family?.status === "active";

  if (loading) return (
    <div className="dashboard-loading">
      <span className="spinner spinner-dark" />
      <p>Loading your dashboard...</p>
    </div>
  );

  if (error) return (
    <div className="dashboard-card dashboard-error-card">
      <div className="callback-emoji">🛠️</div>
      <h2>Couldn't load dashboard</h2>
      <p>{error}</p>
    </div>
  );

  return (
    <div className="parent-dash">
      <h1 className="pd-welcome">
        Welcome, {family?.parent?.first_name ? `${family.parent.first_name}` : "there"} 👋
      </h1>

      {/* Status card */}
      <div className="pd-card pd-status-card">
        <div>
          <h3>{isActive ? "✅ Registration Complete" : "⏳ Pending Payment"}</h3>
          <p className="pd-payment-label">
            Payment: <strong className={isActive ? "pd-paid" : "pd-unpaid"}>
              {isActive ? "Completed" : "Awaiting Payment"}
            </strong>
          </p>
        </div>
        {!isActive && (
          <button className="btn btn-primary pd-pay-btn" onClick={() => navigate(`/plan/${family.family_id}`)}>
            Finish Payment →
          </button>
        )}
      </div>

      {/* Students with real stats */}
      <div className="pd-card">
        <h3>🧒 Registered Students</h3>
        {students.length ? (
          <ul className="pd-students-list">
            {students.map((s) => (
              <li key={s.id} className="pd-student-row">
                <div className="pd-student-info">
                  <strong>• {s.name}</strong>
                  <div className="pd-student-stats">
                    <span>✨ {s.xp} XP</span>
                    <span>🏅 {s.badge_count} badge{s.badge_count !== 1 ? "s" : ""}</span>
                    <span>📅 {s.attendance}% attendance</span>
                  </div>
                </div>
                {isActive
                  ? <CopyableCode code={family.students?.find((fs) => fs.id === s.id)?.login_code || ""} />
                  : <span className="pd-login-pending">Code pending payment</span>
                }
              </li>
            ))}
          </ul>
        ) : (
          <p className="pd-muted">No students found.</p>
        )}
      </div>

      {/* Countdown */}
      <div className="pd-card pd-countdown-card">
        <h3>⏳ Bootcamp Countdown</h3>
        <p className="pd-countdown-number">
          {daysLeft > 0 ? `${daysLeft} ${daysLeft === 1 ? "Day" : "Days"} Remaining` : "It's Here! 🎊"}
        </p>
      </div>

      {/* Updates */}
      <div className="pd-card">
        <h3>📢 Updates</h3>
        <ul className="pd-announcements">
          {ANNOUNCEMENTS.map((a, i) => <li key={i}>{a}</li>)}
        </ul>
      </div>
    </div>
  );
}
