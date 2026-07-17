import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "./AdminLayout.css";

const NAV_ITEMS = [
  { to: "/camp-admin",             label: "🏠 Dashboard",   end: true },
  { to: "/camp-admin/missions",    label: "🎯 Missions"          },
  { to: "/camp-admin/lessons",     label: "📖 Lessons"           },
  { to: "/camp-admin/assignments", label: "📝 Assignments"        },
  { to: "/camp-admin/submissions", label: "📬 Submissions"        },
  { to: "/camp-admin/challenges",  label: "⚡ Challenges"         },
  { to: "/camp-admin/attendance",  label: "📅 Attendance"         },
  { to: "/camp-admin/badges",      label: "🏅 Badges"             },
  { to: "/camp-admin/xp",          label: "✨ XP"                 },
];

export default function AdminLayout({ children, title }) {
  const navigate = useNavigate();
  const { logoutAdmin, adminInfo } = useAuth();

  const handleLogout = () => { logoutAdmin(); navigate("/camp-admin/login"); };

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
