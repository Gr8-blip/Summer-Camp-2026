import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { answerLostGrid, checkProjectSubmission, getLostGrid } from "../../api/client";
import CodingPlayground from "../../components/CodingPlayGround";
import CodingChallengePlayground from "../../components/Codingchallengeplayground";
import ProjectSubmissionPlayer from "../../components/ProjectSubmissionPlayer";
import { generateWordSearch, matchSelection, straightLine } from "../../components/wordSearchGenerator";
import "./lost-grid.css";

/**
 * QUIZGRID — fullscreen quiz-arena game show (formerly "Lost Grid").
 *
 * No maze, no movement, no health/inventory. A mission is a stack of
 * rounds; each round is a stack of questions. This component's only real
 * job is to walk that stack against `progress.answered_questions` and
 * decide what to show: INTRO -> ROUND BANNER -> QUESTION (repeat) ->
 * ROUND COMPLETE -> next ROUND BANNER... -> FINAL RESULTS.
 *
 * Every question type is rendered by the exact same body components the
 * old maze used (ChoiceBody / TextBody / MatchPairsBody / DragOrderBody /
 * MemoryTilesBody / WordSearchBody / CodingPlayground /
 * CodingChallengePlayground / ProjectSubmissionPlayer) — scoring for every
 * type is unchanged; only the surrounding chrome is new.
 */

const ROUND_THEMES = [
  { grad: "linear-gradient(135deg,#7c5cfc,#a78bfa)", glow: "#7c5cfc" },
  { grad: "linear-gradient(135deg,#22d3ee,#67e8f9)", glow: "#22d3ee" },
  { grad: "linear-gradient(135deg,#ff5c8a,#f97316)", glow: "#ff5c8a" },
  { grad: "linear-gradient(135deg,#eab308,#fde047)", glow: "#eab308" },
  { grad: "linear-gradient(135deg,#22c55e,#86efac)", glow: "#22c55e" },
];
const themeFor = (i) => ROUND_THEMES[i % ROUND_THEMES.length];

