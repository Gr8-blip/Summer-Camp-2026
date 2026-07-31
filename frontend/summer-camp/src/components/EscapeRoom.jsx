import { useEffect, useMemo, useRef, useState } from "react";
import { generateWordSearch, matchSelection, straightLine } from "./wordSearchGenerator";
import { buildRoomSequence, bucketFor } from "./roomTemplates";

/**
 * EscapeRoom — a "renderer" for an existing question bank, same contract
 * as DungeonCrawler: hands back `{questionId: response}` via onComplete,
 * exactly what ChallengePlay/QuestPlay already submit. Zero backend
 * awareness of "games" needed.
 *
 * Unlike DungeonCrawler (an open maze you roam), this is a straight line of
 * sealed rooms: solve the checkpoint in front of you, the door unlocks, you
 * step into the next room. No hardcoded story ever lives here — every
 * room's title/description/icon comes from roomTemplates.js, chosen at
 * random per puzzle type when the run starts. Reusing this for a brand new
 * Quest or Challenge means zero changes to this file.
 *
 * Props: { questions, title, onAnswer, onComplete, onExit }
 */

const TYPE_LABEL = {
  multiple_choice: "Multiple Choice", true_false: "True / False", fill_blank: "Fill in the Blank",
  prompt_build: "Prompt Challenge", drag_order: "Put in Order", match_pairs: "Match Pairs",
  memory_tiles: "Memory Tiles", word_search: "Word Search", image_reveal: "Image Reveal",
};

// One accent theme per template "bucket" (roomTemplates.js), not per
// individual room name — keeps this file ignorant of which specific room
// (e.g. "Robot Logs" vs "Memory Bank") is currently showing.
const BUCKET_THEME = {
  memory_tiles: { grad: "linear-gradient(135deg,#3b1f6b,#7c3aed)", glow: "#a78bfa", door: "#a78bfa" },
  drag_order: { grad: "linear-gradient(135deg,#7c2d12,#ea580c)", glow: "#fb923c", door: "#fb923c" },
  match_pairs: { grad: "linear-gradient(135deg,#0f4c5c,#0891b2)", glow: "#22d3ee", door: "#22d3ee" },
  word_search: { grad: "linear-gradient(135deg,#573a12,#b45309)", glow: "#fbbf24", door: "#fbbf24" },
  terminal: { grad: "linear-gradient(135deg,#052e1b,#059669)", glow: "#34d399", door: "#34d399" },
};

function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function shuffledArr(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ───────────────────────── main component ─────────────────────────

export default function EscapeRoom({ questions, title = "Escape Room", onAnswer, onComplete, onExit, timeLeft }) {
  const rooms = useMemo(() => buildRoomSequence(questions), [questions]);

  const [roomIndex, setRoomIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [cleared, setCleared] = useState(() => new Set());
  const [flawless, setFlawless] = useState(true);
  const [doorState, setDoorState] = useState("closed"); // closed | unlocking | open
  const [toast, setToast] = useState("");
  const [showIntro, setShowIntro] = useState(() => {
    try { return localStorage.getItem("er_hide_intro") !== "1"; } catch { return true; }
  });
  const [escaped, setEscaped] = useState(false);
  const startedAt = useRef(Date.now());

  const room = rooms[roomIndex];
  const isFinalRoom = roomIndex === rooms.length - 1;
  const theme = BUCKET_THEME[bucketFor(room.question.question_type)] || BUCKET_THEME.terminal;
  const paused = showIntro || doorState !== "closed" || escaped;

  const say = (msg) => { setToast(msg); setTimeout(() => setToast((t) => (t === msg ? "" : t)), 1900); };

  const resolveRoom = (response, wasCorrect) => {
    const { question } = room;
    setAnswers((a) => ({ ...a, [question.id]: response }));
    onAnswer?.(question.id, response);
    setCleared((s) => new Set(s).add(question.id));

    if (wasCorrect === false) {
      setFlawless(false);
      say("⚡ Not quite — but the door still cracks open.");
    } else {
      say("🔓 Door unlocked!");
    }

    setDoorState("unlocking");
    setTimeout(() => {
      setDoorState("open");
      setTimeout(() => {
        if (isFinalRoom) {
          setEscaped(true);
        } else {
          setRoomIndex((i) => i + 1);
          setDoorState("closed");
        }
      }, 650);
    }, 550);
  };

  useEffect(() => {
    if (!escaped) return;
    const seconds = Math.round((Date.now() - startedAt.current) / 1000);
    const base = rooms.length * 8;
    const speedBonus = Math.max(0, 40 - seconds) > 0 ? Math.round(Math.max(0, 60 - seconds) / 3) : 0;
    const flawlessBonus = flawless ? 12 : 0;
    const coins = Math.min(100, base + speedBonus + flawlessBonus);
    const t = setTimeout(() => onComplete(answers, coins), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escaped]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 300, overflow: "hidden",
        background: `radial-gradient(circle at 50% -10%, ${theme.glow}22, transparent 55%), linear-gradient(180deg,#0a0714,#05040a)`,
        transition: "background 1.1s ease",
      }}
    >
      <style>{`
        @keyframes erFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes erPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.55;transform:scale(.9)} }
        @keyframes erPop { from{transform:scale(.9);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes erShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)} }
        @keyframes erDoorOpenL { from{transform:translateX(0)} to{transform:translateX(-102%)} }
        @keyframes erDoorOpenR { from{transform:translateX(0)} to{transform:translateX(102%)} }
        @keyframes erScan { 0%{transform:translateY(-100%)} 100%{transform:translateY(100%)} }
        @keyframes erSpin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
        @keyframes erGlow { 0%,100%{box-shadow:0 0 18px rgba(52,211,153,.35)} 50%{box-shadow:0 0 34px rgba(52,211,153,.65)} }
        .er-scroll::-webkit-scrollbar { width: 8px; }
        .er-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15); border-radius: 8px; }
      `}</style>

      {/* ambient particles */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.5 }}>
        {Array.from({ length: 14 }).map((_, i) => (
          <span key={i} style={{
            position: "absolute", left: `${(i * 37) % 100}%`, top: `${(i * 53) % 100}%`,
            width: 3, height: 3, borderRadius: "50%", background: theme.glow,
            animation: `erFloat ${2.4 + (i % 5) * 0.4}s ease-in-out infinite`, animationDelay: `${i * 0.2}s`,
            boxShadow: `0 0 6px ${theme.glow}`,
          }} />
        ))}
      </div>

      <TopBar title={title} rooms={rooms} roomIndex={roomIndex} theme={theme} onExit={onExit} timeLeft={timeLeft} />

      {toast && (
        <div style={{
          position: "absolute", top: 86, left: "50%", transform: "translateX(-50%)", zIndex: 60,
          background: "rgba(10,8,20,.9)", border: `1px solid ${theme.glow}55`, color: "#fff",
          fontWeight: 700, fontSize: ".85rem", padding: "9px 18px", borderRadius: 999,
          animation: "erPop .2s ease-out", boxShadow: `0 0 20px ${theme.glow}33`,
        }}>
          {toast}
        </div>
      )}

      <ReadoutStrip room={room} theme={theme} />
      <RoomStage room={room} theme={theme} doorState={doorState} />

      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0, top: "auto", zIndex: 20,
        display: "flex", justifyContent: "center", padding: "0 16px 22px",
      }}>
        <PuzzlePanel key={room.key} room={room} theme={theme} onResolve={resolveRoom} disabled={paused} />
      </div>

      {showIntro && <Briefing onClose={() => setShowIntro(false)} />}
      {escaped && <EscapedScreen rooms={rooms} flawless={flawless} />}
    </div>
  );
}

