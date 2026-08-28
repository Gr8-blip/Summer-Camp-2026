import { useEffect, useMemo, useState } from "react";

/**
 * ProjectMegaCelebration — a full-screen, one-time-per-finish "MEGA COINS"
 * moment reserved for `project_submission` completions.
 *
 * Why this exists separately from the classic Confetti/XPPopup/coin-pill
 * combo used everywhere else in ChallengePlay/QuestPlay: shipping a real
 * project (a live URL or a working zip that the server actually verified)
 * is a bigger deal than clearing a quiz question, and the payout can be
 * much larger (up to MAX_COINS). This gets its own tiered, full-screen
 * payoff instead of quietly reusing the small "+N coins" pill on the done
 * screen — it plays first, then hands off to the normal done screen via
 * onDone(), the same handoff pattern VictoryEffect already uses.
 *
 * Props:
 *  - coins: number of coins earned this finish (0..MAX_COINS)
 *  - onDone: called once the player taps through / animation settles
 */
const MAX_COINS = 800;

const TIERS = [
  {
    id: "legendary",
    min: 0.85,
    label: "LEGENDARY SHIP",
    sub: "Absolutely cracked. Ship it to production.",
    coinCount: 42,
    bg: "radial-gradient(circle at 50% 20%, #4c1d95 0%, #1e1b4b 55%, #05010f 100%)",
    ring: "conic-gradient(from 0deg, #facc15, #f472b6, #22d3ee, #a78bfa, #facc15)",
    glow: "rgba(250,204,21,.85)",
    text: "linear-gradient(90deg,#facc15,#f472b6,#22d3ee,#facc15)",
  },
  {
    id: "epic",
    min: 0.55,
    label: "EPIC SHIP",
    sub: "That's a real project. Big coins incoming.",
    coinCount: 30,
    bg: "radial-gradient(circle at 50% 20%, #78350f 0%, #1c1207 60%, #05010f 100%)",
    ring: "conic-gradient(from 0deg, #f59e0b, #fde68a, #f59e0b)",
    glow: "rgba(245,158,11,.75)",
    text: "linear-gradient(90deg,#fde68a,#f59e0b,#fde68a)",
  },
  {
    id: "solid",
    min: 0.25,
    label: "SOLID SHIP",
    sub: "Submitted, verified, paid out.",
    coinCount: 20,
    bg: "radial-gradient(circle at 50% 20%, #065f46 0%, #022c22 60%, #05010f 100%)",
    ring: "conic-gradient(from 0deg, #34d399, #a7f3d0, #34d399)",
    glow: "rgba(52,211,153,.7)",
    text: "linear-gradient(90deg,#a7f3d0,#34d399,#a7f3d0)",
  },
  {
    id: "shipped",
    min: 0,
    label: "SHIPPED",
    sub: "It's live and it's verified. Coins locked in.",
    coinCount: 14,
    bg: "radial-gradient(circle at 50% 20%, #1e3a8a 0%, #0b1330 60%, #05010f 100%)",
    ring: "conic-gradient(from 0deg, #60a5fa, #bfdbfe, #60a5fa)",
    glow: "rgba(96,165,250,.7)",
    text: "linear-gradient(90deg,#bfdbfe,#60a5fa,#bfdbfe)",
  },
];

function pickTier(ratio) {
  return TIERS.find((t) => ratio >= t.min) || TIERS[TIERS.length - 1];
}

const KEYFRAMES = `
@keyframes pmcFadeIn { from { opacity:0 } to { opacity:1 } }
@keyframes pmcShake { 0%,100%{ transform:translate3d(0,0,0) } 20%{ transform:translate3d(-6px,0,0) } 40%{ transform:translate3d(6px,0,0) } 60%{ transform:translate3d(-4px,0,0) } 80%{ transform:translate3d(4px,0,0) } }
@keyframes pmcRingSpin { to { transform: rotate(360deg) } }
@keyframes pmcCoinFall { from { transform: translateY(-10vh) rotate(0deg); opacity:0 } 8%{ opacity:1 } to { transform: translateY(115vh) rotate(600deg); opacity:.9 } }
@keyframes pmcPop { 0%{ transform:scale(.4); opacity:0 } 60%{ transform:scale(1.08); opacity:1 } 100%{ transform:scale(1) } }
@keyframes pmcPulseGlow { 0%,100%{ filter:drop-shadow(0 0 18px var(--pmc-glow)) } 50%{ filter:drop-shadow(0 0 40px var(--pmc-glow)) } }
@keyframes pmcShine { 0%{ background-position:-200% 0 } 100%{ background-position:200% 0 } }
`;

