import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getStudentDashboard } from "../api/client";
import ParentDashboard from "./ParentDashboard";
import StudentDashboard from "./StudentDashboard";
import { ThemeProvider } from "../context/ThemeContext";
import { isWeekSixActive } from "../utils/week6";
import Week6Hub from "./student/Week6Hub";
import "./Dashboard.css";

export default function Dashboard() {
  const navigate = useNavigate();
  const { logout, logoutStudent, parentEmail, isAuthenticated, isStudentAuthenticated } = useAuth();

  const [viewer, setViewer]     = useState(null);
  const [dashData, setDashData] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [week6, setWeek6]       = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      setViewer("parent");
      setLoading(false);
      return;
    }
    if (isStudentAuthenticated) {
      setViewer("student");
      getStudentDashboard()
        .then((data) => {
          // Week 6 is a dedicated finale experience — students land straight
          // on the hub instead of the normal dashboard while it's active
          // (rendered in place here, not a redirect, so there's no flash of
          // the old dashboard first). Everything else — lessons, quests,
          // challenges, XP, badges — stays reachable by URL, it's just off
          // the main landing path for the week.
          if (isWeekSixActive(data?.missions)) {
            setWeek6(true);
            return;
          }
          setDashData(data);
        })
        .catch((err) => setError(err.data?.error || "Couldn't load your dashboard."))
        .finally(() => setLoading(false));
      return;
    }
    navigate("/login");
  }, [isAuthenticated, isStudentAuthenticated, navigate]);

  if (week6) return <Week6Hub />;

  const handleLogout = () => {
    if (viewer === "parent") logout();
    else logoutStudent();
    navigate("/");
  };

  const displayName = viewer === "parent"
    ? parentEmail
    : (dashData?.student?.name || JSON.parse(localStorage.getItem("student_info") || "{}")?.name || "Student");

  const shell = (
    <div className="page-shell dashboard-page">
      <nav className="dashboard-nav">
        <div className="container dashboard-nav-inner">
          <div className="nav-logo">🚀 Ravilletech</div>
          <div className="dashboard-nav-right">
            <span className="dashboard-user">👋 {displayName}</span>
            <button className="btn btn-secondary dashboard-logout" onClick={handleLogout}>Log Out</button>
          </div>
        </div>
      </nav>

      <div className="container dashboard-content fade-up">
        {loading && (
          <div className="dashboard-loading">
            <span className="spinner spinner-dark" />
            <p>Loading your bootcamp dashboard...</p>
          </div>
        )}

        {!loading && error && (
          <div className="dashboard-card dashboard-error-card">
            <div className="callback-emoji">🛠️</div>
            <h2>Couldn't load your dashboard</h2>
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && viewer === "parent" && <ParentDashboard />}
        {!loading && !error && viewer === "student" && dashData && <StudentDashboard data={dashData} />}
      </div>
    </div>
  );

  // Only the student viewer gets themed — parent viewer is untouched.
  return viewer === "student" ? <ThemeProvider>{shell}</ThemeProvider> : shell;
}