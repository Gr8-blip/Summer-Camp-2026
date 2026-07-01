import { useNavigate } from "react-router-dom";
import { BOOTCAMP_START_DATE, ANNOUNCEMENTS, getDaysUntil } from "../bootcampConfig";
import "./ParentDashboard.css";

export default function ParentDashboard({ family }) {
  const navigate = useNavigate();
  const daysLeft = getDaysUntil(BOOTCAMP_START_DATE);
  const isActive = family.status === "active";

  return (
    <div className="parent-dash">
      <h1 className="pd-welcome">
        Welcome, {family.parent?.first_name ? `Mr/Mrs ${family.parent.first_name}` : "there"} 👋
      </h1>

      <div className="pd-card pd-status-card">
        <div>
          <h3>{isActive ? "✅ Registration Complete" : "⏳ Registration Pending"}</h3>
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

      <div className="pd-card">
        <h3>🧒 Registered Students</h3>
        {family.students?.length ? (
          <ul className="pd-students-list">
            {family.students.map((s) => (
              <li key={s.id} className="pd-student-row">
                <span>• {s.full_name}</span>
                {isActive ? (
                  <span className="pd-login-chip">{s.login_code}</span>
                ) : (
                  <span className="pd-login-pending">Code pending payment</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="pd-muted">No students found.</p>
        )}
      </div>

      <div className="pd-card pd-countdown-card">
        <h3>⏳ Bootcamp Countdown</h3>
        <p className="pd-countdown-number">
          {daysLeft > 0 ? `${daysLeft} ${daysLeft === 1 ? "Day" : "Days"} Remaining` : "It's Here! 🎊"}
        </p>
      </div>

      <div className="pd-card">
        <h3>📢 Updates</h3>
        <ul className="pd-announcements">
          {ANNOUNCEMENTS.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
