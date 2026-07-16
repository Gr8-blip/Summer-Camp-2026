import { useEffect, useState } from "react";
import { getBadges } from "../../api/client";
import StudentLayout from "./StudentLayout";
import "./student.css";

const RARITY = { common: "s-badge-common", rare: "s-badge-rare", epic: "s-badge-epic", legendary: "s-badge-legendary" };

export default function Badges() {
  const [badges, setBadges]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => {
    getBadges()
      .then(setBadges)
      .catch((err) => setError(err.data?.error || "Couldn't load badges."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <StudentLayout title="🏅 My Badges">
      {loading && <div className="s-loading"><span className="spinner spinner-dark" /><span>Loading...</span></div>}
      {error   && <div className="s-error">⚠️ {error}</div>}
      {!loading && !error && badges.length === 0 && <div className="s-empty"><div className="s-empty-icon">🏅</div><p>No badges earned yet — keep going!</p></div>}
      <div className="s-badges-grid">
        {!loading && !error && badges.map((sb, i) => (
          <div key={i} className="s-card s-badge-card">
            <div className="s-badge-big-icon">{sb.badge.icon || "🏅"}</div>
            <h3>{sb.badge.name}</h3>
            <span className={`s-badge ${RARITY[sb.badge.rarity] || "s-badge-common"}`}>{sb.badge.rarity}</span>
            <span className="s-meta-text">Earned {new Date(sb.earned_at).toLocaleDateString()}</span>
          </div>
        ))}
      </div>
    </StudentLayout>
  );
}