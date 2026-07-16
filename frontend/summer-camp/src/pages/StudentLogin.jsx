import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { loginStudent } from "../api/client";
import { useAuth } from "../context/AuthContext";
import AuthNav from "../components/AuthNav";
import "./Login.css";

export default function StudentLogin() {
  const navigate = useNavigate();
  const { loginStudentSession } = useAuth();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const data = await loginStudent(code.trim().toUpperCase());
      loginStudentSession({ access: data.access, refresh: data.refresh }, data.student);
      navigate("/dashboard");
    } catch (err) {
      setError(err.data?.error || err.message || "That code didn't work!");
    } finally { setLoading(false); }
  };

  return (
    <div className="page-shell login-page">
      <AuthNav />
      <div className="blob login-blob-1" style={{ background: "var(--color-pink)" }} />
      <div className="blob login-blob-2" style={{ background: "var(--color-green)" }} />
      <div className="login-container fade-up">
        <div className="login-card">
          <div className="login-tabs">
            <Link to="/login" className="login-tab">👨‍👩‍👧 Parent</Link>
            <span className="login-tab active">🧒 Student</span>
          </div>
          <div className="login-emoji">🧒</div>
          <h2>Student Login</h2>
          <p className="login-sub">Enter your special AI Creator code to jump in!</p>
          <form onSubmit={handleSubmit}>
            <div className="form-group"><label>Login Code</label><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="AI-XXXXXX" className="code-input" required /></div>
            {error && <div className="error-text login-error">⚠️ {error}</div>}
            <button className="btn btn-primary btn-block" disabled={loading}>{loading ? <span className="spinner" /> : "Let's Go! 🚀"}</button>
          </form>
        </div>
      </div>
    </div>
  );
}