export default function LostGrid() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [screen, setScreen] = useState("loading"); // loading | intro | round-banner | question | round-complete | final
  const [roundIdx, setRoundIdx] = useState(0);
  const [flash, setFlash] = useState(null); // {tone:'good'|'bad'}
  const [burstId, setBurstId] = useState(0); // increments to replay the confetti burst
  const [badgeQueue, setBadgeQueue] = useState([]); // unlocked badges waiting to be shown, one at a time
  const [activeBadge, setActiveBadge] = useState(null);
  const [busy, setBusy] = useState(false);
  const [projectAnswer, setProjectAnswer] = useState(null);
  const [projectVerifying, setProjectVerifying] = useState(false);
  const [lastRoundReward, setLastRoundReward] = useState(null);
  const flashTimer = useRef(null);

  // Drains the badge queue one at a time — each unlock shows for ~2.4s
  // before the next one (if any) takes its place.
  useEffect(() => {
    if (activeBadge || !badgeQueue.length) return;
    const [next, ...rest] = badgeQueue;
    setActiveBadge(next);
    setBadgeQueue(rest);
    const t = setTimeout(() => setActiveBadge(null), 2400);
    return () => clearTimeout(t);
  }, [badgeQueue, activeBadge]);

  useEffect(() => {
    let cancelled = false;
    getLostGrid(id)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        const answered = new Set(res.progress.answered_questions);
        if (res.progress.completed_at) {
          setScreen("final");
          return;
        }
        const firstUnfinishedRound = (res.mission.rounds || []).findIndex((r) => r.questions.some((q) => !answered.has(q.id)));
        setRoundIdx(firstUnfinishedRound === -1 ? 0 : firstUnfinishedRound);
        setScreen(answered.size > 0 ? "round-banner" : "intro");
      })
      .catch((err) => !cancelled && setError(err.data?.detail || "Couldn't load QuizGrid."));
    return () => { cancelled = true; clearTimeout(flashTimer.current); };
  }, [id]);

  if (error) return (
    <div className="lgx-error">
      <div className="lgx-error-icon">⚠</div>
      <p>{error}</p>
      <button onClick={() => navigate("/week6")}>Return</button>
    </div>
  );
  if (!data || screen === "loading") return (
    <div className="lgx-loading">
      <div className="lgx-loading-ring" />
      <span>LOADING QUIZGRID…</span>
    </div>
  );

  const { mission, progress } = data;
  const rounds = mission.rounds || [];
  const answeredSet = new Set(progress.answered_questions);
  const totalQuestions = rounds.reduce((n, r) => n + r.questions.length, 0);
  const totalAnswered = progress.answered_count;
  const round = rounds[roundIdx];
  const theme = themeFor(roundIdx);
  const currentQuestion = round?.questions.find((q) => !answeredSet.has(q.id));

  const goToNextRoundOrFinal = () => {
    const nextIdx = roundIdx + 1;
    if (nextIdx < rounds.length) {
      setRoundIdx(nextIdx);
      setScreen("round-banner");
    } else {
      setScreen("final");
    }
  };

  const submitAnswer = async (payload) => {
    if (!currentQuestion || busy) return;
    setBusy(true);
    try {
      const result = await answerLostGrid(id, currentQuestion.id, payload);
      setData((cur) => ({ ...cur, progress: result.progress }));
      const timedOut = payload?.timed_out === true;
      const xp = result.xp_gained || 0;
      const coins = result.coins_gained || 0;
      const streakBonus = result.streak_bonus_xp || 0;
      setFlash({ tone: result.correct ? "good" : "bad", timedOut, xp, coins, streak: result.streak, streakBonus });
      // Correct answers pay out immediately (game.py awards per-question,
      // not just on round clear) — pop confetti right here rather than
      // waiting for the round-complete screen.
      if (result.correct && !timedOut && (xp > 0 || coins > 0)) setBurstId((n) => n + 1);
      // Badge unlocks queue up and get shown one at a time by the effect
      // below, so they never fight the answer flash for screen space.
      if (result.new_badges && result.new_badges.length) {
        setBadgeQueue((q) => [...q, ...result.new_badges]);
      }
      flashTimer.current = setTimeout(() => {
        setFlash(null);
        if (result.round_completed) {
          setLastRoundReward(result.round_completed);
          setScreen("round-complete");
        } else if (result.mission_completed) {
          setScreen("final");
        }
        // else: same screen, next unanswered question in this round
        // renders automatically since `currentQuestion` is re-derived.
      }, 900);
    } catch (err) {
      setFlash({ tone: "bad", message: err.data?.detail || "Something went wrong — try again." });
      flashTimer.current = setTimeout(() => setFlash(null), 1600);
    } finally {
      setBusy(false);
      setProjectAnswer(null);
    }
  };

  return (
    <main className="lgx-arena" style={{ "--lgx-glow": theme.glow }}>
      <div className="lgx-bg-grid" />
      <div className="lgx-bg-glow" />

      <header className="lgx-hud">
        <button className="lgx-exit" onClick={() => navigate("/week6")}>← Exit</button>
        <div className="lgx-hud-title">QUIZGRID</div>
        <div className="lgx-hud-stats">
          <span>⭐ {progress.xp ?? 0}</span>
          <span>🪙 {progress.coins ?? 0}</span>
          {progress.current_streak >= 2 && <span className="lgx-hud-streak">🔥 x{progress.current_streak}</span>}
        </div>
      </header>

      {screen !== "intro" && screen !== "final" && (
        <div className="lgx-progress">
          <div className="lgx-progress-track">
            <div className="lgx-progress-fill" style={{ width: `${(totalAnswered / Math.max(1, totalQuestions)) * 100}%`, background: theme.grad }} />
          </div>
          <span>{totalAnswered}/{totalQuestions} cleared</span>
        </div>
      )}

      {screen === "intro" && (
        <IntroScreen mission={mission} onStart={() => setScreen("round-banner")} />
      )}

      {screen === "round-banner" && round && (
        <RoundBanner round={round} index={roundIdx} total={rounds.length} theme={theme} onDone={() => setScreen("question")} />
      )}

      {screen === "question" && round && currentQuestion && (
        <QuestionScreen
          key={currentQuestion.id}
          round={round}
          index={roundIdx}
          question={currentQuestion}
          theme={theme}
          busy={busy}
          onAnswer={submitAnswer}
          projectAnswer={projectAnswer}
          setProjectAnswer={setProjectAnswer}
          projectVerifying={projectVerifying}
          setProjectVerifying={setProjectVerifying}
        />
      )}

      {screen === "round-complete" && (
        <RoundCompleteScreen reward={lastRoundReward} isLastRound={roundIdx + 1 >= rounds.length} onNext={goToNextRoundOrFinal} />
      )}

      {screen === "final" && (
        <FinalScreen mission={mission} progress={progress} onExit={() => navigate("/week6")} />
      )}

      {flash && (
        <div className={`lgx-flash lgx-flash-${flash.timedOut ? "timeout" : flash.tone}`}>
          <span>{flash.timedOut ? "⏰ TIME'S UP!" : flash.tone === "good" ? "✔ CORRECT!" : "✖ NOT QUITE"}</span>
          {flash.tone === "good" && !flash.timedOut && (flash.xp > 0 || flash.coins > 0) && (
            <div className="lgx-flash-reward">
              {flash.xp > 0 && <span>⭐ +{flash.xp} XP</span>}
              {flash.coins > 0 && <span>🪙 +{flash.coins}</span>}
            </div>
          )}
          {flash.tone === "good" && !flash.timedOut && flash.streakBonus > 0 && (
            <div className="lgx-flash-streak">🔥 {flash.streak} in a row! +{flash.streakBonus} bonus XP</div>
          )}
          {flash.message && <small>{flash.message}</small>}
        </div>
      )}

      {burstId > 0 && <ConfettiBurst key={burstId} />}

      {activeBadge && (
        <div className="lgx-badge-unlock" key={activeBadge.id}>
          <div className={`lgx-badge-unlock-card rarity-${activeBadge.rarity}`}>
            <div className="lgx-badge-unlock-label">🏆 BADGE UNLOCKED</div>
            <div className="lgx-badge-unlock-icon">{activeBadge.icon}</div>
            <div className="lgx-badge-unlock-name">{activeBadge.name}</div>
            <div className="lgx-badge-unlock-rarity">{activeBadge.rarity}</div>
          </div>
        </div>
      )}
    </main>
  );
}

