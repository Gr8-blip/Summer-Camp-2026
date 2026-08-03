import { useEffect, useMemo, useRef, useState, useCallback, memo } from "react";
import { generateWordSearch, matchSelection, straightLine } from "./wordSearchGenerator";

/**
 * EscapeRoom v2 — "AI Virus Facility" survival redesign.
 *
 * Same external contract as before (and as DungeonCrawler): hands back
 * `{questionId: response}` via onComplete, exactly what ChallengePlay/
 * QuestPlay already submit. Zero backend awareness of "games" needed.
 *
 * Props: { questions, title, onAnswer, onComplete, onExit, timeLeft }
 *
 * Story: an AI Virus escaped containment. The facility is a maze, mostly
 * hidden by Fog of War. Scattered through it are AI Data Fragments (one
 * educational puzzle each, reusing the exact same puzzle engine as
 * DungeonCrawler — question banks don't know or care which game renders
 * them). One or more Viruses actively hunt the player using real pathing
 * (BFS distance-to-player), not random wandering — how many, and how
 * relentlessly, scales with difficulty.
 *
 * Core twist: solving a puzzle does NOT pause the virus. Get tagged while
 * a puzzle is open and the fragment corrupts — it drops right there and
 * must be carried to a Healing Center before it can be answered. Get
 * tagged while just exploring and you're infected: an Infection Meter
 * climbs until you reach a Healing Center (which also acts as a small
 * safe zone — viruses won't step onto a Healing Center tile).
 */

// ───────────────────────── maze generation (same recipe as DungeonCrawler) ─────────────────────────

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

  // Braid pass — knock down some dead-end walls so the maze has loops,
  // otherwise a "smart" virus with a single-path tree maze is unbeatable
  // (no alternate route ever exists to dodge around it).
  const DIR4 = [["N", -1, 0, "S"], ["S", 1, 0, "N"], ["E", 0, 1, "W"], ["W", 0, -1, "E"]];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const openCount = DIR4.filter(([d]) => !cells[r][c].walls[d]).length;
      if (openCount === 1 && Math.random() < 0.4) {
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

// Same BFS, but one cell (`blocked`) is treated as an impassable wall —
// used so fragments/healing centers never get placed somewhere only
// reachable by crossing the exit (which is locked until every fragment is
// resolved).
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

// BFS capped at `radius` corridor-steps — this IS the Fog of War. It's
// wall-aware (unlike a plain circle), so sight is genuinely blocked around
// corners, not just dimmed — you really don't know what's past the bend.
function visibleFromRadius(cells, size, start, radius) {
  const dist = Array.from({ length: size }, () => Array(size).fill(Infinity));
  dist[start.r][start.c] = 0;
  const visible = new Set([key(start.r, start.c)]);
  const q = [start];
  while (q.length) {
    const cur = q.shift();
    if (dist[cur.r][cur.c] >= radius) continue;
    const cell = cells[cur.r][cur.c];
    const steps = [["N", -1, 0], ["S", 1, 0], ["E", 0, 1], ["W", 0, -1]];
    for (const [dir, dr, dc] of steps) {
      if (cell.walls[dir]) continue;
      const nr = cur.r + dr, nc = cur.c + dc;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      if (dist[nr][nc] > dist[cur.r][cur.c] + 1) {
        dist[nr][nc] = dist[cur.r][cur.c] + 1;
        visible.add(key(nr, nc));
        q.push({ r: nr, c: nc });
      }
    }
  }
  return visible;
}

const key = (r, c) => `${r},${c}`;

// Deterministic pseudo-random in [0,1), seeded off cell coords + a salt —
// used for fog static/particles so each hidden tile has a stable look
// instead of re-randomizing (and thrashing) on every render.
function seeded(r, c, salt = 0) {
  const x = Math.sin(r * 374761393 + c * 668265263 + salt * 97) * 43758.5453;
  return x - Math.floor(x);
}

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

const DIR4 = [["N", -1, 0], ["S", 1, 0], ["E", 0, 1], ["W", 0, -1]];
const VIRUS_COLORS = ["#ff2d55", "#22d3ee", "#f97316", "#a78bfa"];
const FACE_ROTATE = { E: 0, S: 90, W: 180, N: 270 };

// ── difficulty: how many viruses are hunting you, how fast/aggressive
// they are, how tight the fog is, and how quickly infection climbs.
// coinMult rewards actually playing on higher difficulty instead of just
// making the run miserable for nothing.
const DIFFICULTY = {
  easy:    { label: "Easy",    icon: "🦠",       viruses: 1, tickMs: 640, chaseRadius: 6,  chaseChance: 0.62, fogRadius: 5, infectionRate: 2.0, coinMult: 0.5, desc: "One virus, and it's not always paying attention. Good for your first run through the facility." },
  medium:  { label: "Medium",  icon: "🦠🦠",      viruses: 2, tickMs: 540, chaseRadius: 8,  chaseChance: 0.76, fogRadius: 4, infectionRate: 2.6, coinMult: 1,   desc: "Two viruses actively hunting. The fog closes in a little tighter, too." },
  hard:    { label: "Hard",    icon: "🦠🦠🦠",     viruses: 3, tickMs: 440, chaseRadius: 10, chaseChance: 0.88, fogRadius: 4, infectionRate: 3.4, coinMult: 1.5, desc: "Three viruses, rarely distracted. You will get cornered — plan your route." },
  extreme: { label: "Extreme", icon: "☣️",       viruses: 4, tickMs: 340, chaseRadius: 99, chaseChance: 0.96, fogRadius: 3, infectionRate: 4.4, coinMult: 2,   desc: "Four viruses that basically always know where you are. Only for the fearless." },
};

// ───────────────────────── memoized render layers ─────────────────────────
// Same reasoning as DungeonCrawler: only cells inside the camera viewport
// (plus a small buffer) are ever mounted, so infinite pulse/float
// animations on off-screen fragments never force a repaint of the whole
// facility. Fog visibility is folded in as a third render tier.

// Unexplored tiles: still fully opaque (you can't see through fog), but
// styled as a living haze instead of dead black — a per-cell gradient,
// a very faint drifting static grain, and one or two slow particles,
// all seeded off the cell's own coords so nothing reshuffles on repaint.
const FogCell = memo(function FogCell({ left, top, cellPx, r, c }) {
  const hueSeed = seeded(r, c, 1);
  const bg = hueSeed < 0.12
    ? "radial-gradient(circle at 30% 30%, #2a0f2e 0%, #0a0614 60%, #030209 100%)" // rare corrupted-purple pocket
    : "radial-gradient(circle at 30% 30%, #151033 0%, #0a0818 55%, #03020a 100%)";
  const p1x = 15 + seeded(r, c, 2) * 70;
  const p1y = 15 + seeded(r, c, 3) * 70;
  const p2x = 15 + seeded(r, c, 4) * 70;
  const p2y = 15 + seeded(r, c, 5) * 70;
  const delay1 = seeded(r, c, 6) * 4;
  const delay2 = seeded(r, c, 7) * 4;
  const showStatic = seeded(r, c, 8) < 0.35;
  return (
    <div style={{ position: "absolute", left, top, width: cellPx, height: cellPx, overflow: "hidden", background: bg }}>
      {showStatic && (
        <div style={{
          position: "absolute", inset: 0, opacity: 0.5, mixBlendMode: "screen",
          backgroundImage: "repeating-linear-gradient(0deg, rgba(120,90,220,.06) 0px, transparent 1px, transparent 3px)",
          animation: `erFogStatic ${3 + seeded(r, c, 9) * 2}s linear infinite`,
        }} />
      )}
      <span style={{
        position: "absolute", left: `${p1x}%`, top: `${p1y}%`, width: 3, height: 3, borderRadius: "50%",
        background: "#7dd3fc", opacity: 0.35, filter: "blur(.3px)",
        animation: `erFogParticle ${5 + seeded(r, c, 2) * 3}s ease-in-out ${delay1}s infinite`,
      }} />
      <span style={{
        position: "absolute", left: `${p2x}%`, top: `${p2y}%`, width: 2, height: 2, borderRadius: "50%",
        background: "#c084fc", opacity: 0.3, filter: "blur(.3px)",
        animation: `erFogParticle ${6 + seeded(r, c, 4) * 3}s ease-in-out ${delay2}s infinite`,
      }} />
      <div style={{ position: "absolute", inset: 0, boxShadow: "inset 0 0 14px rgba(0,0,0,.6)" }} />
    </div>
  );
});

const FacilityCell = memo(function FacilityCell({
  left, top, cellPx, wallN, wallS, wallE, wallW,
  isExit, exitUnlocked, isHealing, icon, corrupted, visibility, r, c,
}) {
  if (visibility === "hidden") {
    return <FogCell left={left} top={top} cellPx={cellPx} r={r} c={c} />;
  }
  const dim = visibility === "dim";
  return (
    <div
      style={{
        position: "absolute", left, top, width: cellPx, height: cellPx, boxSizing: "border-box",
        contain: "layout paint", opacity: dim ? 0.38 : 1, transition: "opacity .35s ease",
        borderTop: wallN ? "3px solid #22c55e33" : "3px solid transparent",
        borderLeft: wallW ? "3px solid #22c55e33" : "3px solid transparent",
        borderRight: wallE ? "3px solid #22c55e33" : "3px solid transparent",
        borderBottom: wallS ? "3px solid #22c55e33" : "3px solid transparent",
        boxShadow: wallN || wallS || wallE || wallW ? "inset 0 0 6px rgba(34,197,94,.18)" : "none",
        background: isExit ? (exitUnlocked ? "#0f3d24" : "#2a0e0e") : isHealing ? "#0a2a22" : "#080a14",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: cellPx * 0.44,
      }}
    >
      {isExit && (
        <span style={{ animation: exitUnlocked ? "erPulse 1.2s infinite" : "none", fontSize: cellPx * 0.5, willChange: exitUnlocked ? "transform, opacity" : "auto" }}>
          {exitUnlocked ? "🚪" : "🔒"}
        </span>
      )}
      {!isExit && isHealing && (
        <>
          <span style={{ animation: "erHealGlow 1.6s ease-in-out infinite", fontSize: cellPx * 0.52, willChange: "transform, filter", zIndex: 2 }}>🏥</span>
          <span style={{ position: "absolute", left: "24%", top: "66%", width: 3, height: 3, borderRadius: "50%", background: "#86efac", animation: "erAmbientMote 2.6s ease-in-out infinite" }} />
          <span style={{ position: "absolute", left: "70%", top: "28%", width: 3, height: 3, borderRadius: "50%", background: "#4ade80", animation: "erAmbientMote 3.1s ease-in-out .8s infinite" }} />
        </>
      )}
      {!isExit && !isHealing && icon && (
        <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: cellPx * 0.68, height: cellPx * 0.68 }}>
          {corrupted && [0, 1, 2].map((i) => (
            <span key={i} style={{
              position: "absolute", width: 3, height: 3, borderRadius: "50%", background: "#fb7185",
              boxShadow: "0 0 4px #fb7185", left: "50%", top: "50%",
              animation: `erCorruptOrbit 1.${4 + i}s linear ${i * 0.3}s infinite`,
            }} />
          ))}
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: "100%", height: "100%", borderRadius: "50%",
            background: corrupted ? "radial-gradient(circle,#f43f5e,#7f1d1d)" : "radial-gradient(circle,#22d3ee,#0e7490)",
            boxShadow: corrupted ? "0 0 10px #f43f5e, 0 0 2px #fff inset" : "0 0 10px #22d3ee, 0 0 2px #fff inset",
            animation: corrupted ? "erGlitch 1.1s infinite" : "erPulse 1.3s infinite",
            fontSize: cellPx * 0.34, willChange: "transform, opacity",
          }}>
            {corrupted ? "⚠️" : icon}
          </span>
        </span>
      )}
    </div>
  );
});