export default function ProjectMegaCelebration({ coins, onDone }) {
  const ratio = Math.max(0, Math.min(1, (coins || 0) / MAX_COINS));
  const tier = useMemo(() => pickTier(ratio), [ratio]);
  const [displayCoins, setDisplayCoins] = useState(0);
  const [shaking, setShaking] = useState(true);

  const rainCoins = useMemo(
    () =>
      Array.from({ length: tier.coinCount }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 1.1,
        duration: 1.6 + Math.random() * 1.4,
        size: 18 + Math.random() * 20,
      })),
    [tier.coinCount]
  );

  // Count the number up instead of just slamming it on screen — a ticking
  // total sells "big payout" far better than a static number appearing.
  useEffect(() => {
    const target = coins || 0;
    if (target <= 0) return;
    const durationMs = 900;
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplayCoins(Math.round(eased * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const shakeTimer = setTimeout(() => setShaking(false), 500);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(shakeTimer);
    };
  }, [coins]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 900, display: "flex",
        alignItems: "center", justifyContent: "center", overflow: "hidden",
        background: tier.bg, animation: "pmcFadeIn .25s ease-out",
        "--pmc-glow": tier.glow,
      }}
    >
      <style>{KEYFRAMES}</style>

      {/* coin rain — denser + larger than the classic confetti burst */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {rainCoins.map((c) => (
          <span
            key={c.id}
            style={{
              position: "absolute", top: 0, left: `${c.left}%`, fontSize: c.size,
              animation: `pmcCoinFall ${c.duration}s linear ${c.delay}s infinite`,
            }}
          >
            🪙
          </span>
        ))}
      </div>

      <div
        style={{
          position: "relative", textAlign: "center", padding: "0 24px",
          animation: shaking ? "pmcShake .5s ease-in-out, pmcPop .45s ease-out" : "pmcPop .45s ease-out",
        }}
      >
        {/* spinning ring behind the coin stack */}
        <div
          style={{
            position: "absolute", left: "50%", top: "38%", transform: "translate(-50%,-50%)",
            width: 260, height: 260, borderRadius: "50%", background: tier.ring,
            filter: "blur(2px)", opacity: 0.55, animation: "pmcRingSpin 6s linear infinite",
          }}
        />

        <div
          style={{
            position: "relative", fontSize: "5rem", lineHeight: 1,
            animation: "pmcPulseGlow 1.6s ease-in-out infinite",
          }}
        >
          🪙
        </div>

        <div
          style={{
            position: "relative", marginTop: 6, fontSize: ".78rem", fontWeight: 800,
            letterSpacing: ".16em", color: "rgba(255,255,255,.75)", textTransform: "uppercase",
          }}
        >
          Project Verified
        </div>

        <div
          style={{
            position: "relative", marginTop: 14, fontSize: "3.1rem", fontWeight: 900,
            backgroundImage: tier.text, backgroundSize: "200% auto",
            WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
            animation: "pmcShine 2.2s linear infinite", letterSpacing: "-0.02em",
          }}
        >
          +{displayCoins} COINS
        </div>

        <div
          style={{
            position: "relative", marginTop: 10, fontSize: "1.15rem", fontWeight: 900,
            color: "#fff", letterSpacing: ".04em",
          }}
        >
          {tier.label}
        </div>
        <div style={{ position: "relative", marginTop: 6, fontSize: ".9rem", color: "rgba(255,255,255,.7)", fontWeight: 600 }}>
          {tier.sub}
        </div>

        <button
          onClick={onDone}
          style={{
            position: "relative", marginTop: 30, border: "none", cursor: "pointer",
            background: "rgba(255,255,255,.14)", color: "#fff", fontWeight: 800,
            fontSize: ".92rem", padding: "14px 34px", borderRadius: 999,
            backdropFilter: "blur(6px)", boxShadow: `0 0 0 1px rgba(255,255,255,.25), 0 10px 30px -8px var(--pmc-glow)`,
          }}
        >
          Claim Coins →
        </button>
      </div>
    </div>
  );
}