// ───────────────────────── screens ─────────────────────────

function IntroScreen({ mission, onStart }) {
  return (
    <section className="lgx-intro">
      <div className="lgx-intro-badge">🧠</div>
      <h1 className="lgx-intro-title">WELCOME TO<br /><span>QUIZGRID</span></h1>
      <p className="lgx-intro-sub">{mission.title}</p>
      <p className="lgx-intro-desc">{mission.description}</p>
      <button className="lgx-start-btn" onClick={onStart}>START ▶</button>
    </section>
  );
}

// Lightweight, dependency-free confetti — a burst of colored pieces that
// fly outward from the flash message and fade out. Re-mounted via a
// changing `key` on the caller so every correct-answer burst replays from
// scratch instead of reusing stale randomized positions.
const CONFETTI_COLORS = ["#7c5cfc", "#22d3ee", "#fbbf24", "#ff5c8a", "#86efac"];

function ConfettiBurst() {
  const pieces = useMemo(() => Array.from({ length: 26 }, (_, i) => {
    const angle = Math.random() * Math.PI * 2;
    const distance = 90 + Math.random() * 130;
    return {
      id: i,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance - 40, // bias upward so it reads as a "pop"
      rot: 180 + Math.random() * 540,
      dur: 700 + Math.random() * 500,
      delay: Math.random() * 80,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      round: i % 3 === 0,
    };
  }), []);

  return (
    <div className="lgx-confetti" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className={`lgx-confetti-piece ${p.round ? "round" : ""}`}
          style={{
            "--x": `${p.x}px`,
            "--y": `${p.y}px`,
            "--rot": `${p.rot}deg`,
            "--dur": `${p.dur}ms`,
            "--delay": `${p.delay}ms`,
            background: p.color,
          }}
        />
      ))}
    </div>
  );
}

