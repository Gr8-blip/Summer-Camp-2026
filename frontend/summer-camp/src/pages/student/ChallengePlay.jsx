import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getChallenge,
  getChallengeLeaderboard,
  startChallenge,
  submitChallenge,
} from "../../api/client";
import StudentLayout from "./StudentLayout";
import VictoryEffect from "../../components/VictoryEffect";
import { generateWordSearch, matchSelection, straightLine } from "../../components/wordSearchGenerator";
import DungeonCrawler from "../../components/Dungeoncrawler";
import EscapeRoom from "../../components/EscapeRoom";
import FloorIsLava from "../../components/Floorislava";
import Avatar from "../../components/Avatar";
import CodingPlayground from "../../components/CodingPlayGround";
import CodingChallengePlayground from "../../components/Codingchallengeplayground";
import "./challenge.css";

// Maps a Challenge's `game_type` to the component that renders it.
// "classic" (and anything not yet built) falls through to the existing
// question-list flow below — nothing breaks for old content or games
// still in progress.
const GAME_COMPONENTS = {
  dungeon_crawler: DungeonCrawler,
  floor_is_lava: FloorIsLava,
  escape_room: EscapeRoom,
};

const seconds = (value) =>
  `${String(Math.max(0, Math.floor(value / 60))).padStart(2, "0")}:${String(
    Math.max(0, value % 60)
  ).padStart(2, "0")}`;

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── tiny celebration primitives (no external libs) ──────────────────
const CONFETTI_COLORS = ["#7c5cfc", "#14b8a6", "#f59e0b", "#ec4899", "#3b82f6", "#f43f5e"];

function Confetti({ burstKey }) {
  const pieces = useMemo(
    () => Array.from({ length: 26 }, (_, i) => ({
      id: `${burstKey}-${i}`,
      left: Math.random() * 100,
      delay: Math.random() * 0.15,
      duration: 0.9 + Math.random() * 0.6,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      rotate: Math.random() * 360,
    })),
    [burstKey]
  );
  if (!burstKey) return null;
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 400, overflow: "hidden" }}>
      {pieces.map((p) => (
        <span
          key={p.id}
          style={{
            position: "absolute", top: -20, left: `${p.left}%`,
            width: 9, height: 14, background: p.color, borderRadius: 2,
            transform: `rotate(${p.rotate}deg)`,
            animation: `cpFall ${p.duration}s ease-in ${p.delay}s forwards`,
          }}
        />
      ))}
    </div>
  );
}

function XPPopup({ amount }) {
  if (!amount) return null;
  return (
    <div
      style={{
        position: "fixed", top: 90, left: "50%", transform: "translateX(-50%)",
        zIndex: 401, background: "linear-gradient(135deg,#7c5cfc,#a78bfa)", color: "white",
        fontWeight: 800, fontSize: "1rem", padding: "10px 22px", borderRadius: 999,
        boxShadow: "0 10px 24px -8px rgba(124,92,252,.6)", animation: "xpPop 1.1s ease-out forwards",
      }}
    >
      +{amount} XP ✨
    </div>
  );
}


