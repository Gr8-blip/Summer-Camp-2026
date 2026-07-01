import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getFamilyMe } from "../api/client";
import ParentDashboard from "./ParentDashboard";
import StudentDashboard from "./StudentDashboard";
import "./Dashboard.css";

export default function Dashboard() {
  const navigate = useNavigate();
  const { logout, parentEmail, isAuthenticated } = useAuth();

  const [viewer, setViewer] = useState(null); // "parent" | "student" | null (still deciding)
  const [family, setFamily] = useState(null);
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      // Parents carry a JWT from /parent-login/, so check that path first.
      if (isAuthenticated) {
        setViewer("parent");
        try {
          const data = await getFamilyMe();
          setFamily(data);
        } catch (err) {
          setError(err.data?.error || "Couldn't load your dashboard data.");
        } finally {
          setLoading(false);
        }
        return;
      }

      // Students get no JWT from /student-login/ — their info was stashed
      // in localStorage at login time, and that's all we render from since
      // there's no authenticated student endpoint yet.
      const stored = localStorage.getItem("student_info");
      if (stored) {
        setViewer("student");
        setStudent(JSON.parse(stored));
        setLoading(false);
        return;
      }

      // Neither — bounce to login.
      navigate("/login");
    })();
  }, [isAuthenticated, navigate]);

  const handleLogout = () => {
    if (viewer === "parent") {
      logout();
    } else {
      localStorage.removeItem("student_info");
    }
    navigate("/");
  };

  return (
    <div className="page-shell dashboard-page">
      <nav className="dashboard-nav">
        <div className="container dashboard-nav-inner">
          <div className="nav-logo">🚀 Ravilletech</div>
          <div className="dashboard-nav-right">
            <span className="dashboard-user">
              👋 {viewer === "parent" ? parentEmail : student?.name}
            </span>
            <button className="btn btn-secondary dashboard-logout" onClick={handleLogout}>
              Log Out
            </button>
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

        {!loading && !error && viewer === "parent" && family && (
          <ParentDashboard family={family} />
        )}

        {!loading && !error && viewer === "student" && student && (
          <StudentDashboard student={student} />
        )}
      </div>
    </div>
  );
}
