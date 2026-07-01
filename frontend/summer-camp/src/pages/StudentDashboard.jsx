import { BOOTCAMP_START_DATE, ANNOUNCEMENTS, getDaysUntil } from "../bootcampConfig";
import "./StudentDashboard.css";

export default function StudentDashboard({ student }) {
  const daysLeft = getDaysUntil(BOOTCAMP_START_DATE);

  return (
    <div className="student-dash">
      <h1 className="sd-welcome">👋 Welcome, {student.name}!</h1>

      <div className="sd-card sd-confirm-card">
        <div className="sd-card-icon">🎉</div>
        <div>
          <h3>Registration Confirmed</h3>
          <p>You're officially enrolled in the RavilleTech Summer AI Bootcamp 2026.</p>
        </div>
      </div>

      <div className="sd-card sd-countdown-card">
        <h3>⏳ Bootcamp Starts In</h3>
        <p className="sd-countdown-number">
          {daysLeft > 0 ? `${daysLeft} ${daysLeft === 1 ? "Day" : "Days"}` : "It's Here! 🎊"}
        </p>
      </div>

      <div className="sd-card">
        <h3>📢 Announcements</h3>
        <ul className="sd-announcements">
          {ANNOUNCEMENTS.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      </div>

      <div className="sd-card sd-project-card">
        <h3>🚀 My AI Project</h3>
        <div className="sd-project-locked">
          <span className="sd-lock-icon">🔒</span>
          <span>Unlocks when project week begins.</span>
        </div>
      </div>
    </div>
  );
}
