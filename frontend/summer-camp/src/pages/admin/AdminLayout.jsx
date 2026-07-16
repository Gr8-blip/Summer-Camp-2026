import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "./AdminLayout.css";

const NAV_ITEMS = [
  { to: "/admin",             label: "🏠 Dashboard",   end: true },
  { to: "/admin/missions",    label: "🎯 Missions"          },
  { to: "/admin/lessons",     label: "📖 Lessons"           },
  { to: "/admin/assignments", label: "📝 Assignments"        },
  { to: "/admin/submissions", label: "📬 Submissions"        },
  { to: "/admin/challenges",  label: "⚡ Challenges"         },
  { to: "/admin/attendance",  label: "📅 Attendance"         },
  { to: "/admin/badges",      label: "🏅 Badges"             },
  { to: "/admin/xp",          label: "✨ XP"                 },
];

export default function AdminLayout({ children, title }) {
  const navigate = useNavigate();
  const { logoutAdmin, adminInfo } = useAuth();

  const handleLogout = () => { logoutAdmin(); navigate("/admin/login"); };

  return (
    <div className="al-shell">
      <aside className="al-sidebar">
        <div className="al-brand">
          <div className="al-logo">🚀 Ravilletech</div>
          <div className="al-badge">Admin</div>
        </div>
        <nav className="al-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `al-nav-item ${isActive ? "active" : ""}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="al-footer">
          <p className="al-user">{adminInfo?.email || "Admin"}</p>
          <button className="al-logout" onClick={handleLogout}>← Log Out</button>
        </div>
      </aside>

      <main className="al-main">
        {title && <h1 className="al-page-title">{title}</h1>}
        {children}
      </main>
    </div>
  );
}
