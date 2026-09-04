import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { replayMissedNotifications } from "../../api/replayNotifications";
import { getStudentDashboard } from "../../api/client";
import { isWeekSixActive } from "../../utils/week6"; // gates the finale hub — now the Graduation Day page
import "./StudentLayout.css";

const NAV_ITEMS = [
  { to: "/dashboard",    label: "🏠 Dashboard"   },
  { to: "/missions",     label: "🎯 Missions"     },
  { to: "/assignments",  label: "🗺️ Quests"       },
  { to: "/challenges",   label: "⚡ Challenges"   },
  { to: "/attendance",   label: "📅 Attendance"   },
  { to: "/badges",       label: "🏅 Badges"       },
  { to: "/xp",           label: "✨ XP History"   },
  { to: "/marketplace",  label: "🛒 Marketplace"  },
  { to: "/profile",      label: "👤 Profile"      },
];

// During Week 6 the normal nav is hidden in favor of the Graduation Day
// page — but students still need a way back to their profile and, if they
// wandered onto a direct lesson/quest/challenge link, back to graduation
// itself. This list intentionally does NOT remove any route, just what's
// shown here.
const WEEK_SIX_NAV_ITEMS = [
  { to: "/graduation", label: "🎓 Graduation" },
  { to: "/profile", label: "👤 Profile" },
];

export default function StudentLayout({ children, title }) {
  const navigate = useNavigate();
  const { logoutStudent } = useAuth();
  const handleLogout = () => { logoutStudent(); navigate("/"); };

  const [week6Active, setWeek6Active] = useState(false);

  useEffect(() => {
    replayMissedNotifications().catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    getStudentDashboard()
      .then((data) => {
        if (!cancelled) setWeek6Active(isWeekSixActive(data?.missions));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const navItems = week6Active ? WEEK_SIX_NAV_ITEMS : NAV_ITEMS;

  return (
    <div className="sl-shell">
      <aside className="sl-sidebar">
        <div className="sl-logo">🚀 Ravilletech</div>
        <nav className="sl-nav">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `sl-nav-item ${isActive ? "active" : ""}`}>{item.label}</NavLink>
          ))}
        </nav>
        <button className="sl-logout" onClick={handleLogout}>← Log Out</button>
      </aside>
      <main className="sl-main">
        {title && <h1 className="sl-page-title">{title}</h1>}
        {children}
      </main>
    </div>
  );
}