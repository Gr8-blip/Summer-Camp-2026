import { useEffect, useMemo, useRef, useState, useCallback, memo } from "react";
import { generateWordSearch, matchSelection, straightLine } from "./wordSearchGenerator";

/**
 * DungeonCrawler v2 — Pac-Man-flavored maze game as a "renderer" for an
 * existing question bank. See v1 header notes for the full contract;
 * unchanged: it hands back `{questionId: response}` via onComplete, exactly
 * what ChallengePlay/QuestPlay already submit — zero backend awareness of
 * "games" needed.
 *
 * What's new:
 *  - Bigger maze + a camera viewport that pans/follows the player instead
 *    of rendering the whole thing at once (feels huge without a huge DOM).
 *  - Roaming mobs (ghosts) that patrol the corridors on their own timer and
 *    drain HP on contact — a totally separate danger from the question
 *    trials. You must still clear every trial before the exit unlocks.
 *  - Pellets on the floor for that classic crunch (cosmetic).
 *  - Redesigned question card.
 */

// ───────────────────────── maze generation ─────────────────────────

function generateMaze(size) {
  const cells = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => ({
      r, c, visited: false,
      walls: { N: true, S: true, E: true, W: true },
    }))
  );
  const DIRS = [
    ["N", -1, 0, "S"], ["S", 1, 0, "N"],
    ["E", 0, 1, "W"], ["W", 0, -1, "E"],
  ];
  const stack = [cells[0][0]];
  cells[0][0].visited = true;

  while (stack.length) {
    const cur = stack[stack.length - 1];
    const options = DIRS
      .map(([dir, dr, dc, opp]) => ({ dir, opp, nr: cur.r + dr, nc: cur.c + dc }))
      .filter(({ nr, nc }) => nr >= 0 && nr < size && nc >= 0 && nc < size && !cells[nr][nc].visited);

    if (!options.length) { stack.pop(); continue; }
    const pick = options[Math.floor(Math.random() * options.length)];
    cur.walls[pick.dir] = false;
    cells[pick.nr][pick.nc].walls[pick.opp] = false;
    cells[pick.nr][pick.nc].visited = true;
    stack.push(cells[pick.nr][pick.nc]);
  }

  // Braid pass: knock down a handful of extra dead-end walls so the maze
  // has loops (like Pac-Man corridors) instead of being a pure single-path
  // tree — makes mob-dodging actually possible instead of a hallway.
  const DIR4 = [["N", -1, 0, "S"], ["S", 1, 0, "N"], ["E", 0, 1, "W"], ["W", 0, -1, "E"]];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const openCount = DIR4.filter(([d]) => !cells[r][c].walls[d]).length;
      if (openCount === 1 && Math.random() < 0.35) {
        const candidates = DIR4.filter(([d, dr, dc]) => {
          const nr = r + dr, nc = c + dc;
          return nr >= 0 && nr < size && nc >= 0 && nc < size && cells[r][c].walls[d];
        });
        if (candidates.length) {
          const [dir, dr, dc, opp] = candidates[Math.floor(Math.random() * candidates.length)];
          cells[r][c].walls[dir] = false;
          cells[r + dr][c + dc].walls[opp] = false;
        }
      }
    }
  }
  return cells;
}

function distancesFrom(cells, size, start) {
  const dist = Array.from({ length: size }, () => Array(size).fill(Infinity));
  dist[start.r][start.c] = 0;
  const q = [start];
  while (q.length) {
    const cur = q.shift();
    const cell = cells[cur.r][cur.c];
    const steps = [["N", -1, 0], ["S", 1, 0], ["E", 0, 1], ["W", 0, -1]];
    for (const [dir, dr, dc] of steps) {
      if (cell.walls[dir]) continue;
      const nr = cur.r + dr, nc = cur.c + dc;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      if (dist[nr][nc] > dist[cur.r][cur.c] + 1) {
        dist[nr][nc] = dist[cur.r][cur.c] + 1;
        q.push({ r: nr, c: nc });
      }
    }
  }
  return dist;
}

// Same BFS as distancesFrom, but a single cell (`blocked`) is treated as a
// wall — you can be adjacent to it, but you can never step through it. Used
// to figure out which floor cells are reachable WITHOUT ever crossing the
// exit, so trials/potions never get placed somewhere only reachable by
// passing through a door that's locked until they're all cleared.
function distancesFromBlocking(cells, size, start, blocked) {
  const dist = Array.from({ length: size }, () => Array(size).fill(Infinity));
  dist[start.r][start.c] = 0;
  const q = [start];
  while (q.length) {
    const cur = q.shift();
    const cell = cells[cur.r][cur.c];
    const steps = [["N", -1, 0], ["S", 1, 0], ["E", 0, 1], ["W", 0, -1]];
    for (const [dir, dr, dc] of steps) {
      if (cell.walls[dir]) continue;
      const nr = cur.r + dr, nc = cur.c + dc;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      if (nr === blocked.r && nc === blocked.c) continue;
      if (dist[nr][nc] > dist[cur.r][cur.c] + 1) {
        dist[nr][nc] = dist[cur.r][cur.c] + 1;
        q.push({ r: nr, c: nc });
      }
    }
  }
  return dist;
}