function RoundBanner({ round, index, total, theme, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1600);
    return () => clearTimeout(t);
  }, [round.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="lgx-round-banner" onClick={onDone}>
      <span className="lgx-round-tag">ROUND {String(index + 1).padStart(2, "0")} / {total}</span>
      <h1 className="lgx-round-title" style={{ backgroundImage: theme.grad }}>
        <span className="lgx-round-icon">{round.icon || "⚡"}</span> {round.title}
      </h1>
      <span className="lgx-round-hint">tap to begin</span>
    </section>
  );
}

function RoundCompleteScreen({ reward, isLastRound, onNext }) {
  return (
    <section className="lgx-round-complete">
      <div className="lgx-round-complete-burst">🎉</div>
      <h1>ROUND COMPLETE!</h1>
      {reward && (
        <div className="lgx-round-complete-rewards">
          {reward.xp > 0 && <span className="lgx-reward-pill">⭐ +{reward.xp} XP</span>}
          {reward.coins > 0 && <span className="lgx-reward-pill">🪙 +{reward.coins} coins</span>}
        </div>
      )}
      <button className="lgx-start-btn" onClick={onNext}>{isLastRound ? "SEE RESULTS ▶" : "NEXT ROUND ▶"}</button>
    </section>
  );
}

function FinalScreen({ mission, progress, onExit }) {
  const accuracy = progress.answered_count ? Math.round((progress.correct_count / progress.answered_count) * 100) : 0;
  return (
    <section className="lgx-final">
      <div className="lgx-final-icon">🏆</div>
      <h1>GRID CLEARED!</h1>
      <p className="lgx-final-sub">{mission.title}</p>
      <div className="lgx-final-stats">
        <div className="lgx-final-stat"><strong>{accuracy}%</strong><span>Accuracy</span></div>
        <div className="lgx-final-stat"><strong>⭐ {progress.xp ?? 0}</strong><span>XP earned</span></div>
        <div className="lgx-final-stat"><strong>🪙 {progress.coins ?? 0}</strong><span>Coins earned</span></div>
      </div>
      <button className="lgx-start-btn" onClick={onExit}>RETURN TO WEEK 6</button>
    </section>
  );
}

