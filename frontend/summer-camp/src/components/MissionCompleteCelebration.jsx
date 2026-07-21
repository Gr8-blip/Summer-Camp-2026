const CONFETTI_COLORS = ["#7c5cfc", "#14b8a6", "#f59e0b", "#ec4899", "#3b82f6", "#f43f5e"];
 
function Confetti() {
  const pieces = useMemo(
    () => Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.3,
      duration: 1.2 + Math.random() * 0.8,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      rotate: Math.random() * 360,
    })),
    []
  );
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 500, overflow: "hidden" }}>
      <style>{`@keyframes mcFall { to { top: 110vh; opacity: 0; } }`}</style>
      {pieces.map((p) => (
        <span key={p.id} style={{
          position: "absolute", top: -20, left: `${p.left}%`,
          width: 10, height: 16, background: p.color, borderRadius: 2,
          transform: `rotate(${p.rotate}deg)`,
          animation: `mcFall ${p.duration}s ease-in ${p.delay}s forwards`,
        }} />
      ))}
    </div>
  );
}
 
export default function MissionCompleteCelebration({ missionTitle, xpAwarded, newBadges = [], onDone }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 499, background: "rgba(20,15,40,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <Confetti />
      <div style={{ background: "#fff", borderRadius: 24, padding: "36px 32px", maxWidth: 420, width: "100%", textAlign: "center", boxShadow: "0 30px 60px -20px rgba(0,0,0,.4)" }}>
        <div style={{ fontSize: "2.6rem", marginBottom: 6 }}>🎉</div>
        <h1 style={{ fontSize: "1.4rem", marginBottom: 4 }}>Mission Complete!</h1>
        <p style={{ color: "var(--color-text-soft)", marginBottom: 18 }}>{missionTitle}</p>
        <div style={{
          display: "inline-block", background: "linear-gradient(135deg,#7c5cfc,#a78bfa)", color: "#fff",
          fontWeight: 800, padding: "10px 24px", borderRadius: 999, marginBottom: 22,
        }}>
          +{xpAwarded} XP ✨
        </div>
 
        {newBadges.length > 0 && (
          <div style={{ marginBottom: 22 }}>
            <p style={{ fontWeight: 700, marginBottom: 10 }}>Badges unlocked!</p>
            <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
              {newBadges.map((b, i) => (
                <div key={i} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "2rem" }}>{b.icon}</div>
                  <div style={{ fontSize: ".78rem", fontWeight: 700 }}>{b.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}
 
        <button className="btn btn-primary" style={{ width: "100%" }} onClick={onDone}>Continue</button>
      </div>
    </div>
  );
}