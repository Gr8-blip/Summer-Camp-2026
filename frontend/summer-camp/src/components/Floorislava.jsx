import { useEffect, useMemo, useRef, useState } from "react";

/**
 * FloorIsLava — pure survival climb. Same "renderer" contract as
 * DungeonCrawler/ChallengePlay/QuestPlay: hands back `{questionId: response}`
 * via onComplete, which the parent submits exactly like today. No backend
 * request is made per question — every answer is recorded locally and only
 * submitted together at the end, same as the existing flow.
 *
 * Design rules straight from spec:
 *  - No health system. The lava is the only failure condition.
 *  - The lava NEVER pauses — not while a question is up, not between
 *    platforms, not for animation beats. It only stops once the run has
 *    actually ended (caught, or summit reached).
 *  - Answering correctly-in-time advances the player to the next platform
 *    *immediately* — the jump animation is purely visual and never gates
 *    the next question. Timing out does NOT advance the player: they stay
 *    on the current platform, the clock re-arms right there, AND the lava
 *    gets an instant BOOM spike on top of its constant rise — so a miss is
 *    felt right away, not just accumulated passively. Enough missed rounds
 *    on one platform and it catches them — no HP system, lost time (plus
 *    the spike) is the punishment.
 *  - The lava gets more aggressive the further you climb — it starts slow
 *    and accelerates with progress, on top of the instant BOOM spike from a
 *    miss. This means even a player who's answering everything correctly
 *    still feels the run tighten up over time instead of coasting on a
 *    comfy head start forever.
 *  - The player is the fixed point on screen (a few rows above the bottom
 *    of the frame) — the world scrolls past THEM, not the other way
 *    around. New platforms simply come into view above as they climb, so
 *    this works the same whether there are 5 questions or 50; nothing is
 *    laid out beyond the visible window. The window is sized so the lava
 *    is always at least partly on-screen and visibly creeping, even when
 *    the player has a healthy lead — it should never read as stationary.
 *  - Getting caught is a full run reset (no mid-run health, so no partial
 *    checkpoint to fall back to) — "Play Again" restarts from platform 1.
 *    onComplete is only ever called on a summit finish, matching "answers
 *    are submitted for grading when the run is won."
 */

const TIME_PER_Q = 4500;              // ms to answer before auto-timeout — tight enough to force real urgency
const LAVA_RATE_BASE_PER_MS = 1 / 4200; // even at the START, sitting on a question costs real ground
const LAVA_RATE_MAX_MULT = 4.2;       // ~4x faster once fully ramped up — "start slow then go faster"
const LAVA_RAMP_PLATFORMS = 9;        // ramps to full aggression fast — the run should never stay comfortable for long
const LAVA_BUFFER = 1.6;              // slim head start — some lava is visible from platform 1
const TIMEOUT_LAVA_BOOM = 0.7;        // a miss should hurt, but shouldn't feel like a teleporting instant-kill

// Two things speed the lava up: (1) raw progress — the further you've
// climbed, the faster the passive rise, eased so it truly starts slow; and
// (2) timeouts, handled separately as an instant spike in resolve().
function lavaRampMultiplier(platformsCleared) {
  const t = Math.min(1, platformsCleared / LAVA_RAMP_PLATFORMS);
  const eased = t * t;
  return 1 + eased * (LAVA_RATE_MAX_MULT - 1);
}

function buildRows(questions) {
  return questions.map((q) => ({ question: q }));
}

