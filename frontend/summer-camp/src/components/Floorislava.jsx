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

// ── Difficulty presets ────────────────────────────────────────────────
// Each preset defines the *felt* knobs (time per question, top ramp
// speed, how fast the ramp maxes out, buffer size, timeout penalty).
// LAVA_RATE_BASE_PER_MS is NOT hand-tuned — it's DERIVED from the other
// numbers (see computeConfig) so the math is always fair: at full ramp
// speed, a player who uses their ENTIRE question timer only burns ~90%
// of their buffer, never more. That's the bug fix — see note below.
const DIFFICULTY_PRESETS = {
  easy: {
    label: "Easy",
    icon: "😌",
    coinMult: 0.6,
    blurb: "More time to think, lava takes it slow.",
    TIME_PER_Q: 6000,
    LAVA_RATE_MAX_MULT: 3.0,
    LAVA_RAMP_PLATFORMS: 12,
    LAVA_BUFFER: 2.0,
    TIMEOUT_LAVA_BOOM: 0.45,
  },
  normal: {
    label: "Normal",
    icon: "🔥",
    coinMult: 1,
    blurb: "Balanced heat — the classic climb.",
    TIME_PER_Q: 4500,
    LAVA_RATE_MAX_MULT: 4.2,
    LAVA_RAMP_PLATFORMS: 9,
    LAVA_BUFFER: 1.6,
    TIMEOUT_LAVA_BOOM: 0.6,
  },
  hard: {
    label: "Hard",
    icon: "💀",
    coinMult: 1.6,
    blurb: "Fast clock, faster lava. No mercy.",
    TIME_PER_Q: 3200,
    LAVA_RATE_MAX_MULT: 5.4,
    LAVA_RAMP_PLATFORMS: 7,
    LAVA_BUFFER: 1.3,
    TIMEOUT_LAVA_BOOM: 0.75,
  },
};

// ── THE BUG FIX ──────────────────────────────────────────────────────
// Old code hard-coded LAVA_RATE_BASE_PER_MS completely independent of
// TIME_PER_Q. At full ramp (platform 9+), that meant the lava's rise
// over one FULL question timer (4.5s) was ~4.5 platforms-worth — but
// the buffer was only 1.6. Translation: past platform 9, simply using
// your whole timer to answer (even correctly!) was already more lava
// than your buffer could survive. That's the "rushes to 0 with 1s
// left" feeling — it wasn't a rendering glitch, the speed genuinely
// outran the clock.
//
// Fix: derive the base rate FROM the buffer and timer, so at max ramp,
// a full-timer answer only ever eats SAFETY_MARGIN (90%) of the
// buffer — always survivable if you're reasonably quick, always tense
// because 90% is close, never a guaranteed death by design.
const SAFETY_MARGIN = 0.9;
function computeConfig(preset) {
  const maxRatePerMs = (preset.LAVA_BUFFER * SAFETY_MARGIN) / (preset.TIME_PER_Q * preset.LAVA_RATE_MAX_MULT);
  return { ...preset, LAVA_RATE_BASE_PER_MS: maxRatePerMs };
}

// Two things speed the lava up: (1) raw progress — the further you've
// climbed, the faster the passive rise, eased so it truly starts slow; and
// (2) timeouts, handled separately as an instant spike in resolve().
function lavaRampMultiplier(platformsCleared, cfg) {
  const t = Math.min(1, platformsCleared / cfg.LAVA_RAMP_PLATFORMS);
  const eased = t * t;
  return 1 + eased * (cfg.LAVA_RATE_MAX_MULT - 1);
}

function buildRows(questions) {
  return questions.map((q) => ({ question: q }));
}

