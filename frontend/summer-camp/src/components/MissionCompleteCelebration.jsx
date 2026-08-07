import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, ArrowRight, Swords } from "lucide-react";

// ── Palette (mission-complete is the biggest moment in the app, so it gets
// its own accent trio layered on top of the existing --color-primary purple)
const GOLD = "#f5b942";
const GOLD_SOFT = "#ffe6a8";
const INK = "#150f2e";

const CONFETTI_COLORS = ["#7c5cfc", "#14b8a6", GOLD, "#ec4899", "#3b82f6"];

// ── Confetti: a single burst from the medallion, not a rain shower.
// Pieces launch outward on a spread of angles/velocities, then tumble down.
function ConfettiBurst() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 46 }, (_, i) => {
        const angle = (Math.PI * 2 * i) / 46 + Math.random() * 0.4;
        const distance = 120 + Math.random() * 220;
        return {
          id: i,
          tx: Math.cos(angle) * distance,
          ty: Math.sin(angle) * distance - 40,
          rotate: Math.random() * 720 - 360,
          delay: Math.random() * 0.15,
          duration: 1.1 + Math.random() * 0.7,
          size: 6 + Math.random() * 6,
          color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          shape: i % 3 === 0 ? "50%" : "2px",
        };
      }),
    []
  );

  return (
    <div style={styles.confettiField} aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="mc-confetti-piece"
          style={{
            "--tx": `${p.tx}px`,
            "--ty": `${p.ty}px`,
            "--rot": `${p.rotate}deg`,
            width: p.size,
            height: p.size * 1.6,
            background: p.color,
            borderRadius: p.shape,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </div>
  );
}

export default function MissionCompleteCelebration({
  missionTitle,
  xpAwarded,
  newBadges = [],
  nextChallengeId,
  nextChallengeTitle,
  onDone,
}) {
  const [stage, setStage] = useState("enter"); // enter -> settled

  useEffect(() => {
    const t = setTimeout(() => setStage("settled"), 700);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={styles.overlay} role="dialog" aria-modal="true" aria-label="Mission complete">
      <style>{KEYFRAMES}</style>
      <ConfettiBurst />

      <div style={styles.card} className="mc-card">
        {/* Signature: a medallion that punches in with a shockwave ring,
            standing in for the trophy — the one bold element in the piece. */}
        <div style={styles.medallionWrap}>
          <span style={styles.shockwave} className="mc-shockwave" />
          <div style={styles.medallion} className="mc-medallion">
            <Sparkles size={30} color={INK} strokeWidth={2.4} />
          </div>
        </div>

        <p style={styles.eyebrow}>Mission complete</p>
        <h1 style={styles.title}>{missionTitle}</h1>

        <div style={styles.xpPill} className="mc-xp-pill">
          <span style={styles.xpValue}>+{xpAwarded}</span>
          <span style={styles.xpLabel}>XP earned</span>
        </div>

        {newBadges.length > 0 && (
          <div style={styles.badgeSection}>
            <p style={styles.badgeHeading}>
              {newBadges.length === 1 ? "Badge unlocked" : `${newBadges.length} badges unlocked`}
            </p>
            <div style={styles.badgeRow}>
              {newBadges.map((b, i) => (
                <div
                  key={i}
                  className="mc-badge-pop"
                  style={{ ...styles.badgeItem, animationDelay: `${0.55 + i * 0.12}s` }}
                >
                  <div style={styles.badgeIconRing}>
                    <span style={styles.badgeIcon}>{b.icon}</span>
                  </div>
                  <div style={styles.badgeName}>{b.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={styles.actions}>
          {nextChallengeId && (
            <Link
              to={`/challenges/${nextChallengeId}`}
              style={styles.quickLink}
              className="mc-quick-link"
            >
              <Swords size={16} strokeWidth={2.4} />
              <span>
                Jump into {nextChallengeTitle ? `“${nextChallengeTitle}”` : "the next challenge"}
              </span>
              <ArrowRight size={16} strokeWidth={2.4} />
            </Link>
          )}

          <button
            type="button"
            className="btn btn-primary"
            style={styles.continueBtn}
            onClick={onDone}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

const KEYFRAMES = `
@keyframes mcCardIn {
  0% { opacity: 0; transform: scale(.82) translateY(24px); }
  60% { opacity: 1; transform: scale(1.03) translateY(-4px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes mcMedallionIn {
  0% { transform: scale(0) rotate(-35deg); opacity: 0; }
  55% { transform: scale(1.18) rotate(8deg); opacity: 1; }
  100% { transform: scale(1) rotate(0deg); opacity: 1; }
}
@keyframes mcShockwave {
  0% { transform: scale(.3); opacity: .9; }
  100% { transform: scale(2.6); opacity: 0; }
}
@keyframes mcConfetti {
  0% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
  75% { opacity: 1; }
  100% { transform: translate(var(--tx), calc(var(--ty) + 260px)) rotate(var(--rot)); opacity: 0; }
}
@keyframes mcBadgePop {
  0% { transform: scale(.4) translateY(10px); opacity: 0; }
  70% { transform: scale(1.08) translateY(0); opacity: 1; }
  100% { transform: scale(1) translateY(0); opacity: 1; }
}
@keyframes mcPillGlow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(245,185,66,.45); }
  50% { box-shadow: 0 0 0 10px rgba(245,185,66,0); }
}
.mc-card { animation: mcCardIn .55s cubic-bezier(.2,.9,.25,1.1) both; }
.mc-medallion { animation: mcMedallionIn .6s cubic-bezier(.2,.9,.25,1.2) both; }
.mc-shockwave { animation: mcShockwave .8s ease-out .05s both; }
.mc-confetti-piece { position: absolute; top: 50%; left: 50%; animation-name: mcConfetti; animation-timing-function: cubic-bezier(.15,.7,.4,1); animation-fill-mode: forwards; }
.mc-badge-pop { animation: mcBadgePop .5s cubic-bezier(.2,.9,.25,1.1) both; }
.mc-xp-pill { animation: mcPillGlow 2.2s ease-in-out .6s infinite; }
.mc-quick-link { transition: transform .15s ease, box-shadow .15s ease; }
.mc-quick-link:hover { transform: translateY(-1px); box-shadow: 0 10px 24px -10px rgba(124,92,252,.55); }
.mc-quick-link:focus-visible, .mc-card button:focus-visible { outline: 3px solid ${GOLD}; outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  .mc-card, .mc-medallion, .mc-shockwave, .mc-badge-pop, .mc-confetti-piece { animation: none !important; }
  .mc-xp-pill { animation: none !important; }
}
`;

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 499,
    background: `radial-gradient(circle at 50% 35%, rgba(124,92,252,.35), rgba(15,10,32,.82) 65%)`,
    backdropFilter: "blur(2px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  confettiField: {
    position: "fixed",
    inset: 0,
    pointerEvents: "none",
    zIndex: 500,
    overflow: "hidden",
  },
  card: {
    position: "relative",
    zIndex: 501,
    background: "#fff",
    borderRadius: 28,
    padding: "40px 32px 32px",
    maxWidth: 430,
    width: "100%",
    textAlign: "center",
    boxShadow: "0 40px 80px -24px rgba(21,15,46,.55)",
    border: "1px solid rgba(124,92,252,.12)",
  },
  medallionWrap: {
    position: "relative",
    width: 76,
    height: 76,
    margin: "0 auto 18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  shockwave: {
    position: "absolute",
    inset: 0,
    borderRadius: "50%",
    border: `2px solid ${GOLD}`,
  },
  medallion: {
    position: "relative",
    width: 68,
    height: 68,
    borderRadius: "50%",
    background: `linear-gradient(150deg, ${GOLD_SOFT}, ${GOLD})`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 10px 22px -6px rgba(245,185,66,.65)",
  },
  eyebrow: {
    fontSize: ".72rem",
    fontWeight: 800,
    letterSpacing: ".14em",
    textTransform: "uppercase",
    color: "#7c5cfc",
    marginBottom: 6,
  },
  title: {
    fontSize: "1.5rem",
    fontWeight: 800,
    color: INK,
    marginBottom: 20,
    lineHeight: 1.25,
  },
  xpPill: {
    display: "inline-flex",
    alignItems: "baseline",
    gap: 6,
    background: "linear-gradient(135deg,#7c5cfc,#a78bfa)",
    color: "#fff",
    fontWeight: 800,
    padding: "10px 22px",
    borderRadius: 999,
    marginBottom: 24,
  },
  xpValue: { fontSize: "1.15rem" },
  xpLabel: { fontSize: ".78rem", fontWeight: 700, opacity: 0.9 },
  badgeSection: { marginBottom: 26 },
  badgeHeading: {
    fontSize: ".8rem",
    fontWeight: 700,
    color: "var(--color-text-soft, #6b7280)",
    marginBottom: 12,
  },
  badgeRow: {
    display: "flex",
    justifyContent: "center",
    gap: 14,
    flexWrap: "wrap",
  },
  badgeItem: { textAlign: "center", width: 68 },
  badgeIconRing: {
    width: 52,
    height: 52,
    borderRadius: "50%",
    background: "linear-gradient(150deg,#fff,#f1edff)",
    border: "1px solid rgba(124,92,252,.25)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 6px",
    fontSize: "1.4rem",
  },
  badgeIcon: { lineHeight: 1 },
  badgeName: { fontSize: ".72rem", fontWeight: 700, color: INK },
  actions: { display: "flex", flexDirection: "column", gap: 10 },
  quickLink: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "12px 16px",
    borderRadius: 14,
    background: "#f1edff",
    color: "#5b3df0",
    fontWeight: 700,
    fontSize: ".88rem",
    textDecoration: "none",
    border: "1px solid rgba(124,92,252,.25)",
  },
  continueBtn: { width: "100%" },
};