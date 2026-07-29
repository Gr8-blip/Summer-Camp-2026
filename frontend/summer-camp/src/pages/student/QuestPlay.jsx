import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getQuest,
  startQuest,
  submitQuest,
} from "../../api/client";
import StudentLayout from "./StudentLayout";
import VictoryEffect from "../../components/VictoryEffect";
import { generateWordSearch, matchSelection, straightLine } from "../../components/wordSearchGenerator";
import DungeonCrawler from "../../components/DungeonCrawler";
import FloorIsLava from "../../components/Floorislava";
import "./challenge.css"; // reused as-is — same puzzle visuals for Quests

// Same map as ChallengePlay — "classic" (or an unbuilt game_type) falls
// through to the existing question-list flow below.
const GAME_COMPONENTS = {
  dungeon_crawler: DungeonCrawler,
  floor_is_lava: FloorIsLava,
};

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── same tiny celebration primitives as ChallengePlay ───────────────
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

const GAME_KEYFRAMES = `
@keyframes cpFall { to { top: 110vh; opacity: 0; } }
@keyframes xpPop { 0% { opacity:0; transform: translateX(-50%) translateY(10px) scale(.8); } 15% { opacity:1; transform: translateX(-50%) translateY(0) scale(1); } 80% { opacity:1; } 100% { opacity:0; transform: translateX(-50%) translateY(-16px) scale(.95); } }
@keyframes fadeSlideIn { from { opacity:0; transform: translateY(8px);} to { opacity:1; transform: translateY(0);} }
@keyframes tileMatchPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(20,184,166,.5); } 50% { box-shadow: 0 0 0 8px rgba(20,184,166,0); } }
@keyframes tileWrongShake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
`;