function StatPill({ value, label, accent }) {
  return (
    <div style={{
      background: "var(--color-purple-soft)", borderRadius: 16, padding: "14px 8px", textAlign: "center",
      border: `1px solid ${accent}33`, boxShadow: `inset 0 0 0 1px rgba(255,255,255,.04)`,
    }}>
      <div style={{ fontSize: "1.15rem", fontWeight: 800, color: accent }}>{value}</div>
      <div style={{ fontSize: ".66rem", fontWeight: 700, color: "var(--color-text-soft)", marginTop: 3, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
    </div>
  );
}

const GAME_KEYFRAMES = `
@keyframes cpFall { to { top: 110vh; opacity: 0; } }
@keyframes xpPop { 0% { opacity:0; transform: translateX(-50%) translateY(10px) scale(.8); } 15% { opacity:1; transform: translateX(-50%) translateY(0) scale(1); } 80% { opacity:1; } 100% { opacity:0; transform: translateX(-50%) translateY(-16px) scale(.95); } }
@keyframes fadeSlideIn { from { opacity:0; transform: translateY(8px);} to { opacity:1; transform: translateY(0);} }
@keyframes tileMatchPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(20,184,166,.5); } 50% { box-shadow: 0 0 0 8px rgba(20,184,166,0); } }
@keyframes tileWrongShake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
`;

export default function ChallengePlay() {
  const { id } = useParams();
  const navigate = useNavigate();
  const STORAGE_KEY = `challenge-progress-${id}`;

  const [challenge, setChallenge] = useState(null);
  const [step, setStep] = useState("intro");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [left, setLeft] = useState(0);
  const [result, setResult] = useState(null);
  const [board, setBoard] = useState({ results: [], is_finalized: false, champion_id: null, champion_name: null });
  const [error, setError] = useState("");
  const [confettiKey, setConfettiKey] = useState(0);
  const [victoryEffectKey, setVictoryEffectKey] = useState(null);
  const [pendingDoneData, setPendingDoneData] = useState(null);
  const [xpFlash, setXpFlash] = useState(0);
  const [coinsWon, setCoinsWon] = useState(0);
  // Guards the timeout-triggered auto-finish below so it can only ever
  // fire once per game session — without this, a failed submit that
  // bounces step back to "game" while left is still <= 0 would re-trigger
  // finish() on every re-render, POSTing /submit/ in an infinite loop.
  const autoFinishedRef = useRef(false);

  const celebrate = (xp = 5) => {
    setConfettiKey((k) => k + 1);
    setXpFlash(xp);
    setTimeout(() => setXpFlash(0), 1100);
  };

  useEffect(() => {
    getChallenge(id)
      .then((c) => {
        setChallenge(c);
        if (c.completed) {
          setStep("done");
          localStorage.removeItem(STORAGE_KEY);
          return;
        }

        // Resume in-progress answers after a refresh, instead of forcing
        // the student to start over from question 1. `startedAt` lets us
        // recompute remaining time accurately (the backend independently
        // caps real elapsed time at time_limit anyway, so this can't be
        // gamed by clearing/editing localStorage — it just affects the
        // client-side display).
        try {
          const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
          if (saved && saved.startedAt) {
            const elapsed = Math.floor((Date.now() - saved.startedAt) / 1000);
            const remaining = Math.max(c.time_limit - elapsed, 0);
            // A remaining time of 0 means this saved session already expired
            // (e.g. left the tab open for days, or the attempt was reset
            // server-side) — resuming straight into "game" here would skip
            // startChallenge() entirely, since begin() is what normally
            // creates the attempt. Treat it as stale instead: clear it and
            // fall through to the ordinary intro screen so the student has
            // to press "Enter Challenge" and a real attempt gets created.
            if (remaining <= 0) {
              localStorage.removeItem(STORAGE_KEY);
            } else {
              setAnswers(saved.answers || {});
              setIndex(saved.index || 0);
              setLeft(remaining);
              setStep("game");
              return;
            }
          }
        } catch {
          localStorage.removeItem(STORAGE_KEY);
        }

        setLeft(c.time_limit);
      })
      .catch(() => setError("This challenge is unavailable."));
  }, [id]);

  // Persist progress on every change while actively playing, so a refresh
  // (or accidental tab close) doesn't wipe out answered questions.
  useEffect(() => {
    if (step !== "game") return;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || {}; } catch { }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...saved,
      answers,
      index,
      startedAt: saved.startedAt || Date.now(),
    }));
  }, [answers, index, step]);

  useEffect(() => {
    if (step !== "game") return;
    if (left <= 0) {
      if (!autoFinishedRef.current) {
        autoFinishedRef.current = true;
        finish();
      }
      return;
    }
    const t = setInterval(() => setLeft((n) => n - 1), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, left]);

  const question = challenge?.questions?.[index];
  const content = question?.content || {};

  const progress = useMemo(() => {
    return challenge?.questions?.length
      ? ((index + 1) / challenge.questions.length) * 100
      : 0;
  }, [challenge, index]);

  const answer = (value) =>
    setAnswers((old) => ({ ...old, [question.id]: value }));

  // ── drag & drop ordering ─────────────────────────────────────────
  const dragPool = useMemo(() => {
    if (question?.question_type !== "drag_order") return [];
    return shuffled(content.items || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question?.id]);
  const currentOrder = answers[question?.id] ?? dragPool;
  const [dragFrom, setDragFrom] = useState(null);
  const reorderDrag = (from, to) => {
    if (from == null || from === to) return;
    const next = [...currentOrder];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    answer(next);
  };

  // ── match pairs ───────────────────────────────────────────────────
  // Backend sends `content.left` (array) and `content.right` (array,
  // pre-shuffled server-side with no correspondence to `left`) instead of
  // a `pairs` dict — the dict form used to leak the correct mapping
  // straight into the network response.
  const matchRightPool = useMemo(() => {
    if (question?.question_type !== "match_pairs") return [];
    return shuffled(content.right || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question?.id]);
  const leftKeys = content.left || [];
  // matchIdx is LOCAL, per-question UI bookkeeping only (which right-pool
  // index is assigned to which left key) — needed because right-side
  // values can repeat (e.g. two different tiles both labeled "BOTH"), so
  // tracking by index (not text) is the only reliable way to know which
  // specific tile is "used". This never gets submitted directly.
  const [matchIdx, setMatchIdx] = useState({});
  useEffect(() => {
    if (question?.question_type !== "match_pairs") { setMatchIdx({}); return; }
    // The scored answer (text-based) already survives a refresh via the
    // persisted `answers`, but the visual "which right-tile is connected"
    // state doesn't — matchIdx is local-only. Rebuild it here by mapping
    // each saved text value back to a matching index in matchRightPool.
    const savedTextMatches = answers[question.id] || {};
    const usedIdx = new Set();
    const rebuilt = {};
    for (const [leftKey, rightText] of Object.entries(savedTextMatches)) {
      const idx = matchRightPool.findIndex((v, i) => v === rightText && !usedIdx.has(i));
      if (idx !== -1) { rebuilt[leftKey] = idx; usedIdx.add(idx); }
    }
    setMatchIdx(rebuilt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question?.id, matchRightPool]);

  const [selectedRightIndex, setSelectedRightIndex] = useState(null);
  const usedRight = new Set(Object.values(matchIdx));

  // Resolves the index-based UI state into the real text values the
  // backend actually stores in `content.pairs` — this is what gets
  // submitted. The backend has no idea what shuffle order the frontend
  // used, so submitting a raw index (as this used to do) could never
  // match the stored answer text, no matter what the student picked.
  const toTextMatches = (idxMap) =>
    Object.fromEntries(Object.entries(idxMap).map(([lk, idx]) => [lk, matchRightPool[idx]]));

  // 1. Assign using the INDEX (rightIdx) for local UI state...
  const assign = (leftKey, rightIdx) => {
    const newIdx = { ...matchIdx, [leftKey]: rightIdx };
    setMatchIdx(newIdx);
    // ...but submit the resolved TEXT value.
    answer(toTextMatches(newIdx));
    setSelectedRightIndex(null);
  };

  const unassign = (leftKey) => {
    const n = { ...matchIdx };
    delete n[leftKey];
    setMatchIdx(n);
    answer(toTextMatches(n));
  };

  // ── memory tiles ─────────────────────────────────────────────────
  const tiles = useMemo(() => {
    if (question?.question_type !== "memory_tiles") return [];
    const pairs = content.pairs || [];
    return shuffled(
      pairs.flatMap(([a, b], i) => [
        { id: `${i}-a`, pairId: i, label: a },
        { id: `${i}-b`, pairId: i, label: b },
      ])
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question?.id]);
  const [flipped, setFlipped] = useState([]);
  const [matchedPairs, setMatchedPairs] = useState(new Set());
  const [wrongIds, setWrongIds] = useState([]);
  const flipTile = (tile) => {
    if (matchedPairs.has(tile.pairId) || flipped.some((t) => t.id === tile.id) || flipped.length === 2) return;
    const next = [...flipped, tile];
    setFlipped(next);
    if (next.length === 2) {
      const [a, b] = next;
      if (a.pairId === b.pairId) {
        setTimeout(() => {
          setMatchedPairs((prev) => {
            const updated = new Set(prev).add(a.pairId);
            if (updated.size === (content.pairs || []).length) {
              answer({ completed: true });
              celebrate(8);
            }
            return updated;
          });
          setFlipped([]);
        }, 350);
      } else {
        setWrongIds([a.id, b.id]);
        setTimeout(() => { setFlipped([]); setWrongIds([]); }, 800);
      }
    }
  };

  // ── word search ──────────────────────────────────────────────────
  const puzzle = useMemo(() => {
    if (question?.question_type !== "word_search") return null;
    return generateWordSearch(content.words || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question?.id]);
  const [foundWords, setFoundWords] = useState(new Set());
  const [foundCells, setFoundCells] = useState(new Set());
  const [selStart, setSelStart] = useState(null);
  const [selCells, setSelCells] = useState([]);
  const selecting = useRef(false);

  const cellKey = (r, c) => `${r}:${c}`;
  const beginSelect = (r, c) => { selecting.current = true; setSelStart([r, c]); setSelCells([[r, c]]); };
  const extendSelect = (r, c) => {
    if (!selecting.current || !selStart) return;
    const line = straightLine(selStart, [r, c]);
    if (line) setSelCells(line);
  };
  const endSelect = () => {
    if (!selecting.current) return;
    selecting.current = false;
    const match = matchSelection(selCells, puzzle?.placements || []);
    if (match && !foundWords.has(match.word)) {
      const nextFound = new Set(foundWords).add(match.word);
      setFoundWords(nextFound);
      setFoundCells((prev) => {
        const next = new Set(prev);
        match.cells.forEach(([r, c]) => next.add(cellKey(r, c)));
        return next;
      });
      answer([...nextFound]);
      if (nextFound.size === (puzzle?.placements.length || 0)) celebrate(10);
      else celebrate(4);
    }
    setSelCells([]);
    setSelStart(null);
  };
  const cellFromTouch = (touch) => {
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!el || !el.dataset || el.dataset.row === undefined) return null;
    return [Number(el.dataset.row), Number(el.dataset.col)];
  };

  // ── image reveal ─────────────────────────────────────────────────
  const [blur, setBlur] = useState(20);
  const [guess, setGuess] = useState("");
  const [guessState, setGuessState] = useState(null); // 'correct' | 'wrong' | null
  useEffect(() => {
    if (question?.question_type !== "image_reveal" || step !== "game") return;
    if (guessState === "correct") return;
    const t = setInterval(() => setBlur((b) => Math.max(1.5, b - 0.6)), 700);
    return () => clearInterval(t);
  }, [question?.id, step, guessState]);

  const submitGuess = () => {
    const correct = guess.trim().toLowerCase() === String(content.answer || "").trim().toLowerCase();
    answer(guess);
    setGuessState(correct ? "correct" : "wrong");
    if (correct) { setBlur(0); celebrate(8); }
    else setTimeout(() => setGuessState(null), 700);
  };

  // reset all per-question interactive state when moving to a new question
  useEffect(() => {
    setFlipped([]); setWrongIds([]);
    setSelCells([]); setSelStart(null);
    setSelectedRightIndex(null);

    // word_search: the found-words list already survives a refresh via
    // persisted `answers`, but the highlighted cells / chip strikethrough
    // are local-only — rebuild them from the saved words + this question's
    // placements instead of wiping the board back to "nothing found".
    if (question?.question_type === "word_search") {
      const savedWords = new Set(answers[question.id] || []);
      const cells = new Set();
      (puzzle?.placements || []).forEach((p) => {
        if (savedWords.has(p.word)) p.cells.forEach(([r, c]) => cells.add(cellKey(r, c)));
      });
      setFoundWords(savedWords);
      setFoundCells(cells);
    } else {
      setFoundWords(new Set());
      setFoundCells(new Set());
    }

    // image_reveal: restore the guess text + blur/correct state from the
    // saved answer instead of re-blurring an image the student already
    // solved.
    if (question?.question_type === "image_reveal") {
      const savedGuess = answers[question.id];
      const isCorrect = savedGuess && String(savedGuess).trim().toLowerCase() === String(content.answer || "").trim().toLowerCase();
      setGuess(savedGuess || "");
      setGuessState(isCorrect ? "correct" : null);
      setBlur(isCorrect ? 0 : 20);
    } else {
      setBlur(20); setGuess(""); setGuessState(null);
    }

    // Restore in-progress memory-tile matches for this question, if any
    // were saved before a refresh — otherwise this game would silently
    // wipe out everything already matched every time the page reloads.
    let savedTiles = [];
    if (question?.question_type === "memory_tiles") {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
        savedTiles = saved?.tileProgress?.[question.id] || [];
      } catch { }
    }
    setMatchedPairs(new Set(savedTiles));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question?.id]);

  // Persist memory-tile match progress as it happens, same idea as the
  // answers-persist effect above but keyed per-question since matched
  // pairs aren't part of `answers` until the game is fully complete.
  useEffect(() => {
    if (step !== "game" || question?.question_type !== "memory_tiles") return;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || {}; } catch { }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...saved,
      tileProgress: { ...(saved.tileProgress || {}), [question.id]: [...matchedPairs] },
    }));
  }, [matchedPairs, step, question?.id, question?.question_type]);

  useEffect(() => {
    const leaderboard = async () => {
      setBoard(await getChallengeLeaderboard(id));
    };

    leaderboard();
  }, [id])


  useEffect(() => {
    if (step !== "done" || board.is_finalized) return;
    const interval = setInterval(() => {
      getChallengeLeaderboard(id).then(setBoard).catch(() => { });
    }, 15000);
    return () => clearInterval(interval);
  }, [step, id, board.is_finalized]);

  const begin = async () => {
    try {
      await startChallenge(id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ answers: {}, index: 0, startedAt: Date.now() }));
      autoFinishedRef.current = false;
      setStep("game");
    } catch (e) {
      setError(e.data?.detail || "You have already completed this challenge.");
    }
  };

  const finish = async (coinsEarned, answersOverride) => {
    if (step === "submitting" || !challenge) return;
    setStep("submitting");
    try {
      // answersOverride lets coding_challenge (and any other postMessage-
      // driven playground) pass its freshly-graded result directly rather
      // than relying on `answers` state having flushed by the time this
      // runs — same fix QuestPlay already uses for interactive_coding.
      const payloadAnswers = answersOverride || answers;
      const data = await submitChallenge(id, { answers: payloadAnswers, coins_earned: coinsEarned || 0 });
      localStorage.removeItem(STORAGE_KEY);
      const board = await getChallengeLeaderboard(id);

      // coins_gained comes back from the server, computed from this
      // attempt's accuracy — that's the number we show, not whatever the
      // game shell guessed on its own.
      const revealDone = () => {
        setResult(data);
        setBoard(board);
        setCoinsWon(data.coins_gained || 0);
        setStep("done");
        setConfettiKey((k) => k + 1);
      };

      if (data.victory_effect_key) {
        setPendingDoneData(() => revealDone);
        setVictoryEffectKey(data.victory_effect_key);
      } else {
        revealDone();
      }
    } catch (e) {
      setError(e.data?.detail || "Could not submit your answers.");
      setStep("game");
    }
  };

  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const handleExit = () => setShowExitConfirm(true);
  const confirmExit = () => {
    localStorage.removeItem(STORAGE_KEY);
    navigate("/challenges");
  };

  if (error) {
    return (
      <StudentLayout title="Boss Battle">
        <div className="s-error">{error}</div>
      </StudentLayout>
    );
  }

  if (!challenge) {
    return (
      <StudentLayout title="Boss Battle">
        <div className="s-loading">Loading challenge...</div>
      </StudentLayout>
    );
  }

  const grad = {
    memory_tiles: "linear-gradient(135deg,#8b5cf6,#c4b5fd)",
    word_search: "linear-gradient(135deg,#06b6d4,#67e8f9)",
    image_reveal: "linear-gradient(135deg,#f97316,#fdba74)",
  };

  return (
    <StudentLayout title="Boss Battle">
      <style>{GAME_KEYFRAMES}</style>
      <Confetti burstKey={confettiKey} />
      <XPPopup amount={xpFlash} />

      {victoryEffectKey && (
        <VictoryEffect
          effectKey={victoryEffectKey}
          onDone={() => {
            setVictoryEffectKey(null);
            pendingDoneData?.();
            setPendingDoneData(null);
          }}
        />
      )}

      {step === "intro" && (
        <section className="challenge-hero">
          <span>⚔️ BOSS BATTLE</span>
          <h1>{challenge.title}</h1>
          <p>{challenge.description}</p>
          <div>
            <b>+{challenge.xp_reward} XP</b>
            <b>{Math.ceil(challenge.time_limit / 60)} min</b>
          </div>
          {challenge.end_date && new Date(challenge.end_date) <= new Date() ? (
            <>
              <p style={{ opacity: 0.85, marginTop: 8 }}>
                ⏰ This challenge's deadline passed on {new Date(challenge.end_date).toLocaleString()} — it can no longer be started.
              </p>
              <button
                className="btn"
                onClick={() => navigate(`/challenges/${id}/leaderboard`)}
              >
                View Leaderboard Instead
              </button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={begin}>
              Start Challenge
            </button>
          )}
        </section>
      )}

      {step === "done" && (
        <section
          style={{
            maxWidth: 560, margin: "0 auto", borderRadius: 28, overflow: "hidden",
            background: "var(--color-bg-alt)",
            boxShadow: "var(--shadow-card), 0 0 0 1px var(--color-border)",
          }}
        >
          <style>{`
            @keyframes cwPop { from{ transform:scale(.9); opacity:0 } to{ transform:scale(1); opacity:1 } }
            @keyframes cwFloat { 0%,100%{ transform:translateY(0) rotate(-2deg) } 50%{ transform:translateY(-6px) rotate(2deg) } }
            @keyframes cwShine { 0%{ background-position:-200% 0 } 100%{ background-position:200% 0 } }
            @keyframes cwGlow { 0%,100%{ box-shadow:0 0 18px rgba(250,204,21,.35) } 50%{ box-shadow:0 0 30px rgba(250,204,21,.6) } }
            @keyframes cwCoinSpin { 0%{ transform:rotateY(0deg) } 100%{ transform:rotateY(360deg) } }
            @keyframes cwSparkle { 0%,100%{ opacity:.3; transform:scale(.8) } 50%{ opacity:1; transform:scale(1.15) } }
          `}</style>

          {/* Hero — always a vivid themed gradient, so this stays the celebratory
              focal point no matter which theme is equipped */}
          <div style={{ position: "relative", padding: "38px 28px 30px", textAlign: "center", overflow: "hidden", background: "var(--gradient-hero)" }}>
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% -10%, rgba(255,255,255,.25), transparent 60%)" }} />
            <span style={{ position: "absolute", top: 18, left: 22, fontSize: "1.3rem", animation: "cwSparkle 1.8s ease-in-out infinite" }}>✨</span>
            <span style={{ position: "absolute", top: 30, right: 30, fontSize: "1rem", animation: "cwSparkle 1.8s ease-in-out infinite .4s" }}>✨</span>
            <span style={{ position: "absolute", bottom: 14, left: "18%", fontSize: ".9rem", animation: "cwSparkle 1.8s ease-in-out infinite .8s" }}>⭐</span>

            <div style={{ fontSize: "3.4rem", animation: "cwFloat 2.4s ease-in-out infinite", filter: "drop-shadow(0 0 18px rgba(250,204,21,.6))", position: "relative" }}>
              🎉
            </div>
            <div style={{
              display: "inline-block", marginTop: 10, fontSize: ".72rem", fontWeight: 800, letterSpacing: ".08em",
              color: "#facc15", textTransform: "uppercase", position: "relative",
              textShadow: "0 0 12px rgba(250,204,21,.6)",
            }}>
              Great Work
            </div>

            <div style={{ position: "relative", display: "flex", justifyContent: "center", marginTop: 8 }}>
              <Avatar avatarKey={result?.student_avatar} size={48} />
            </div>

            <h1 style={{
              margin: "10px 0 0", fontSize: "1.6rem", fontWeight: 800, position: "relative",
              background: "linear-gradient(90deg, #fff 20%, #ffe9a8 40%, #fff 60%)",
              backgroundSize: "200% auto", WebkitBackgroundClip: "text", backgroundClip: "text",
              color: "transparent", animation: "cwShine 2.6s linear infinite",
            }}>
              Boss Battle Complete
            </h1>

            {result && (
              <div style={{ display: "grid", gridTemplateColumns: coinsWon > 0 ? "repeat(4, 1fr)" : "repeat(3, 1fr)", gap: 10, marginTop: 26, position: "relative" }}>
                <StatPill value={`${result.accuracy}%`} label="Score" accent="#a78bfa" />
                <StatPill value={`+${result.xp_earned}`} label="XP earned" accent="#4ade80" />
                <StatPill value={seconds(result.time_taken)} label="Time" accent="#38bdf8" />
                {coinsWon > 0 && (
                  <div style={{
                    background: "rgba(255,255,255,.14)", borderRadius: 16, padding: "14px 8px", textAlign: "center",
                    border: "1px solid rgba(250,204,21,.5)", animation: "cwGlow 1.8s ease-in-out infinite",
                  }}>
                    <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "#facc15", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                      <span style={{ display: "inline-block", animation: "cwCoinSpin 1.6s linear infinite" }}>🪙</span>
                      +{coinsWon}
                    </div>
                    <div style={{ fontSize: ".66rem", fontWeight: 700, color: "#fef3c7", marginTop: 3, textTransform: "uppercase", letterSpacing: ".04em" }}>Coins</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Leaderboard */}
          <div style={{ background: "var(--color-bg)", padding: "24px 24px 28px" }}>
            <h2 style={{ margin: "0 0 8px", fontSize: "1rem", fontWeight: 800, color: "var(--color-text)", display: "flex", alignItems: "center", gap: 8 }}>
              🏆 Top Players
            </h2>
            <p style={{
              fontSize: ".76rem", lineHeight: 1.5, marginBottom: 16, padding: "8px 12px", borderRadius: 10,
              color: board.is_finalized ? "var(--color-success)" : "#d97706",
              background: board.is_finalized ? "color-mix(in srgb, var(--color-success) 14%, transparent)" : "rgba(250,204,21,.12)",
              border: `1px solid ${board.is_finalized ? "color-mix(in srgb, var(--color-success) 35%, transparent)" : "rgba(250,204,21,.3)"}`,
            }}>
              {board.is_finalized
                ? (board.champion_name ? `🏆 Finalized — ${board.champion_name} is the Challenge Champion` : "🏆 Finalized")
                : `🔴 Live — the Hall of Fame badge isn't awarded yet. It locks in once the challenge ends${challenge?.end_date ? ` (${new Date(challenge.end_date).toLocaleString()})` : ""}.`}
            </p>

            <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
              {(board.results || []).map((row, i) => (
                <li
                  key={`${row.student_name}-${i}`}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: 14,
                    animation: "cwPop .25s ease-out both", animationDelay: `${i * 0.04}s`,
                    background: row.is_current_student ? "var(--color-purple-soft)" : "var(--color-bg-alt)",
                    border: row.is_champion ? "1px solid rgba(250,204,21,.55)" : row.is_current_student ? "1px solid var(--color-purple)" : "1px solid var(--color-border)",
                    boxShadow: row.is_champion ? "0 0 18px rgba(250,204,21,.25)" : "none",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".88rem", fontWeight: row.is_current_student ? 800 : 600, color: "var(--color-text)" }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: "50%",
                      fontSize: ".72rem", fontWeight: 800, flexShrink: 0,
                      background: row.is_champion ? "linear-gradient(135deg,#eab308,#fde047)" : "var(--color-border)",
                      color: row.is_champion ? "#3a2c00" : "var(--color-text-soft)",
                    }}>
                      {row.is_champion ? "🏆" : `#${row.rank ?? i + 1}`}
                    </span>
                    {row.student_name}
                  </span>
                  <span style={{ fontSize: ".78rem", color: "var(--color-text-soft)", fontWeight: 700, flexShrink: 0 }}>
                    {row.accuracy}% · {seconds(row.time_taken)}
                  </span>
                </li>
              ))}
            </ol>

            <div style={{ display: "grid", gap: 10, marginTop: 22 }}>
              <button
                onClick={() => navigate(`/challenges/${id}/leaderboard`)}
                style={{
                  padding: "14px 0", borderRadius: 14, border: "none", fontWeight: 800, fontSize: ".92rem", cursor: "pointer",
                  background: "var(--gradient-cta)", color: "#fff", boxShadow: "var(--shadow-cta-pop)",
                }}
              >
                View Full Leaderboard
              </button>
              <button
                onClick={() => navigate("/challenges")}
                style={{ padding: "13px 0", borderRadius: 14, border: "1px solid var(--color-border)", background: "transparent", color: "var(--color-text)", fontWeight: 700, fontSize: ".9rem", cursor: "pointer" }}
              >
                Continue
              </button>
            </div>
          </div>
        </section>
      )}

      {step !== "intro" && step !== "done" && challenge.questions.length === 0 && (
        <div className="s-error"><h2>Challenge doesn't have any questions</h2></div>
      )}

      {(step === "game" || step === "submitting") && GAME_COMPONENTS[challenge.game_type] && (() => {
        const Game = GAME_COMPONENTS[challenge.game_type];
        return (
          <>
            <div style={{ textAlign: "center", fontWeight: 800, marginBottom: 6 }}>⏱ {seconds(left)}</div>
            <Game
              questions={challenge.questions}
              title={challenge.title}
              timeLeft={left}   // 👈 add this one line
              onAnswer={(qid, val) => setAnswers((old) => ({ ...old, [qid]: val }))}
              onComplete={(finalAnswers, coinsEarned) => finish(coinsEarned)}
              onExit={handleExit}
            />
          </>
        );
      })()}

      {(step === "game" || step === "submitting") && !GAME_COMPONENTS[challenge.game_type] && question && (
        <section className="game-card">
          <header>
            <span>Question {index + 1} / {challenge.questions.length}</span>
            <strong>⏱ {seconds(left)}</strong>
            <button
              type="button"
              onClick={handleExit}
              style={{ border: "none", background: "none", cursor: "pointer", fontSize: ".78rem", color: "var(--color-danger)", fontWeight: 700 }}
            >
              Exit Challenge ✕
            </button>
          </header>

          <div className="game-progress"><i style={{ width: `${progress}%` }} /></div>

          {question.question_type !== "image_reveal" &&
            question.question_type !== "interactive_coding" &&
            question.question_type !== "coding_challenge" && (
            <h2 key={question.id} style={{ animation: "fadeSlideIn .25s ease-out" }}>
              {content.question || content.task || "Complete this activity"}
            </h2>
          )}

          {question.question_type === "multiple_choice" && (
            <div className="option-grid">
              {(content.options || []).map((o, i) => (
                <button className={answers[question.id] === i ? "selected" : ""} onClick={() => answer(i)} key={o + i}>
                  {o}
                </button>
              ))}
            </div>
          )}

          {question.question_type === "true_false" && (
            <div className="option-grid">
              <button className={answers[question.id] === true ? "selected" : ""} onClick={() => answer(true)}>True</button>
              <button className={answers[question.id] === false ? "selected" : ""} onClick={() => answer(false)}>False</button>
            </div>
          )}

          {question.question_type === "fill_blank" && (
            <input
              type="text"
              value={answers[question.id] || ""}
              onChange={(e) => answer(e.target.value)}
              placeholder="Type your answer..."
              style={{ width: "100%", fontSize: "1.1rem", padding: "14px 16px", borderRadius: 12, border: "2px solid var(--color-border, #ddd)" }}
            />
          )}

          {question.question_type === "prompt_build" && (
            <textarea
              value={answers[question.id] || ""}
              onChange={(e) => answer(e.target.value)}
              placeholder="Write your prompt here..."
              rows={7}
            />
          )}

          {question.question_type === "drag_order" && (
            <>
              <p className="game-hint">Drag the cards into the correct order.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {currentOrder.map((item, i) => (
                  <div
                    key={item + i} draggable
                    onDragStart={() => setDragFrom(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => { reorderDrag(dragFrom, i); setDragFrom(null); }}
                    onDragEnd={() => setDragFrom(null)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 12,
                      cursor: "grab", border: "2px solid var(--color-border)", background: "var(--color-bg-alt)",
                      opacity: dragFrom === i ? 0.4 : 1, transition: "opacity .15s ease",
                    }}
                  >
                    <span style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--color-purple, #7c5cfc)", color: "#fff", fontSize: ".75rem", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ userSelect: "none", fontWeight: 600 }}>{item}</span>
                    <span style={{ marginLeft: "auto", opacity: 0.35 }}>⠿</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {question.question_type === "match_pairs" && (
            <>
              <p className="game-hint">
                {selectedRightIndex !== null
                  ? `Tap the left item that matches "${matchRightPool[selectedRightIndex]}".`
                  : "Tap an item on the right, then tap its match on the left — or drag it over."}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                {/* LEFT COLUMN */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {leftKeys.map((leftKey) => (
                    <div
                      key={leftKey}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        // Extract the index from the drag payload
                        const rightIdx = e.dataTransfer.getData("text/plain");
                        if (rightIdx !== "") assign(leftKey, parseInt(rightIdx, 10));
                      }}
                      onClick={() => selectedRightIndex !== null && assign(leftKey, selectedRightIndex)}
                      style={{
                        padding: "14px 16px",
                        borderRadius: 12,
                        cursor: selectedRightIndex !== null ? "pointer" : "default",
                        border: matchIdx[leftKey] !== undefined ? "2px solid var(--color-purple)" : "2px dashed var(--color-border)",
                        background: matchIdx[leftKey] !== undefined ? "color-mix(in srgb, var(--color-purple) 8%, transparent)" : "var(--color-bg-alt)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                    >
                      <strong>{leftKey}</strong>
                      {matchIdx[leftKey] !== undefined ? (
                        <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: ".85rem", color: "var(--color-purple)" }}>
                          ↔ {matchRightPool[matchIdx[leftKey]]}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              unassign(leftKey);
                            }}
                            style={{ border: "none", background: "none", cursor: "pointer", color: "var(--color-danger)" }}
                          >
                            ✕
                          </button>
                        </span>
                      ) : (
                        <span style={{ fontSize: ".8rem", opacity: 0.5 }}>Drop or tap a match here</span>
                      )}
                    </div>
                  ))}
                </div>

                {/* RIGHT COLUMN */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {matchRightPool.map((val, i) => {
                    // Check if THIS SPECIFIC INDEX is used (usedRight should be a Set of indices!)
                    const used = usedRight.has(i);
                    const isSelected = selectedRightIndex === i;

                    return (
                      <div
                        key={val + "-" + i}
                        draggable={!used}
                        onDragStart={(e) => {
                          // Transfer the INDEX, not the text string!
                          e.dataTransfer.setData("text/plain", i.toString());
                        }}
                        onClick={() => {
                          if (!used) {
                            setSelectedRightIndex(isSelected ? null : i);
                          }
                        }}
                        style={{
                          padding: "14px 16px",
                          borderRadius: 12,
                          cursor: used ? "default" : "grab",
                          border: isSelected ? "2px solid var(--color-purple)" : "2px solid var(--color-border)",
                          background: used ? "var(--color-border)" : "var(--color-bg-alt)",
                          opacity: used ? 0.4 : 1,
                          fontWeight: 600,
                        }}
                      >
                        {val}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {question.question_type === "memory_tiles" && (
            <>
              <p className="game-hint">{matchedPairs.size} / {(content.pairs || []).length} pairs found</p>
              <div className="s-memory-grid">
                {tiles.map((tile) => {
                  const isMatched = matchedPairs.has(tile.pairId);
                  const isFlipped = isMatched || flipped.some((t) => t.id === tile.id);
                  const isWrong = wrongIds.includes(tile.id);
                  return (
                    <button
                      key={tile.id}
                      className="s-memory-tile"
                      onClick={() => flipTile(tile)}
                      disabled={isMatched}
                      style={{
                        cursor: isMatched ? "default" : "pointer",
                        background: isFlipped ? grad.memory_tiles : "linear-gradient(135deg, var(--color-border), var(--color-bg-alt))",
                        color: isFlipped ? "white" : "transparent",
                        animation: isMatched ? "tileMatchPulse 1s ease-out" : isWrong ? "tileWrongShake .4s" : "none",
                        boxShadow: isMatched ? "0 0 0 2px var(--color-success) inset" : "none",
                      }}
                    >
                      {isFlipped ? tile.label : "🧠"}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {question.question_type === "word_search" && puzzle && (
            <>
              <p className="game-hint">
                {foundWords.size} / {puzzle.placements.length} words found — drag across letters to select
              </p>
              <div
                onMouseUp={endSelect}
                onTouchEnd={endSelect}
                style={{
                  display: "grid", gridTemplateColumns: `repeat(${puzzle.size}, 1fr)`, gap: 3,
                  userSelect: "none", touchAction: "none", maxWidth: 420, margin: "0 auto 14px",
                }}
              >
                {puzzle.grid.map((row, r) =>
                  row.map((letter, c) => {
                    const key = cellKey(r, c);
                    const isFound = foundCells.has(key);
                    const isSelecting = selCells.some(([sr, sc]) => sr === r && sc === c);
                    return (
                      <div
                        key={key}
                        data-row={r}
                        data-col={c}
                        onMouseDown={() => beginSelect(r, c)}
                        onMouseEnter={() => extendSelect(r, c)}
                        onTouchStart={(e) => { const cell = cellFromTouch(e.touches[0]); if (cell) beginSelect(...cell); }}
                        onTouchMove={(e) => { const cell = cellFromTouch(e.touches[0]); if (cell) extendSelect(...cell); }}
                        style={{
                          aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center",
                          borderRadius: 6, fontWeight: 800, fontSize: ".8rem", cursor: "pointer",
                          color: isFound || isSelecting ? "white" : "var(--color-text)",
                          background: isFound ? "linear-gradient(135deg,#06b6d4,#22d3ee)"
                            : isSelecting ? "var(--gradient-cta)"
                              : "var(--color-bg-alt)",
                          border: "1px solid var(--color-border)",
                        }}
                      >
                        {letter}
                      </div>
                    );
                  })
                )}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                {(puzzle.words || [...new Set(puzzle.placements.map((p) => p.word))]).map((word) => (
                  <span
                    key={word}
                    style={{
                      fontWeight: 700, fontSize: ".78rem", padding: "6px 12px", borderRadius: 999,
                      background: foundWords.has(word) ? "#06b6d4" : "var(--color-border)",
                      color: foundWords.has(word) ? "white" : "var(--color-text-soft)",
                      textDecoration: foundWords.has(word) ? "line-through" : "none",
                    }}
                  >
                    {word}
                  </span>
                ))}
              </div>
            </>
          )}

          {question.question_type === "image_reveal" && (
            <div style={{ textAlign: "center" }}>
              <div style={{ position: "relative", borderRadius: 16, overflow: "hidden", marginBottom: 16, display: "inline-block", maxWidth: 360 }}>
                <img
                  src={content.image}
                  alt="reveal"
                  style={{ width: "100%", maxHeight: 280, objectFit: "cover", filter: `blur(${blur}px)`, transition: "filter .6s ease" }}
                />
              </div>
              <h2 style={{ animation: "fadeSlideIn .25s ease-out" }}>{content.question}</h2>
              <div style={{ display: "flex", gap: 10, maxWidth: 360, margin: "0 auto" }}>
                <input
                  type="text"
                  value={guess}
                  onChange={(e) => setGuess(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitGuess()}
                  placeholder="Your guess..."
                  disabled={guessState === "correct"}
                  style={{
                    flex: 1, fontSize: "1rem", padding: "12px 14px", borderRadius: 12,
                    border: guessState === "wrong" ? "2px solid var(--color-danger)" : guessState === "correct" ? "2px solid var(--color-success)" : "2px solid var(--color-border)",
                    animation: guessState === "wrong" ? "tileWrongShake .4s" : "none",
                  }}
                />
                <button
                  className="btn btn-primary"
                  style={{ background: guessState === "correct" ? "var(--color-success)" : grad.image_reveal, border: "none" }}
                  onClick={submitGuess}
                  disabled={guessState === "correct" || !guess.trim()}
                >
                  {guessState === "correct" ? "Correct! 🎉" : "Guess"}
                </button>
              </div>
            </div>
          )}

          {/* NEW — interactive_coding, same exact-check playground Quests
              use. It portals fullscreen over the whole screen (including
              the ⏱ timer in the header above), so timeLeft/exitLabel/
              finishLabel are passed through explicitly rather than relying
              on anything from this page still being visible underneath. */}
          {step === "game" && question.question_type === "interactive_coding" && (
            <CodingPlayground
              key={question.id}
              content={content}
              storageKey={`challenge-coding-classic-${question.id}`}
              onResult={(results) => answer(results)}
              onExit={handleExit}
              canGoBack={!!index}
              onBack={() => setIndex(index - 1)}
              isLast={index === challenge.questions.length - 1}
              timeLeft={left}
              exitLabel="Exit Challenge ✕"
              finishLabel="Finish Battle"
              onNext={(freshResult) => {
                // freshResult passed directly rather than read back out of
                // `answers` state, since that update isn't guaranteed to
                // have flushed by the time this fires — it comes from a
                // postMessage listener, not a React synthetic event.
                const finalAnswers = freshResult
                  ? { ...answers, [question.id]: freshResult }
                  : answers;
                if (index === challenge.questions.length - 1) finish(undefined, finalAnswers);
                else setIndex(index + 1);
              }}
            />
          )}

          {/* NEW — coding_challenge, same open-ended playground QuestPlay
              uses. Same deal as above — pass timeLeft/labels explicitly
              since the fullscreen overlay covers this page's own timer. */}
          {step === "game" && question.question_type === "coding_challenge" && (
            <CodingChallengePlayground
              key={question.id}
              content={content}
              storageKey={`challenge-coding-${question.id}`}
              onResult={(results) => answer(results)}
              onExit={handleExit}
              canGoBack={!!index}
              onBack={() => setIndex(index - 1)}
              isLast={index === challenge.questions.length - 1}
              timeLeft={left}
              exitLabel="Exit Challenge ✕"
              finishLabel="Finish Battle"
              onNext={(freshResult) => {
                const finalAnswers = freshResult
                  ? { ...answers, [question.id]: freshResult }
                  : answers;
                if (index === challenge.questions.length - 1) finish(undefined, finalAnswers);
                else setIndex(index + 1);
              }}
            />
          )}

          {question.question_type !== "interactive_coding" &&
            question.question_type !== "coding_challenge" && (
            <footer>
              <button className="btn btn-secondary" disabled={!index} onClick={() => setIndex(index - 1)}>Back</button>
              <button
                className="btn btn-primary"
                onClick={() => (index === challenge.questions.length - 1 ? finish() : setIndex(index + 1))}
              >
                {index === challenge.questions.length - 1 ? "Finish Battle" : "Next"}
              </button>
            </footer>
          )}
        </section>
      )}

      {showExitConfirm && (
        <div
          onClick={() => setShowExitConfirm(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(20,15,45,.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            // Was 1000 — invisible behind CodingPlayground/
            // CodingChallengePlayground's fullscreen portal (z-index
            // 999999), which made "Exit Challenge" look broken for
            // interactive_coding/coding_challenge questions: the click
            // registered and set showExitConfirm=true, the dialog just
            // rendered underneath the coding overlay where no one could
            // see or click it.
            zIndex: 1000000, padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--color-bg-alt)", borderRadius: 20, padding: "28px 26px", maxWidth: 380,
              width: "100%", textAlign: "center", boxShadow: "var(--shadow-card)",
            }}
          >
            <div style={{ fontSize: "2rem", marginBottom: 8 }}>⚠️</div>
            <h3 style={{ margin: "0 0 8px", color: "var(--color-text)" }}>Exit this challenge?</h3>
            <p style={{ fontSize: ".88rem", color: "var(--color-text-soft)", margin: "0 0 22px", lineHeight: 1.5 }}>
              Your answers on this page will be cleared — you'll need to start over from question 1 next time.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowExitConfirm(false)}>
                Cancel
              </button>
              <button
                className="btn"
                style={{ flex: 1, background: "var(--color-danger)", color: "#fff", border: "none" }}
                onClick={confirmExit}
              >
                Exit Challenge
              </button>
            </div>
          </div>
        </div>
      )}
    </StudentLayout>
  );
}