const FacilityGrid = memo(function FacilityGrid({
  maze, size, cellPx, encounterMap, resolved, corrupted, carrying, healingKeys,
  exitR, exitC, allResolved, distNoExit, camR, camC, view, visibleSet, everSeen,
}) {
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
      const isHealing = healingKeys.has(k);
      const encounter = encounterMap.get(k);
      const isResolved = resolved.has(k);
      const isCorrupted = corrupted.has(k);
      const isCarried = carrying.has(k);
      const showIcon = encounter && !isResolved && !isCarried ? true : false;
      const visibility = visibleSet.has(k) ? "visible" : everSeen.has(k) ? "dim" : "hidden";
      const icon = showIcon ? (ICONS[encounter.question.question_type] || "❓") : null;
      cells.push(
        <FacilityCell
          key={k}
          left={c * cellPx} top={r * cellPx} cellPx={cellPx} r={r} c={c}
          wallN={cell.walls.N} wallS={cell.walls.S} wallE={cell.walls.E} wallW={cell.walls.W}
          isExit={isExit} exitUnlocked={allResolved} isHealing={isHealing}
          icon={icon} corrupted={isCorrupted} visibility={visibility}
        />
      );
    }
  }
  return cells;
});

const VirusSprite = memo(function VirusSprite({ r, c, cellPx, color, visible, id }) {
  if (!visible) return null;
  return (
    <div
      style={{
        position: "absolute", left: 0, top: 0, width: cellPx, height: cellPx,
        display: "flex", alignItems: "center", justifyContent: "center",
        transform: `translate(${c * cellPx}px, ${r * cellPx}px)`,
        transition: "transform .4s linear", zIndex: 5, willChange: "transform",
      }}
    >
      {/* glitch-jitter layer: independent of the position transform above,
          so the corrupted stutter never fights the smooth grid movement */}
      <div style={{ position: "relative", width: cellPx * 0.7, height: cellPx * 0.7, animation: `erVirusGlitchJitter ${0.5 + (id % 3) * 0.1}s steps(6) infinite` }}>
        {/* trailing corruption particles */}
        {[0, 1, 2].map((i) => (
          <span key={i} style={{
            position: "absolute", left: "50%", top: "50%", width: 3, height: 3, borderRadius: "50%",
            background: "#ff2d55", boxShadow: "0 0 6px #ff2d55",
            animation: `erVirusParticle ${0.9 + i * 0.25}s ease-out ${i * 0.22}s infinite`,
          }} />
        ))}
        <div style={{
          width: "100%", height: "100%", background: `radial-gradient(circle at 35% 30%, ${color}, #1a0000)`,
          borderRadius: "42% 58% 55% 45% / 55% 45% 58% 42%",
          boxShadow: `0 0 16px ${color}, 0 0 30px rgba(255,45,85,.35)`,
          position: "relative", animation: "erVirusPulse .55s ease-in-out infinite, erVirusFlicker 1.7s ease-in-out infinite",
        }}>
          <span style={{ position: "absolute", top: "32%", left: "20%", width: "18%", height: "18%", background: "#fff", borderRadius: "50%" }} />
          <span style={{ position: "absolute", top: "32%", right: "20%", width: "18%", height: "18%", background: "#fff", borderRadius: "50%" }} />
        </div>
      </div>
    </div>
  );
});

const VirusesLayer = memo(function VirusesLayer({ viruses, cellPx, visibleSet }) {
  return viruses.map((v) => (
    <VirusSprite key={v.id} id={v.id} r={v.r} c={v.c} cellPx={cellPx} color={v.color} visible={visibleSet.has(key(v.r, v.c))} />
  ));
});

