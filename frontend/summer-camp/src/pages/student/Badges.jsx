import { useEffect, useState } from "react";
import { getBadgeGrid } from "../../api/client";
import StudentLayout from "./StudentLayout";
import "./student.css";
import "./Badges.css";

const RARITY = { common: "s-badge-common", rare: "s-badge-rare", epic: "s-badge-epic", legendary: "s-badge-legendary" };

function ProgressBar({ current, target, label }) {
  const pct = target ? Math.min((current / target) * 100, 100) : 0;
  return (
    <div className="bd-progress">
      <div className="bd-progress-track"><div className="bd-progress-fill" style={{ width: `${pct}%` }} /></div>
      <span className="bd-progress-label">{current} / {target} {label}</span>
    </div>
  );
}

export default function Badges() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => {
    getBadgeGrid()
      .then(setData)
      .catch((err) => setError(err.data?.error || "Couldn't load badges."))
      .finally(() => setLoading(false));
  }, []);

  const badges = data?.badges || [];
  const unlockedCount = data?.unlocked_count ?? 0;
  const totalCount = data?.total_count ?? 0;
  const collectionPct = totalCount ? Math.min((unlockedCount / totalCount) * 100, 100) : 0;

  return (
    <StudentLayout title="🏅 My Badges">
      {loading && <div className="s-loading"><span className="spinner spinner-dark" /><span>Loading...</span></div>}
      {error   && <div className="s-error">⚠️ {error}</div>}

      {!loading && !error && (
        <div className="bd-collection-card">
          <span className="bd-collection-label">{unlockedCount} / {totalCount} Badges</span>
          <div className="bd-progress-track bd-collection-track">
            <div className="bd-progress-fill" style={{ width: `${collectionPct}%` }} />
          </div>
        </div>
      )}

      {!loading && !error && badges.length === 0 && <div className="s-empty"><div className="s-empty-icon">🏅</div><p>No badges yet — keep going!</p></div>}

      <div className="s-badges-grid">
        {!loading && !error && badges.map((b) => (
          <div
            key={b.id}
            className={`s-card s-badge-card bd-badge-card ${RARITY[b.rarity] || "s-badge-common"} ${b.unlocked ? "bd-unlocked" : "bd-locked"}`}
          >
            <div className="s-badge-big-icon">{b.unlocked ? (b.icon || "🏅") : "🔒"}</div>
            <h3>{b.name}</h3>
            <span className={`s-badge ${RARITY[b.rarity] || "s-badge-common"}`}>{b.rarity}</span>

            {b.requirement && <p className="bd-requirement">{b.requirement}</p>}

            {b.unlocked ? (
              <span className="bd-earned-date">Earned {b.earned_at ? new Date(b.earned_at).toLocaleDateString() : ""}</span>
            ) : (
              b.progress && (
                <>
                  <ProgressBar current={b.progress.current} target={b.progress.target} label={b.progress.label} />
                  {b.progress.secondary && (
                    <ProgressBar
                      current={b.progress.secondary.current}
                      target={b.progress.secondary.target}
                      label={b.progress.secondary.label}
                    />
                  )}
                </>
              )
            )}
          </div>
        ))}
      </div>
    </StudentLayout>
  );
}