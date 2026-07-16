import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getStudentDashboard } from "../api/client";
import ParentDashboard from "./ParentDashboard";
import StudentDashboard from "./StudentDashboard";
import "./Dashboard.css";

export default function Dashboard() {
  const navigate = useNavigate();
  const { logout, logoutStudent, parentEmail, isAuthenticated, isStudentAuthenticated } = useAuth();

  const [viewer, setViewer]     = useState(null);
  const [dashData, setDashData] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");

  useEffect(() => {
    if (isAuthenticated) {
      setViewer("parent");
      setLoading(false);
      return;
    }
    if (isStudentAuthenticated) {
      setViewer("student");
      getStudentDashboard()
        .then(setDashData)
        .catch((err) => setError(err.data?.error || "Couldn't load your dashboard."))
        .finally(() => setLoading(false));
      return;
    }
    navigate("/login");
  }, [isAuthenticated, isStudentAuthenticated, navigate]);

  const handleLogout = () => {
    if (viewer === "parent") logout();
    else logoutStudent();
    navigate("/");
  };

  const displayName = viewer === "parent"
    ? parentEmail
    : (dashData?.student?.name || JSON.parse(localStorage.getItem("student_info") || "{}")?.name || "Student");

  return (
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
}
