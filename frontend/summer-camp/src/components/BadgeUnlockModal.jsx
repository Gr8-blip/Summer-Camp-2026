import { useEffect, useState } from "react";
import "./BadgeUnlockModal.css";

const RARITY_XP = { common: 20, rare: 50, epic: 100, legendary: 250 };
const RARITY_CLASS = { common: "bum-common", rare: "bum-rare", epic: "bum-epic", legendary: "bum-legendary" };

/**
 * Renders a celebratory modal for one badge at a time out of a queue.
 * Usage:
 *   const [badgeQueue, setBadgeQueue] = useState([]);
 *   // whenever an API call returns { new_badges: [...] }:
 *   if (res.new_badges?.length) setBadgeQueue((q) => [...q, ...res.new_badges]);
 *   ...
 *   <BadgeUnlockModal queue={badgeQueue} onAdvance={() => setBadgeQueue((q) => q.slice(1))} />
 */
export default function BadgeUnlockModal({ queue, onAdvance }) {
  const badge = queue?.[0];
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (badge) {
      setVisible(false);
      const t = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(t);
    }
  }, [badge]);

  if (!badge) return null;

  const rarityClass = RARITY_CLASS[badge.rarity] || "bum-common";
  const xp = RARITY_XP[badge.rarity] ?? 0;

  const dismiss = () => {
    setVisible(false);
    setTimeout(onAdvance, 180);
  };

  return (
    <div className={`bum-overlay ${visible ? "bum-in" : ""}`} onClick={dismiss}>
      <div className={`bum-modal ${rarityClass}`} onClick={(e) => e.stopPropagation()}>
        <div className="bum-particles">
          {Array.from({ length: 16 }).map((_, i) => (
            <span key={i} className="bum-particle" style={{ "--i": i }} />
          ))}
        </div>

        <div className="bum-glow" />
        <div className="bum-icon">{badge.icon || "🏅"}</div>
        <p className="bum-eyebrow">Badge Unlocked!</p>
        <h2 className="bum-name">{badge.name}</h2>
        <span className={`bum-rarity-pill ${rarityClass}`}>{badge.rarity}</span>
        <p className="bum-xp">+{xp} Badge XP</p>

        <button className="btn btn-primary bum-dismiss" onClick={dismiss}>
          {queue.length > 1 ? "Next →" : "Nice!"}
        </button>
      </div>
    </div>
  );
}