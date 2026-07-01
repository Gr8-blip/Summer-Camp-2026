import { Link } from "react-router-dom";
import "./AuthNav.css";

export default function AuthNav() {
  return (
    <Link to="/" className="auth-nav-logo">
      🚀 Ravilletech
    </Link>
  );
}
