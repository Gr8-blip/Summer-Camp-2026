import { useEffect, useState } from "react";
import "./Coinpopup.css";

/**
 * Renders one coin celebration at a time out of a queue — same queueing
 * pattern as BadgeUnlockModal, but a lighter, non-blocking toast instead
 * of a full modal (coins fire far more often than badges, so a dead-stop
 * modal for every single one would get old fast). Auto-advances after
 * its animation finishes; the student can also tap to skip ahead.
 *
 * Usage:
 *   <CoinPopup queue={coinQueue} onAdvance={() => setCoinQueue((q) => q.slice(1))} />
 */

const AUTO_ADVANCE_MS = 2600;
const COIN_COUNT = 14;

export default function CoinPopup({ queue, onAdvance }) {
  const event = queue?.[0];
  const [phase, setPhase] = useState("enter"); // enter | hold | exit

  useEffect(() => {
    if (!event) return;
    setPhase("enter");

    const toHold = setTimeout(() => setPhase("hold"), 250);
    const toExit = setTimeout(() => setPhase("exit"), AUTO_ADVANCE_MS - 300);
    const advance = setTimeout(onAdvance, AUTO_ADVANCE_MS);

    return () => {
      clearTimeout(toHold);
      clearTimeout(toExit);
      clearTimeout(advance);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);

  if (!event) return null;

  const skip = () => {
    setPhase("exit");
    setTimeout(onAdvance, 200);
  };

  return (
    <div className={`cp-wrap cp-${phase}`} onClick={skip}>
      <div className="cp-spray">
        {Array.from({ length: COIN_COUNT }).map((_, i) => (
          <span
            key={i}
            className="cp-coin"
            style={{
              "--angle": `${(360 / COIN_COUNT) * i}deg`,
              "--dist": `${90 + Math.random() * 60}px`,
              "--delay": `${Math.random() * 0.12}s`,
            }}
          >
            🪙
          </span>
        ))}
      </div>

      <div className="cp-card">
        <div className="cp-amount">+{event.amount}<span className="cp-coin-icon">🪙</span></div>
        <div className="cp-reason">{event.reason}</div>
      </div>
    </div>
  );
}