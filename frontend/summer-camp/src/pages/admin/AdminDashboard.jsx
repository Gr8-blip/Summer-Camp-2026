import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAdminDashboard } from "../../api/client";
import AdminLayout from "./AdminLayout";
import "./AdminLayout.css";

const STAT_CONFIG = [
  { key: "total_students",      label: "Total Students",      emoji: "🧒", color: ""       },
  { key: "total_families",      label: "Total Families",      emoji: "👨‍👩‍👧", color: "green"  },
  { key: "total_missions",      label: "Total Missions",      emoji: "🎯", color: "purple" },
  { key: "total_lessons",       label: "Total Lessons",       emoji: "📖", color: "blue"   },
  { key: "total_assignments",   label: "Total Assignments",   emoji: "📝", color: "orange" },
  { key: "total_badges",        label: "Total Badges",        emoji: "🏅", color: "yellow" },
  { key: "total_challenges",    label: "Total Challenges",    emoji: "⚡", color: "pink"   },
  { key: "attendance_today",    label: "Attendance Today",    emoji: "📅", color: "green"  },
  { key: "pending_submissions", label: "Pending Submissions", emoji: "📬", color: "orange" },
  { key: "total_xp_awarded",   label: "Total XP Awarded",    emoji: "✨", color: "purple" },
];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState("");

  useEffect(() => {
    getAdminDashboard()
      .then(setStats)
      .catch((err) => setError(err.data?.error || "Couldn't load dashboard."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AdminLayout title="🏠 Dashboard">
      {loading && <div className="a-loading"><span className="spinner spinner-dark" /><span>Loading dashboard...</span></div>}
      {error   && <div className="a-error">⚠️ {error}</div>}

      {!loading && !error && stats && (
        <>
        <div className="a-grid">
          {STAT_CONFIG.map(({ key, label, emoji, color }) => (
            <div key={key} className={`a-stat-card ${color}`}>
              <div className="a-stat-label">{emoji} {label}</div>
              <div className="a-stat-value">{stats[key] ?? "—"}</div>
            </div>
          ))}
        </div>
        <div className="a-confirm" style={{ marginTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
          <div><strong>Build a Boss Battle</strong><p style={{ margin: "6px 0 0" }}>Create a playable challenge and add its questions.</p></div>
          <button className="btn btn-primary" onClick={() => navigate("/camp-admin/challenges")}>Create Play Challenge →</button>
        </div>
        </>
      )}
    </AdminLayout>
  );
}