const key = (r, c) => `${r},${c}`;
function shuffledArr(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const ICONS = {
  multiple_choice: "🎯", true_false: "⚖️", fill_blank: "✏️", prompt_build: "🤖",
  drag_order: "🧩", match_pairs: "🔗", memory_tiles: "🧠", word_search: "🔍", image_reveal: "🖼️",
};

const MOB_COLORS = ["#ff5c8a", "#22d3ee", "#f97316", "#a78bfa"];
const DIR4 = [["N", -1, 0], ["S", 1, 0], ["E", 0, 1], ["W", 0, -1]];

// ── difficulty: scales mob count/speed/aggression, and — the actual
// point of it — the Coins payout multiplier. Chosen once per run, right
// after the walkthrough, via a modal that's upfront about the trade-off.
const DIFFICULTY = {
  easy:    { label: "Easy",    icon: "🌱", coinMult: 0.5, mobDelta: -2, tickMs: 640, chaseRadius: 5,  chaseChance: 0.45, desc: "Fewer, slower, less alert mobs. Best for a first run." },
  medium:  { label: "Medium",  icon: "⚔️", coinMult: 1,   mobDelta: 0,  tickMs: 480, chaseRadius: 7,  chaseChance: 0.65, desc: "The standard dungeon. Balanced risk and reward." },
  hard:    { label: "Hard",    icon: "🔥", coinMult: 1.5, mobDelta: 2,  tickMs: 380, chaseRadius: 8,  chaseChance: 0.78, desc: "More mobs, faster and more likely to chase you down." },
  extreme: { label: "Extreme", icon: "💀", coinMult: 2,   mobDelta: 4,  tickMs: 280, chaseRadius: 10, chaseChance: 0.9,  desc: "A swarm that hunts relentlessly. Only for the brave." },
};
const FACE_ROTATE = { E: 0, S: 90, W: 180, N: 270 };

// ───────────────────────── perf: memoized render layers ─────────────────────────
// The maze board can have up to 21×21 = 441 cells. Originally every cell was
// re-created and re-diffed on *any* state change in the parent (mob AI tick
// every 480ms, HP loss, hit-flash, toast messages, invulnerability blink,
// even player movement) because it all lived inline in one render function.
// None of those besides an actual pellet/potion/encounter/exit-lock change
// affect what a cell looks like, so the grid is split into its own memoized
// component: React skips calling it (and touching any of its 441 children)
// entirely unless the props it actually depends on change. Mobs and the
// player are similarly split out so a mob step (or a hit) never touches the
// grid, and vice versa. Movement also switches from animating `left`/`top`
// (which forces layout on every frame) to `transform`, which the browser can
// composite on the GPU — same easing/duration, cheaper to animate.

const MazeCell = memo(function MazeCell({ left, top, cellPx, wallN, wallS, wallE, wallW, isExit, exitUnlocked, isPotion, icon, showPellet }) {
  return (
    <div
      style={{
        position: "absolute", left, top, width: cellPx, height: cellPx, boxSizing: "border-box",
        contain: "layout paint",
        borderTop: wallN ? "3px solid #4c3f8c" : "3px solid transparent",
        borderLeft: wallW ? "3px solid #4c3f8c" : "3px solid transparent",
        borderRight: wallE ? "3px solid #4c3f8c" : "3px solid transparent",
        borderBottom: wallS ? "3px solid #4c3f8c" : "3px solid transparent",
        boxShadow: wallN || wallS || wallE || wallW ? "inset 0 0 6px rgba(124,92,252,.25)" : "none",
        background: isExit ? (exitUnlocked ? "#0f3d24" : "#3a1414") : "#1a1430",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: cellPx * 0.44, transition: "background .25s",
      }}
    >
      {showPellet && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#ffd166", boxShadow: "0 0 5px #ffd166" }} />}
      {isExit && <span style={{ animation: exitUnlocked ? "dcPulse 1.2s infinite" : "none", fontSize: cellPx * 0.5, willChange: exitUnlocked ? "transform, opacity" : "auto" }}>{exitUnlocked ? "🚪" : "🔒"}</span>}
      {!isExit && isPotion && <span style={{ animation: "dcFloat 1.4s ease-in-out infinite", fontSize: cellPx * 0.5, willChange: "transform" }}>❤️</span>}
      {!isExit && icon && (
        <span style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: cellPx * 0.68, height: cellPx * 0.68, borderRadius: "50%",
          background: "radial-gradient(circle,#7c5cfc,#4c2fb0)",
          boxShadow: "0 0 10px #7c5cfc, 0 0 2px #fff inset",
          animation: "dcPulse 1.3s infinite", fontSize: cellPx * 0.34, willChange: "transform, opacity",
        }}>
          {icon}
        </span>
      )}
    </div>
  );
});

// Only cells near the camera viewport are ever mounted — the maze can be up
// to 21×21 (441 cells), but at most ~11×11 are ever visible at once (the
// rest were previously still sitting in the DOM, just clipped by
// `overflow: hidden`, which meant every infinite pulse/float animation on an
// off-screen encounter or potion was still forcing the browser to repaint
// the whole board every frame). A 1-cell buffer around the viewport keeps
// cells from popping in/out during the camera's pan transition.
const MazeGrid = memo(function MazeGrid({ maze, size, cellPx, encounterMap, resolved, potionKeys, potionsUsed, pelletsEaten, exitR, exitC, allResolved, distNoExit, camR, camC, view }) {
  const buffer = 1;
  const rStart = Math.max(0, camR - buffer);
  const rEnd = Math.min(size, camR + view + buffer);
  const cStart = Math.max(0, camC - buffer);
  const cEnd = Math.min(size, camC + view + buffer);

  const cells = [];
  for (let r = rStart; r < rEnd; r++) {
    for (let c = cStart; c < cEnd; c++) {
      const cell = maze[r][c];
      const k = key(r, c);
      const isExit = r === exitR && c === exitC;
      const encounter = encounterMap.get(k);
      const isResolved = resolved.has(k);
      const isPotion = potionKeys.has(k) && !potionsUsed.has(k);
      const showPellet = !isExit && !encounter && !isPotion && !pelletsEaten.has(k) && distNoExit[r][c] !== Infinity;
      const icon = encounter && !isResolved ? (ICONS[encounter.question.question_type] || "❓") : null;
      cells.push(
        <MazeCell
          key={k}
          left={c * cellPx} top={r * cellPx} cellPx={cellPx}
          wallN={cell.walls.N} wallS={cell.walls.S} wallE={cell.walls.E} wallW={cell.walls.W}
          isExit={isExit} exitUnlocked={allResolved}
          isPotion={isPotion} icon={icon} showPellet={showPellet}
        />
      );
    }
  }
  return cells;
});

const MobSprite = memo(function MobSprite({ r, c, cellPx, color }) {
  return (
    <div
      style={{
        position: "absolute", left: 0, top: 0, width: cellPx, height: cellPx,
        display: "flex", alignItems: "center", justifyContent: "center",
        transform: `translate(${c * cellPx}px, ${r * cellPx}px)`,
        transition: "transform .42s linear", zIndex: 5, willChange: "transform",
      }}
    >
      <div style={{
        width: cellPx * 0.62, height: cellPx * 0.62, background: color,
        borderRadius: "50% 50% 6px 6px / 50% 50% 0 0", boxShadow: `0 0 10px ${color}`,
        position: "relative", animation: "dcGhostWave .5s ease-in-out infinite",
      }}>
        <span style={{ position: "absolute", top: "30%", left: "18%", width: "22%", height: "22%", background: "#fff", borderRadius: "50%" }} />
        <span style={{ position: "absolute", top: "30%", right: "18%", width: "22%", height: "22%", background: "#fff", borderRadius: "50%" }} />
      </div>
    </div>
  );
});

const MobsLayer = memo(function MobsLayer({ mobs, cellPx }) {
  return mobs.map((m) => <MobSprite key={m.id} r={m.r} c={m.c} cellPx={cellPx} color={m.color} />);
});

const PlayerSprite = memo(function PlayerSprite({ r, c, cellPx, facing, invulnerable }) {
  return (
    <div
      style={{
        position: "absolute", left: 0, top: 0, width: cellPx, height: cellPx,
        display: "flex", alignItems: "center", justifyContent: "center",
        transform: `translate(${c * cellPx}px, ${r * cellPx}px)`,
        transition: "transform .12s linear", zIndex: 6, willChange: "transform",
        animation: invulnerable ? "dcBlink .25s infinite" : "none",
      }}
    >
      <div style={{
        width: cellPx * 0.72, height: cellPx * 0.72, borderRadius: "50%", background: "#ffd166",
        boxShadow: "0 0 12px #ffd166", transform: `rotate(${FACE_ROTATE[facing]}deg)`,
        animation: "dcMouth .3s linear infinite",
      }} />
    </div>
  );
});

// ───────────────────────── main component ─────────────────────────