function QuestionScreen({ round, index, question, theme, busy, onAnswer, projectAnswer, setProjectAnswer, projectVerifying, setProjectVerifying }) {
  const content = question.content || {};
  const type = question.question_type;
  const timeLimit = question.time_limit;

  // Countdown lives here so it resets cleanly per-question (key={question.id}
  // on the parent already forces a remount) and fires exactly once.
  const [secondsLeft, setSecondsLeft] = useState(timeLimit || 0);
  const [timedOut, setTimedOut] = useState(false);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!timeLimit) return;
    setSecondsLeft(timeLimit);
    firedRef.current = false;
    const tick = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(tick);
          if (!firedRef.current) {
            firedRef.current = true;
            setTimedOut(true);
            onAnswer({ timed_out: true });
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id, timeLimit]);

  const urgent = timeLimit && secondsLeft <= 5;

  return (
    <section className="lgx-question-wrap">
      <div className="lgx-question-eyebrow" style={{ color: theme.glow }}>
        <span>{round.icon || "⚡"} {round.title}</span>
        {timeLimit ? (
          <span className={`lgx-q-timer ${urgent ? "urgent" : ""}`}>⏱ {secondsLeft}s</span>
        ) : null}
      </div>

      <div className={`lgx-question-card ${timedOut ? "locked" : ""}`} style={{ "--card-glow": theme.glow }}>
        {timeLimit ? (
          <div className="lgx-q-timer-track">
            <div className="lgx-q-timer-fill" style={{ width: `${(secondsLeft / timeLimit) * 100}%`, background: urgent ? "#ff5c8a" : theme.grad }} />
          </div>
        ) : null}
        {type === "interactive_coding" && (
          <CodingPlayground
            content={content}
            storageKey={`lostgrid-coding-classic-${question.id}`}
            onResult={(results) => onAnswer(results)}
            onExit={() => {}}
            canGoBack={false}
            isLast
            finishLabel="Submit"
            exitLabel=""
            onNext={(freshResult) => freshResult && onAnswer(freshResult)}
          />
        )}
        {type === "coding_challenge" && (
          <CodingChallengePlayground
            content={content}
            storageKey={`lostgrid-coding-${question.id}`}
            onResult={(results) => onAnswer(results)}
            onExit={() => {}}
            canGoBack={false}
            isLast
            finishLabel="Submit"
            exitLabel=""
            onNext={(freshResult) => freshResult && onAnswer(freshResult)}
          />
        )}
        {type === "project_submission" && (
          <>
            <ProjectSubmissionPlayer
              key={question.id}
              question={{ ...question, id: question.bank_question_id }}
              questionKind="challenge"
              onAnswer={(value) => setProjectAnswer(value)}
            />
            <button
              className="lgx-q-submit"
              style={{ background: theme.grad }}
              disabled={!projectAnswer || projectVerifying || busy}
              onClick={async () => {
                setProjectVerifying(true);
                try {
                  const result = await checkProjectSubmission("challenge", question.bank_question_id, projectAnswer);
                  await onAnswer(result);
                } finally {
                  setProjectVerifying(false);
                }
              }}
            >
              {projectVerifying ? "Verifying…" : "Submit for review"}
            </button>
          </>
        )}
        {!["interactive_coding", "coding_challenge", "project_submission"].includes(type) && (
          <EncounterQuestion question={question} content={content} onResolve={onAnswer} theme={theme} />
        )}
      </div>
    </section>
  );
}

// ───────────────────────── question renderer ─────────────────────────
// Same per-type body components the maze version used — scoring contract
// for every question_type is unchanged, only the class-name namespace
// (lgx-q-* instead of lg3d-q-*) and surrounding chrome differ.

function EncounterQuestion({ question, content, onResolve, theme }) {
  const type = question.question_type;
  if (type === "multiple_choice") return <ChoiceBody prompt={content.question} options={content.options || []} onPick={(i) => onResolve(i)} theme={theme} />;
  if (type === "true_false") return <ChoiceBody prompt={content.question} options={["True", "False"]} onPick={(i) => onResolve(i === 0)} theme={theme} />;
  if (type === "fill_blank") return <TextBody prompt={content.question} placeholder="Type your answer..." onSubmit={(v) => onResolve(v)} theme={theme} />;
  if (type === "prompt_build") return <TextBody prompt={content.task} placeholder="Write your prompt..." multiline onSubmit={(v) => onResolve(v)} theme={theme} />;
  if (type === "image_reveal") return <TextBody prompt={content.question} placeholder="Your guess..." onSubmit={(v) => onResolve(v)} theme={theme} />;
  if (type === "match_pairs") return <MatchPairsBody content={content} onSubmit={(v) => onResolve(v)} theme={theme} />;
  if (type === "drag_order") return <DragOrderBody content={content} onResolve={(v) => onResolve(v)} theme={theme} />;
  if (type === "memory_tiles") return <MemoryTilesBody content={content} onResolve={(payload) => onResolve(payload)} />;
  if (type === "word_search") return <WordSearchBody content={content} onResolve={(payload) => onResolve(payload)} />;
  return <TextBody prompt={content.question || "Complete this activity"} placeholder="Your answer..." onSubmit={(v) => onResolve(v)} theme={theme} />;
}

