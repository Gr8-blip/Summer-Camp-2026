import { useEffect, useState } from "react";
import "./VictoryEffect.css";

// Plays a short cosmetic celebration, then calls onDone() so the caller
// can reveal the actual completion screen. Purely visual — no gameplay
// impact. Usage in ChallengePlay/QuestPlay after a successful submit:
//
//   const [effectKey, setEffectKey] = useState(null);
//   ...
//   const res = await submitChallenge(id, body);
//   if (res.victory_effect_key) {
//     setEffectKey(res.victory_effect_key);   // shows the effect first
//   } else {
//     setShowCompletion(true);                // no effect equipped, skip straight there
//   }
//
//   {effectKey && (
//     <VictoryEffect effectKey={effectKey} onDone={() => { setEffectKey(null); setShowCompletion(true); }} />
//   )}

const EFFECT_DURATION_MS = 1400;

const EFFECT_LABEL = {
  star_burst: "✨",
  lightning_strike: "⚡",
  pixel_explosion: "💥",
  galaxy_warp: "🌌",
  lava_burst: "🔥",
};

export default function VictoryEffect({ effectKey, onDone }) {
  const [particles] = useState(() =>
    Array.from({ length: 24 }, (_, i) => ({
      id: i,
      angle: (360 / 24) * i,
      delay: Math.random() * 0.15,
    }))
  );

  useEffect(() => {
    const t = setTimeout(onDone, EFFECT_DURATION_MS);
    return () => clearTimeout(t);
  }, [onDone]);

  const symbol = EFFECT_LABEL[effectKey] || "✨";

  return (
    <div className={`ve-overlay ve-${effectKey}`}>
      <div className="ve-core">{symbol}</div>
      {particles.map((p) => (
        <span
          key={p.id}
          className="ve-particle"
          style={{
            "--angle": `${p.angle}deg`,
            animationDelay: `${p.delay}s`,
          }}
        >
          {symbol}
        </span>
      ))}
    </div>
  );
}