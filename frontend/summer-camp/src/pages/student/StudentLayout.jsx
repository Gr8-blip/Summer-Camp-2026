import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "./StudentLayout.css";

const NAV_ITEMS = [
  { to: "/dashboard",   label: "🏠 Dashboard"   },
  { to: "/missions",    label: "🎯 Missions"     },
  { to: "/assignments", label: "📝 Assignments"  },
  { to: "/submissions", label: "📬 Submissions"  },
  { to: "/challenges",  label: "⚡ Challenges"   },
  { to: "/attendance",  label: "📅 Attendance"   },
  { to: "/badges",      label: "🏅 Badges"       },
  { to: "/xp",          label: "✨ XP History"   },
];

export default function StudentLayout({ children, title }) {
  const navigate = useNavigate();
  const { logoutStudent } = useAuth();
  const handleLogout = () => { logoutStudent(); navigate("/"); };
  return (
    <div className="sl-shell">
      <aside className="sl-sidebar">
        <div className="sl-logo">🚀 Ravilletech</div>
        <nav className="sl-nav">
          {NAV_ITEMS.map((item) => (
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