function ChoiceBody({ prompt, options, onPick, theme }) {
  return (
    <>
      {prompt && <p className="lgx-q-prompt">{prompt}</p>}
      <div className="lgx-q-choices">
        {options.map((o, i) => (
          <button key={i} className="lgx-q-choice" onClick={() => onPick(i)}>
            <span>{o}</span>
            <span className="lgx-q-choice-verb">ANSWER</span>
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
      {prompt && <p className="lgx-q-prompt">{prompt}</p>}
      {multiline ? (
        <textarea className="lgx-q-input" rows={3} value={val} onChange={(e) => setVal(e.target.value)} placeholder={placeholder} />
      ) : (
        <input
          className="lgx-q-input"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => e.key === "Enter" && val.trim() && onSubmit(val)}
        />
      )}
      <button className="lgx-q-submit" disabled={!val.trim()} style={{ background: theme.grad }} onClick={() => onSubmit(val)}>Submit</button>
    </>
  );
}

function MemoryTilesBody({ content, onResolve }) {
  const pairs = content.pairs || [];
  const tiles = useMemo(
    () => [...pairs.flatMap(([a, b], i) => [{ id: `${i}a`, pairId: i, label: a }, { id: `${i}b`, pairId: i, label: b }])].sort(() => Math.random() - 0.5),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [flipped, setFlipped] = useState([]);
  const [matched, setMatched] = useState(new Set());
  const [wrong, setWrong] = useState([]);

  const flip = (tile) => {
    if (matched.has(tile.pairId) || flipped.some((t) => t.id === tile.id) || flipped.length === 2) return;
    const next = [...flipped, tile];
    setFlipped(next);
    if (next.length === 2) {
      const [a, b] = next;
      if (a.pairId === b.pairId) {
        setTimeout(() => {
          setMatched((prev) => {
            const upd = new Set(prev).add(a.pairId);
            if (upd.size === pairs.length) setTimeout(() => onResolve({ completed: true }), 300);
            return upd;
          });
          setFlipped([]);
        }, 300);
      } else {
        setWrong([a.id, b.id]);
        setTimeout(() => { setFlipped([]); setWrong([]); }, 650);
      }
    }
  };

  return (
    <>
      <p className="lgx-q-hint">{matched.size}/{pairs.length} pairs found</p>
      <div className="lgx-q-memory-grid">
        {tiles.map((t) => {
          const isMatched = matched.has(t.pairId);
          const isFlipped = isMatched || flipped.some((f) => f.id === t.id);
          const isWrong = wrong.includes(t.id);
          return (
            <button
              key={t.id}
              className={`lgx-q-memory-tile ${isFlipped ? "flipped" : ""} ${isWrong ? "wrong" : ""}`}
              onClick={() => flip(t)}
              disabled={isMatched}
            >
              {isFlipped ? t.label : "❓"}
            </button>
          );
        })}
      </div>
    </>
  );
}

function WordSearchBody({ content, onResolve }) {
  const puzzle = useMemo(() => generateWordSearch(content.words || []), []); // eslint-disable-line react-hooks/exhaustive-deps
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
      if (nf.size === puzzle.words.length) setTimeout(() => onResolve([...nf]), 250);
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
      <p className="lgx-q-hint">{found.size}/{puzzle.words.length} words found — drag across letters to select</p>
      <div className="lgx-q-wordsearch" onMouseUp={end} onTouchEnd={end} style={{ gridTemplateColumns: `repeat(${puzzle.size}, 1fr)` }}>
        {puzzle.grid.map((row, r) => row.map((letter, c) => {
          const k = cellKey(r, c);
          const isFound = foundCells.has(k);
          const isSel = selCells.some(([sr, sc]) => sr === r && sc === c);
          return (
            <div
              key={k}
              data-row={r}
              data-col={c}
              className={`lgx-q-ws-cell ${isFound ? "found" : ""} ${isSel ? "selected" : ""}`}
              onMouseDown={() => begin(r, c)}
              onMouseEnter={() => extend(r, c)}
              onTouchStart={(e) => { const cell = cellFromTouch(e.touches[0]); if (cell) begin(...cell); }}
              onTouchMove={(e) => { const cell = cellFromTouch(e.touches[0]); if (cell) extend(...cell); }}
            >
              {letter}
            </div>
          );
        }))}
      </div>
      <div className="lgx-q-ws-words">
        {wordList.map((word) => (
          <span key={word} className={`lgx-q-ws-word ${found.has(word) ? "found" : ""}`}>{word}</span>
        ))}
      </div>
    </>
  );
}

function MatchPairsBody({ content, onSubmit, theme }) {
  const left = content.left || [];
  const rightPool = useMemo(() => [...(content.right || [])].sort(() => Math.random() - 0.5), []); // eslint-disable-line
  const [matches, setMatches] = useState({});
  const [selRight, setSelRight] = useState(null);
  const used = new Set(Object.values(matches));

  return (
    <>
      {content.question && <p className="lgx-q-prompt">{content.question}</p>}
      <p className="lgx-q-hint">Pick a right-hand item, then tap its match on the left.</p>
      <div className="lgx-q-match">
        <div className="lgx-q-match-col">
          {left.map((l) => {
            const matchedIdx = matches[l];
            return (
              <div
                key={l}
                className={`lgx-q-match-item ${matchedIdx != null ? "matched" : ""}`}
                onClick={() => { if (matchedIdx == null && selRight != null) { setMatches((m) => ({ ...m, [l]: selRight })); setSelRight(null); } }}
              >
                <strong>{l}</strong>
                {matchedIdx != null && <span>↔ {rightPool[matchedIdx]}</span>}
              </div>
            );
          })}
        </div>
        <div className="lgx-q-match-col">
          {rightPool.map((r, i) => (
            <button key={i} disabled={used.has(i)} className={`lgx-q-match-pill ${selRight === i ? "selected" : ""}`} onClick={() => !used.has(i) && setSelRight(i)}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <button
        className="lgx-q-submit"
        style={{ background: theme.grad }}
        disabled={Object.keys(matches).length < left.length}
        onClick={() => onSubmit(Object.fromEntries(Object.entries(matches).map(([l, i]) => [l, rightPool[i]])))}
      >
        Submit
      </button>
    </>
  );
}

function DragOrderBody({ content, onResolve, theme }) {
  const correctOrder = content.items || [];
  const [order, setOrder] = useState(() => [...correctOrder].sort(() => Math.random() - 0.5));

  const nudge = (i, dir) => {
    const target = i + dir;
    if (target < 0 || target >= order.length) return;
    setOrder((prev) => {
      const next = [...prev];
      [next[i], next[target]] = [next[target], next[i]];
      return next;
    });
  };

  return (
    <>
      {content.question && <p className="lgx-q-prompt">{content.question}</p>}
      <p className="lgx-q-hint">Use the arrows to put these in the correct order:</p>
      <div className="lgx-q-order">
        {order.map((item, i) => (
          <div key={item + i} className="lgx-q-order-row">
            <span className="lgx-q-order-num">{i + 1}</span>
            <span className="lgx-q-order-label">{item}</span>
            <div className="lgx-q-order-nudges">
              <button disabled={i === 0} onClick={() => nudge(i, -1)}>▲</button>
              <button disabled={i === order.length - 1} onClick={() => nudge(i, 1)}>▼</button>
            </div>
          </div>
        ))}
      </div>
      <button className="lgx-q-submit" style={{ background: theme.grad }} onClick={() => onResolve(order)}>Submit</button>
    </>
  );
}