export default function QuestPlay() {
  const { id } = useParams();
  const navigate = useNavigate();
  const STORAGE_KEY = `quest-progress-${id}`;

  const [quest, setQuest] = useState(null);
  const [step, setStep] = useState("intro"); // intro | locked | game | submitting | done
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [confettiKey, setConfettiKey] = useState(0);
  const [victoryEffectKey, setVictoryEffectKey] = useState(null);
  const [pendingDoneData, setPendingDoneData] = useState(null);
  const [xpFlash, setXpFlash] = useState(0);

  const celebrate = (xp = 5) => {
    setConfettiKey((k) => k + 1);
    setXpFlash(xp);
    setTimeout(() => setXpFlash(0), 1100);
  };

  useEffect(() => {
    getQuest(id)
      .then((q) => {
        setQuest(q);
        if (!q.camp_started) { setStep("locked"); return; }
        if (q.completed) {
          setStep("done");
          localStorage.removeItem(STORAGE_KEY);
          return;
        }

        // Resume in-progress answers after a refresh, instead of forcing
        // the student to start over from question 1. Quests have no
        // timer, so there's no elapsed-time math needed — just restore
        // straight into the game.
        try {
          const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
          if (saved) {
            setAnswers(saved.answers || {});
            setIndex(saved.index || 0);
            setStep("game");
          }
        } catch {
          localStorage.removeItem(STORAGE_KEY);
        }
      })
      .catch(() => setError("This quest is unavailable."));
  }, [id]);

  // Persist progress on every change while actively playing, so a refresh
  // (or accidental tab close) doesn't wipe out answered questions.
  useEffect(() => {
    if (step !== "game") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ answers, index }));
  }, [answers, index, step]);

  const question = quest?.questions?.[index];
  const content = question?.content || {};

  const progress = useMemo(() => {
    return quest?.questions?.length ? ((index + 1) / quest.questions.length) * 100 : 0;
  }, [quest, index]);

  const answer = (value) => setAnswers((old) => ({ ...old, [question.id]: value }));

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
  const matchRightPool = useMemo(() => {
    if (question?.question_type !== "match_pairs") return [];
    return shuffled(content.right || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question?.id]);
  const leftKeys = content.left || [];
  const matches = answers[question?.id] || {};
  const [selectedRight, setSelectedRight] = useState(null);
  const usedRight = new Set(Object.values(matches));
  const assign = (leftKey, rightVal) => { answer({ ...matches, [leftKey]: rightVal }); setSelectedRight(null); };
  const unassign = (leftKey) => { const n = { ...matches }; delete n[leftKey]; answer(n); };

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
  const [guessState, setGuessState] = useState(null);
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

  useEffect(() => {
    setFlipped([]); setWrongIds([]);
    setSelCells([]); setSelStart(null);

    // word_search: rebuild highlighted cells from the already-persisted
    // found-words list instead of wiping the board on refresh.
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

    // image_reveal: restore guess/blur/correct state from the saved
    // answer instead of re-blurring an already-solved image.
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
    // were saved before a refresh.
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

  // Persist memory-tile match progress as it happens.
  useEffect(() => {
    if (step !== "game" || question?.question_type !== "memory_tiles") return;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || {}; } catch { }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...saved,
      tileProgress: { ...(saved.tileProgress || {}), [question.id]: [...matchedPairs] },
    }));
  }, [matchedPairs, step, question?.id, question?.question_type]);

  const begin = async () => {
    try {
      await startQuest(id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ answers: {}, index: 0 }));
      setStep("game");
      setIndex(0);
    } catch (e) {
      setError(e.data?.detail || "You have already completed this quest.");
    }
  };

  const finish = async (coinsEarned) => {
    if (step === "submitting" || !quest) return;
    setStep("submitting");
    try {
      const data = await submitQuest(id, { answers, coins_earned: coinsEarned || 0 });
      setResult(data);
      if (data.is_complete) {
        localStorage.removeItem(STORAGE_KEY);

        // Stash the "done" reveal — if a victory effect is equipped, play
        // it first and only THEN flip to the completion screen.
        const revealDone = () => {
          setStep("done");
          setConfettiKey((k) => k + 1);
        };

        if (data.victory_effect_key) {
          setPendingDoneData(() => revealDone);
          setVictoryEffectKey(data.victory_effect_key);
        } else {
          revealDone();
        }
      } else {
        // Retryable: show what went wrong, let them try again from Q1
        setStep("retry");
      }
    } catch (e) {
      setError(e.data?.detail || "Could not submit your answers.");
      setStep("game");
    }
  };

  const tryAgain = () => {
    localStorage.removeItem(STORAGE_KEY);
    setAnswers({});
    setIndex(0);
    setResult(null);
    setStep("game");
  };

  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const handleExit = () => setShowExitConfirm(true);
  const confirmExit = () => {
    localStorage.removeItem(STORAGE_KEY);
    navigate("/assignments");
  };

  if (error) {
    return <StudentLayout title="Mission Quest"><div className="s-error">{error}</div></StudentLayout>;
  }
  if (!quest) {
    return <StudentLayout title="Mission Quest"><div className="s-loading">Loading quest...</div></StudentLayout>;
  }

  const grad = {
    memory_tiles: "linear-gradient(135deg,#8b5cf6,#c4b5fd)",
    word_search: "linear-gradient(135deg,#06b6d4,#67e8f9)",
    image_reveal: "linear-gradient(135deg,#f97316,#fdba74)",
  };

  return (
    <StudentLayout title="Mission Quest">
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

      {step === "locked" && (
        <section className="challenge-hero">
          <span>🔒 QUEST LOCKED</span>
          <h1>Available after today's lesson.</h1>
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>Back</button>
        </section>
      )}

      {step === "intro" && (
        <section className="challenge-hero">
          <span>🗺️ MISSION QUEST</span>
          <h1>{quest.title}</h1>
          <p>{quest.description}</p>
          <div><b>+{quest.xp_reward} XP</b></div>
          {quest.deadline && new Date(quest.deadline) <= new Date() ? (
            <>
              <p style={{ opacity: 0.85, marginTop: 8 }}>
                ⏰ This quest's deadline passed on {new Date(quest.deadline).toLocaleString()} — it can no longer be started.
              </p>
              <button className="btn" onClick={() => navigate("/assignments")}>Back to Quests</button>
            </>
          ) : (
            <button
              className="btn btn-primary"
              style={{ background: "linear-gradient(135deg,#7c5cfc,#a78bfa)", border: "none" }}
              onClick={begin}
            >
              Start Quest
            </button>
          )}
        </section>
      )}

      {step === "retry" && (
        <section className="challenge-hero">
          <span>💪 ALMOST THERE</span>
          <h1>{result?.accuracy ?? 0}% correct</h1>
          <p>No stress — quests can be retried until you nail it.</p>
          <button className="btn btn-primary" onClick={tryAgain}>Try Again</button>
        </section>
      )}

      {step === "done" && (
        <section className="challenge-hero celebrate">
          <span>🎉 QUEST COMPLETE!</span>
          <h1>{quest.title}</h1>
          {result && (
            <div className="result-grid result-grid-3">
              <b>{result.accuracy}%<small>Score</small></b>
              <b>+{result.xp_gained}<small>XP earned</small></b>
              <b>{result.attempt_count}<small>Attempts</small></b>
            </div>
          )}
          <button className="btn btn-primary" onClick={() => navigate("/assignments")}>Continue</button>
        </section>
      )}

      {step !== "intro" && step !== "done" && step !== "locked" && step !== "retry" && quest.questions.length === 0 && (
        <div className="s-error"><h2>This quest doesn't have any questions yet.</h2></div>
      )}

      {(step === "game" || step === "submitting") && GAME_COMPONENTS[quest.game_type] && (() => {
        const Game = GAME_COMPONENTS[quest.game_type];
        return (
          <Game
            questions={quest.questions}
            title={quest.title}
            onAnswer={(qid, val) => setAnswers((old) => ({ ...old, [qid]: val }))}
            onComplete={(finalAnswers, coinsEarned) => finish(coinsEarned)}
            onExit={handleExit}
          />
        );
      })()}

      {(step === "game" || step === "submitting") && !GAME_COMPONENTS[quest.game_type] && question && (
        <section className="game-card">
          <header>
            <span>Question {index + 1} / {quest.questions.length}</span>
            <button
              type="button"
              onClick={handleExit}
              style={{ border: "none", background: "none", cursor: "pointer", fontSize: ".78rem", color: "#c7473f", fontWeight: 700 }}
            >
              Exit Quest ✕
            </button>
          </header>

          <div className="game-progress"><i style={{ width: `${progress}%` }} /></div>

          {question.question_type !== "image_reveal" && (
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
                      cursor: "grab", border: "2px solid var(--color-border, #ddd)", background: "#fff",
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
                {selectedRight ? `Tap the left item that matches "${selectedRight}".` : "Tap an item on the right, then tap its match on the left — or drag it over."}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {leftKeys.map((leftKey) => (
                    <div
                      key={leftKey}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { const val = e.dataTransfer.getData("text/plain"); if (val) assign(leftKey, val); }}
                      onClick={() => selectedRight && assign(leftKey, selectedRight)}
                      style={{
                        padding: "14px 16px", borderRadius: 12, cursor: selectedRight ? "pointer" : "default",
                        border: matches[leftKey] ? "2px solid var(--color-purple, #7c5cfc)" : "2px dashed var(--color-border, #ddd)",
                        background: matches[leftKey] ? "rgba(124,92,252,.08)" : "#fff",
                        display: "flex", flexDirection: "column", gap: 4,
                      }}
                    >
                      <strong>{leftKey}</strong>
                      {matches[leftKey] ? (
                        <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: ".85rem", color: "var(--color-purple, #7c5cfc)" }}>
                          ↔ {matches[leftKey]}
                          <button onClick={(e) => { e.stopPropagation(); unassign(leftKey); }} style={{ border: "none", background: "none", cursor: "pointer", color: "#c7473f" }}>✕</button>
                        </span>
                      ) : <span style={{ fontSize: ".8rem", opacity: 0.5 }}>Drop or tap a match here</span>}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {matchRightPool.map((val, i) => {
                    const used = usedRight.has(val);
                    return (
                      <div
                        key={val + i} draggable={!used}
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", val)}
                        onClick={() => !used && setSelectedRight(val === selectedRight ? null : val)}
                        style={{
                          padding: "14px 16px", borderRadius: 12, cursor: used ? "default" : "grab",
                          border: selectedRight === val ? "2px solid var(--color-purple, #7c5cfc)" : "2px solid var(--color-border, #ddd)",
                          background: used ? "#f3f2ee" : "#fff", opacity: used ? 0.4 : 1, fontWeight: 600,
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
                        background: isFlipped ? grad.memory_tiles : "linear-gradient(135deg,#e9e5da,#d8d3c5)",
                        color: isFlipped ? "white" : "transparent",
                        animation: isMatched ? "tileMatchPulse 1s ease-out" : isWrong ? "tileWrongShake .4s" : "none",
                        boxShadow: isMatched ? "0 0 0 2px #14b8a6 inset" : "none",
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
                          color: isFound || isSelecting ? "white" : "#3a3628",
                          background: isFound ? "linear-gradient(135deg,#06b6d4,#22d3ee)"
                            : isSelecting ? "linear-gradient(135deg,#7c5cfc,#a78bfa)"
                              : "#fdfcf8",
                          border: "1px solid #e6e2da",
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
                      background: foundWords.has(word) ? "#06b6d4" : "#f3f2ee",
                      color: foundWords.has(word) ? "white" : "#7a7568",
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
                    border: guessState === "wrong" ? "2px solid #f43f5e" : guessState === "correct" ? "2px solid #22c55e" : "2px solid var(--color-border, #ddd)",
                    animation: guessState === "wrong" ? "tileWrongShake .4s" : "none",
                  }}
                />
                <button
                  className="btn btn-primary"
                  style={{ background: guessState === "correct" ? "#22c55e" : grad.image_reveal, border: "none" }}
                  onClick={submitGuess}
                  disabled={guessState === "correct" || !guess.trim()}
                >
                  {guessState === "correct" ? "Correct! 🎉" : "Guess"}
                </button>
              </div>
            </div>
          )}

          <footer>
            <button className="btn btn-secondary" disabled={!index} onClick={() => setIndex(index - 1)}>Back</button>
            <button
              className="btn btn-primary"
              onClick={() => (index === quest.questions.length - 1 ? finish() : setIndex(index + 1))}
            >
              {index === quest.questions.length - 1 ? "Finish Quest" : "Next"}
            </button>
          </footer>
        </section>
      )}

      {showExitConfirm && (
        <div
          onClick={() => setShowExitConfirm(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(20,15,45,.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1000, padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: 20, padding: "28px 26px", maxWidth: 380,
              width: "100%", textAlign: "center", boxShadow: "0 24px 60px rgba(20,15,45,.35)",
            }}
          >
            <div style={{ fontSize: "2rem", marginBottom: 8 }}>⚠️</div>
            <h3 style={{ margin: "0 0 8px" }}>Exit this quest?</h3>
            <p style={{ fontSize: ".88rem", color: "#7a7568", margin: "0 0 22px", lineHeight: 1.5 }}>
              Your answers on this page will be cleared — you'll need to start over from question 1 next time.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowExitConfirm(false)}>
                Cancel
              </button>
              <button
                className="btn"
                style={{ flex: 1, background: "#c7473f", color: "#fff", border: "none" }}
                onClick={confirmExit}
              >
                Exit Quest
              </button>
            </div>
          </div>
        </div>
      )}
    </StudentLayout>
  );
}