// ───────────────────────── top bar / progress ─────────────────────────

function TopBar({ title, rooms, roomIndex, theme, onExit, timeLeft }) {
  const hasTimer = typeof timeLeft === "number";
  const low = hasTimer && timeLeft <= 30;
  const critical = hasTimer && timeLeft <= 10;

  return (
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0, zIndex: 50,
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      padding: "16px 20px", background: "linear-gradient(180deg,rgba(5,4,10,.9),rgba(5,4,10,.5) 70%,transparent)",
    }}>
      <div>
        <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#fff", display: "flex", alignItems: "center", gap: 8 }}>
          🚪 {title}
        </div>
        <div style={{ fontSize: ".76rem", color: "#a8a2c0", marginTop: 2 }}>
          Room {roomIndex + 1} of {rooms.length}
        </div>
      </div>

      <div style={{ display: "flex", gap: 5, flex: 1, justifyContent: "center" }}>
        {rooms.map((r, i) => (
          <span key={r.key} style={{
            width: i === roomIndex ? 22 : 9, height: 9, borderRadius: 999,
            background: i < roomIndex ? theme.door : i === roomIndex ? "#fff" : "rgba(255,255,255,.18)",
            transition: "all .25s ease", boxShadow: i === roomIndex ? `0 0 10px ${theme.glow}` : "none",
          }} />
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {hasTimer && (
          <div style={{
            display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 999,
            background: critical ? "rgba(239,68,68,.18)" : low ? "rgba(251,191,36,.16)" : "rgba(255,255,255,.06)",
            border: `1px solid ${critical ? "#ef4444" : low ? "#fbbf24" : "rgba(255,255,255,.18)"}`,
            animation: critical ? "erPulse .7s infinite" : "none",
          }}>
            <span style={{ fontSize: ".95rem" }}>⏱</span>
            <span style={{
              fontWeight: 800, fontSize: ".95rem", fontVariantNumeric: "tabular-nums",
              color: critical ? "#f87171" : low ? "#fbbf24" : "#fff",
            }}>
              {formatClock(timeLeft)}
            </span>
          </div>
        )}

        {onExit && (
          <button onClick={onExit} style={{
            border: "1px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.06)", color: "#e6e2f5",
            cursor: "pointer", fontSize: ".78rem", fontWeight: 700, borderRadius: 999, padding: "7px 14px",
          }}>
            Exit ✕
          </button>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── HUD readout strip ─────────────────────────
// The room icon/title/description used to live in a big flat card, which
// read like a slide deck. Now it's a slim terminal-style readout under the
// top bar — a HUD overlay, not the scene itself — so the actual room below
// can be a real space instead of a slide.

function ReadoutStrip({ room, theme }) {
  const { template, question } = room;
  return (
    <div style={{
      position: "absolute", top: 74, left: "50%", transform: "translateX(-50%)", zIndex: 45,
      width: "min(92vw, 620px)", display: "flex", alignItems: "center", gap: 12,
      padding: "10px 16px", borderRadius: 14, background: "rgba(8,7,16,.72)", backdropFilter: "blur(6px)",
      border: `1px solid ${theme.glow}40`, boxShadow: `0 10px 30px -14px ${theme.glow}55`,
    }}>
      <span style={{ fontSize: "1.5rem", flexShrink: 0, filter: `drop-shadow(0 0 8px ${theme.glow}aa)` }}>{template.icon}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 800, fontSize: ".92rem", color: "#fff" }}>{template.title}</span>
          <span style={{ fontSize: ".62rem", fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: theme.glow }}>
            {TYPE_LABEL[question.question_type] || "Trial"}
          </span>
        </div>
        <p style={{ margin: "2px 0 0", fontSize: ".76rem", lineHeight: 1.4, color: "#b9b4d0", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {template.description}
        </p>
      </div>
    </div>
  );
}

// ───────────────────────── the room itself ─────────────────────────
// A real one-point-perspective space, not a card: floor, ceiling, and side
// walls converge toward a back wall with a door in it. The door visibly
// locks/unlocks/slides open. This component has no idea what a "Robot Logs"
// room is versus an "AI Console" room — it only reads `room.template.icon`
// for the light fixture glow and renders whatever it's handed.

const WALL_TOP = 26, WALL_BOTTOM = 58, WALL_LEFT = 36, WALL_RIGHT = 64;

function RoomStage({ room, theme, doorState }) {
  const { template } = room;
  return (
    <div style={{ position: "absolute", top: 60, left: 0, right: 0, bottom: 0, overflow: "hidden", zIndex: 10 }}>
      {/* ceiling */}
      <div style={{
        position: "absolute", inset: 0,
        clipPath: `polygon(0% 0%, 100% 0%, ${WALL_RIGHT}% ${WALL_TOP}%, ${WALL_LEFT}% ${WALL_TOP}%)`,
        background: theme.grad, filter: "brightness(1.35) saturate(.7)",
      }} />
      {/* floor */}
      <div style={{
        position: "absolute", inset: 0,
        clipPath: `polygon(0% 100%, 100% 100%, ${WALL_RIGHT}% ${WALL_BOTTOM}%, ${WALL_LEFT}% ${WALL_BOTTOM}%)`,
        background: theme.grad, filter: "brightness(.4) saturate(.8)",
      }} />
      {/* left wall */}
      <div style={{
        position: "absolute", inset: 0,
        clipPath: `polygon(0% 0%, ${WALL_LEFT}% ${WALL_TOP}%, ${WALL_LEFT}% ${WALL_BOTTOM}%, 0% 100%)`,
        background: theme.grad, filter: "brightness(.7)",
      }} />
      {/* right wall */}
      <div style={{
        position: "absolute", inset: 0,
        clipPath: `polygon(100% 0%, ${WALL_RIGHT}% ${WALL_TOP}%, ${WALL_RIGHT}% ${WALL_BOTTOM}%, 100% 100%)`,
        background: theme.grad, filter: "brightness(.85)",
      }} />

      {/* light rays from the vanishing point, drawn on top of every plane */}
      <div style={{
        position: "absolute", inset: 0, mixBlendMode: "overlay", opacity: 0.55,
        background: `conic-gradient(from 0deg at 50% ${((WALL_TOP + WALL_BOTTOM) / 2)}%, rgba(255,255,255,.5) 0deg 1.2deg, transparent 1.2deg 9deg)`,
      }} />
      {/* vignette so the edges fall into shadow like a real enclosed room */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 45%, transparent 30%, rgba(0,0,0,.55) 85%)" }} />
      <div style={{ position: "absolute", inset: 0, boxShadow: "inset 0 0 140px 40px rgba(0,0,0,.6)" }} />

      {/* back wall + door, sitting at the vanishing rectangle */}
      <div style={{
        position: "absolute",
        left: `${WALL_LEFT}%`, top: `${WALL_TOP}%`, width: `${WALL_RIGHT - WALL_LEFT}%`, height: `${WALL_BOTTOM - WALL_TOP}%`,
        borderRadius: 3, overflow: "hidden", boxShadow: `0 0 40px ${theme.glow}55, inset 0 0 30px rgba(0,0,0,.5)`,
      }}>
        <div style={{ position: "absolute", inset: 0, background: "#0b0914" }} />
        <div style={{ position: "absolute", left: "12%", top: "6%", width: "76%", height: "88%", overflow: "hidden" }}>
          <div style={{
            position: "absolute", left: 0, top: 0, width: "50%", height: "100%",
            background: "linear-gradient(135deg,#221c3a,#0e0c1c)", borderRight: `2px solid ${theme.door}`,
            animation: doorState !== "closed" ? "erDoorOpenL .6s ease forwards" : "none",
          }} />
          <div style={{
            position: "absolute", right: 0, top: 0, width: "50%", height: "100%",
            background: "linear-gradient(225deg,#221c3a,#0e0c1c)", borderLeft: `2px solid ${theme.door}`,
            animation: doorState !== "closed" ? "erDoorOpenR .6s ease forwards" : "none",
          }} />
        </div>
        {/* light spilling through once open */}
        <div style={{
          position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 50%, ${theme.glow}66, transparent 70%)`,
          opacity: doorState === "open" ? 1 : 0, transition: "opacity .4s ease",
        }} />
        <div style={{
          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
          fontSize: "1.5rem", zIndex: 3, opacity: doorState === "open" ? 0 : 1, transition: "opacity .3s ease",
          animation: doorState === "closed" ? "erPulse 1.6s infinite" : "none",
        }}>
          {doorState === "closed" ? "🔒" : "🔓"}
        </div>
      </div>

      {/* a fixture glowing overhead, themed to the current room */}
      <div style={{
        position: "absolute", left: "50%", top: `${WALL_TOP - 6}%`, transform: "translateX(-50%)",
        fontSize: "1.6rem", filter: `drop-shadow(0 0 16px ${theme.glow})`, animation: "erFloat 2.8s ease-in-out infinite",
      }}>
        {template.icon}
      </div>
    </div>
  );
}

// ───────────────────────── briefing (intro) ─────────────────────────

const BRIEFING_SLIDES = [
  { icon: "🚪", title: "You're Locked In", body: "A chain of sealed rooms stands between you and the exit. Clear the checkpoint in each room to unlock the door and move forward." },
  { icon: "🧠", title: "Solve to Progress", body: "Every room hides a quick challenge — pulled straight from what you've been learning. Solve it, and the door unlocks." },
  { icon: "🏁", title: "Reach the Exit", body: "Clear every room in the chain, and the final door opens. Escape!" },
];

function Briefing({ onClose }) {
  const [step, setStep] = useState(0);
  const [dontShow, setDontShow] = useState(false);
  const last = step === BRIEFING_SLIDES.length - 1;
  const slide = BRIEFING_SLIDES[step];

  const finish = () => {
    if (dontShow) { try { localStorage.setItem("er_hide_intro", "1"); } catch { /* ignore */ } }
    onClose();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(5,4,10,.94)", backdropFilter: "blur(2px)", zIndex: 700,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 18, animation: "erPop .22s ease-out",
    }}>
      <button onClick={finish} style={{
        position: "absolute", top: 22, right: 22, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.18)",
        color: "#e6e2f5", borderRadius: 999, padding: "8px 16px", fontSize: ".76rem", fontWeight: 700, cursor: "pointer",
      }}>
        Skip ✕
      </button>

      <div style={{ width: "100%", maxWidth: 400, borderRadius: 26, overflow: "hidden", background: "#0c0f0e", boxShadow: "0 40px 90px -20px rgba(0,0,0,.7), 0 0 0 1px rgba(52,211,153,.25)" }}>
        <div key={step} style={{ background: "linear-gradient(135deg,#052e1b,#059669)", padding: "40px 24px 30px", textAlign: "center", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 0%, rgba(255,255,255,.25), transparent 60%)" }} />
          <div style={{ fontSize: "3.4rem", animation: "erFloat 1.6s ease-in-out infinite", filter: "drop-shadow(0 0 16px rgba(255,255,255,.55))", position: "relative" }}>
            {slide.icon}
          </div>
        </div>

        <div style={{ padding: "22px 26px 22px", color: "#e6e2f5" }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "1.18rem", fontWeight: 800 }}>{slide.title}</h2>
          <p style={{ fontSize: ".92rem", lineHeight: 1.55, color: "#c9c4e0", marginBottom: 20, minHeight: 66 }}>{slide.body}</p>

          <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 18 }}>
            {BRIEFING_SLIDES.map((_, i) => (
              <span key={i} style={{ width: i === step ? 20 : 7, height: 7, borderRadius: 999, background: i === step ? "#34d399" : "#243d33", transition: "all .25s ease" }} />
            ))}
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            {step > 0 && (
              <button onClick={() => setStep((s) => s - 1)} style={{ padding: "12px 16px", borderRadius: 12, border: "1px solid #243d33", background: "transparent", color: "#e6e2f5", fontWeight: 700, cursor: "pointer" }}>←</button>
            )}
            {!last ? (
              <button onClick={() => setStep((s) => s + 1)} style={{ flex: 1, padding: "12px 16px", borderRadius: 12, border: "none", fontWeight: 800, cursor: "pointer", background: "linear-gradient(135deg,#059669,#34d399)", color: "#fff" }}>Next →</button>
            ) : (
              <button onClick={finish} style={{ flex: 1, padding: "14px 16px", borderRadius: 12, border: "none", fontWeight: 800, fontSize: "1rem", cursor: "pointer", background: "linear-gradient(135deg,#059669,#34d399)", color: "#fff", boxShadow: "0 10px 24px -8px rgba(52,211,153,.6)" }}>Enter the Rooms 🚪</button>
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

// ───────────────────────── escaped screen ─────────────────────────

function EscapedScreen({ rooms, flawless }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(5,4,10,.92)", zIndex: 690,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      animation: "erPop .3s ease-out",
    }}>
      <div style={{ textAlign: "center", color: "#fff", maxWidth: 380 }}>
        <div style={{ fontSize: "3.6rem", marginBottom: 6, animation: "erFloat 1.8s ease-in-out infinite" }}>🏁</div>
        <h2 style={{ margin: "6px 0 8px", fontSize: "1.5rem", fontWeight: 800 }}>You Escaped!</h2>
        <p style={{ color: "#a8a2c0", marginBottom: 4 }}>
          Cleared all {rooms.length} room{rooms.length === 1 ? "" : "s"}{flawless ? " — flawlessly! ⚡" : "."}
        </p>
        <p style={{ color: "#75708f", fontSize: ".85rem" }}>Submitting your run…</p>
      </div>
    </div>
  );
}

// ───────────────────────── puzzle panel ─────────────────────────
// Floats over the bottom of the room stage. Same mechanical contract as
// every other puzzle renderer in the app: onResolve(response, wasCorrect).
// wasCorrect is `undefined` for types the client can't safely verify
// (answer key is stripped for students) — those just resolve as cleared;
// the real check happens server-side on submit, same as the classic flow.

function PuzzlePanel({ room, theme, onResolve, disabled }) {
  const { question } = room;
  const content = question.content || {};
  const type = question.question_type;

  return (
    <div style={{
      position: "relative", width: "min(94vw, 640px)", maxHeight: "48vh", overflowY: "auto",
      borderRadius: 24, background: "rgba(12,10,22,.92)", backdropFilter: "blur(10px)",
      border: `1px solid ${theme.glow}33`, boxShadow: `0 30px 70px -25px rgba(0,0,0,.65), 0 0 0 1px rgba(255,255,255,.03) inset`,
      padding: "0 24px 24px", color: "#e6e2f5", pointerEvents: disabled ? "none" : "auto",
      opacity: disabled ? 0.6 : 1, transition: "opacity .2s ease",
    }} className="er-scroll">
      <div style={{
        display: "flex", alignItems: "center", gap: 8, margin: "0 -24px 18px", padding: "12px 24px",
        borderBottom: `1px solid ${theme.glow}30`, background: "rgba(255,255,255,.02)",
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%", background: theme.glow, boxShadow: `0 0 8px ${theme.glow}`,
          animation: disabled ? "none" : "erPulse 1.4s infinite",
        }} />
        <span style={{ fontSize: ".68rem", fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: theme.glow }}>
          Checkpoint Terminal
        </span>
      </div>
      {type === "multiple_choice" && (
        <ChoiceBody prompt={content.question} options={content.options || []} onPick={(i) => onResolve(i, undefined)} theme={theme} />
      )}
      {type === "true_false" && (
        <ChoiceBody prompt={content.question} options={["True", "False"]} onPick={(i) => onResolve(i === 0, undefined)} theme={theme} />
      )}
      {type === "fill_blank" && (
        <TextBody prompt={content.question} placeholder="Type your answer..." onSubmit={(v) => onResolve(v, undefined)} theme={theme} />
      )}
      {type === "prompt_build" && (
        <TextBody prompt={content.task} placeholder="Write your prompt..." multiline onSubmit={(v) => onResolve(v, undefined)} theme={theme} />
      )}
      {type === "image_reveal" && (
        <TextBody prompt={content.question} placeholder="Your guess..." onSubmit={(v) => onResolve(v, undefined)} theme={theme} />
      )}
      {type === "match_pairs" && (
        <MatchPairsBody content={content} onSubmit={(v) => onResolve(v, undefined)} theme={theme} />
      )}
      {type === "drag_order" && (
        <DragOrderBody content={content} onResolve={onResolve} theme={theme} />
      )}
      {type === "memory_tiles" && (
        <MemoryTilesBody content={content} onResolve={onResolve} theme={theme} />
      )}
      {type === "word_search" && (
        <WordSearchBody content={content} onResolve={onResolve} theme={theme} />
      )}
      {!TYPE_LABEL[type] && (
        <TextBody prompt="Complete this activity" placeholder="..." onSubmit={(v) => onResolve(v, undefined)} theme={theme} />
      )}
    </div>
  );
}

const inputStyle = { width: "100%", borderRadius: 13, padding: "13px 15px", border: "1px solid #2c2a3c", background: "#181624", color: "#fff", marginBottom: 16, fontSize: ".95rem", boxSizing: "border-box" };
function submitBtnStyle(theme, enabled) {
  return { width: "100%", padding: "14px 16px", borderRadius: 13, border: "none", fontWeight: 800, fontSize: ".92rem", cursor: enabled ? "pointer" : "default", background: theme.grad, color: "#fff", opacity: enabled ? 1 : 0.4, boxShadow: enabled ? `0 8px 22px -8px ${theme.glow}88` : "none", transition: "opacity .15s ease" };
}

function ChoiceBody({ prompt, options, onPick, theme }) {
  return (
    <>
      {prompt && <p style={{ fontWeight: 700, marginBottom: 16, fontSize: "1rem", lineHeight: 1.45 }}>{prompt}</p>}
      <div style={{ display: "grid", gap: 9 }}>
        {options.map((o, i) => (
          <button key={i} onClick={() => onPick(i)} style={{
            padding: "13px 16px", borderRadius: 13, border: "1px solid #2c2a3c", background: "#181624", color: "#e6e2f5",
            fontWeight: 600, cursor: "pointer", textAlign: "left", fontSize: ".9rem", touchAction: "manipulation",
            transition: "border-color .15s ease",
          }}>
            {o}
          </button>
        ))}
      </div>
    </>
  );
}

function TextBody({ prompt, placeholder, multiline, onSubmit, theme }) {
  const [val, setVal] = useState("");
  return (
    <>
      {prompt && <p style={{ fontWeight: 700, marginBottom: 14, fontSize: "1rem", lineHeight: 1.4 }}>{prompt}</p>}
      {multiline ? (
        <textarea value={val} onChange={(e) => setVal(e.target.value)} placeholder={placeholder} rows={3} style={inputStyle} />
      ) : (
        <input value={val} onChange={(e) => setVal(e.target.value)} placeholder={placeholder} onKeyDown={(e) => e.key === "Enter" && val.trim() && onSubmit(val)} style={inputStyle} />
      )}
      <button disabled={!val.trim()} onClick={() => onSubmit(val)} style={submitBtnStyle(theme, !!val.trim())}>Unlock Door</button>
    </>
  );
}

function MatchPairsBody({ content, onSubmit, theme }) {
  // The serializer normally ships `content.left` / `content.right` (derived
  // server-side from `content.pairs`). If a question was ever authored
  // with pairs stored under a different key, left/right can come back
  // empty — fall back to deriving them straight from `content.pairs` (or
  // `content.answer`, same fallback scoring.py uses) so this never just
  // silently renders nothing.
  const derived = useMemo(() => {
    if (content.left?.length && content.right?.length) {
      return { left: content.left, right: content.right };
    }
    const pairs = content.pairs || content.answer || {};
    return { left: Object.keys(pairs), right: Object.values(pairs) };
  }, [content]);

  const left = derived.left;
  const rightPool = useMemo(() => shuffledArr(derived.right), [derived]);
  const [matches, setMatches] = useState({});
  const [selRight, setSelRight] = useState(null);
  const used = new Set(Object.values(matches));

  if (!left.length) {
    return (
      <p style={{ color: "#f87171", fontSize: ".85rem", fontWeight: 600 }}>
        ⚠️ This checkpoint's match-pairs data looks empty — check the question's content in the admin builder.
      </p>
    );
  }

  const assign = (l, i) => setMatches((m) => ({ ...m, [l]: i }));
  const unassign = (l) => setMatches((m) => { const n = { ...m }; delete n[l]; return n; });

  return (
    <>
      {content.question && <p style={{ fontWeight: 700, marginBottom: 14, fontSize: "1rem", lineHeight: 1.45 }}>{content.question}</p>}
      <p style={{ fontSize: ".72rem", color: "#8a8474", marginBottom: 10 }}>Tap a right-hand item, then tap its match on the left.</p>
      <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
        <div style={{ flex: 1, display: "grid", gap: 8 }}>
          {left.map((l) => {
            const matchedIdx = matches[l];
            return (
              <div key={l} onClick={() => { if (matchedIdx == null && selRight != null) { assign(l, selRight); setSelRight(null); } }} style={{
                padding: "10px 11px", borderRadius: 11, fontSize: ".8rem",
                border: matchedIdx != null ? `2px solid ${theme.glow}` : "1px solid #2c2a3c",
                background: "#181624", color: "#fff", cursor: matchedIdx == null && selRight != null ? "pointer" : "default",
                display: "flex", flexDirection: "column", gap: 3,
              }}>
                <strong>{l}</strong>
                {matchedIdx != null && (
                  <span style={{ display: "flex", justifyContent: "space-between", fontSize: ".74rem", color: theme.glow }}>
                    ↔ {rightPool[matchedIdx]}
                    <button onClick={(e) => { e.stopPropagation(); unassign(l); }} style={{ border: "none", background: "none", cursor: "pointer", color: "#f87171", fontSize: ".82rem" }}>✕</button>
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ flex: 1, display: "grid", gap: 8 }}>
          {rightPool.map((r, i) => (
            <button key={i} disabled={used.has(i)} onClick={() => setSelRight(i)} style={{
              padding: "10px 11px", borderRadius: 11, fontSize: ".8rem",
              border: selRight === i ? `2px solid ${theme.glow}` : "1px solid #2c2a3c",
              background: used.has(i) ? "#100e1a" : "#181624", color: "#fff",
              opacity: used.has(i) ? 0.35 : 1, cursor: used.has(i) ? "default" : "pointer",
            }}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <button disabled={Object.keys(matches).length < left.length} onClick={() => onSubmit(Object.fromEntries(Object.entries(matches).map(([l, i]) => [l, rightPool[i]])))} style={submitBtnStyle(theme, Object.keys(matches).length >= left.length)}>
        Unlock Door
      </button>
    </>
  );
}

function DragOrderBody({ content, onResolve, theme }) {
  const correctOrder = content.items || [];
  const [order, setOrder] = useState(() => shuffledArr(correctOrder));
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const dragging = useRef(false);

  const move = (from, to) => {
    if (from == null || to == null || from === to) return;
    setOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  // Pointer Events, not HTML5 drag/drop — dragstart/dragover/drop don't
  // fire reliably on touchscreens, which is what was actually breaking
  // dragging here. Pointer events work the same for mouse, touch, and pen.
  const rowIndexFromPoint = (x, y) => {
    const el = document.elementFromPoint(x, y);
    const row = el && el.closest ? el.closest("[data-drag-index]") : null;
    return row ? Number(row.dataset.dragIndex) : null;
  };
  const onPointerDown = (e, i) => {
    dragging.current = true;
    setDragIndex(i);
    setOverIndex(i);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragging.current) return;
    const idx = rowIndexFromPoint(e.clientX, e.clientY);
    if (idx != null) setOverIndex(idx);
  };
  const endDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    move(dragIndex, overIndex);
    setDragIndex(null);
    setOverIndex(null);
  };

  const nudge = (i, dir) => {
    const target = i + dir;
    if (target < 0 || target >= order.length) return;
    move(i, target);
  };

  const submit = () => {
    const correct = order.length === correctOrder.length && order.every((v, i) => v === correctOrder[i]);
    onResolve(order, correct);
  };

  return (
    <>
      {content.question && <p style={{ fontWeight: 700, marginBottom: 12, fontSize: "1rem", lineHeight: 1.4 }}>{content.question}</p>}
      <p style={{ fontSize: ".72rem", color: "#8a8474", marginBottom: 10 }}>Drag the cards (or use the arrows) into the correct order:</p>
      <div onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {order.map((item, i) => (
          <div
            key={item + i}
            data-drag-index={i}
            onPointerDown={(e) => onPointerDown(e, i)}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderRadius: 12,
              border: overIndex === i && dragIndex !== null && dragIndex !== i ? `2px solid ${theme.glow}` : "1px solid #2c2a3c",
              background: dragIndex === i ? "#242237" : "#181624", opacity: dragIndex === i ? 0.55 : 1,
              transition: "opacity .12s ease, border-color .12s ease, background .12s ease",
              cursor: "grab", touchAction: "none",
            }}
          >
            <span style={{ width: 24, height: 24, borderRadius: "50%", background: theme.grad, color: "#fff", fontSize: ".72rem", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, pointerEvents: "none" }}>{i + 1}</span>
            <span style={{ flex: 1, fontWeight: 600, fontSize: ".86rem", pointerEvents: "none", userSelect: "none" }}>{item}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
              <button onPointerDown={(e) => e.stopPropagation()} onClick={() => nudge(i, -1)} disabled={i === 0} style={{ width: 24, height: 18, borderRadius: 5, border: "none", background: "#242237", color: "#e6e2f5", fontSize: ".55rem", cursor: i === 0 ? "default" : "pointer", opacity: i === 0 ? 0.25 : 0.85 }}>▲</button>
              <button onPointerDown={(e) => e.stopPropagation()} onClick={() => nudge(i, 1)} disabled={i === order.length - 1} style={{ width: 24, height: 18, borderRadius: 5, border: "none", background: "#242237", color: "#e6e2f5", fontSize: ".55rem", cursor: i === order.length - 1 ? "default" : "pointer", opacity: i === order.length - 1 ? 0.25 : 0.85 }}>▼</button>
            </div>
          </div>
        ))}
      </div>
      <button onClick={submit} style={submitBtnStyle(theme, true)}>Unlock Door</button>
    </>
  );
}

function MemoryTilesBody({ content, onResolve, theme }) {
  const pairs = content.pairs || [];
  const tiles = useMemo(() => shuffledArr(pairs.flatMap(([a, b], i) => [{ id: `${i}a`, pairId: i, label: a }, { id: `${i}b`, pairId: i, label: b }])), []); // eslint-disable-line
  const [flipped, setFlipped] = useState([]);
  const [matched, setMatched] = useState(new Set());
  const [wrong, setWrong] = useState([]);
  const resolvedRef = useRef(false);

  const flip = (tile) => {
    if (matched.has(tile.pairId) || flipped.some((t) => t.id === tile.id) || flipped.length === 2) return;
    const next = [...flipped, tile];
    setFlipped(next);
    if (next.length === 2) {
      const [a, b] = next;
      if (a.pairId === b.pairId) {
        setTimeout(() => {
          // Just update state here — no side effects. State updaters can
          // legitimately run more than once (React Strict Mode invokes
          // them twice in dev specifically to catch this), so calling
          // onResolve from in here was firing the room-advance logic
          // TWICE on the last pair, skipping the room right after this one.
          setMatched((prev) => new Set(prev).add(a.pairId));
          setFlipped([]);
        }, 300);
      } else {
        setWrong([a.id, b.id]);
        setTimeout(() => { setFlipped([]); setWrong([]); }, 650);
      }
    }
  };

  // The ONE place completion is detected and resolved — driven by state,
  // guarded by a ref so it's physically impossible to fire more than once
  // per mount, no matter how many times this effect re-runs.
  useEffect(() => {
    if (pairs.length > 0 && matched.size === pairs.length && !resolvedRef.current) {
      resolvedRef.current = true;
      const t = setTimeout(() => onResolve({ completed: true }, true), 300);
      return () => clearTimeout(t);
    }
  }, [matched, pairs.length, onResolve]);

  return (
    <>
      <p style={{ fontSize: ".76rem", color: "#8a8474", marginBottom: 12 }}>{matched.size}/{pairs.length} pairs found</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
        {tiles.map((t) => {
          const isMatched = matched.has(t.pairId);
          const isFlipped = isMatched || flipped.some((f) => f.id === t.id);
          const isWrong = wrong.includes(t.id);
          return (
            <button key={t.id} onClick={() => flip(t)} disabled={isMatched} style={{
              aspectRatio: "1", borderRadius: 10, border: "none", fontWeight: 800, fontSize: ".72rem",
              background: isFlipped ? theme.grad : "#181624", color: isFlipped ? "#fff" : "transparent",
              animation: isWrong ? "erShake .35s" : "none", cursor: isMatched ? "default" : "pointer", touchAction: "manipulation",
            }}>
              {isFlipped ? t.label : "❓"}
            </button>
          );
        })}
      </div>
    </>
  );
}

function WordSearchBody({ content, onResolve, theme }) {
  const puzzle = useMemo(() => generateWordSearch(content.words || []), []); // eslint-disable-line
  const [found, setFound] = useState(new Set());
  const [foundCells, setFoundCells] = useState(new Set());
  const [selStart, setSelStart] = useState(null);
  const [selCells, setSelCells] = useState([]);
  const selecting = useRef(false);
  const cellKey = (r, c) => `${r}:${c}`;
  const wordList = content.words || [...new Set(puzzle.placements.map((p) => p.word))];

  const begin = (r, c) => { selecting.current = true; setSelStart([r, c]); setSelCells([[r, c]]); };
  const extend = (r, c) => { if (!selecting.current || !selStart) return; const l = straightLine(selStart, [r, c]); if (l) setSelCells(l); };
  const end = () => {
    if (!selecting.current) return;
    selecting.current = false;
    const match = matchSelection(selCells, puzzle.placements);
    if (match && !found.has(match.word)) {
      const nf = new Set(found).add(match.word);
      setFound(nf);
      setFoundCells((prev) => { const n = new Set(prev); match.cells.forEach(([r, c]) => n.add(cellKey(r, c))); return n; });
      if (nf.size === puzzle.words.length) setTimeout(() => onResolve([...nf], true), 250);
    }
    setSelCells([]); setSelStart(null);
  };
  const cellFromTouch = (touch) => {
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!el || !el.dataset || el.dataset.row === undefined) return null;
    return [Number(el.dataset.row), Number(el.dataset.col)];
  };

  return (
    <>
      <p style={{ fontSize: ".76rem", color: "#8a8474", marginBottom: 10 }}>{found.size}/{puzzle.words.length} words found — drag across letters</p>
      <div onMouseUp={end} onTouchEnd={end} style={{ display: "grid", gridTemplateColumns: `repeat(${puzzle.size}, 1fr)`, gap: 3, userSelect: "none", touchAction: "none", margin: "0 auto 14px", maxWidth: 320 }}>
        {puzzle.grid.map((row, r) => row.map((letter, c) => {
          const k = cellKey(r, c);
          const isFound = foundCells.has(k);
          const isSel = selCells.some(([sr, sc]) => sr === r && sc === c);
          return (
            <div key={k} data-row={r} data-col={c}
              onMouseDown={() => begin(r, c)} onMouseEnter={() => extend(r, c)}
              onTouchStart={(e) => { const cell = cellFromTouch(e.touches[0]); if (cell) begin(...cell); }}
              onTouchMove={(e) => { const cell = cellFromTouch(e.touches[0]); if (cell) extend(...cell); }}
              style={{
                aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".68rem", fontWeight: 800,
                borderRadius: 6, cursor: "pointer", border: "1px solid #201d30",
                background: isFound ? theme.grad : isSel ? "#3a3454" : "#181624", color: "#fff",
              }}
            >
              {letter}
            </div>
          );
        }))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, justifyContent: "center" }}>
        {wordList.map((word) => (
          <span key={word} style={{
            fontWeight: 700, fontSize: ".7rem", padding: "5px 11px", borderRadius: 999,
            background: found.has(word) ? theme.grad : "#181624", color: found.has(word) ? "#fff" : "#a09a89",
            textDecoration: found.has(word) ? "line-through" : "none",
          }}>
            {word}
          </span>
        ))}
      </div>
    </>
  );
}