export default function FloorIsLava({ questions, title = "Floor Is Lava", onAnswer, onComplete, onExit }) {
  const rows = useMemo(() => buildRows(questions), [questions]);

  const [cleared, setCleared] = useState(0);        // platforms fully passed
  const [lava, setLava] = useState(-LAVA_BUFFER);
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(TIME_PER_Q);
  const [toast, setToast] = useState("");
  const [flashKind, setFlashKind] = useState(null);  // 'climb' | 'slip'
  const [jumping, setJumping] = useState(false);      // visual-only, never blocks
  const [jumpTick, setJumpTick] = useState(0);        // bumped every successful jump — forces the animation to replay every time, no exceptions
  // `cleared` is the authoritative game state (updates instantly — timers,
  // catch detection, etc. all key off it right away, same as before). But
  // rendering the world's SCROLL POSITION off it directly meant a new
  // platform just silently swapped in underneath a bouncing emoji — no
  // sense that you'd actually gone anywhere. `displayCleared` is the
  // scroll position instead: it trails `cleared` by one short slide
  // animation, so climbing a platform visibly moves the world.
  const [displayCleared, setDisplayCleared] = useState(0);
  const [slideStep, setSlideStep] = useState(0); // 0 settled · 1 wound up (pre-transition) · 2 sliding
  const [attempt, setAttempt] = useState(0);          // bumps on every timeout to restart the clock on the SAME platform
  // playing -> touch -> fire -> fade -> gameover   |   playing -> victory
  const [phase, setPhase] = useState("playing");

  const answeredRef = useRef(false); // debounce so a single round can't double-resolve
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const clearedRef = useRef(cleared); // read inside the rise interval without re-subscribing it
  clearedRef.current = cleared;

  const terminal = phase !== "playing";
  const currentRow = rows[cleared];
  const allClimbed = cleared >= rows.length;

  const say = (msg) => { setToast(msg); setTimeout(() => setToast((t) => (t === msg ? "" : t)), 1700); };
  const flash = (kind) => { setFlashKind(kind); setTimeout(() => setFlashKind(null), 420); };

  useEffect(() => { answeredRef.current = false; }, [cleared, attempt]);

  // ── platform slide: whenever `cleared` moves ahead of `displayCleared`,
  // play a short scroll so the new platform visibly arrives instead of
  // silently swapping in. Two-step so the browser actually animates it:
  // step 1 renders the pre-slide position with no transition, then a
  // rAF flips to step 2 (transition on, target position) on the next
  // paint. After the animation window, the scroll position is committed. ─
  const SLIDE_MS = 260;
  useEffect(() => {
    if (cleared === displayCleared) return;
    setSlideStep(1);
    const raf = requestAnimationFrame(() => setSlideStep(2));
    const done = setTimeout(() => {
      setDisplayCleared(cleared);
      setSlideStep(0);
    }, SLIDE_MS + 20);
    return () => { cancelAnimationFrame(raf); clearTimeout(done); };
  }, [cleared]);

  // ── lava rises continuously — nothing pauses it except the run ending.
  // Rate scales up with progress (lavaRampMultiplier), so it starts slow
  // and genuinely accelerates the further the player climbs. ──────────────
  useEffect(() => {
    const t = setInterval(() => {
      if (phaseRef.current !== "playing") return;
      const mult = lavaRampMultiplier(clearedRef.current);
      setLava((l) => l + LAVA_RATE_BASE_PER_MS * 150 * mult);
    }, 150);
    return () => clearInterval(t);
  }, []);

  // ── the lava reaching the player's platform kicks off the burn sequence ─
  useEffect(() => {
    if (phase !== "playing" || allClimbed) return;
    if (lava >= cleared) setPhase("touch");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lava, phase, allClimbed]);

  useEffect(() => {
    if (phase === "touch") { const t = setTimeout(() => setPhase("fire"), 300); return () => clearTimeout(t); }
    if (phase === "fire")  { const t = setTimeout(() => setPhase("fade"), 700);  return () => clearTimeout(t); }
    if (phase === "fade")  { const t = setTimeout(() => setPhase("gameover"), 520); return () => clearTimeout(t); }
  }, [phase]);

  // ── question countdown — restarts on `attempt` too, so a timeout re-arms
  // the clock on the SAME platform instead of skipping ahead ─────────────
  useEffect(() => {
    if (terminal || allClimbed || !currentRow) return;
    setTimeLeft(TIME_PER_Q);
    const start = Date.now();
    const t = setInterval(() => {
      const left = TIME_PER_Q - (Date.now() - start);
      if (left <= 0) { clearInterval(t); resolve(null, true); }
      else setTimeLeft(left);
    }, 100);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleared, attempt, terminal]);

  const resolve = (response, timedOut = false) => {
    if (!currentRow || answeredRef.current || terminal) return;
    answeredRef.current = true;
    const q = currentRow.question;

    if (timedOut) {
      // Missed it — the player stays put. No advance, no new platform. On
      // top of the lava's constant rise, it gets an instant BOOM spike here
      // so a miss is felt immediately, not just accumulated passively.
      onAnswer?.(q.id, null);
      flash("slip");
      say("💥 BOOM — the lava surged! Speed up!");
      setLava((l) => l + TIMEOUT_LAVA_BOOM);
      setAttempt((a) => a + 1);
      return;
    }

    setAnswers((a) => ({ ...a, [q.id]: response }));
    onAnswer?.(q.id, response);
    flash("climb");
    say("🧍 Nice! Climbing higher...");
    setJumping(true);
    setJumpTick((n) => n + 1);
    setTimeout(() => setJumping(false), 320);
    setAttempt(0);
    setCleared((c) => c + 1); // next platform + next question, right now
  };

  const retry = () => {
    setCleared(0);
    setDisplayCleared(0);
    setSlideStep(0);
    setLava(-LAVA_BUFFER);
    setAnswers({});
    setToast("");
    setFlashKind(null);
    setJumping(false);
    setAttempt(0);
    answeredRef.current = false;
    setPhase("playing");
  };

  useEffect(() => {
    if (allClimbed && phase === "playing") {
      setPhase("victory");
      // Reward margin over the lava, not just reaching the top — average
      // remaining gap is a reasonable proxy for how many close calls this
      // run actually had vs. cruising clean.
      const avgGap = Math.max(0, cleared - lava);
      const coins = rows.length * 2 + Math.round(avgGap * 6);
      const t = setTimeout(() => onComplete(answers, coins), 1500);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allClimbed]);

  // ── viewport: the PLAYER is the fixed point, not the camera. They always
  // render at the same spot (PLAYER_OFFSET rows above the bottom edge); the
  // world scrolls past them instead. This is what makes "more platforms
  // spawn ahead as you climb" work cleanly no matter how many questions
  // there are (10, 50, whatever) — we only ever render VIEW rows, computed
  // relative to `cleared`, instead of laying out every row and panning a
  // giant stack (which is what made the player vanish off-screen once a
  // deck got long).
  const VIEW = 8;
  const PLAYER_OFFSET = 3; // rows above the viewport's bottom edge the player stands on — high enough that lava is visible well before it's dangerously close
  const cellPx = 58;
  const viewportPx = VIEW * cellPx;
  const pct = !terminal && currentRow ? Math.max(0, timeLeft / TIME_PER_Q) : 1;

  // lava's position translated into this fixed window: when lava === cleared
  // (i.e. it has reached the player's platform) this equals PLAYER_OFFSET,
  // so the molten surface visibly reaches right up to the player's feet.
  const lavaRowFromBottom = lava - cleared + PLAYER_OFFSET;
  const lavaHeightPx = Math.max(0, Math.min(viewportPx, lavaRowFromBottom * cellPx));
  const dangerT = Math.min(1, cleared / LAVA_RAMP_PLATFORMS); // 0 at the start, 1 once the ramp is maxed

  // Slide render params: while a slide is in flight we render one extra row
  // (revealed from the top as the world scrolls down past the fixed
  // player) using the OLD scroll base; once settled it's back to a plain
  // VIEW-row window on the live base. See the SLIDE_MS effect above.
  const sliding = slideStep !== 0;
  const slideRowCount = sliding ? VIEW + 1 : VIEW;
  const slideBase = sliding ? displayCleared : cleared;
  const slideTransform = slideStep === 1 ? `translateY(-${cellPx}px)` : "translateY(0)";
  const slideTransition = slideStep === 2 ? `transform ${SLIDE_MS}ms cubic-bezier(.22,.9,.35,1)` : "none";

  // How many platforms separate the player from the lava right now — this
  // shrinks in real time whenever the player is stuck on a platform (a
  // timeout doesn't move `cleared`, so the lava visibly gains) and jumps
  // back up whenever they successfully climb.
  const gapPlatforms = Math.max(0, cleared - lava);
  const gapPct = Math.round(Math.min(1, gapPlatforms / LAVA_BUFFER) * 100);
  const gapColor = gapPct > 55 ? "#22c55e" : gapPct > 25 ? "#f59e0b" : "#ef4444";

  return (
    <div style={{ maxWidth: 460, margin: "0 auto" }}>
      <style>{`
        @keyframes filShake { 0%,100%{transform:translateX(0) translateY(0)} 20%{transform:translateX(-7px) translateY(2px)} 40%{transform:translateX(6px) translateY(-2px)} 60%{transform:translateX(-4px) translateY(1px)} 80%{transform:translateX(4px) translateY(-1px)} }
        @keyframes filFlashClimb { 0%{box-shadow:0 0 0 0 rgba(74,222,128,.55)} 100%{box-shadow:0 0 0 22px rgba(74,222,128,0)} }
        @keyframes filFlashSlip { 0%{box-shadow:0 0 0 0 rgba(244,63,94,.6)} 100%{box-shadow:0 0 0 22px rgba(244,63,94,0)} }
        @keyframes filPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.55;transform:scale(.85)} }
        @keyframes filPop { from{transform:scale(.85);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes filFloat { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-3px) rotate(-2deg)} }
        @keyframes filJump { 0%{transform:translateY(0) scale(1)} 30%{transform:translateY(-22px) scale(1.08) rotate(-6deg)} 60%{transform:translateY(-26px) scale(1.1) rotate(4deg)} 100%{transform:translateY(0) scale(1) rotate(0deg)} }
        @keyframes filEmber { 0%{transform:translateY(0) translateX(0);opacity:0} 10%{opacity:.9} 100%{transform:translateY(-140px) translateX(var(--drift,10px));opacity:0} }
        @keyframes filFlow { from{background-position-x:0} to{background-position-x:34px} }
        @keyframes filBoil { 0%,100%{transform:translateY(0) scaleY(1)} 50%{transform:translateY(-3px) scaleY(1.06)} }
        @keyframes filGlow { 0%,100%{ box-shadow: 0 0 26px 6px rgba(255,110,40,.55), inset 0 12px 24px rgba(255,180,80,.25) } 50%{ box-shadow: 0 0 38px 12px rgba(255,170,40,.8), inset 0 16px 30px rgba(255,200,100,.35) } }
        @keyframes filIgnite { 0%{transform:scale(.7);opacity:.4} 50%{transform:scale(1.25);opacity:1} 100%{transform:scale(1.05);opacity:1} }
        @keyframes filFadeIn { from{opacity:0} to{opacity:1} }
        @keyframes filSunPulse { 0%,100%{opacity:.55;transform:scale(1)} 50%{opacity:.9;transform:scale(1.12)} }
      `}</style>

      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#fff" }}>🌋 {title}</div>
          <div style={{ fontSize: ".78rem", color: "#8a8474" }}>{cleared} / {rows.length} platforms climbed</div>
        </div>
        {onExit && (
          <button onClick={onExit} style={{ border: "none", background: "none", cursor: "pointer", fontSize: ".78rem", color: "#c7473f", fontWeight: 700 }}>
            Exit ✕
          </button>
        )}
      </header>

      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".72rem", fontWeight: 700, color: "#7a7568", marginBottom: 3 }}>
          <span>🌡️ Platforms until lava catches you</span><span>{gapPlatforms.toFixed(1)}</span>
        </div>
        <div style={{ height: 10, borderRadius: 999, background: "#2a2440", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${gapPct}%`, borderRadius: 999, transition: "width .15s linear, background .3s ease", background: gapColor }} />
        </div>
      </div>

      {toast && (
        <div style={{ textAlign: "center", fontSize: ".82rem", fontWeight: 700, color: "#5b3fd6", background: "#efeaff", borderRadius: 10, padding: "6px 10px", marginBottom: 10, animation: "filPop .2s ease-out" }}>
          {toast}
        </div>
      )}

      {/* Climbing shaft — cool, dim sky up top; the walls warm into the
          lava's glow as you look down toward the bottom of frame */}
      <div
        style={{
          position: "relative", margin: "0 auto",
          background: "linear-gradient(180deg,#141a2e 0%,#241d3a 30%,#3a2418 62%,#5c2408 85%,#c2340a 100%)",
          borderRadius: 20, padding: 10, width: 260, overflow: "hidden",
          boxShadow: "0 0 0 1px #40342a, 0 20px 50px -20px rgba(255,110,40,.35)",
          animation: (phase === "touch" || phase === "fire") ? "filShake .4s ease-in-out" :
            flashKind === "climb" ? "filFlashClimb .42s" : flashKind === "slip" ? "filFlashSlip .42s, filShake .32s ease-in-out" : "none",
        }}
      >
        <div style={{ position: "relative", width: 240, height: viewportPx, overflow: "hidden", borderRadius: 12, margin: "0 auto" }}>
          {/* ambient heat wash — intensifies with progress so a fast player
              still visibly feels the run getting more aggressive over time.
              zIndex 0 and BELOW the platform stack — this must never sit on
              top of the player or it dulls the jump. */}
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0,
            background: "radial-gradient(ellipse at 50% 100%, rgba(255,110,26,.9) 0%, rgba(255,110,26,0) 65%)",
            opacity: 0.12 + dangerT * 0.28, transition: "opacity 1s ease" }} />

          {/* distant peaks silhouette, faint, near the top of the shaft */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 60, opacity: 0.35, pointerEvents: "none",
            background: "linear-gradient(115deg, transparent 40%, #0a0e1c 41% 46%, transparent 47%), linear-gradient(245deg, transparent 55%, #0a0e1c 56% 63%, transparent 64%), linear-gradient(130deg, transparent 20%, #0a0e1c 21% 30%, transparent 31%)" }} />

          {/* drifting embers, ambient atmosphere */}
          {[...Array(9)].map((_, i) => (
            <span key={i} style={{
              position: "absolute", left: `${6 + ((i * 11) % 88)}%`, bottom: 6, width: 3 + (i % 3), height: 3 + (i % 3),
              borderRadius: "50%", background: i % 2 ? "#ffb454" : "#ff7a1a", pointerEvents: "none",
              "--drift": `${(i % 2 ? 1 : -1) * (8 + i * 3)}px`,
              animation: `filEmber ${2.4 + (i % 4) * 0.6}s linear infinite`, animationDelay: `${i * 0.35}s`,
            }} />
          ))}

          <div style={{ position: "relative", zIndex: 2, transform: slideTransform, transition: slideTransition }}>
            {Array.from({ length: slideRowCount }).map((_, i) => {
              const rowFromBottom = slideRowCount - 1 - i;       // screen slot within THIS render's stack
              const actualIndex = slideBase - PLAYER_OFFSET + rowFromBottom; // which platform this slot shows right now
              const inRange = actualIndex >= 0 && actualIndex <= rows.length;

              if (!inRange) return <div key={i} style={{ height: cellPx }} />; // nothing built here yet / past the summit

              const isSummit = actualIndex === rows.length;
              const isCurrent = actualIndex === cleared;
              const isCleared = actualIndex < cleared;
              const isPlayerHere = isCurrent;
              const isMelting = !isSummit && isCleared && actualIndex <= Math.ceil(lava);

              return (
                <div key={i} style={{ height: cellPx, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {isSummit ? (
                    <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <div style={{ position: "absolute", width: 46, height: 46, borderRadius: "50%", background: "radial-gradient(circle,#fff3c4 0%,rgba(255,243,196,0) 70%)", animation: "filSunPulse 1.6s ease-in-out infinite" }} />
                      <div style={{ fontSize: "1.7rem", position: "relative", animation: allClimbed ? "filPulse 1.1s infinite" : "none" }}>🏔️</div>
                    </div>
                  ) : (
                    <div style={{
                      position: "relative", width: "90%", height: 16, borderRadius: 4,
                      background: isMelting
                        ? "linear-gradient(180deg,#ffb454 0%,#c2340a 60%,#6b1c05 100%)"
                        : isCleared
                          ? "linear-gradient(180deg,#8f9a7a 0%,#5e6b4a 55%,#3a4430 100%)"
                          : "linear-gradient(180deg,#9c8468 0%,#6b5842 45%,#43362a 100%)",
                      backgroundImage: isMelting ? "none" : "repeating-linear-gradient(115deg, rgba(0,0,0,.14) 0 2px, transparent 2px 13px)",
                      backgroundBlendMode: isMelting ? "normal" : "multiply",
                      border: "1px solid rgba(0,0,0,.35)",
                      borderTop: isMelting ? "2px solid rgba(255,220,150,.6)" : "2px solid rgba(255,255,255,.16)",
                      boxShadow: isCurrent ? "0 0 16px rgba(255,170,60,.55), inset 0 -4px 6px rgba(0,0,0,.35)" : "inset 0 -4px 6px rgba(0,0,0,.35), 0 6px 10px -4px rgba(0,0,0,.5)",
                      opacity: isCleared && !isMelting ? 0.7 : 1,
                    }} />
                  )}

                  {isPlayerHere && !isSummit && phase !== "gameover" && (
                    <div key={jumping ? `jump-${jumpTick}` : "idle"} style={{
                      position: "absolute", bottom: (cellPx - 16) / 2 + 13, fontSize: "1.5rem", lineHeight: 1,
                      animation: phase === "fire" ? "filIgnite .5s ease-in-out infinite alternate" : jumping ? "filJump .32s ease-out" : "filFloat 1.6s ease-in-out infinite",
                      filter: (phase === "touch" || phase === "fire") ? "drop-shadow(0 0 8px #ff7a1a)" : "none",
                    }}>
                      {phase === "touch" || phase === "fire" ? "🔥" : "🧍"}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* rising lava, layered for a molten-crust look */}
          <div
            style={{
              position: "absolute", left: 0, right: 0, bottom: 0,
              height: lavaHeightPx,
              background: "linear-gradient(180deg,#ff9a3d 0%,#ff7a1a 12%,#c2340a 55%,#5e1804 100%)",
              animation: "filGlow 1.4s ease-in-out infinite",
              transition: "height .4s cubic-bezier(.3,.85,.4,1)",
            }}
          >
            <div style={{
              position: "absolute", top: -6, left: -8, right: -8, height: 14,
              backgroundImage: "repeating-radial-gradient(circle at 0 60%, #ffd166 0 3px, transparent 4px 20px)",
              backgroundSize: "34px 14px", animation: "filFlow 1.8s linear infinite, filBoil 1.1s ease-in-out infinite",
              opacity: .9,
            }} />
            {[...Array(6)].map((_, i) => (
              <span key={i} style={{
                position: "absolute", left: `${8 + i * 16}%`, top: 8, width: 7, height: 7, borderRadius: "50%",
                background: "#ffd166", animation: `filFloat ${1.1 + i * 0.15}s ease-in-out infinite`, animationDelay: `${i * 0.2}s`,
              }} />
            ))}
          </div>
        </div>
      </div>

      {/* True/False HUD prompt — stays live and visible while the lava keeps
          climbing underneath, so waiting is never free */}
      {phase === "playing" && currentRow && (
        <div style={{ marginTop: 16, background: "#14102a", borderRadius: 18, padding: "18px 18px 16px", border: "1px solid rgba(124,92,252,.18)", animation: "filPop .18s ease-out" }}>
          <div style={{ height: 5, borderRadius: 999, background: "#241d47", overflow: "hidden", marginBottom: 14 }}>
            <div style={{ height: "100%", width: `${pct * 100}%`, background: pct > 0.4 ? "linear-gradient(90deg,#0ea5e9,#67e8f9)" : "linear-gradient(90deg,#ef4444,#f87171)", transition: "width .1s linear" }} />
          </div>
          <p style={{ fontWeight: 700, fontSize: "1.02rem", lineHeight: 1.4, color: "#e6e2f5", marginBottom: 16 }}>
            {currentRow.question.content?.question}
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => resolve(true)} style={{ flex: 1, padding: "16px 0", borderRadius: 14, border: "none", fontWeight: 800, fontSize: "1rem", color: "#fff", cursor: "pointer", background: "linear-gradient(135deg,#22c55e,#4ade80)", boxShadow: "0 8px 20px -8px rgba(34,197,94,.6)" }}>
              ⭕ TRUE
            </button>
            <button onClick={() => resolve(false)} style={{ flex: 1, padding: "16px 0", borderRadius: 14, border: "none", fontWeight: 800, fontSize: "1rem", color: "#fff", cursor: "pointer", background: "linear-gradient(135deg,#ef4444,#f87171)", boxShadow: "0 8px 20px -8px rgba(239,68,68,.6)" }}>
              ❌ FALSE
            </button>
          </div>
        </div>
      )}

      {phase === "fade" && <div style={{ position: "fixed", inset: 0, background: "#000", zIndex: 480, animation: "filFadeIn .5s ease-in forwards" }} />}

      {phase === "gameover" && (
        <Overlay burnt>
          <div style={{ fontSize: "2.4rem" }}>🔥</div>
          <h2 style={{ margin: "8px 0", letterSpacing: ".02em" }}>YOU BURNT</h2>
          <p style={{ color: "#c9a58f", marginBottom: 18 }}>The lava caught up with you.</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button onClick={retry} style={{ padding: "12px 22px", borderRadius: 12, border: "none", fontWeight: 800, cursor: "pointer", background: "linear-gradient(135deg,#ff7a1a,#ffb454)", color: "#fff" }}>
              Play Again
            </button>
            {onExit && (
              <button onClick={onExit} style={{ padding: "12px 22px", borderRadius: 12, border: "1px solid rgba(255,255,255,.25)", fontWeight: 700, cursor: "pointer", background: "none", color: "#e6e2f5" }}>
                Exit
              </button>
            )}
          </div>
        </Overlay>
      )}

      {phase === "victory" && (
        <Overlay>
          <div style={{ fontSize: "2.4rem" }}>🏔️</div>
          <h2 style={{ margin: "8px 0" }}>SUMMIT REACHED</h2>
          <p style={{ color: "#a09a89" }}>Submitting your run…</p>
        </Overlay>
      )}
    </div>
  );
}

function Overlay({ children, burnt }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,6,24,.75)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{
        background: burnt ? "linear-gradient(180deg,#241407,#140b05)" : "#181228", color: "#fff", borderRadius: 20,
        padding: "32px 28px", textAlign: "center", maxWidth: 380, width: "100%", animation: "filPop .25s ease-out",
        border: burnt ? "1px solid rgba(255,140,60,.25)" : "none",
      }}>
        {children}
      </div>
    </div>
  );
}