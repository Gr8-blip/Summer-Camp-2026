import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getProfile } from "../../api/client";
import StudentLayout from "./StudentLayout";
import Avatar from "../../components/Avatar";
import "./student.css";
import "./profile.css";

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    getProfile()
      .then(setProfile)
      .catch(() => setError("Couldn't load your profile."));
  }, []);

  if (error) {
    return (
      <StudentLayout title="👤 Profile">
        <div className="s-error">{error}</div>
      </StudentLayout>
    );
  }

  if (!profile) {
    return (
      <StudentLayout title="👤 Profile">
        <div className="s-loading"><span className="spinner spinner-dark" /><span>Loading your profile...</span></div>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout title="👤 Profile">
      <div className="prof-wrapper">
        <div className="s-card prof-hero">
          <div className="prof-avatar-ring">
            <Avatar avatarKey={profile.avatar?.key} size={64} />
          </div>
          <h2 className="prof-name">{profile.username}</h2>
          <p className="prof-tagline">
            {profile.avatar ? profile.avatar.name : "No avatar equipped yet"}
          </p>

          <div className="prof-stats-row">
            <div className="prof-stat">
              <strong>{profile.xp}</strong>
              <small>XP</small>
            </div>
            <div className="prof-stat">
              <strong>🪙 {profile.coins}</strong>
              <small>Coins</small>
            </div>
            <div className="prof-stat">
              <strong>{profile.badges.length}</strong>
              <small>Badges</small>
            </div>
          </div>

          <div className="prof-equip-row">
            <span className="prof-equip-pill">🎨 Theme: {profile.theme.replace("_", " ")}</span>
            {profile.victory_effect && (
              <span className="prof-equip-pill">{profile.victory_effect.name}</span>
            )}
          </div>

          <button className="btn btn-primary" onClick={() => navigate("/marketplace")}>
            🛒 Visit Marketplace
          </button>
        </div>

        <div className="s-card prof-badges-card">
          <h3 className="lb-title" style={{ fontSize: "1.05rem" }}>Achievements</h3>
          {profile.badges.length === 0 ? (
            <div className="s-empty">
              <div className="s-empty-icon">🏅</div>
              <p>No badges yet — go earn some!</p>
            </div>
          ) : (
            <div className="prof-badge-grid">
              {profile.badges.map((b) => (
                <div key={b.name} className={`prof-badge prof-badge-${b.rarity}`}>
                  <span className="prof-badge-icon">{b.icon}</span>
                  <span className="prof-badge-name">{b.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </StudentLayout>
  );
}