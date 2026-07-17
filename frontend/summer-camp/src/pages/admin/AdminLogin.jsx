import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginAdmin } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import "./AdminLogin.css";

export default function AdminLogin() {
  const navigate = useNavigate();
  const { loginAdminSession } = useAuth();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const data = await loginAdmin(email, password);
      loginAdminSession({ access: data.access, refresh: data.refresh }, data.admin);
      navigate("/camp-admin");
    } catch (err) {
      setError(err.data?.error || err.message || "Login failed.");
    } finally { setLoading(false); }
  };

  return (
    <div className="admin-login-page">
      <div className="admin-login-card fade-up">
        <div className="admin-login-logo">🚀 Ravilletech</div>
        <div className="admin-login-badge">Admin Portal</div>

        <h2>Welcome back</h2>
        <p className="admin-login-sub">Sign in to access the admin dashboard.</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email Address</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@ravilletech.com" />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>

          {error && <div className="error-text admin-login-error">⚠️ {error}</div>}

          <button className="btn btn-primary btn-block" disabled={loading}>
            {loading ? <span className="spinner" /> : "Sign In →"}
          </button>
        </form>
      </div>
    </div>
  );
}