export default function FloorIsLava({ questions, title = "Floor Is Lava", onAnswer, onComplete, onExit }) {
  const rows = useMemo(() => buildRows(questions), [questions]);

  const [difficulty, setDifficulty] = useState(null); // null while on the select screen
  const cfg = useMemo(() => computeConfig(DIFFICULTY_PRESETS[difficulty || "normal"]), [difficulty]);

  const [cleared, setCleared] = useState(0);        // platforms fully passed
  const [lava, setLava] = useState(0);
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(0);
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
  const [misses, setMisses] = useState(0);            // total wrong/timeout answers this run — feeds accuracy + coin payout
  // select -> playing -> touch -> fire -> fade -> gameover   |   playing -> victory
  const [phase, setPhase] = useState("select");
  // Shown once per browser (persisted), same pattern as DungeonCrawler's
  // intro walkthrough — reopenable anytime via the "❓ How to play" button.
  const [showIntro, setShowIntro] = useState(() => {
    try { return localStorage.getItem("fil_hide_intro") !== "1"; } catch { return true; }
  });

  const answeredRef = useRef(false); // debounce so a single round can't double-resolve
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const clearedRef = useRef(cleared); // read inside the rise interval without re-subscribing it
  clearedRef.current = cleared;
  const cfgRef = useRef(cfg); // read inside the rise interval without re-subscribing it
  cfgRef.current = cfg;

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
      const c = cfgRef.current;
      const mult = lavaRampMultiplier(clearedRef.current, c);
      setLava((l) => l + c.LAVA_RATE_BASE_PER_MS * 150 * mult);
    }, 150);
    return () => clearInterval(t);
  }, []);

  // ── the lava reaching the player's platform kicks off the burn sequence ─
  useEffect(() => {
    if (phase !== "playing" || allClimbed) return;
    if (lava >= cleared) setPhase("touch");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lava, phase, allClimbed]); // phase !== "playing" already excludes the "select" screen

  useEffect(() => {
    if (phase === "touch") { const t = setTimeout(() => setPhase("fire"), 300); return () => clearTimeout(t); }
    if (phase === "fire")  { const t = setTimeout(() => setPhase("fade"), 700);  return () => clearTimeout(t); }
    if (phase === "fade")  { const t = setTimeout(() => setPhase("gameover"), 520); return () => clearTimeout(t); }
  }, [phase]);

  // ── question countdown — restarts on `attempt` too, so a timeout re-arms
  // the clock on the SAME platform instead of skipping ahead ─────────────
  useEffect(() => {
    if (phase !== "playing" || allClimbed || !currentRow) return;
    setTimeLeft(cfg.TIME_PER_Q);
    const start = Date.now();
    const t = setInterval(() => {
      const left = cfg.TIME_PER_Q - (Date.now() - start);
      if (left <= 0) { clearInterval(t); resolve(null, true); }
      else setTimeLeft(left);
    }, 100);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleared, attempt, phase]);

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
      setLava((l) => l + cfg.TIMEOUT_LAVA_BOOM);
      setAttempt((a) => a + 1);
      setMisses((m) => m + 1);
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

  // Kicks off a fresh run at the chosen difficulty — used both for the
  // very first start (from the select screen) and for "Play Again"
  // (which reuses whatever difficulty was already picked).
  const beginRun = (diff) => {
    const nextCfg = computeConfig(DIFFICULTY_PRESETS[diff]);
    setDifficulty(diff);
    setCleared(0);
    setDisplayCleared(0);
    setSlideStep(0);
    setLava(-nextCfg.LAVA_BUFFER);
    setAnswers({});
    setToast("");
    setFlashKind(null);
    setJumping(false);
    setAttempt(0);
    setMisses(0);
    answeredRef.current = false;
    setPhase("playing");
  };

  const retry = () => beginRun(difficulty || "normal");
  const changeDifficulty = () => setPhase("select");

  useEffect(() => {
    if (allClimbed && phase === "playing") {
      setPhase("victory");
      // Coin formula, same "difficulty multiplier on top of a run-quality
      // base" shape as DungeonCrawler's coinMult:
      //  - a flat per-platform base (you climbed the whole thing)
      //  - an accuracy bonus (fewer misses = more coins — this is the
      //    stand-in for "pellets collected" here, since there's nothing
      //    to sweep in this game, just questions to not blow)
      //  - a small gap bonus (finished with breathing room, not scraping in)
      //  - all of that scaled by the chosen difficulty's coinMult
      const totalAnswers = cleared + misses;
      const accuracy = totalAnswers > 0 ? cleared / totalAnswers : 1;
      const gapBonus = Math.max(0, cleared - lava);
      const base = rows.length * 2;
      const accuracyBonus = Math.round(rows.length * 3 * accuracy);
      const gapBonusCoins = Math.round(gapBonus * 4);
      const coins = Math.round((base + accuracyBonus + gapBonusCoins) * cfg.coinMult);
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
  const pct = phase === "playing" && currentRow ? Math.max(0, timeLeft / cfg.TIME_PER_Q) : 1;

  // lava's position translated into this fixed window: when lava === cleared
  // (i.e. it has reached the player's platform) this equals PLAYER_OFFSET,
  // so the molten surface visibly reaches right up to the player's feet.
  const lavaRowFromBottom = lava - cleared + PLAYER_OFFSET;
  const lavaHeightPx = Math.max(0, Math.min(viewportPx, lavaRowFromBottom * cellPx));
  const dangerT = Math.min(1, cleared / cfg.LAVA_RAMP_PLATFORMS); // 0 at the start, 1 once the ramp is maxed

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
  const gapPct = Math.round(Math.min(1, gapPlatforms / cfg.LAVA_BUFFER) * 100);
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
          <div style={{ fontSize: ".78rem", color: "#8a8474" }}>
            {phase === "select" ? "Choose your heat" : `${cleared} / ${rows.length} platforms climbed`}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setShowIntro(true)} style={{ border: "1px solid rgba(255,255,255,.2)", background: "none", cursor: "pointer", fontSize: ".76rem", color: "#c9c3e8", fontWeight: 700, borderRadius: 999, padding: "4px 10px" }}>
            ❓ How to play
          </button>
          {onExit && (
            <button onClick={onExit} style={{ border: "none", background: "none", cursor: "pointer", fontSize: ".78rem", color: "#c7473f", fontWeight: 700 }}>
              Exit ✕
            </button>
          )}
        </div>
      </header>

      {phase !== "select" && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".72rem", fontWeight: 700, color: "#7a7568", marginBottom: 3 }}>
            <span>🌡️ Platforms until lava catches you</span><span>{gapPlatforms.toFixed(1)}</span>
          </div>
          <div style={{ height: 10, borderRadius: 999, background: "#2a2440", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${gapPct}%`, borderRadius: 999, transition: "width .15s linear, background .3s ease", background: gapColor }} />
          </div>
        </div>
      )}

      {toast && (
        <div style={{ textAlign: "center", fontSize: ".82rem", fontWeight: 700, color: "#5b3fd6", background: "#efeaff", borderRadius: 10, padding: "6px 10px", marginBottom: 10, animation: "filPop .2s ease-out" }}>
          {toast}
        </div>
      )}

      {/* Climbing shaft — cool, dim sky up top; the walls warm into the
          lava's glow as you look down toward the bottom of frame */}
      {phase !== "select" && (
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
      )}

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
          <p style={{ color: "#c9a58f", marginBottom: 6 }}>The lava caught up with you.</p>
          <p style={{ color: "#8a7a6a", fontSize: ".78rem", marginBottom: 18 }}>Difficulty: {DIFFICULTY_PRESETS[difficulty || "normal"].icon} {DIFFICULTY_PRESETS[difficulty || "normal"].label}</p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={retry} style={{ padding: "12px 22px", borderRadius: 12, border: "none", fontWeight: 800, cursor: "pointer", background: "linear-gradient(135deg,#ff7a1a,#ffb454)", color: "#fff" }}>
              Play Again
            </button>
            <button onClick={changeDifficulty} style={{ padding: "12px 22px", borderRadius: 12, border: "1px solid rgba(255,255,255,.25)", fontWeight: 700, cursor: "pointer", background: "none", color: "#e6e2f5" }}>
              Change Difficulty
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
          <p style={{ color: "#a09a89", marginBottom: 4 }}>
            Accuracy: {cleared + misses > 0 ? Math.round((cleared / (cleared + misses)) * 100) : 100}% · {misses} miss{misses === 1 ? "" : "es"}
          </p>
          <p style={{ color: "#a09a89" }}>Submitting your run…</p>
        </Overlay>
      )}

      {showIntro && <IntroWalkthrough onClose={() => setShowIntro(false)} />}
      {phase === "select" && !showIntro && <DifficultyModal onChoose={beginRun} />}
    </div>
  );
}

// ───────────────────────── intro walkthrough ─────────────────────────
// Shown once per browser (persisted via localStorage) unless the player
// checks "Don't show again" or hits Skip. Reopenable anytime via the
// "❓ How to play" button in the header — same pattern as DungeonCrawler.

const FIL_INTRO_SLIDES = [
  { icon: "🌋", grad: "linear-gradient(135deg,#ff7a1a,#ffb454)", title: "The Floor Is Lava!", body: "Climb platform by platform by answering True/False questions. Miss too many, and the lava underneath catches you." },
  { icon: "❓", grad: "linear-gradient(135deg,#7c5cfc,#a78bfa)", title: "Answer Before Time's Up", body: "Each platform gives you one question and a countdown. Answer TRUE or FALSE before the bar under the question runs out." },
  { icon: "🧍➡️🪨", grad: "linear-gradient(135deg,#22c55e,#86efac)", title: "Correct = Instant Climb", body: "Get it right and you jump straight to the next platform — no waiting around." },
  { icon: "🐌🔥", grad: "linear-gradient(135deg,#ff5c8a,#f97316)", title: "Wrong or Too Slow = You Stay Put", body: "Miss it and you're stuck on the same platform — the question re-arms right there, and the lava gets an instant surge on top of its normal rise." },
  { icon: "🌡️", grad: "linear-gradient(135deg,#eab308,#fde047)", title: "The Lava Never Stops", body: "It's always rising — not while you're reading, not between platforms — and it speeds up the higher you climb. The bar up top just tracks the gap between you and it." },
  { icon: "📊", grad: "linear-gradient(135deg,#0ea5e9,#67e8f9)", title: "Your Score Shows After the Run", body: "Nothing gets sent anywhere while you're climbing — every answer is tracked right here. Your accuracy only shows up once you reach the summit, so a rough patch mid-run doesn't end things early. Get it, then play again to push it higher." },
  { icon: "🪙", grad: "linear-gradient(135deg,#eab308,#fde047)", title: "Harder Heat = More Coins", body: "Coins are based on how far you climbed, how accurate you were, and how big your lead over the lava was — then multiplied by your difficulty. Hard pays out way more than Easy for the same clean run." },
  { icon: "🏔️", grad: "linear-gradient(135deg,#0ea5e9,#67e8f9)", title: "Reach the Summit", body: "Clear every platform to win. Getting caught is a full reset back to platform 1 — no checkpoints, so keep the pace up!" },
];

function IntroWalkthrough({ onClose }) {
  const [step, setStep] = useState(0);
  const [dontShow, setDontShow] = useState(false);
  const last = step === FIL_INTRO_SLIDES.length - 1;
  const slide = FIL_INTRO_SLIDES[step];

  const finish = () => {
    if (dontShow) { try { localStorage.setItem("fil_hide_intro", "1"); } catch { /* ignore */ } }
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(6,3,16,.93)", backdropFilter: "blur(2px)", zIndex: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: 18, animation: "filPop .25s ease-out" }}>
      <button
        onClick={finish}
        style={{ position: "absolute", top: 22, right: 22, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.18)", color: "#e6e2f5", borderRadius: 999, padding: "8px 16px", fontSize: ".76rem", fontWeight: 700, cursor: "pointer" }}
      >
        Skip ✕
      </button>

      <div style={{ width: "100%", maxWidth: 400, borderRadius: 26, overflow: "hidden", background: "#14102a", boxShadow: "0 40px 90px -20px rgba(0,0,0,.7), 0 0 0 1px rgba(124,92,252,.25)" }}>
        <div key={step} style={{ background: slide.grad, padding: "40px 24px 30px", textAlign: "center", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 0%, rgba(255,255,255,.25), transparent 60%)" }} />
          <div style={{ fontSize: "3.4rem", animation: "filFloat 1.6s ease-in-out infinite", filter: "drop-shadow(0 0 16px rgba(255,255,255,.55))", position: "relative" }}>
            {slide.icon}
          </div>
        </div>

        <div style={{ padding: "22px 26px 22px", color: "#e6e2f5" }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "1.18rem", fontWeight: 800 }}>{slide.title}</h2>
          <p style={{ fontSize: ".92rem", lineHeight: 1.55, color: "#c9c4e0", marginBottom: 20, minHeight: 66 }}>{slide.body}</p>

          <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 18 }}>
            {FIL_INTRO_SLIDES.map((_, i) => (
              <span key={i} style={{ width: i === step ? 20 : 7, height: 7, borderRadius: 999, background: i === step ? slide.grad : "#332a5c", transition: "all .25s ease" }} />
            ))}
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            {step > 0 && (
              <button onClick={() => setStep((s) => s - 1)} style={{ padding: "12px 16px", borderRadius: 12, border: "1px solid #34295c", background: "transparent", color: "#e6e2f5", fontWeight: 700, cursor: "pointer" }}>
                ←
              </button>
            )}
            {!last ? (
              <button onClick={() => setStep((s) => s + 1)} style={{ flex: 1, padding: "12px 16px", borderRadius: 12, border: "none", fontWeight: 800, cursor: "pointer", background: slide.grad, color: "#fff" }}>
                Next →
              </button>
            ) : (
              <button onClick={finish} style={{ flex: 1, padding: "14px 16px", borderRadius: 12, border: "none", fontWeight: 800, fontSize: "1rem", cursor: "pointer", background: slide.grad, color: "#fff", boxShadow: "0 10px 24px -8px rgba(124,92,252,.6)" }}>
                Let's Climb! 🌋
              </button>
            )}
          </div>

          <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: ".76rem", color: "#8a8474", cursor: "pointer" }}>
            <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} />
            Don't show this again
          </label>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── difficulty select modal ─────────────────────────
// Shown every run (no "don't show again" here — it's a real setup choice,
// not a one-time tutorial), same pattern as DungeonCrawler's DifficultyModal.

function DifficultyModal({ onChoose }) {
  const order = ["easy", "normal", "hard"];
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(6,3,16,.93)", backdropFilter: "blur(2px)", zIndex: 690, display: "flex", alignItems: "center", justifyContent: "center", padding: 18, animation: "filPop .22s ease-out" }}>
      <div style={{ width: "100%", maxWidth: 420, borderRadius: 26, background: "#14102a", boxShadow: "0 40px 90px -20px rgba(0,0,0,.7), 0 0 0 1px rgba(124,92,252,.25)", padding: "26px 24px 22px" }}>
        <div style={{ textAlign: "center", marginBottom: 6 }}>
          <div style={{ fontSize: "2rem" }}>🌋</div>
          <h2 style={{ margin: "6px 0 4px", fontSize: "1.2rem", fontWeight: 800, color: "#fff" }}>Choose Your Heat</h2>
          <p style={{ fontSize: ".8rem", color: "#a09a89", marginBottom: 18 }}>Higher difficulty means less time per question and faster-rising lava — but it pays out way more Coins. Easy is chill, but the reward matches it.</p>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {order.map((key) => {
            const p = DIFFICULTY_PRESETS[key];
            return (
              <button
                key={key}
                onClick={() => onChoose(key)}
                style={{
                  display: "flex", alignItems: "center", gap: 14, textAlign: "left", padding: "14px 16px", borderRadius: 16,
                  border: "1px solid rgba(124,92,252,.22)", background: "#1d1740", cursor: "pointer", color: "#e6e2f5",
                }}
              >
                <div style={{ fontSize: "1.7rem", flexShrink: 0 }}>{p.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 800, fontSize: ".95rem" }}>{p.label}</span>
                    <span style={{
                      fontSize: ".72rem", fontWeight: 800, padding: "3px 9px", borderRadius: 999,
                      background: p.coinMult >= 1.5 ? "linear-gradient(135deg,#eab308,#fde047)" : p.coinMult === 1 ? "linear-gradient(135deg,#7c5cfc,#a78bfa)" : "#332a5c",
                      color: p.coinMult >= 1.5 ? "#3a2c00" : "#fff",
                    }}>
                      🪙 {p.coinMult}×
                    </span>
                  </div>
                  <div style={{ fontSize: ".76rem", color: "#a099c2", marginTop: 3, lineHeight: 1.4 }}>{p.blurb}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
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