export default function DungeonCrawler({ questions, title = "Dungeon Crawl", onAnswer, onComplete, onExit }) {
  const size = Math.min(21, Math.max(11, questions.length + 8));
  const maze = useMemo(() => generateMaze(size), [size]);
  const dist = useMemo(() => distancesFrom(maze, size, { r: 0, c: 0 }), [maze, size]);
  const exit = { r: size - 1, c: size - 1 };
  // Reachability field that pretends the exit is already a wall — this is
  // the one trial/potion placement must use, since the exit really will be
  // locked until every trial is cleared.
  const distNoExit = useMemo(() => distancesFromBlocking(maze, size, { r: 0, c: 0 }, exit), [maze, size]);

  const encounterCells = useMemo(() => {
    const floor = [];
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if ((r === 0 && c === 0) || (r === exit.r && c === exit.c)) continue;
      if (distNoExit[r][c] === Infinity) continue;
      floor.push({ r, c, d: distNoExit[r][c] });
    }
    floor.sort((a, b) => a.d - b.d);
    const n = questions.length;
    const picked = [];
    for (let i = 0; i < n; i++) {
      const bucketStart = Math.floor((i / n) * floor.length);
      const bucketEnd = Math.floor(((i + 1) / n) * floor.length);
      const bucket = floor.slice(bucketStart, Math.max(bucketEnd, bucketStart + 1));
      const pick = bucket[Math.floor(Math.random() * bucket.length)] || floor[floor.length - 1];
      picked.push(pick);
      floor.splice(floor.indexOf(pick), 1);
    }
    return picked;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  const potionCells = useMemo(() => {
    const used = new Set(encounterCells.map((e) => key(e.r, e.c)));
    used.add(key(0, 0)); used.add(key(exit.r, exit.c));
    const candidates = [];
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++)
      if (!used.has(key(r, c)) && distNoExit[r][c] !== Infinity) candidates.push({ r, c });
    // Keep hearts scarce: mostly 2-3 on the map, occasionally 4, rarely 5 —
    // instead of scaling up with maze size (which used to litter the floor
    // with them on bigger mazes).
    const roll = Math.random();
    const heartCount = roll < 0.08 ? 5 : roll < 0.22 ? 4 : roll < 0.55 ? 3 : 2;
    return shuffledArr(candidates).slice(0, heartCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  const potionKeys = useMemo(() => new Set(potionCells.map((p) => key(p.r, p.c))), [potionCells]);

  const encounterMap = useMemo(() => {
    const m = new Map();
    encounterCells.forEach((cell, i) => {
      m.set(key(cell.r, cell.c), { question: questions[i], kind: i % 2 === 0 ? "enemy" : "gate" });
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounterCells]);

  // Every reachable tile that CAN show a pellet (everything except start,
  // exit, encounter tiles, and potion tiles) — the ground truth for "how
  // many pellets are actually on this floor," used both for the pellet
  // fade-out visual and for coin scoring at the end of the run.
  const pelletCells = useMemo(() => {
    const used = new Set([...encounterMap.keys(), ...potionKeys, key(0, 0), key(exit.r, exit.c)]);
    const cells = new Set();
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      const k = key(r, c);
      if (!used.has(k) && distNoExit[r][c] !== Infinity) cells.add(k);
    }
    return cells;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, encounterMap, potionKeys]);

  // ── mobs: independent wandering hazards, unrelated to questions ────
  const mobSpawnCells = useMemo(() => {
    const used = new Set([key(0, 0), key(exit.r, exit.c)]);
    encounterCells.forEach((e) => used.add(key(e.r, e.c)));
    const farCells = [];
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if (used.has(key(r, c))) continue;
      if (dist[r][c] < Math.floor(size / 2)) continue; // don't spawn on top of the player
      if (dist[r][c] === Infinity) continue;
      farCells.push({ r, c });
    }
    return farCells;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  const baseMobCount = Math.min(7, Math.max(4, Math.floor(size / 3) + 1));

  const spawnMobs = (count) =>
    shuffledArr(mobSpawnCells).slice(0, count).map((cell, i) => ({
      id: i, r: cell.r, c: cell.c, dir: DIR4[Math.floor(Math.random() * 4)][0], color: MOB_COLORS[i % MOB_COLORS.length],
    }));

  const initialMobs = useMemo(() => spawnMobs(baseMobCount), [mobSpawnCells]); // eslint-disable-line react-hooks/exhaustive-deps

  const [player, setPlayer] = useState({ r: 0, c: 0 });
  const [facing, setFacing] = useState("E");
  const [visited, setVisited] = useState(() => new Set([key(0, 0)]));
  const [pelletsEaten, setPelletsEaten] = useState(() => new Set([key(0, 0)]));
  const [resolved, setResolved] = useState(() => new Set());
  const [potionsUsed, setPotionsUsed] = useState(() => new Set());
  const [mobs, setMobs] = useState(initialMobs);
  const [hp, setHp] = useState(100);
  const [answers, setAnswers] = useState({});
  const [activeEncounter, setActiveEncounter] = useState(null);
  const [hitFlash, setHitFlash] = useState(null);
  const [toast, setToast] = useState("");
  const [gameOver, setGameOver] = useState(false);
  const [victory, setVictory] = useState(false);
  const [invulnerable, setInvulnerable] = useState(false);
  const [showIntro, setShowIntro] = useState(() => {
    try { return localStorage.getItem("dc_hide_intro") !== "1"; } catch { return true; }
  });
  const [showDifficulty, setShowDifficulty] = useState(() => {
    try { return localStorage.getItem("dc_hide_intro") === "1"; } catch { return false; }
  });
  const [difficulty, setDifficulty] = useState(null);

  const allResolved = resolved.size >= questions.length;
  const cellsRef = useRef(maze);
  cellsRef.current = maze;
  const playerRef = useRef(player);
  playerRef.current = player;
  const paused = !!activeEncounter || gameOver || victory || showIntro || showDifficulty;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const chooseDifficulty = (key) => {
    const cfg = DIFFICULTY[key];
    setDifficulty(key);
    const count = Math.min(12, Math.max(2, baseMobCount + cfg.mobDelta));
    setMobs(spawnMobs(count));
    setShowDifficulty(false);
  };

  const flash = (kind) => { setHitFlash(kind); setTimeout(() => setHitFlash(null), 450); };
  const say = (msg) => { setToast(msg); setTimeout(() => setToast((t) => (t === msg ? "" : t)), 1700); };

  // ── mob AI: hunts the player when it gets close, otherwise wanders the
  // corridors on its own. A fresh BFS distance-from-player field is
  // computed once per tick (cheap at this maze size) and every mob greedily
  // steps toward whichever open neighbor is closer to the player — with
  // just enough randomness mixed in that they're smart but still beatable
  // by a kid dodging through a loop in the maze.
  const diffCfg = DIFFICULTY[difficulty] || DIFFICULTY.medium;
  const CHASE_RADIUS = diffCfg.chaseRadius;
  const CHASE_CHANCE = diffCfg.chaseChance;
  useEffect(() => {
    const t = setInterval(() => {
      if (pausedRef.current) return;
      const cells = cellsRef.current;
      const distToPlayer = distancesFrom(cells, size, playerRef.current);
      setMobs((prev) => prev.map((mob) => {
        const cell = cells[mob.r][mob.c];
        const options = DIR4.filter(([d]) => !cell.walls[d]);
        if (!options.length) return mob;
        const reverse = { N: "S", S: "N", E: "W", W: "E" }[mob.dir];

        const myDist = distToPlayer[mob.r]?.[mob.c] ?? Infinity;
        const canChase = myDist !== Infinity && myDist <= CHASE_RADIUS && Math.random() < CHASE_CHANCE;

        let choice;
        if (canChase) {
          // Prefer whichever open neighbor gets strictly closer to the
          // player; avoid doubling straight back unless it's the only option.
          const ranked = options
            .map(([d, dr, dc]) => ({ d, dr, dc, dist: distToPlayer[mob.r + dr]?.[mob.c + dc] ?? Infinity }))
            .sort((a, b) => a.dist - b.dist);
          const best = ranked.filter((o) => o.dist === ranked[0].dist);
          const nonReverseBest = best.filter((o) => o.d !== reverse);
          const pick = (nonReverseBest.length ? nonReverseBest : best)[Math.floor(Math.random() * (nonReverseBest.length ? nonReverseBest.length : best.length))];
          choice = [pick.d, pick.dr, pick.dc];
        } else {
          const continuing = options.find(([d]) => d === mob.dir);
          const nonReverse = options.filter(([d]) => d !== reverse);
          if (continuing && Math.random() < 0.55) choice = continuing;
          else if (nonReverse.length) choice = nonReverse[Math.floor(Math.random() * nonReverse.length)];
          else choice = options[Math.floor(Math.random() * options.length)];
        }
        const [dir, dr, dc] = choice;
        return { ...mob, r: mob.r + dr, c: mob.c + dc, dir };
      }));
    }, diffCfg.tickMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, difficulty]);

  // ── mob collision: independent of the player's own move, since mobs
  // move on their own timer too ──
  useEffect(() => {
    if (paused || invulnerable) return;
    const hit = mobs.find((m) => m.r === player.r && m.c === player.c);
    if (!hit) return;
    setHp((h) => {
      const nh = Math.max(0, h - 14);
      if (nh <= 0) setTimeout(() => setGameOver(true), 300);
      return nh;
    });
    flash("miss");
    say("👻 A mob drained your HP!");
    setInvulnerable(true);
    setTimeout(() => setInvulnerable(false), 1100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobs, player]);

  const tryMove = useCallback((dr, dc, dir) => {
    if (paused) return;
    setFacing(dir);
    setPlayer((p) => {
      const cell = cellsRef.current[p.r][p.c];
      if (cell.walls[dir]) return p;
      const nr = p.r + dr, nc = p.c + dc;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) return p;

      // The exit is a real, impassable door until every trial is
      // cleared — not just a gated win-condition. This is safe because
      // trials/potions are placed using distNoExit, which guarantees a
      // path from the entrance that never has to cross this cell, so
      // locking it can never seal off an unfinished trial.
      if (nr === exit.r && nc === exit.c && !allResolved) {
        say("🔒 Sealed — clear every trial before the exit opens.");
        return p;
      }

      const k = key(nr, nc);
      setVisited((v) => new Set(v).add(k));
      setPelletsEaten((v) => new Set(v).add(k));

      if (encounterMap.has(k) && !resolved.has(k)) {
        setActiveEncounter({ r: nr, c: nc, ...encounterMap.get(k) });
        return { r: nr, c: nc };
      }
      if (potionCells.some((p2) => key(p2.r, p2.c) === k) && !potionsUsed.has(k)) {
        setPotionsUsed((s) => new Set(s).add(k));
        setHp((h) => Math.min(100, h + 30));
        flash("hit"); say("❤️ Health potion! +30 HP");
      }
      if (nr === exit.r && nc === exit.c) {
        setVictory(true);
      }
      return { r: nr, c: nc };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, allResolved, resolved, potionsUsed, encounterMap, potionCells, size]);

  useEffect(() => {
    const onKey = (e) => {
      const map = {
        ArrowUp: [-1, 0, "N"], w: [-1, 0, "N"], W: [-1, 0, "N"],
        ArrowDown: [1, 0, "S"], s: [1, 0, "S"], S: [1, 0, "S"],
        ArrowLeft: [0, -1, "W"], a: [0, -1, "W"], A: [0, -1, "W"],
        ArrowRight: [0, 1, "E"], d: [0, 1, "E"], D: [0, 1, "E"],
      };
      if (map[e.key]) { e.preventDefault(); tryMove(...map[e.key]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tryMove]);

  const resolveEncounter = (response, wasHit) => {
    const { r, c, question, kind } = activeEncounter;
    setAnswers((a) => ({ ...a, [question.id]: response }));
    onAnswer?.(question.id, response);
    setResolved((s) => new Set(s).add(key(r, c)));

    if (wasHit === false) {
      flash("miss");
      say("⚡ Not quite — but the trial still cracked open.");
    } else {
      flash("hit");
      say(kind === "gate" ? "🔓 Trial unlocked!" : "✨ Trial cleared!");
    }
    setActiveEncounter(null);
  };

  const respawn = () => {
    setPlayer({ r: 0, c: 0 });
    setHp(100);
    setGameOver(false);
    setInvulnerable(false);
  };

  useEffect(() => {
    if (victory) {
      // Coins now mostly reward pellet collection — the more of the floor
      // you actually swept, the bigger the payout — with a smaller flat
      // base for finishing and a little credit for potions found. HP is
      // gone from the formula since pellets are the thing we want kids
      // hunting for.
      const pelletsCollected = [...pelletsEaten].filter((k) => pelletCells.has(k)).length;
      const pelletTotal = Math.max(1, pelletCells.size);
      const pelletBonus = Math.round((pelletsCollected / pelletTotal) * (questions.length * 6));
      const rawCoins = questions.length * 2 + potionsUsed.size * 3 + pelletBonus;
      const coins = Math.round(rawCoins * diffCfg.coinMult);
      const t = setTimeout(() => onComplete(answers, coins), 1400);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [victory]);

  // No fog-of-war "chunk" border — the camera viewport already limits how
  // much of the maze is on screen at once, so everything inside it (walls,
  // items, and mobs) renders plainly. This lets players actually see mobs
  // coming from a distance instead of them popping out of the dark.

  // Visual size of the map card is independent of maze complexity (`size`
  // below) — bumped up so the card reads as noticeably bigger on screen,
  // not just a side-effect of a bigger/harder maze.
  const VIEW = 11;
  const cellPx = 46;
  const half = Math.floor(VIEW / 2);
  const camR = Math.min(Math.max(player.r - half, 0), Math.max(size - VIEW, 0));
  const camC = Math.min(Math.max(player.c - half, 0), Math.max(size - VIEW, 0));
  const viewportPx = Math.min(VIEW, size) * cellPx;

  return (
    <div style={{ maxWidth: 740, margin: "0 auto" }}>
      <style>{`
        @keyframes dcShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-6px)} 75%{transform:translateX(6px)} }
        @keyframes dcFlashHit { 0%{box-shadow:0 0 0 0 rgba(34,197,94,.55)} 100%{box-shadow:0 0 0 22px rgba(34,197,94,0)} }
        @keyframes dcFlashMiss { 0%{box-shadow:0 0 0 0 rgba(244,63,94,.6)} 100%{box-shadow:0 0 0 22px rgba(244,63,94,0)} }
        @keyframes dcPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.85)} }
        @keyframes dcPop { from{transform:scale(.85);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes dcMouth { 0%,100%{ clip-path: polygon(100% 50%, 45% 0%, 45% 100%); } 50%{ clip-path: polygon(100% 50%, 100% 20%, 100% 80%); } }
        @keyframes dcBlink { 0%,100%{opacity:1} 50%{opacity:.25} }
        @keyframes dcFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-3px)} }
        @keyframes dcGhostWave { 0%,100%{ border-radius: 50% 50% 6px 6px / 50% 50% 0 0; } 50%{ border-radius: 50% 50% 0 0 / 50% 50% 6px 6px; } }
      `}</style>

      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#fff" }}>🕹️ {title}</div>
          <div style={{ fontSize: ".78rem", color: "#8a8474" }}>
            {resolved.size} / {questions.length} trials cleared · 🟡 {[...pelletsEaten].filter((k) => pelletCells.has(k)).length}/{pelletCells.size} pellets
          </div>
        </div>
        {onExit && (
          <button onClick={onExit} style={{ border: "none", background: "none", cursor: "pointer", fontSize: ".78rem", color: "#c7473f", fontWeight: 700 }}>
            Exit ✕
          </button>
        )}
      </header>

      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".72rem", fontWeight: 700, color: "#7a7568", marginBottom: 3 }}>
          <span>❤️ HP</span><span>{hp}/100</span>
        </div>
        <div style={{ height: 10, borderRadius: 999, background: "#2a2440", overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${hp}%`, borderRadius: 999, transition: "width .3s ease",
            background: hp > 50 ? "linear-gradient(90deg,#22c55e,#4ade80)" : hp > 20 ? "linear-gradient(90deg,#f59e0b,#fbbf24)" : "linear-gradient(90deg,#ef4444,#f87171)",
          }} />
        </div>
      </div>

      {toast && (
        <div style={{ textAlign: "center", fontSize: ".82rem", fontWeight: 700, color: "#5b3fd6", background: "#efeaff", borderRadius: 10, padding: "6px 10px", marginBottom: 10, animation: "dcPop .2s ease-out" }}>
          {toast}
        </div>
      )}

      {/* Maze viewport — camera pans over a bigger board */}
      <div
        style={{
          position: "relative", margin: "0 auto", background: "radial-gradient(ellipse at center, #1c1436 0%, #0c0818 100%)",
          borderRadius: 20, padding: 10, width: viewportPx + 20, overflow: "hidden",
          boxShadow: "0 0 0 1px #3d3560, 0 20px 50px -20px rgba(124,92,252,.5)",
          animation: hitFlash === "hit" ? "dcFlashHit .45s" : hitFlash === "miss" ? "dcFlashMiss .45s, dcShake .35s" : "none",
        }}
      >
        <div style={{ position: "relative", width: viewportPx, height: viewportPx, overflow: "hidden", borderRadius: 12 }}>
          <div
            style={{
              position: "absolute", top: 0, left: 0, width: size * cellPx, height: size * cellPx,
              transition: "transform .18s ease-out",
              transform: `translate(${-camC * cellPx}px, ${-camR * cellPx}px)`,
              willChange: "transform",
            }}
          >
            <MazeGrid
              maze={maze} size={size} cellPx={cellPx} encounterMap={encounterMap}
              resolved={resolved} potionKeys={potionKeys} potionsUsed={potionsUsed}
              pelletsEaten={pelletsEaten} exitR={exit.r} exitC={exit.c}
              allResolved={allResolved} distNoExit={distNoExit}
              camR={camR} camC={camC} view={VIEW}
            />

            {/* mobs — absolutely positioned within the same transformed grid.
                Always rendered (no fog gate) so players can see them coming. */}
            <MobsLayer mobs={mobs} cellPx={cellPx} />

            {/* player — CSS-drawn pac shape, rotates to face movement */}
            <PlayerSprite r={player.r} c={player.c} cellPx={cellPx} facing={facing} invulnerable={invulnerable} />
          </div>
        </div>
      </div>

      {/* D-pad for mobile */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 48px)", gridTemplateRows: "repeat(2, 48px)", gap: 6, justifyContent: "center", margin: "16px auto 0" }}>
        <div />
        <DpadBtn onClick={() => tryMove(-1, 0, "N")}>↑</DpadBtn>
        <div />
        <DpadBtn onClick={() => tryMove(0, -1, "W")}>←</DpadBtn>
        <DpadBtn onClick={() => tryMove(1, 0, "S")}>↓</DpadBtn>
        <DpadBtn onClick={() => tryMove(0, 1, "E")}>→</DpadBtn>
      </div>
      <p style={{ textAlign: "center", fontSize: ".72rem", color: "#8a8474", marginTop: 6 }}>Arrow keys / WASD also work</p>

      {showIntro && <IntroWalkthrough onClose={() => { setShowIntro(false); setShowDifficulty(true); }} />}

      {showDifficulty && <DifficultyModal onChoose={chooseDifficulty} />}

      {activeEncounter && <EncounterModal encounter={activeEncounter} onResolve={resolveEncounter} />}

      {gameOver && (
        <Overlay>
          <div style={{ fontSize: "2.4rem" }}>💀</div>
          <h2 style={{ margin: "8px 0" }}>Knocked out!</h2>
          <p style={{ color: "#a09a89", marginBottom: 18 }}>Cleared trials stay cleared — you'll respawn at the entrance with full HP.</p>
          <button className="btn btn-primary" onClick={respawn} style={{ background: "linear-gradient(135deg,#7c5cfc,#a78bfa)", border: "none" }}>Respawn</button>
        </Overlay>
      )}

      {victory && (
        <Overlay>
          <div style={{ fontSize: "2.4rem" }}>🏆</div>
          <h2 style={{ margin: "8px 0" }}>Dungeon cleared!</h2>
          <p style={{ color: "#a09a89" }}>Submitting your run…</p>
        </Overlay>
      )}
    </div>
  );
}

function DpadBtn({ children, onClick }) {
  return (
    <button onClick={onClick} style={{ width: 48, height: 48, borderRadius: 12, border: "none", fontSize: "1.2rem", fontWeight: 800, background: "linear-gradient(135deg,#2a2440,#3d3560)", color: "#e6e2f5", cursor: "pointer" }}>
      {children}
    </button>
  );
}

// ───────────────────────── intro walkthrough ─────────────────────────
// Shown once per browser (persisted via localStorage) unless the player
// checks "Don't show again" or hits Skip. Paused gameplay behind it via
// the `showIntro` flag folded into the main `paused` computation.

const INTRO_SLIDES = [
  { icon: "🏰", grad: "linear-gradient(135deg,#7c5cfc,#a78bfa)", title: "Welcome, Explorer!", body: "A maze full of secrets awaits. Explore every corner, clear every Trial, and reach the exit before it's too late." },
  { icon: "🕹️", grad: "linear-gradient(135deg,#0ea5e9,#67e8f9)", title: "Move Around", body: "Use WASD or the Arrow Keys — or the on-screen D-pad on mobile — to explore the maze." },
  { icon: "👻", grad: "linear-gradient(135deg,#ff5c8a,#f97316)", title: "Watch Out for Mobs!", body: "Roaming mobs patrol the corridors. Touching one drains your HP — dodge them, or take the hit and keep moving." },
  { icon: "🔷", grad: "linear-gradient(135deg,#eab308,#fde047)", title: "Clear Every Trial", body: "Glowing orbs hide a quick question — pulled straight from what you've been learning in class. Answer it to clear the Trial, and clear ALL of them before the exit unlocks." },
  { icon: "🟡", grad: "linear-gradient(135deg,#22c55e,#86efac)", title: "Sweep Every Pellet", body: "Pellets cover the floor. Collecting them boosts your Coins at the end, so go for a full clear, not just a fast one!" },
  { icon: "🚪", grad: "linear-gradient(135deg,#f43f5e,#fda4af)", title: "Escape!", body: "Once every Trial is cleared, the exit unlocks. Reach it before the mobs — and your patience — run out." },
];

function IntroWalkthrough({ onClose }) {
  const [step, setStep] = useState(0);
  const [dontShow, setDontShow] = useState(false);
  const last = step === INTRO_SLIDES.length - 1;
  const slide = INTRO_SLIDES[step];

  const finish = () => {
    if (dontShow) { try { localStorage.setItem("dc_hide_intro", "1"); } catch { /* ignore */ } }
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(6,3,16,.93)", backdropFilter: "blur(2px)", zIndex: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: 18, animation: "dcPop .25s ease-out" }}>
      <button
        onClick={finish}
        style={{ position: "absolute", top: 22, right: 22, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.18)", color: "#e6e2f5", borderRadius: 999, padding: "8px 16px", fontSize: ".76rem", fontWeight: 700, cursor: "pointer" }}
      >
        Skip ✕
      </button>

      <div style={{ width: "100%", maxWidth: 400, borderRadius: 26, overflow: "hidden", background: "#14102a", boxShadow: "0 40px 90px -20px rgba(0,0,0,.7), 0 0 0 1px rgba(124,92,252,.25)" }}>
        <div key={step} style={{ background: slide.grad, padding: "40px 24px 30px", textAlign: "center", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 0%, rgba(255,255,255,.25), transparent 60%)" }} />
          <div style={{ fontSize: "3.4rem", animation: "dcFloat 1.6s ease-in-out infinite", filter: "drop-shadow(0 0 16px rgba(255,255,255,.55))", position: "relative" }}>
            {slide.icon}
          </div>
        </div>

        <div style={{ padding: "22px 26px 22px", color: "#e6e2f5" }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "1.18rem", fontWeight: 800 }}>{slide.title}</h2>
          <p style={{ fontSize: ".92rem", lineHeight: 1.55, color: "#c9c4e0", marginBottom: 20, minHeight: 66 }}>{slide.body}</p>

          <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 18 }}>
            {INTRO_SLIDES.map((_, i) => (
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
                Let's Go! 🏰
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
// not a one-time tutorial). Upfront about the trade-off: harder = more
// mobs, faster and more aggressive, but a real Coins multiplier to match.

function DifficultyModal({ onChoose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(6,3,16,.93)", backdropFilter: "blur(2px)", zIndex: 690, display: "flex", alignItems: "center", justifyContent: "center", padding: 18, animation: "dcPop .22s ease-out" }}>
      <div style={{ width: "100%", maxWidth: 420, borderRadius: 26, background: "#14102a", boxShadow: "0 40px 90px -20px rgba(0,0,0,.7), 0 0 0 1px rgba(124,92,252,.25)", padding: "26px 24px 22px" }}>
        <div style={{ textAlign: "center", marginBottom: 6 }}>
          <div style={{ fontSize: "2rem" }}>⚔️</div>
          <h2 style={{ margin: "6px 0 4px", fontSize: "1.2rem", fontWeight: 800, color: "#fff" }}>Choose Your Difficulty</h2>
          <p style={{ fontSize: ".8rem", color: "#a09a89", marginBottom: 18 }}>Harder dungeons throw more (and faster) mobs at you — but pay out way more Coins. Easy is chill, but the reward matches it.</p>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {Object.entries(DIFFICULTY).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => onChoose(key)}
              style={{
                display: "flex", alignItems: "center", gap: 14, textAlign: "left", padding: "14px 16px", borderRadius: 16,
                border: "1px solid rgba(124,92,252,.22)", background: "#1d1740", cursor: "pointer", color: "#e6e2f5",
              }}
            >
              <div style={{ fontSize: "1.7rem", flexShrink: 0 }}>{cfg.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 800, fontSize: ".95rem" }}>{cfg.label}</span>
                  <span style={{
                    fontSize: ".72rem", fontWeight: 800, padding: "3px 9px", borderRadius: 999,
                    background: cfg.coinMult >= 1.5 ? "linear-gradient(135deg,#eab308,#fde047)" : cfg.coinMult === 1 ? "linear-gradient(135deg,#7c5cfc,#a78bfa)" : "#332a5c",
                    color: cfg.coinMult >= 1.5 ? "#3a2c00" : "#fff",
                  }}>
                    🪙 {cfg.coinMult}×
                  </span>
                </div>
                <div style={{ fontSize: ".76rem", color: "#a099c2", marginTop: 3, lineHeight: 1.4 }}>{cfg.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Overlay({ children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,6,24,.75)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#181228", color: "#fff", borderRadius: 20, padding: "32px 28px", textAlign: "center", maxWidth: 380, width: "100%", animation: "dcPop .25s ease-out" }}>
        {children}
      </div>
    </div>
  );
}

// ───────────────────────── trial modal (redesigned) ─────────────────────────
// Types whose correctness can't be safely checked client-side (answer
// stripped by the backend for students) resolve as "cleared" the instant
// you submit — real scoring happens at Finish, same as the classic flow.

const TYPE_THEME = {
  multiple_choice: { grad: "linear-gradient(135deg,#7c5cfc,#a78bfa)", label: "Multiple Choice" },
  true_false:      { grad: "linear-gradient(135deg,#0ea5e9,#67e8f9)", label: "True / False" },
  fill_blank:      { grad: "linear-gradient(135deg,#f97316,#fdba74)", label: "Fill in the Blank" },
  prompt_build:    { grad: "linear-gradient(135deg,#ec4899,#f9a8d4)", label: "Prompt Challenge" },
  drag_order:      { grad: "linear-gradient(135deg,#22c55e,#86efac)", label: "Put in Order" },
  match_pairs:     { grad: "linear-gradient(135deg,#eab308,#fde047)", label: "Match Pairs" },
  memory_tiles:    { grad: "linear-gradient(135deg,#8b5cf6,#c4b5fd)", label: "Memory Tiles" },
  word_search:     { grad: "linear-gradient(135deg,#06b6d4,#67e8f9)", label: "Word Search" },
  image_reveal:    { grad: "linear-gradient(135deg,#f43f5e,#fda4af)", label: "Image Reveal" },
};

function EncounterModal({ encounter, onResolve }) {
  const { question, kind } = encounter;
  const content = question.content || {};
  const theme = TYPE_THEME[question.question_type] || TYPE_THEME.multiple_choice;
  const verb = kind === "gate" ? "Unlock" : "Solve";

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(8,5,18,.82)", backdropFilter: "blur(3px)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <div style={{
        width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto", overflowX: "hidden", borderRadius: 24,
        background: "#14102a", border: "1px solid rgba(124,92,252,.18)",
        boxShadow: "0 30px 70px -20px rgba(0,0,0,.65), 0 0 0 1px rgba(255,255,255,.03) inset",
        animation: "dcPop .22s ease-out",
      }}>
        <div style={{ background: theme.grad, padding: "24px 30px", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 46, height: 46, borderRadius: 15, background: "rgba(255,255,255,.2)", border: "1px solid rgba(255,255,255,.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem", flexShrink: 0 }}>
            {ICONS[question.question_type] || "❓"}
          </div>
          <div>
            <div style={{ fontSize: ".68rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", color: "rgba(255,255,255,.85)", marginBottom: 2 }}>
              {kind === "gate" ? "Sealed Trial" : "Trial"}
            </div>
            <div style={{ fontWeight: 800, color: "#fff", fontSize: "1.08rem" }}>{theme.label}</div>
          </div>
        </div>

        <div style={{ padding: "30px 30px 32px", color: "#e6e2f5", touchAction: "manipulation" }}>
          <QuestionBody question={question} content={content} verb={verb} onResolve={onResolve} theme={theme} />
        </div>
      </div>
    </div>
  );
}

function QuestionBody({ question, content, verb, onResolve, theme }) {
  const type = question.question_type;

  if (type === "multiple_choice") return <ChoiceBody prompt={content.question} options={content.options || []} onPick={(i) => onResolve(i, undefined)} verb={verb} theme={theme} />;
  if (type === "true_false") return <ChoiceBody prompt={content.question} options={["True", "False"]} onPick={(i) => onResolve(i === 0, undefined)} verb={verb} theme={theme} />;
  if (type === "fill_blank") return <TextBody prompt={content.question} placeholder="Type your answer..." onSubmit={(v) => onResolve(v, undefined)} verb={verb} theme={theme} />;
  if (type === "prompt_build") return <TextBody prompt={content.task} placeholder="Write your prompt..." multiline onSubmit={(v) => onResolve(v, undefined)} verb={verb} theme={theme} />;
  if (type === "image_reveal") return <TextBody prompt={content.question} placeholder="Your guess..." onSubmit={(v) => onResolve(v, undefined)} verb={verb} theme={theme} />;
  if (type === "match_pairs") return <MatchPairsBody content={content} onSubmit={(v) => onResolve(v, undefined)} verb={verb} theme={theme} />;
  if (type === "drag_order") return <DragOrderBody content={content} onResolve={onResolve} verb={verb} theme={theme} />;
  if (type === "memory_tiles") return <MemoryTilesBody content={content} onResolve={onResolve} />;
  if (type === "word_search") return <WordSearchBody content={content} onResolve={onResolve} />;
  return <TextBody prompt="Complete this activity" placeholder="..." onSubmit={(v) => onResolve(v, undefined)} verb={verb} theme={theme} />;
}

const inputStyle = { width: "100%", borderRadius: 13, padding: "13px 15px", border: "1px solid #34295c", background: "#1d1740", color: "#fff", marginBottom: 16, fontSize: ".95rem", boxSizing: "border-box" };
function submitBtnStyle(theme, enabled) {
  return { width: "100%", padding: "14px 16px", borderRadius: 13, border: "none", fontWeight: 800, fontSize: ".92rem", cursor: enabled ? "pointer" : "default", background: theme.grad, color: "#fff", opacity: enabled ? 1 : 0.4, boxShadow: enabled ? "0 8px 22px -8px rgba(124,92,252,.6)" : "none", transition: "opacity .15s ease, transform .1s ease" };
}

function ChoiceBody({ prompt, options, onPick, verb, theme }) {
  return (
    <>
      {prompt && <p style={{ fontWeight: 700, marginBottom: 18, fontSize: "1.02rem", lineHeight: 1.45 }}>{prompt}</p>}
      <div style={{ display: "grid", gap: 10 }}>
        {options.map((o, i) => (
          <button key={i} onClick={() => onPick(i)} style={{ padding: "14px 17px", borderRadius: 13, border: "1px solid #34295c", background: "#1d1740", color: "#e6e2f5", fontWeight: 600, cursor: "pointer", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: ".92rem", transition: "border-color .15s ease, background .15s ease", touchAction: "manipulation" }}>
            <span>{o}</span>
            <span style={{ fontSize: ".66rem", fontWeight: 800, opacity: 0.45, flexShrink: 0, marginLeft: 12 }}>{verb.toUpperCase()}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function TextBody({ prompt, placeholder, multiline, onSubmit, verb, theme }) {
  const [val, setVal] = useState("");
  return (
    <>
      {prompt && <p style={{ fontWeight: 700, marginBottom: 16, fontSize: "1.02rem", lineHeight: 1.4 }}>{prompt}</p>}
      {multiline ? (
        <textarea value={val} onChange={(e) => setVal(e.target.value)} placeholder={placeholder} rows={3} style={inputStyle} />
      ) : (
        <input value={val} onChange={(e) => setVal(e.target.value)} placeholder={placeholder} onKeyDown={(e) => e.key === "Enter" && val.trim() && onSubmit(val)} style={inputStyle} />
      )}
      <button disabled={!val.trim()} onClick={() => onSubmit(val)} style={submitBtnStyle(theme, !!val.trim())}>{verb}!</button>
    </>
  );
}

function MatchPairsBody({ content, onSubmit, verb, theme }) {
  const left = content.left || [];
  const rightPool = useMemo(() => shuffledArr(content.right || []), []); // eslint-disable-line
  const [matches, setMatches] = useState({});
  const [selRight, setSelRight] = useState(null);
  const [dragRight, setDragRight] = useState(null);
  const [hoverLeft, setHoverLeft] = useState(null);
  const dragging = useRef(false);
  const used = new Set(Object.values(matches));

  const assign = (leftKey, rightIdx) => setMatches((m) => ({ ...m, [leftKey]: rightIdx }));
  const unassign = (leftKey) => setMatches((m) => { const next = { ...m }; delete next[leftKey]; return next; });

  // Pointer Events (same technique as DragOrderBody) so dragging actually
  // works on touch, not just mouse — HTML5 drag/drop doesn't fire
  // reliably on touchscreens.
  const leftKeyFromPoint = (x, y) => {
    const el = document.elementFromPoint(x, y);
    const row = el && el.closest ? el.closest("[data-left-key]") : null;
    return row ? row.dataset.leftKey : null;
  };
  const onRightPointerDown = (e, i) => {
    if (used.has(i)) return;
    dragging.current = true;
    setDragRight(i);
    setSelRight(null);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onAreaPointerMove = (e) => {
    if (!dragging.current) return;
    setHoverLeft(leftKeyFromPoint(e.clientX, e.clientY));
  };
  const endDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (dragRight != null && hoverLeft != null) assign(hoverLeft, dragRight);
    setDragRight(null);
    setHoverLeft(null);
  };

  return (
    <>
      {content.question && <p style={{ fontWeight: 700, marginBottom: 16, fontSize: "1.02rem", lineHeight: 1.45 }}>{content.question}</p>}
      <p style={{ fontSize: ".74rem", color: "#8a8474", marginBottom: 12 }}>Drag a right-hand item onto its match on the left — or tap-tap.</p>
      <div onPointerMove={onAreaPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} style={{ display: "flex", gap: 16, marginBottom: 18 }}>
        <div style={{ flex: 1, display: "grid", gap: 9 }}>
          {left.map((l) => {
            const isHoverTarget = dragRight != null && hoverLeft === l;
            const matchedIdx = matches[l];
            return (
              <div
                key={l}
                data-left-key={l}
                onClick={() => { if (matchedIdx == null && selRight != null) { assign(l, selRight); setSelRight(null); } }}
                style={{
                  padding: "11px 12px", borderRadius: 11,
                  border: isHoverTarget ? "2px solid #86efac" : matchedIdx != null ? "2px solid #22c55e" : "1px solid #34295c",
                  background: "#1d1740", color: "#fff", fontSize: ".82rem",
                  cursor: matchedIdx == null && selRight != null ? "pointer" : "default",
                  transition: "border-color .15s ease", touchAction: "manipulation",
                  display: "flex", flexDirection: "column", gap: 4,
                }}
              >
                <strong>{l}</strong>
                {matchedIdx != null && (
                  <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: ".78rem", color: "#86efac" }}>
                    ↔ {rightPool[matchedIdx]}
                    <button
                      onClick={(e) => { e.stopPropagation(); unassign(l); }}
                      style={{ border: "none", background: "none", cursor: "pointer", color: "#f87171", fontSize: ".85rem", padding: "0 0 0 8px" }}
                    >
                      ✕
                    </button>
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ flex: 1, display: "grid", gap: 9 }}>
          {rightPool.map((r, i) => (
            <button
              key={i}
              disabled={used.has(i)}
              onPointerDown={(e) => onRightPointerDown(e, i)}
              onClick={() => { if (!used.has(i)) setSelRight(i); }}
              style={{
                padding: "11px 12px", borderRadius: 11,
                border: selRight === i ? "2px solid #7c5cfc" : "1px solid #34295c",
                background: used.has(i) ? "#141033" : "#1d1740", color: "#fff", fontSize: ".82rem",
                opacity: used.has(i) || dragRight === i ? 0.35 : 1,
                cursor: used.has(i) ? "default" : "grab",
                transition: "border-color .15s ease, opacity .12s ease", touchAction: "none",
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <button disabled={Object.keys(matches).length < left.length} onClick={() => onSubmit(Object.fromEntries(Object.entries(matches).map(([l, i]) => [l, rightPool[i]])))} style={submitBtnStyle(theme, Object.keys(matches).length >= left.length)}>
        {verb}!
      </button>
    </>
  );
}

function DragOrderBody({ content, onResolve, verb, theme }) {
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

  // Pointer Events (not HTML5 drag-and-drop) — HTML5 dragstart/dragover/drop
  // don't reliably fire on touchscreens, which was silently breaking this
  // on mobile. Pointer events work the same for mouse, touch, and pen.
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
      {content.question && <p style={{ fontWeight: 700, marginBottom: 14, fontSize: "1.02rem", lineHeight: 1.4 }}>{content.question}</p>}
      <p style={{ fontSize: ".74rem", color: "#8a8474", marginBottom: 12 }}>Drag the cards (or use the arrows) into the correct order:</p>
      <div onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 18 }}>
        {order.map((item, i) => (
          <div
            key={item + i}
            data-drag-index={i}
            onPointerDown={(e) => onPointerDown(e, i)}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "12px 13px", borderRadius: 12,
              border: overIndex === i && dragIndex !== null && dragIndex !== i ? "2px solid #86efac" : "1px solid #34295c",
              background: dragIndex === i ? "#241d47" : "#1d1740", opacity: dragIndex === i ? 0.55 : 1,
              transition: "opacity .12s ease, border-color .12s ease, background .12s ease",
              cursor: "grab", touchAction: "none",
            }}
          >
            <span style={{
              width: 26, height: 26, borderRadius: "50%", background: theme.grad, color: "#fff",
              fontSize: ".75rem", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, pointerEvents: "none",
            }}>
              {i + 1}
            </span>
            <span style={{ userSelect: "none", fontWeight: 600, fontSize: ".9rem", color: "#e6e2f5", flex: 1, pointerEvents: "none" }}>
              {item}
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => nudge(i, -1)}
                disabled={i === 0}
                style={nudgeBtnStyle(i === 0)}
              >
                ▲
              </button>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => nudge(i, 1)}
                disabled={i === order.length - 1}
                style={nudgeBtnStyle(i === order.length - 1)}
              >
                ▼
              </button>
            </div>
          </div>
        ))}
      </div>
      <button onClick={submit} style={submitBtnStyle(theme, true)}>{verb}!</button>
    </>
  );
}

const nudgeBtnStyle = (disabled) => ({
  width: 24, height: 18, borderRadius: 5, border: "none", background: "#2a2450", color: "#e6e2f5",
  fontSize: ".55rem", lineHeight: 1, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.25 : 0.85,
});

function MemoryTilesBody({ content, onResolve }) {
  const pairs = content.pairs || [];
  const tiles = useMemo(() => shuffledArr(pairs.flatMap(([a, b], i) => [{ id: `${i}a`, pairId: i, label: a }, { id: `${i}b`, pairId: i, label: b }])), []); // eslint-disable-line
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
            if (upd.size === pairs.length) setTimeout(() => onResolve({ completed: true }, true), 300);
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
      <p style={{ fontSize: ".78rem", color: "#8a8474", marginBottom: 14 }}>{matched.size}/{pairs.length} pairs found</p>
      <div className="s-memory-grid" style={{ maxWidth: 480, margin: "0 auto", padding: "0 3px" }}>
        {tiles.map((t) => {
          const isMatched = matched.has(t.pairId);
          const isFlipped = isMatched || flipped.some((f) => f.id === t.id);
          const isWrong = wrong.includes(t.id);
          return (
            <button key={t.id} className="s-memory-tile" onClick={() => flip(t)} disabled={isMatched}
              style={{ background: isFlipped ? "#7c5cfc" : "#1d1740", color: isFlipped ? "#fff" : "transparent", animation: isWrong ? "dcShake .35s" : "none", cursor: isMatched ? "default" : "pointer", touchAction: "manipulation" }}>
              {isFlipped ? t.label : "❓"}
            </button>
          );
        })}
      </div>
    </>
  );
}

function WordSearchBody({ content, onResolve }) {
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
      <p style={{ fontSize: ".78rem", color: "#8a8474", marginBottom: 12 }}>{found.size}/{puzzle.words.length} words found — drag across letters to select</p>
      <div
        onMouseUp={end}
        onTouchEnd={end}
        style={{ display: "grid", gridTemplateColumns: `repeat(${puzzle.size}, 1fr)`, gap: 3, userSelect: "none", touchAction: "none", margin: "0 auto 16px", maxWidth: 320 }}
      >
        {puzzle.grid.map((row, r) => row.map((letter, c) => {
          const k = cellKey(r, c);
          const isFound = foundCells.has(k);
          const isSel = selCells.some(([sr, sc]) => sr === r && sc === c);
          return (
            <div
              key={k}
              data-row={r}
              data-col={c}
              onMouseDown={() => begin(r, c)}
              onMouseEnter={() => extend(r, c)}
              onTouchStart={(e) => { const cell = cellFromTouch(e.touches[0]); if (cell) begin(...cell); }}
              onTouchMove={(e) => { const cell = cellFromTouch(e.touches[0]); if (cell) extend(...cell); }}
              style={{
                aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: ".7rem", fontWeight: 800,
                borderRadius: 6, cursor: "pointer", border: "1px solid #241d47",
                background: isFound ? "linear-gradient(135deg,#06b6d4,#22d3ee)" : isSel ? "linear-gradient(135deg,#7c5cfc,#a78bfa)" : "#1d1740",
                color: "#fff", transition: "background .12s ease",
              }}
            >
              {letter}
            </div>
          );
        }))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
        {wordList.map((word) => (
          <span
            key={word}
            style={{
              fontWeight: 700, fontSize: ".72rem", padding: "6px 12px", borderRadius: 999,
              background: found.has(word) ? "linear-gradient(135deg,#06b6d4,#22d3ee)" : "#1d1740",
              color: found.has(word) ? "#fff" : "#a09a89",
              textDecoration: found.has(word) ? "line-through" : "none",
              border: found.has(word) ? "none" : "1px solid #34295c",
            }}
          >
            {word}
          </span>
        ))}
      </div>
    </>
  );
}