const PlayerSprite = memo(function PlayerSprite({ r, c, cellPx, facing, invulnerable }) {
  return (
    <div
      style={{
        position: "absolute", left: 0, top: 0, width: cellPx, height: cellPx,
        display: "flex", alignItems: "center", justifyContent: "center",
        transform: `translate(${c * cellPx}px, ${r * cellPx}px)`,
        transition: "transform .12s linear", zIndex: 6, willChange: "transform",
        animation: invulnerable ? "erBlink .25s infinite" : "none",
      }}
    >
      {/* idle float layer — its own transform, so it never fights the
          grid-position transition on the wrapper above */}
      <div style={{ position: "relative", width: cellPx * 0.72, height: cellPx * 0.72, animation: "erPlayerFloat 2.2s ease-in-out infinite" }}>
        {/* slow scanner ring — reads as "AI explorer", not a plain dot */}
        <div style={{
          position: "absolute", inset: -5, borderRadius: "50%",
          border: "1.5px solid rgba(103,232,249,.55)", borderTopColor: "transparent", borderRightColor: "transparent",
          animation: "erPlayerRing 3.4s linear infinite",
        }} />
        <div style={{
          width: "100%", height: "100%", borderRadius: "50%",
          background: "radial-gradient(circle at 35% 30%, #e0fbff, #67e8f9 45%, #0e7490 100%)",
          boxShadow: "0 0 10px #67e8f9, 0 0 22px rgba(103,232,249,.45)",
          transform: `rotate(${FACE_ROTATE[facing]}deg)`, position: "relative",
        }}>
          {/* directional "visor" — a small bright chip showing facing */}
          <span style={{ position: "absolute", top: "50%", right: "6%", width: "22%", height: "22%", transform: "translateY(-50%)", borderRadius: "50%", background: "#022c33", boxShadow: "0 0 3px #fff inset" }} />
        </div>
      </div>
    </div>
  );
});

const HealBurst = memo(function HealBurst({ r, c, cellPx }) {
  const particles = useMemo(() => Array.from({ length: 10 }, (_, i) => ({
    angle: (i / 10) * Math.PI * 2 + seeded(i, 1, 3),
    dist: 16 + seeded(i, 2, 4) * 14,
    delay: seeded(i, 3, 5) * 0.15,
  })), []);
  return (
    <div style={{
      position: "absolute", left: 0, top: 0, width: cellPx, height: cellPx,
      transform: `translate(${c * cellPx}px, ${r * cellPx}px)`, zIndex: 7, pointerEvents: "none",
    }}>
      <div style={{ position: "absolute", left: "50%", top: "50%", width: cellPx * 1.4, height: cellPx * 1.4, marginLeft: -cellPx * 0.7, marginTop: -cellPx * 0.7, borderRadius: "50%", background: "radial-gradient(circle,rgba(74,222,128,.4),transparent 70%)", animation: "erHealRingPulse .9s ease-out" }} />
      {particles.map((p, i) => (
        <span key={i} style={{
          position: "absolute", left: "50%", top: "50%", width: 4, height: 4, borderRadius: "50%",
          background: "#86efac", boxShadow: "0 0 6px #4ade80",
          "--ex": `${Math.cos(p.angle) * p.dist}px`, "--ey": `${Math.sin(p.angle) * p.dist}px`,
          animation: `erHealParticle .9s ease-out ${p.delay}s`,
        }} />
      ))}
    </div>
  );
});

// ───────────────────────── main component ─────────────────────────

