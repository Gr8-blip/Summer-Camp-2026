import { useNavigate } from "react-router-dom";
import { BOOTCAMP_START_DATE, getDaysUntil } from "../bootcampConfig";
import "./StudentDashboard.css";

function XPBar({ xp }) {
  const pct = Math.min((xp) * 100, 100);
  return (
    <div className="sd-xp-bar-wrap">
      <div className="sd-xp-bar-track"><div className="sd-xp-bar-fill" style={{ width: `${pct}%` }} /></div>
      <span className="sd-xp-bar-label">{xp} XP</span>
    </div>
  );
}

export default function StudentDashboard({ data }) {
  const navigate = useNavigate();
  const { student, missions, recent_badges, recent_xp, recent_attendance, recent_conversations } = data;
  const daysLeft = getDaysUntil(BOOTCAMP_START_DATE);
  return (
    <div className="student-dash">
      <div className="sd-hero">
        <div><h1 className="sd-welcome">👋 Welcome back, {student.name}!</h1><p className="sd-hero-sub">Keep building, keep learning 🚀</p></div>
        <div className="sd-level-chip">
          <span className="sd-level-num">Stat.</span>
          <XPBar xp={student.xp} />
          <span className="sd-total-xp">✨ {student.xp} XP total</span>
        </div>
      </div>
      {daysLeft > 0 && <div className="sd-card sd-countdown-card"><h3>⏳ Bootcamp Starts In</h3><p className="sd-countdown-number">{daysLeft} {daysLeft === 1 ? "Day" : "Days"}</p></div>}
      <div className="sd-quick-nav">
        {[["🎯 Missions","/missions"],["📝 Assignments","/assignments"],["⚡ Challenges","/challenges"],["📅 Attendance","/attendance"],["🏅 Badges","/badges"],["✨ XP History","/xp"]].map(([label,to]) => (
          <button key={to} className="sd-quick-btn" onClick={() => navigate(to)}>{label}</button>
        ))}
      </div>
      <div className="sd-grid">
        <div className="sd-card sd-card-wide">
          <div className="sd-card-top"><h3>🎯 Missions</h3><button className="sd-link" onClick={() => navigate("/missions")}>See all →</button></div>
          {missions?.length ? <ul className="sd-mission-list">{missions.slice(0,4).map((m) => (<li key={m.id} className="sd-mission-row" onClick={() => navigate(`/missions/${m.id}`)}><div><strong>Week {m.week}: {m.title}</strong><span className="sd-meta">{m.lesson_count} lesson{m.lesson_count!==1?"s":""}</span></div><span className="sd-xp-pill">+{m.xp_reward} XP</span></li>))}</ul> : <p className="sd-empty-inline">No missions yet!</p>}
        </div>
        <div className="sd-card">
          <div className="sd-card-top"><h3>🏅 Recent Badges</h3><button className="sd-link" onClick={() => navigate("/badges")}>See all →</button></div>
          {recent_badges?.length ? <ul className="sd-badge-list">{recent_badges.slice(0,4).map((sb,i) => (<li key={i} className="sd-badge-row"><span className="sd-badge-icon">{sb.badge.icon||"🏅"}</span><div><strong>{sb.badge.name}</strong><span className={`sd-rarity sd-rarity-${sb.badge.rarity}`}>{sb.badge.rarity}</span></div></li>))}</ul> : <p className="sd-empty-inline">No badges yet!</p>}
        </div>
        <div className="sd-card">
          <div className="sd-card-top"><h3>✨ Recent XP</h3><button className="sd-link" onClick={() => navigate("/xp")}>See all →</button></div>
          {recent_xp?.length ? <ul className="sd-xp-list">{recent_xp.slice(0,5).map((x,i) => (<li key={i} className="sd-xp-row"><span className="sd-xp-reason">{x.reason}</span><span className="sd-xp-amount">+{x.amount} XP</span></li>))}</ul> : <p className="sd-empty-inline">No XP earned yet.</p>}
        </div>
        <div className="sd-card">
          <div className="sd-card-top"><h3>📅 Attendance</h3><button className="sd-link" onClick={() => navigate("/attendance")}>See all →</button></div>
          {recent_attendance?.length ? <ul className="sd-attendance-list">{recent_attendance.slice(0,4).map((a,i) => (<li key={i} className="sd-attendance-row">✅ {a.lesson?.title||"Lesson"}</li>))}</ul> : <p className="sd-empty-inline">No attendance yet.</p>}
        </div>
        <div className="sd-card sd-card-wide">
          <div className="sd-card-top"><h3>🤖 Recent AI Conversations</h3></div>
          {recent_conversations?.length ? <ul className="sd-convo-list">{recent_conversations.slice(0,4).map((c) => (<li key={c.id} className="sd-convo-row"><span>💬 {c.title||"Untitled"}</span><span className="sd-meta">{new Date(c.updated_at).toLocaleDateString()}</span></li>))}</ul> : <p className="sd-empty-inline">No conversations yet.</p>}
        </div>
      </div>
    </div>
  );
}