import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { loginParent } from "../api/client";
import { useAuth } from "../context/AuthContext";
import AuthNav from "../components/AuthNav";
import "./Login.css";

export default function ParentLogin() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await loginParent(email, password);
      login(data, email);
      navigate("/dashboard");
    } catch (err) {
      setError(err.data?.error || err.message || "Login failed. Check your details!");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-shell login-page">
      <AuthNav />
      <div className="blob login-blob-1" style={{ background: "var(--color-blue)" }} />
      <div className="blob login-blob-2" style={{ background: "var(--color-yellow)" }} />

      <div className="login-container fade-up">
        <div className="login-card">
          {/* Loud tab switcher so the student login path is impossible to miss */}
          <div className="login-tabs">
            <span className="login-tab active">👨‍👩‍👧 Parent</span>
            <Link to="/student-login" className="login-tab">🧒 Student</Link>
          </div>

          <div className="login-emoji">👨‍👩‍👧</div>
          <h2>Parent Login</h2>
          <p className="login-sub">Welcome back! Log in to manage your bootcamp dashboard.</p>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>

            {error && <div className="error-text login-error">⚠️ {error}</div>}

            <button className="btn btn-primary btn-block" disabled={loading}>
              {loading ? <span className="spinner" /> : "Log In →"}
            </button>
          </form>

          <p className="login-switch">
            New here? <Link to="/register">Register your family →</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