export default function EscapeRoom({ questions, title = "AI Virus Facility", onAnswer, onComplete, onExit, timeLeft }) {
  const size = Math.min(21, Math.max(13, questions.length + 9));
  const maze = useMemo(() => generateMaze(size), [size]);
  const dist = useMemo(() => distancesFrom(maze, size, { r: 0, c: 0 }), [maze, size]);
  const exit = { r: size - 1, c: size - 1 };
  const distNoExit = useMemo(() => distancesFromBlocking(maze, size, { r: 0, c: 0 }, exit), [maze, size]);

  // ── AI Data Fragments — spread across the floor, biased so early ones
  // aren't right next to spawn and late ones aren't all crammed near exit.
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

  const encounterMap = useMemo(() => {
    const m = new Map();
    encounterCells.forEach((cell, i) => { m.set(key(cell.r, cell.c), { r: cell.r, c: cell.c, question: questions[i] }); });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounterCells]);

  // ── Healing Centers — scarce, and also act as safe zones (viruses will
  // not step onto one), so they double as breathing-room checkpoints.
  const healingCells = useMemo(() => {
    const used = new Set(encounterCells.map((e) => key(e.r, e.c)));
    used.add(key(0, 0)); used.add(key(exit.r, exit.c));
    const candidates = [];
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++)
      if (!used.has(key(r, c)) && distNoExit[r][c] !== Infinity) candidates.push({ r, c });
    const count = Math.min(4, Math.max(2, Math.round(size / 7)));
    return shuffledArr(candidates).slice(0, count);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);
  const healingKeys = useMemo(() => new Set(healingCells.map((h) => key(h.r, h.c))), [healingCells]);

  // ── viruses: spawn away from the player, hunt intelligently ──
  const virusSpawnCells = useMemo(() => {
    const used = new Set([key(0, 0), key(exit.r, exit.c), ...healingKeys]);
    const farCells = [];
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if (used.has(key(r, c))) continue;
      if (dist[r][c] < Math.floor(size / 2)) continue;
      if (dist[r][c] === Infinity) continue;
      farCells.push({ r, c });
    }
    return farCells;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, healingKeys]);

  const spawnViruses = (count) =>
    shuffledArr(virusSpawnCells).slice(0, count).map((cell, i) => ({
      id: i, r: cell.r, c: cell.c, dir: DIR4[Math.floor(Math.random() * 4)][0], color: VIRUS_COLORS[i % VIRUS_COLORS.length],
    }));

  const [player, setPlayer] = useState({ r: 0, c: 0 });
  const [facing, setFacing] = useState("E");
  const [everSeen, setEverSeen] = useState(() => new Set([key(0, 0)]));
  const [resolved, setResolved] = useState(() => new Set());
  const [corrupted, setCorrupted] = useState(() => new Set());
  const [carrying, setCarrying] = useState(() => new Set());
  const [repairQueue, setRepairQueue] = useState([]);
  const [viruses, setViruses] = useState([]);
  const [infected, setInfected] = useState(false);
  const [infectionPct, setInfectionPct] = useState(0);
  const [answers, setAnswers] = useState({});
  const [activeEncounter, setActiveEncounter] = useState(null);
  const [flashKind, setFlashKind] = useState(null);
  const [healBurstId, setHealBurstId] = useState(0);
  const [toast, setToast] = useState("");
  const [overridden, setOverridden] = useState(false);
  const [victory, setVictory] = useState(false);
  const [invulnerable, setInvulnerable] = useState(false);
  const [nearestVirusDist, setNearestVirusDist] = useState(Infinity);
  const [showIntro, setShowIntro] = useState(() => {
    try { return localStorage.getItem("er2_hide_intro") !== "1"; } catch { return true; }
  });
  const [showDifficulty, setShowDifficulty] = useState(() => {
    try { return localStorage.getItem("er2_hide_intro") === "1"; } catch { return false; }
  });
  const [difficulty, setDifficulty] = useState(null);

  const totalFragments = questions.length;
  const allResolved = resolved.size >= totalFragments;
  const startedAt = useRef(Date.now());

  const mazeRef = useRef(maze); mazeRef.current = maze;
  const playerRef = useRef(player); playerRef.current = player;
  const systemPaused = showIntro || showDifficulty || overridden || victory;
  const systemPausedRef = useRef(systemPaused); systemPausedRef.current = systemPaused;
  const healingKeysRef = useRef(healingKeys); healingKeysRef.current = healingKeys;

  const diffCfg = DIFFICULTY[difficulty] || DIFFICULTY.medium;

  const chooseDifficulty = (k) => {
    setDifficulty(k);
    setViruses(spawnViruses(DIFFICULTY[k].viruses));
    setShowDifficulty(false);
  };

  const flash = (kind) => {
    setFlashKind(kind);
    if (kind === "heal") setHealBurstId((n) => n + 1);
    setTimeout(() => setFlashKind((f) => (f === kind ? null : f)), 700);
  };
  const say = (msg) => { setToast(msg); setTimeout(() => setToast((t) => (t === msg ? "" : t)), 1900); };

  // ── Fog of War — wall-aware BFS radius around the player, recomputed on
  // every move. `everSeen` accumulates so previously-explored corridors
  // stay dimly visible instead of vanishing back into pure black.
  const visibleSet = useMemo(
    () => visibleFromRadius(maze, size, player, diffCfg.fogRadius),
    [maze, size, player, diffCfg.fogRadius]
  );
  useEffect(() => {
    setEverSeen((prev) => {
      let changed = false;
      const next = new Set(prev);
      visibleSet.forEach((k) => { if (!next.has(k)) { next.add(k); changed = true; } });
      return changed ? next : prev;
    });
  }, [visibleSet]);

  // ── virus AI: BFS distance-to-player recomputed each tick, every virus
  // greedily steps toward whichever open neighbor is closer — smart, but
  // still dodgeable through a loop, with wandering when out of range or
  // chance rolls against it. Healing Center tiles are off-limits to
  // viruses, so they double as real safe zones.
  useEffect(() => {
    const t = setInterval(() => {
      if (systemPausedRef.current) return;
      const cells = mazeRef.current;
      const distToPlayer = distancesFrom(cells, size, playerRef.current);
      const hk = healingKeysRef.current;

      let nearest = Infinity;
      setViruses((prev) => prev.map((v) => {
        const cell = cells[v.r][v.c];
        const rawOptions = DIR4.filter(([d]) => !cell.walls[d]);
        const options = rawOptions.filter(([, dr, dc]) => !hk.has(key(v.r + dr, v.c + dc)));
        const usable = options.length ? options : rawOptions;
        if (!usable.length) return v;
        const reverse = { N: "S", S: "N", E: "W", W: "E" }[v.dir];

        const myDist = distToPlayer[v.r]?.[v.c] ?? Infinity;
        if (myDist !== Infinity) nearest = Math.min(nearest, myDist);
        const canChase = myDist !== Infinity && myDist <= diffCfg.chaseRadius && Math.random() < diffCfg.chaseChance;

        let choice;
        if (canChase) {
          const ranked = usable
            .map(([d, dr, dc]) => ({ d, dr, dc, dist: distToPlayer[v.r + dr]?.[v.c + dc] ?? Infinity }))
            .sort((a, b) => a.dist - b.dist);
          const best = ranked.filter((o) => o.dist === ranked[0].dist);
          const nonReverseBest = best.filter((o) => o.d !== reverse);
          const pool = nonReverseBest.length ? nonReverseBest : best;
          const pick = pool[Math.floor(Math.random() * pool.length)];
          choice = [pick.d, pick.dr, pick.dc];
        } else {
          const continuing = usable.find(([d]) => d === v.dir);
          const nonReverse = usable.filter(([d]) => d !== reverse);
          if (continuing && Math.random() < 0.55) choice = continuing;
          else if (nonReverse.length) choice = nonReverse[Math.floor(Math.random() * nonReverse.length)];
          else choice = usable[Math.floor(Math.random() * usable.length)];
        }
        const [dir, dr, dc] = choice;
        return { ...v, r: v.r + dr, c: v.c + dc, dir };
      }));
      setNearestVirusDist(nearest);
    }, diffCfg.tickMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, difficulty]);

  // ── tag detection: runs independently of player movement, since
  // viruses move on their own timer too. Behaviour branches on whether a
  // puzzle is currently open. ──
  useEffect(() => {
    if (systemPaused || invulnerable) return;
    const hitVirus = viruses.find((v) => v.r === player.r && v.c === player.c);
    if (!hitVirus) return;

    if (activeEncounter) {
      const { r, c } = activeEncounter;
      setCorrupted((s) => new Set(s).add(key(r, c)));
      setActiveEncounter(null);
      flash("corrupt");
      say("⚠️ Data Fragment Corrupted!");
    } else {
      setInfected(true);
      flash("infect");
      say("👾 TAGGED! Virus infected you!");
    }
    setInvulnerable(true);
    setTimeout(() => setInvulnerable(false), 900);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viruses, player]);

  // ── infection climb: keeps rising even mid-puzzle, only truly frozen by
  // system-level pauses (intro/difficulty/game over/victory). ──
  useEffect(() => {
    if (!infected || systemPaused) return;
    const t = setInterval(() => {
      setInfectionPct((p) => {
        const np = Math.min(100, p + diffCfg.infectionRate);
        if (np >= 100) setTimeout(() => setOverridden(true), 250);
        return np;
      });
    }, 500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [infected, systemPaused, diffCfg.infectionRate]);

  // ── repair queue: once at a Healing Center, carried corrupted fragments
  // get repaired and reopened one at a time, right there. ──
  useEffect(() => {
    if (activeEncounter || systemPaused || !repairQueue.length) return;
    const k = repairQueue[0];
    const enc = encounterMap.get(k);
    if (!enc) { setRepairQueue((q) => q.slice(1)); return; }
    setActiveEncounter({ ...enc, kind: "repaired" });
    setRepairQueue((q) => q.slice(1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEncounter, systemPaused, repairQueue]);

  const tryMove = useCallback((dr, dc, dir) => {
    if (systemPaused || activeEncounter) return;
    setFacing(dir);
    setPlayer((p) => {
      const cell = mazeRef.current[p.r][p.c];
      if (cell.walls[dir]) return p;
      const nr = p.r + dr, nc = p.c + dc;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) return p;

      if (nr === exit.r && nc === exit.c && !allResolved) {
        say("🔒 Sealed — recover and repair every fragment before the exit opens.");
        return p;
      }

      const k = key(nr, nc);

      if (healingKeys.has(k)) {
        if (infected) { setInfected(false); setInfectionPct(0); flash("heal"); say("✅ System Restored"); }
        if (carrying.size) {
          setRepairQueue((q) => [...q, ...carrying]);
          setCarrying(new Set());
          flash("heal");
          say("🔧 Fragments repaired — answer them now!");
        }
      } else if (encounterMap.has(k) && !resolved.has(k) && !carrying.has(k)) {
        setActiveEncounter({ ...encounterMap.get(k), kind: "fresh" });
      }

      if (nr === exit.r && nc === exit.c) setVictory(true);
      return { r: nr, c: nc };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemPaused, activeEncounter, allResolved, resolved, corrupted, carrying, healingKeys, encounterMap, infected, size]);

  // Corrupted fragments no longer auto-pick-up on step — the player must
  // press E while standing on one. Reads current position off the ref so
  // the handler doesn't need to be rebound on every move.
  const pickupCorrupted = useCallback(() => {
    if (systemPausedRef.current || activeEncounter) return;
    const p = playerRef.current;
    const k = key(p.r, p.c);
    setCorrupted((s) => {
      if (!s.has(k)) return s;
      const n = new Set(s);
      n.delete(k);
      setCarrying((c) => new Set(c).add(k));
      flash("pickup");
      say("💾 Corrupted Fragment Collected — get it to a Healing Center!");
      return n;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEncounter]);

  useEffect(() => {
    const onKey = (e) => {
      const map = {
        ArrowUp: [-1, 0, "N"], w: [-1, 0, "N"], W: [-1, 0, "N"],
        ArrowDown: [1, 0, "S"], s: [1, 0, "S"], S: [1, 0, "S"],
        ArrowLeft: [0, -1, "W"], a: [0, -1, "W"], A: [0, -1, "W"],
        ArrowRight: [0, 1, "E"], d: [0, 1, "E"], D: [0, 1, "E"],
      };
      if (map[e.key]) { e.preventDefault(); tryMove(...map[e.key]); return; }
      if (e.key === "e" || e.key === "E") { e.preventDefault(); pickupCorrupted(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tryMove, pickupCorrupted]);

  const resolveEncounter = (response, wasCorrect) => {
    const { r, c, question } = activeEncounter;
    setAnswers((a) => ({ ...a, [question.id]: response }));
    onAnswer?.(question.id, response);
    setResolved((s) => new Set(s).add(key(r, c)));

    if (wasCorrect === false) { flash("miss"); say("⚡ Not quite — but the fragment still decodes."); }
    else { flash("hit"); say("✅ Fragment recovered!"); }
    setActiveEncounter(null);
  };

  const respawn = () => {
    setPlayer({ r: 0, c: 0 });
    setFacing("E");
    setInfected(false);
    setInfectionPct(0);
    setOverridden(false);
    setInvulnerable(true);
    setTimeout(() => setInvulnerable(false), 900);
  };

  useEffect(() => {
    if (!victory) return;
    const seconds = Math.round((Date.now() - startedAt.current) / 1000);
    const speedBonus = Math.max(0, 60 - seconds) > 0 ? Math.round(Math.max(0, 90 - seconds) / 3) : 0;
    const base = totalFragments * 8;
    const rawCoins = base + speedBonus;
    const coins = Math.round(rawCoins * diffCfg.coinMult);
    const t = setTimeout(() => onComplete(answers, coins), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [victory]);

  // ── viewport measurement — the maze now fills essentially the whole
  // screen below the HUD, so cellPx/VIEW are derived from real available
  // space (via ResizeObserver) instead of a fixed 44px/11-cell box.
  const viewportRef = useRef(null);
  const [viewportBox, setViewportBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0].contentRect;
      setViewportBox({ w: cr.width, h: cr.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const TARGET_CELL_PX = 48;
  const shortSide = Math.min(viewportBox.w || 0, viewportBox.h || 0);
  const VIEW = shortSide ? Math.min(size, Math.max(9, Math.floor(shortSide / TARGET_CELL_PX))) : 11;
  const cellPx = shortSide ? Math.floor(shortSide / VIEW) : 44;
  const half = Math.floor(VIEW / 2);
  const camR = Math.min(Math.max(player.r - half, 0), Math.max(size - VIEW, 0));
  const camC = Math.min(Math.max(player.c - half, 0), Math.max(size - VIEW, 0));
  const viewportPx = Math.min(VIEW, size) * cellPx;

  const distTier = nearestVirusDist <= 3 ? "close" : nearestVirusDist <= 7 ? "near" : "far";
  const distLabel = distTier === "close" ? "Very Close" : distTier === "near" ? "Nearby" : "Far Away";
  const distColor = distTier === "close" ? "#f87171" : distTier === "near" ? "#fbbf24" : "#4ade80";
  const progressPct = totalFragments ? Math.round((resolved.size / totalFragments) * 100) : 0;
  const standingKey = key(player.r, player.c);
  const canPickupCorrupted = corrupted.has(standingKey) && !systemPaused && !activeEncounter;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, overflow: "hidden", background: "radial-gradient(circle at 50% -10%, #22d3ee14, transparent 55%), linear-gradient(180deg,#050708,#020204)", display: "flex", flexDirection: "column" }}>
      <style>{`
        @keyframes erPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.85)} }
        @keyframes erGlitch { 0%,100%{opacity:1;transform:scale(1) translate(0,0)} 20%{transform:scale(1.08) translate(-1px,1px)} 40%{opacity:.6;transform:scale(.92) translate(1px,-1px)} 60%{transform:scale(1.05) translate(-1px,-1px)} }
        @keyframes erHealGlow { 0%,100%{filter:drop-shadow(0 0 4px #22c55e); transform:scale(1)} 50%{filter:drop-shadow(0 0 14px #4ade80); transform:scale(1.12)} }
        @keyframes erVirusPulse { 0%,100%{ border-radius: 42% 58% 55% 45% / 55% 45% 58% 42%; } 50%{ border-radius: 55% 45% 42% 58% / 45% 58% 45% 55%; } }
        @keyframes erVirusFlicker { 0%,100%{opacity:1} 46%{opacity:1} 48%{opacity:.55} 50%{opacity:1} 74%{opacity:1} 76%{opacity:.4} 79%{opacity:1} }
        @keyframes erVirusGlitchJitter { 0%,100%{transform:translate(0,0)} 16%{transform:translate(-1px,1px)} 33%{transform:translate(1px,-1px)} 50%{transform:translate(0,0)} 66%{transform:translate(1px,1px)} 83%{transform:translate(-1px,0)} }
        @keyframes erVirusParticle { 0%{opacity:.9; transform:translate(-50%,-50%) scale(1)} 100%{opacity:0; transform:translate(-50%,-50%) translateY(16px) scale(.3)} }
        @keyframes erCorruptOrbit { from{transform:translate(-50%,-50%) rotate(0deg) translateX(14px) rotate(0deg)} to{transform:translate(-50%,-50%) rotate(360deg) translateX(14px) rotate(-360deg)} }
        @keyframes erPlayerFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
        @keyframes erPlayerRing { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes erAmbientMote { 0%,100%{opacity:.2; transform:translateY(0)} 50%{opacity:.9; transform:translateY(-6px)} }
        @keyframes erFogStatic { 0%{transform:translateY(0)} 100%{transform:translateY(6px)} }
        @keyframes erFogParticle { 0%,100%{opacity:.15; transform:translateY(0)} 50%{opacity:.55; transform:translateY(-5px)} }
        @keyframes erHealRingPulse { 0%{opacity:.9; transform:scale(.3)} 100%{opacity:0; transform:scale(1)} }
        @keyframes erHealParticle { 0%{opacity:1; transform:translate(-50%,-50%) scale(1)} 100%{opacity:0; transform:translate(calc(-50% + var(--ex)), calc(-50% + var(--ey))) scale(.4)} }
        @keyframes erBlink { 0%,100%{opacity:1} 50%{opacity:.25} }
        @keyframes erPop { from{transform:scale(.85);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes erFlashInfect { 0%{opacity:0} 15%{opacity:1} 100%{opacity:0} }
        @keyframes erFlashCorrupt { 0%{opacity:0} 12%{opacity:.9} 30%{opacity:.2} 45%{opacity:.85} 100%{opacity:0} }
        @keyframes erFlashHeal { 0%{opacity:0; transform:scale(.7)} 30%{opacity:.85; transform:scale(1.05)} 100%{opacity:0; transform:scale(1.4)} }
        @keyframes erFlashPickup { 0%{opacity:0; transform:scale(.8)} 25%{opacity:.7; transform:scale(1.02)} 100%{opacity:0; transform:scale(1.2)} }
        @keyframes erFlashHit { 0%{box-shadow:0 0 0 0 rgba(34,211,238,.55)} 100%{box-shadow:0 0 0 26px rgba(34,211,238,0)} }
        @keyframes erFlashMiss { 0%{box-shadow:0 0 0 0 rgba(244,63,94,.55)} 100%{box-shadow:0 0 0 26px rgba(244,63,94,0)} }
        @keyframes erInfectVignette { 0%,100%{opacity:.35} 50%{opacity:.75} }
        @keyframes erPromptPulse { 0%,100%{opacity:1; transform:translate(-50%,0) scale(1)} 50%{opacity:.7; transform:translate(-50%,0) scale(1.03)} }
      `}</style>

      {/* full-screen event flashes — infect / corrupt / heal / pickup */}
      {flashKind === "infect" && (
        <div style={{ position: "fixed", inset: 0, zIndex: 480, pointerEvents: "none", background: "radial-gradient(circle,transparent 40%,rgba(244,63,94,.55) 100%)", animation: "erFlashInfect .7s ease-out" }} />
      )}
      {flashKind === "corrupt" && (
        <div style={{ position: "fixed", inset: 0, zIndex: 480, pointerEvents: "none", background: "repeating-linear-gradient(0deg, rgba(244,63,94,.12) 0 2px, transparent 2px 4px), radial-gradient(circle,transparent 35%,rgba(244,63,94,.5) 100%)", animation: "erFlashCorrupt .7s ease-out" }} />
      )}
      {flashKind === "heal" && (
        <div style={{ position: "fixed", inset: 0, zIndex: 480, pointerEvents: "none", background: "radial-gradient(circle,rgba(74,222,128,.55) 0%,transparent 70%)", animation: "erFlashHeal .8s ease-out" }} />
      )}
      {flashKind === "pickup" && (
        <div style={{ position: "fixed", inset: 0, zIndex: 480, pointerEvents: "none", background: "radial-gradient(circle,rgba(34,211,238,.5) 0%,transparent 65%)", animation: "erFlashPickup .6s ease-out" }} />
      )}

      {/* infection vignette — persistent while infected, intensity ~ % */}
      {infected && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 470, pointerEvents: "none",
          background: `radial-gradient(circle, transparent 30%, rgba(244,63,94,${0.15 + infectionPct / 220}) 100%)`,
          animation: "erInfectVignette 1.4s ease-in-out infinite",
        }} />
      )}

      {/* ── Top HUD — a single slim futuristic console bar. Everything the
          player needs mid-run lives here so the rest of the screen is
          pure facility. ── */}
      <header style={{
        flexShrink: 0, display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap",
        padding: "8px 12px", background: "linear-gradient(180deg, rgba(6,14,16,.92), rgba(6,14,16,.78))",
        backdropFilter: "blur(6px)", borderBottom: "1px solid rgba(34,211,238,.22)",
        boxShadow: "0 1px 0 rgba(34,211,238,.08), 0 6px 18px -10px rgba(0,0,0,.6)", zIndex: 10, position: "relative",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingRight: 12, marginRight: 4, flexShrink: 0 }}>
          <span style={{ fontSize: "1.1rem", filter: "drop-shadow(0 0 6px rgba(34,211,238,.5))" }}>🦠</span>
          <span style={{ fontWeight: 800, fontSize: ".82rem", color: "#e6faff", letterSpacing: ".01em", maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
        </div>

        <HudStat icon="🦠" label="Infection" value={infected ? `${Math.round(infectionPct)}%` : "0%"} valueColor={infected ? "#f87171" : "#4ade80"} barPct={infected ? infectionPct : 0} barColor="linear-gradient(90deg,#f43f5e,#fb7185)" />
        <HudDivider />
        <HudStat icon="📏" label="Virus" value={distLabel} valueColor={distColor} />
        <HudDivider />
        <HudStat icon="💾" label="Fragments" value={`${resolved.size}/${totalFragments}`} valueColor="#67e8f9" extra={carrying.size > 0 ? `🎒${carrying.size}` : null} />
        <HudDivider />
        <HudStat icon="🎯" label="Progress" value={`${progressPct}%`} valueColor="#67e8f9" barPct={progressPct} barColor="linear-gradient(90deg,#0ea5e9,#67e8f9)" />
        {typeof timeLeft === "number" && (
          <>
            <HudDivider />
            <HudStat icon="⏱" label="Time" value={formatClock(timeLeft)} valueColor={timeLeft <= 10 ? "#f87171" : timeLeft <= 30 ? "#fbbf24" : "#67e8f9"} />
          </>
        )}

        <div style={{ flex: 1 }} />
        {onExit && (
          <button onClick={onExit} style={{ border: "1px solid rgba(248,113,113,.35)", background: "rgba(248,113,113,.08)", cursor: "pointer", fontSize: ".72rem", color: "#f87171", fontWeight: 700, borderRadius: 8, padding: "6px 10px", flexShrink: 0 }}>
            Exit ✕
          </button>
        )}
      </header>

      {toast && (
        <div style={{ position: "absolute", top: 68, left: "50%", transform: "translateX(-50%)", textAlign: "center", fontSize: ".82rem", fontWeight: 700, color: "#67e8f9", background: "rgba(10,31,34,.9)", border: "1px solid #134048", borderRadius: 10, padding: "6px 14px", zIndex: 40, animation: "erPop .2s ease-out", whiteSpace: "nowrap" }}>
          {toast}
        </div>
      )}

      {/* ── Facility viewport — fills essentially the entire remaining
          screen; sizing is measured live so this genuinely scales to the
          device instead of sitting in a small fixed box. ── */}
      <div ref={viewportRef} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0, position: "relative" }}>
        {viewportPx > 0 && (
          <div
            style={{
              position: "relative", width: viewportPx, height: viewportPx, overflow: "hidden",
              boxShadow: (flashKind === "miss") ? "0 0 0 0 rgba(244,63,94,.6)" : (flashKind === "hit") ? "0 0 0 0 rgba(34,211,238,.55)" : "none",
              animation: flashKind === "hit" ? "erFlashHit .45s ease-out" : flashKind === "miss" ? "erFlashMiss .45s ease-out" : "none",
            }}
          >
            <div
              style={{
                position: "absolute", top: 0, left: 0, width: size * cellPx, height: size * cellPx,
                transition: "transform .18s ease-out",
                transform: `translate(${-camC * cellPx}px, ${-camR * cellPx}px)`,
                willChange: "transform",
              }}
            >
              <FacilityGrid
                maze={maze} size={size} cellPx={cellPx} encounterMap={encounterMap}
                resolved={resolved} corrupted={corrupted} carrying={carrying} healingKeys={healingKeys}
                exitR={exit.r} exitC={exit.c} allResolved={allResolved} distNoExit={distNoExit}
                camR={camR} camC={camC} view={VIEW} visibleSet={visibleSet} everSeen={everSeen}
              />
              <VirusesLayer viruses={viruses} cellPx={cellPx} visibleSet={visibleSet} />
              <PlayerSprite r={player.r} c={player.c} cellPx={cellPx} facing={facing} invulnerable={invulnerable} />
              {flashKind === "heal" && <HealBurst key={healBurstId} r={player.r} c={player.c} cellPx={cellPx} />}
            </div>

            {/* fog vignette — reinforces the limited-visibility read even
                though the underlying cells already gate what's rendered */}
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(circle at 50% 50%, transparent 42%, rgba(0,0,0,.55) 78%, rgba(0,0,0,.92) 100%)" }} />
          </div>
        )}

        {/* "Press E to Pick Up" — shown only while standing on a corrupted,
            not-yet-recovered fragment */}
        {canPickupCorrupted && (
          <div style={{
            position: "absolute", left: "50%", bottom: 96, transform: "translate(-50%,0)", zIndex: 45,
            display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 999,
            background: "rgba(127,29,29,.85)", border: "1px solid rgba(251,113,133,.5)",
            boxShadow: "0 0 18px rgba(244,63,94,.4)", animation: "erPromptPulse 1.1s ease-in-out infinite",
          }}>
            <kbd style={{ background: "#fff", color: "#7f1d1d", fontWeight: 900, fontSize: ".72rem", borderRadius: 5, padding: "2px 7px" }}>E</kbd>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: ".8rem" }}>Press E to Pick Up</span>
          </div>
        )}

        {/* D-pad — overlaid on the map itself so exploration keeps the
            screen, not pushed into its own layout row */}
        <div style={{
          position: "absolute", left: "50%", bottom: 14, transform: "translateX(-50%)", zIndex: 40,
          display: "grid", gridTemplateColumns: "repeat(3, 46px)", gridTemplateRows: "repeat(2, 46px)", gap: 6,
          padding: 8, borderRadius: 16, background: "rgba(6,14,16,.55)", backdropFilter: "blur(4px)", border: "1px solid rgba(34,211,238,.15)",
        }}>
          <div />
          <DpadBtn onClick={() => tryMove(-1, 0, "N")}>↑</DpadBtn>
          <div />
          <DpadBtn onClick={() => tryMove(0, -1, "W")}>←</DpadBtn>
          <DpadBtn onClick={() => tryMove(1, 0, "S")}>↓</DpadBtn>
          <DpadBtn onClick={() => tryMove(0, 1, "E")}>→</DpadBtn>
        </div>
      </div>

      {showIntro && <IntroWalkthrough onClose={() => { setShowIntro(false); setShowDifficulty(true); }} />}
      {showDifficulty && <DifficultyModal onChoose={chooseDifficulty} />}
      {activeEncounter && <EncounterModal encounter={activeEncounter} onResolve={resolveEncounter} />}

      {overridden && (
        <Overlay>
          <div style={{ fontSize: "2.4rem" }}>🦠</div>
          <h2 style={{ margin: "8px 0" }}>SYSTEM OVERRIDDEN</h2>
          <p style={{ color: "#a09a89", marginBottom: 18 }}>Mission failed — the infection took over. Recovered fragments stay recovered; you'll respawn at the entrance.</p>
          <button className="btn btn-primary" onClick={respawn} style={{ background: "linear-gradient(135deg,#f43f5e,#fb7185)", border: "none" }}>Respawn</button>
        </Overlay>
      )}

      {victory && (
        <Overlay>
          <div style={{ fontSize: "2.4rem" }}>🚪</div>
          <h2 style={{ margin: "8px 0" }}>Facility cleared!</h2>
          <p style={{ color: "#a09a89" }}>Submitting your run…</p>
        </Overlay>
      )}
    </div>
  );
}

function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function HudDivider() {
  return <div style={{ width: 1, alignSelf: "stretch", background: "linear-gradient(180deg,transparent,rgba(34,211,238,.25),transparent)", margin: "2px 12px", flexShrink: 0 }} />;
}

function HudStat({ icon, label, value, valueColor, barPct, barColor, extra }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 64, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: ".62rem", fontWeight: 800, color: "#7a8a90", textTransform: "uppercase", letterSpacing: ".04em" }}>
        <span style={{ fontSize: ".8rem" }}>{icon}</span>{label}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: ".82rem", fontWeight: 800, color: valueColor || "#e6faff" }}>{value}</span>
        {extra && <span style={{ fontSize: ".68rem", fontWeight: 700, color: "#67e8f9" }}>{extra}</span>}
      </div>
      {typeof barPct === "number" && (
        <div style={{ width: 56, height: 4, borderRadius: 999, background: "#131f21", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, barPct))}%`, borderRadius: 999, background: barColor, transition: "width .4s ease" }} />
        </div>
      )}
    </div>
  );
}

function DpadBtn({ children, onClick }) {
  return (
    <button onClick={onClick} style={{ width: 48, height: 48, borderRadius: 12, border: "none", fontSize: "1.2rem", fontWeight: 800, background: "linear-gradient(135deg,#0e2a2e,#134048)", color: "#e6faff", cursor: "pointer" }}>
      {children}
    </button>
  );
}

function Overlay({ children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(2,4,6,.8)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#0a1214", color: "#fff", borderRadius: 20, padding: "32px 28px", textAlign: "center", maxWidth: 380, width: "100%", animation: "erPop .25s ease-out", border: "1px solid #16302f" }}>
        {children}
      </div>
    </div>
  );
}

// ───────────────────────── intro walkthrough ─────────────────────────

const INTRO_SLIDES = [
  { icon: "🦠", grad: "linear-gradient(135deg,#f43f5e,#fb7185)", title: "Containment Breached", body: "An experimental AI Virus escaped and the facility went into lockdown. Recover every AI Data Fragment and reach the exit — alive." },
  { icon: "🌫️", grad: "linear-gradient(135deg,#0891b2,#22d3ee)", title: "Fog of War", body: "You can only see a short distance around yourself. Explore carefully — you never know what's around the next corner." },
  { icon: "👾", grad: "linear-gradient(135deg,#f43f5e,#f97316)", title: "The Virus Hunts You", body: "One or more Viruses actively path toward you. They don't wander randomly — they're smart. Use the Virus Distance readout to judge how close is too close." },
  { icon: "💾", grad: "linear-gradient(135deg,#22d3ee,#67e8f9)", title: "Recover Fragments", body: "Step on a Data Fragment to open a quick question pulled from what you've been learning. Answer every one to unlock the exit." },
  { icon: "⚠️", grad: "linear-gradient(135deg,#eab308,#fde047)", title: "Solving Isn't Safe", body: "The virus keeps moving even while you're mid-question. Get tagged during a puzzle and the fragment corrupts — glitching in place until you press E to pick it up and carry it to a Healing Center for repair." },
  { icon: "🦠", grad: "linear-gradient(135deg,#f43f5e,#fda4af)", title: "Infection", body: "Get tagged while exploring and you're infected — a meter climbs until you reach a Healing Center. Let it hit 100% and the mission fails." },
  { icon: "🏥", grad: "linear-gradient(135deg,#22c55e,#86efac)", title: "Healing Centers", body: "They cure infection, repair carried fragments on the spot, and viruses can't step onto them — a real safe zone if you can find one in time." },
];

function IntroWalkthrough({ onClose }) {
  const [step, setStep] = useState(0);
  const [dontShow, setDontShow] = useState(false);
  const last = step === INTRO_SLIDES.length - 1;
  const slide = INTRO_SLIDES[step];

  const finish = () => {
    if (dontShow) { try { localStorage.setItem("er2_hide_intro", "1"); } catch { /* ignore */ } }
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(2,4,6,.93)", backdropFilter: "blur(2px)", zIndex: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: 18, animation: "erPop .25s ease-out" }}>
      <button
        onClick={finish}
        style={{ position: "absolute", top: 22, right: 22, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.18)", color: "#e6faff", borderRadius: 999, padding: "8px 16px", fontSize: ".76rem", fontWeight: 700, cursor: "pointer" }}
      >
        Skip ✕
      </button>

      <div style={{ width: "100%", maxWidth: 400, borderRadius: 26, overflow: "hidden", background: "#0a1214", boxShadow: "0 40px 90px -20px rgba(0,0,0,.7), 0 0 0 1px rgba(34,211,238,.2)" }}>
        <div key={step} style={{ background: slide.grad, padding: "40px 24px 30px", textAlign: "center", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 0%, rgba(255,255,255,.25), transparent 60%)" }} />
          <div style={{ fontSize: "3.4rem", filter: "drop-shadow(0 0 16px rgba(255,255,255,.55))", position: "relative" }}>
            {slide.icon}
          </div>
        </div>

        <div style={{ padding: "22px 26px 22px", color: "#e6faff" }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "1.18rem", fontWeight: 800 }}>{slide.title}</h2>
          <p style={{ fontSize: ".92rem", lineHeight: 1.55, color: "#a9c4c9", marginBottom: 20, minHeight: 66 }}>{slide.body}</p>

          <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 18 }}>
            {INTRO_SLIDES.map((_, i) => (
              <span key={i} style={{ width: i === step ? 20 : 7, height: 7, borderRadius: 999, background: i === step ? slide.grad : "#16302f", transition: "all .25s ease" }} />
            ))}
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            {step > 0 && (
              <button onClick={() => setStep((s) => s - 1)} style={{ padding: "12px 16px", borderRadius: 12, border: "1px solid #134048", background: "transparent", color: "#e6faff", fontWeight: 700, cursor: "pointer" }}>
                ←
              </button>
            )}
            {!last ? (
              <button onClick={() => setStep((s) => s + 1)} style={{ flex: 1, padding: "12px 16px", borderRadius: 12, border: "none", fontWeight: 800, cursor: "pointer", background: slide.grad, color: "#fff" }}>
                Next →
              </button>
            ) : (
              <button onClick={finish} style={{ flex: 1, padding: "14px 16px", borderRadius: 12, border: "none", fontWeight: 800, fontSize: "1rem", cursor: "pointer", background: slide.grad, color: "#fff", boxShadow: "0 10px 24px -8px rgba(34,211,238,.6)" }}>
                Enter the Facility 🚪
              </button>
            )}
          </div>

          <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: ".76rem", color: "#7a8a90", cursor: "pointer" }}>
            <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} />
            Don't show this again
          </label>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── difficulty select modal ─────────────────────────

function DifficultyModal({ onChoose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(2,4,6,.93)", backdropFilter: "blur(2px)", zIndex: 690, display: "flex", alignItems: "center", justifyContent: "center", padding: 18, animation: "erPop .22s ease-out" }}>
      <div style={{ width: "100%", maxWidth: 420, borderRadius: 26, background: "#0a1214", boxShadow: "0 40px 90px -20px rgba(0,0,0,.7), 0 0 0 1px rgba(34,211,238,.2)", padding: "26px 24px 22px" }}>
        <div style={{ textAlign: "center", marginBottom: 6 }}>
          <div style={{ fontSize: "2rem" }}>☣️</div>
          <h2 style={{ margin: "6px 0 4px", fontSize: "1.2rem", fontWeight: 800, color: "#fff" }}>Choose Containment Level</h2>
          <p style={{ fontSize: ".8rem", color: "#7a8a90", marginBottom: 18 }}>More viruses, smarter and faster, tighter fog — but a real Coins multiplier to match.</p>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {Object.entries(DIFFICULTY).map(([k, cfg]) => (
            <button
              key={k}
              onClick={() => onChoose(k)}
              style={{
                display: "flex", alignItems: "center", gap: 14, textAlign: "left", padding: "14px 16px", borderRadius: 16,
                border: "1px solid rgba(34,211,238,.2)", background: "#0e1a1c", cursor: "pointer", color: "#e6faff",
              }}
            >
              <div style={{ fontSize: "1.5rem", flexShrink: 0, minWidth: 46 }}>{cfg.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 800, fontSize: ".95rem" }}>{cfg.label}</span>
                  <span style={{
                    fontSize: ".72rem", fontWeight: 800, padding: "3px 9px", borderRadius: 999,
                    background: cfg.coinMult >= 1.5 ? "linear-gradient(135deg,#eab308,#fde047)" : cfg.coinMult === 1 ? "linear-gradient(135deg,#22d3ee,#67e8f9)" : "#16302f",
                    color: cfg.coinMult >= 1.5 ? "#3a2c00" : "#04202a",
                  }}>
                    🪙 {cfg.coinMult}×
                  </span>
                </div>
                <div style={{ fontSize: ".76rem", color: "#7a8a90", marginTop: 3, lineHeight: 1.4 }}>{cfg.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── fragment modal (same puzzle engine as DungeonCrawler) ─────────────────────────
// Types whose correctness can't be safely checked client-side (answer
// stripped for students) resolve as "recovered" the instant you submit —
// real scoring happens at Finish, same as the classic flow.

const TYPE_THEME = {
  multiple_choice: { grad: "linear-gradient(135deg,#22d3ee,#67e8f9)", label: "Multiple Choice" },
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
  const verb = kind === "repaired" ? "Decode" : "Decode";
  const eyebrow = kind === "repaired" ? "Repaired Fragment" : "AI Data Fragment";

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(2,5,7,.82)", backdropFilter: "blur(3px)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <div style={{
        width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto", overflowX: "hidden", borderRadius: 24,
        background: "#0a1214", border: "1px solid rgba(34,211,238,.16)",
        boxShadow: "0 30px 70px -20px rgba(0,0,0,.65), 0 0 0 1px rgba(255,255,255,.03) inset",
        animation: "erPop .22s ease-out",
      }}>
        <div style={{ background: theme.grad, padding: "24px 30px", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 46, height: 46, borderRadius: 15, background: "rgba(255,255,255,.2)", border: "1px solid rgba(255,255,255,.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem", flexShrink: 0 }}>
            {ICONS[question.question_type] || "❓"}
          </div>
          <div>
            <div style={{ fontSize: ".68rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", color: "rgba(255,255,255,.85)", marginBottom: 2 }}>
              {eyebrow}
            </div>
            <div style={{ fontWeight: 800, color: "#fff", fontSize: "1.08rem" }}>{theme.label}</div>
          </div>
        </div>

        <div style={{ padding: "30px 30px 32px", color: "#e6faff", touchAction: "manipulation" }}>
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

const inputStyle = { width: "100%", borderRadius: 13, padding: "13px 15px", border: "1px solid #134048", background: "#0e1a1c", color: "#fff", marginBottom: 16, fontSize: ".95rem", boxSizing: "border-box" };
function submitBtnStyle(theme, enabled) {
  return { width: "100%", padding: "14px 16px", borderRadius: 13, border: "none", fontWeight: 800, fontSize: ".92rem", cursor: enabled ? "pointer" : "default", background: theme.grad, color: "#fff", opacity: enabled ? 1 : 0.4, boxShadow: enabled ? "0 8px 22px -8px rgba(34,211,238,.5)" : "none", transition: "opacity .15s ease, transform .1s ease" };
}

function ChoiceBody({ prompt, options, onPick, verb, theme }) {
  return (
    <>
      {prompt && <p style={{ fontWeight: 700, marginBottom: 18, fontSize: "1.02rem", lineHeight: 1.45 }}>{prompt}</p>}
      <div style={{ display: "grid", gap: 10 }}>
        {options.map((o, i) => (
          <button key={i} onClick={() => onPick(i)} style={{ padding: "14px 17px", borderRadius: 13, border: "1px solid #134048", background: "#0e1a1c", color: "#e6faff", fontWeight: 600, cursor: "pointer", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: ".92rem", transition: "border-color .15s ease, background .15s ease", touchAction: "manipulation" }}>
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
      <p style={{ fontSize: ".74rem", color: "#7a8a90", marginBottom: 12 }}>Drag a right-hand item onto its match on the left — or tap-tap.</p>
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
                  border: isHoverTarget ? "2px solid #86efac" : matchedIdx != null ? "2px solid #22c55e" : "1px solid #134048",
                  background: "#0e1a1c", color: "#fff", fontSize: ".82rem",
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
                border: selRight === i ? "2px solid #22d3ee" : "1px solid #134048",
                background: used.has(i) ? "#081012" : "#0e1a1c", color: "#fff", fontSize: ".82rem",
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
      <p style={{ fontSize: ".74rem", color: "#7a8a90", marginBottom: 12 }}>Drag the cards (or use the arrows) into the correct order:</p>
      <div onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 18 }}>
        {order.map((item, i) => (
          <div
            key={item + i}
            data-drag-index={i}
            onPointerDown={(e) => onPointerDown(e, i)}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "12px 13px", borderRadius: 12,
              border: overIndex === i && dragIndex !== null && dragIndex !== i ? "2px solid #86efac" : "1px solid #134048",
              background: dragIndex === i ? "#122228" : "#0e1a1c", opacity: dragIndex === i ? 0.55 : 1,
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
            <span style={{ userSelect: "none", fontWeight: 600, fontSize: ".9rem", color: "#e6faff", flex: 1, pointerEvents: "none" }}>
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
  width: 24, height: 18, borderRadius: 5, border: "none", background: "#122228", color: "#e6faff",
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
      <p style={{ fontSize: ".78rem", color: "#7a8a90", marginBottom: 14 }}>{matched.size}/{pairs.length} pairs found</p>
      <div className="s-memory-grid" style={{ maxWidth: 480, margin: "0 auto", padding: "0 3px" }}>
        {tiles.map((t) => {
          const isMatched = matched.has(t.pairId);
          const isFlipped = isMatched || flipped.some((f) => f.id === t.id);
          const isWrong = wrong.includes(t.id);
          return (
            <button key={t.id} className="s-memory-tile" onClick={() => flip(t)} disabled={isMatched}
              style={{ background: isFlipped ? "#0e7490" : "#0e1a1c", color: isFlipped ? "#fff" : "transparent", animation: isWrong ? "erShake .35s" : "none", cursor: isMatched ? "default" : "pointer", touchAction: "manipulation" }}>
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
      <p style={{ fontSize: ".78rem", color: "#7a8a90", marginBottom: 12 }}>{found.size}/{puzzle.words.length} words found — drag across letters to select</p>
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
                borderRadius: 6, cursor: "pointer", border: "1px solid #0d2426",
                background: isFound ? "linear-gradient(135deg,#06b6d4,#22d3ee)" : isSel ? "linear-gradient(135deg,#0ea5e9,#67e8f9)" : "#0e1a1c",
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
              background: found.has(word) ? "linear-gradient(135deg,#06b6d4,#22d3ee)" : "#0e1a1c",
              color: found.has(word) ? "#fff" : "#7a8a90",
              textDecoration: found.has(word) ? "line-through" : "none",
              border: found.has(word) ? "none" : "1px solid #134048",
            }}
          >
            {word}
          </span>
        ))}
      </div>
    </>
  );
}