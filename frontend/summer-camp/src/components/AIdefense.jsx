import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { generateWordSearch, matchSelection, straightLine } from "./wordSearchGenerator";

/**
 * AIDefense — "The AI Defense". Same renderer contract as
 * DungeonCrawler/FloorIsLava/ChallengePlay/QuestPlay: hands back
 * `{questionId: response}` via onComplete, exactly what the parent already
 * submits. No backend awareness of "games" needed.
 *
 * Premise: the AI is powering down. Q-nodes scattered across the map are
 * the only thing that can restore it — answering one heals the core.
 * Meanwhile hostile bots continuously spawn at the map's edges and march
 * toward the core; one that arrives drains a big chunk of power on
 * contact. Bumping an unarmed player into a bot slows them down instead of
 * hurting them — the real threat is always to the AI, never directly to
 * the player. Sword/gun pickups let the player fight back and clear a
 * path to the Q-nodes faster.
 *
 * No three.js — the board is a flat, absolutely-positioned tile grid
 * wrapped in a CSS `perspective` + `rotateX` tilt (classic pseudo-3D
 * "simulated" isometric look). Every sprite counter-rotates its inner
 * content so icons/emoji stay upright and readable despite the tilt, and
 * obstacles get a real `translateZ` lift so they visibly stick up out of
 * the floor. It's all plain CSS, no WebGL.
 */

// ───────────────────────── arena generation ─────────────────────────

const key = (r, c) => `${r},${c}`;

function shuffledArr(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const DIR4 = [
  ["N", -1, 0],
  ["S", 1, 0],
  ["E", 0, 1],
  ["W", 0, -1],
];

// Open arena (no maze walls) with scattered rock obstacles. Regenerates a
// handful of times if the obstacles happen to wall off a big chunk of the
// floor — with this density that's rare, but cheap to guard against.
function generateArena(size, coreR, coreC) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const blocked = new Set();
    const density = 0.14;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (Math.abs(r - coreR) <= 1 && Math.abs(c - coreC) <= 1) continue; // keep the core plaza clear
        if (r === 0 && c === 0) continue; // player start
        if (Math.random() < density) blocked.add(key(r, c));
      }
    }
    const dist = distancesFrom(size, blocked, { r: coreR, c: coreC });
    let reachable = 0;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (dist[r][c] !== Infinity) reachable++;
    const total = size * size - blocked.size;
    if (reachable / total > 0.92) return blocked;
  }
  return new Set(); // fallback: open floor, no obstacles
}

function distancesFrom(size, blocked, start) {
  const dist = Array.from({ length: size }, () => Array(size).fill(Infinity));
  dist[start.r][start.c] = 0;
  const q = [start];
  while (q.length) {
    const cur = q.shift();
    for (const [, dr, dc] of DIR4) {
      const nr = cur.r + dr, nc = cur.c + dc;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      if (blocked.has(key(nr, nc))) continue;
      if (dist[nr][nc] > dist[cur.r][cur.c] + 1) {
        dist[nr][nc] = dist[cur.r][cur.c] + 1;
        q.push({ r: nr, c: nc });
      }
    }
  }
  return dist;
}

// ───────────────────────── question rendering (shared) ─────────────────────────

const ICONS = {
  multiple_choice: "🎯", true_false: "⚖️", fill_blank: "✏️", prompt_build: "🤖",
  drag_order: "🧩", match_pairs: "🔗", memory_tiles: "🧠", word_search: "🔍", image_reveal: "🖼️",
};

const TYPE_THEME = {
  multiple_choice: { grad: "linear-gradient(135deg,#22d3ee,#0ea5e9)", label: "Multiple Choice" },
  true_false:      { grad: "linear-gradient(135deg,#7c5cfc,#a78bfa)", label: "True / False" },
  fill_blank:      { grad: "linear-gradient(135deg,#f97316,#fdba74)", label: "Fill in the Blank" },
  prompt_build:    { grad: "linear-gradient(135deg,#ec4899,#f9a8d4)", label: "Prompt Challenge" },
  drag_order:      { grad: "linear-gradient(135deg,#22c55e,#86efac)", label: "Put in Order" },
  match_pairs:     { grad: "linear-gradient(135deg,#eab308,#fde047)", label: "Match Pairs" },
  memory_tiles:    { grad: "linear-gradient(135deg,#8b5cf6,#c4b5fd)", label: "Memory Tiles" },
  word_search:     { grad: "linear-gradient(135deg,#06b6d4,#67e8f9)", label: "Word Search" },
  image_reveal:    { grad: "linear-gradient(135deg,#f43f5e,#fda4af)", label: "Image Reveal" },
};

// ── difficulty: scales the bot swarm, the core's passive power drain, the
// heal-per-Q, and how long a weapon pickup stays active — plus the Coins
// payout multiplier, the same "harder = more reward" shape as its sibling
// games' difficulty tables.
const DIFFICULTY = {
  easy: {
    label: "Easy", icon: "🌱", coinMult: 0.5,
    maxMobs: 3, mobSpawnMs: 5200, mobMoveMs: 640, mobDamage: 9,
    passiveDrainPerTick: 0.32, healAmount: 16, weaponMs: 9000,
    desc: "Fewer, slower bots and a gentle power drain. A good first defense.",
  },
  medium: {
    label: "Medium", icon: "🤖", coinMult: 1,
    maxMobs: 5, mobSpawnMs: 3800, mobMoveMs: 480, mobDamage: 13,
    passiveDrainPerTick: 0.5, healAmount: 14, weaponMs: 7500,
    desc: "The standard defense. Balanced risk and reward.",
  },
  hard: {
    label: "Hard", icon: "🔥", coinMult: 1.5,
    maxMobs: 7, mobSpawnMs: 2800, mobMoveMs: 380, mobDamage: 17,
    passiveDrainPerTick: 0.72, healAmount: 12, weaponMs: 6200,
    desc: "More bots, faster and hungrier for the core.",
  },
  extreme: {
    label: "Extreme", icon: "💀", coinMult: 2,
    maxMobs: 10, mobSpawnMs: 2000, mobMoveMs: 300, mobDamage: 22,
    passiveDrainPerTick: 1.0, healAmount: 10, weaponMs: 5000,
    desc: "A relentless swarm hunting the core. Only for elite defenders.",
  },
};

const WEAPONS = {
  sword: { icon: "⚔️", label: "Sword", note: "Melee — defeats a bot on contact." },
  gun:   { icon: "🔫", label: "Blaster", note: "Ranged — auto-zaps nearby bots." },
};

// ───────────────────────── main component ─────────────────────────

export default function AIDefense({ questions, title = "The AI Defense", onAnswer, onComplete, onExit }) {
  const size = Math.min(13, Math.max(9, questions.length + 5));
  const core = useMemo(() => ({ r: Math.floor(size / 2), c: Math.floor(size / 2) }), [size]);
  const start = { r: 0, c: 0 };

  const blocked = useMemo(() => generateArena(size, core.r, core.c), [size, core.r, core.c]);
  const distFromStart = useMemo(() => distancesFrom(size, blocked, start), [size, blocked]); // eslint-disable-line
  const distFromCore = useMemo(() => distancesFrom(size, blocked, core), [size, blocked, core]);

  // ── Q-node placement: bucketed by distance from the player's start so
  // they're spread across the whole map, not clumped near spawn — same
  // "search the whole map" idea as DungeonCrawler's trial placement. ──
  const qCells = useMemo(() => {
    const floor = [];
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if (blocked.has(key(r, c))) continue;
      if (r === start.r && c === start.c) continue;
      if (r === core.r && c === core.c) continue;
      if (distFromStart[r][c] === Infinity) continue;
      floor.push({ r, c, d: distFromStart[r][c] });
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
  }, [size, blocked]);

  const qMap = useMemo(() => {
    const m = new Map();
    qCells.forEach((cell, i) => m.set(key(cell.r, cell.c), questions[i]));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qCells]);

  // ── weapon pickups: one sword, one gun, placed away from Q-nodes/start/core ─
  const weaponCells = useMemo(() => {
    const used = new Set([...qMap.keys(), key(start.r, start.c), key(core.r, core.c)]);
    const candidates = [];
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      const k = key(r, c);
      if (used.has(k) || blocked.has(k)) continue;
      if (distFromStart[r][c] === Infinity) continue;
      candidates.push({ r, c });
    }
    const picks = shuffledArr(candidates).slice(0, 2);
    return picks.map((p, i) => ({ ...p, type: i === 0 ? "sword" : "gun" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, blocked, qMap]);
  const weaponMap = useMemo(() => new Map(weaponCells.map((w) => [key(w.r, w.c), w.type])), [weaponCells]);

  // ── mob spawn points: reachable edge-ish cells far from the core ──────
  const spawnCells = useMemo(() => {
    const far = [];
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      const k = key(r, c);
      if (blocked.has(k)) continue;
      if (distFromCore[r][c] === Infinity) continue;
      const onEdge = r === 0 || c === 0 || r === size - 1 || c === size - 1;
      if (onEdge && distFromCore[r][c] >= Math.floor(size / 2)) far.push({ r, c });
    }
    return far.length ? far : [{ r: 0, c: size - 1 }];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, blocked]);

  // ── state ──────────────────────────────────────────────────────────
  const [player, setPlayer] = useState(start);
  const [qUsed, setQUsed] = useState(() => new Set());
  const [weaponUsed, setWeaponUsed] = useState(() => new Set());
  const [weapon, setWeapon] = useState(null); // { type, until }
  const [mobs, setMobs] = useState([]);
  const [power, setPower] = useState(70);
  const [kills, setKills] = useState(0);
  const [answers, setAnswers] = useState({});
  const [activeEncounter, setActiveEncounter] = useState(null);
  const [toast, setToast] = useState("");
  const [flashKind, setFlashKind] = useState(null);
  const [frozenUntil, setFrozenUntil] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [victory, setVictory] = useState(false);
  const [mobIdSeq, setMobIdSeq] = useState(0);
  const [showIntro, setShowIntro] = useState(() => {
    try { return localStorage.getItem("aid_hide_intro") !== "1"; } catch { return true; }
  });
  const [showDifficulty, setShowDifficulty] = useState(() => {
    try { return localStorage.getItem("aid_hide_intro") === "1"; } catch { return false; }
  });
  const [difficulty, setDifficulty] = useState(null);

  const diffCfg = DIFFICULTY[difficulty] || DIFFICULTY.medium;
  const allFound = qUsed.size >= questions.length;
  const paused = !!activeEncounter || gameOver || victory || showIntro || showDifficulty;

  const playerRef = useRef(player); playerRef.current = player;
  const pausedRef = useRef(paused); pausedRef.current = paused;
  const weaponRef = useRef(weapon); weaponRef.current = weapon;
  const diffCfgRef = useRef(diffCfg); diffCfgRef.current = diffCfg;
  const mobIdSeqRef = useRef(mobIdSeq); mobIdSeqRef.current = mobIdSeq;

  const say = (msg) => { setToast(msg); setTimeout(() => setToast((t) => (t === msg ? "" : t)), 1700); };
  const flash = (kind) => { setFlashKind(kind); setTimeout(() => setFlashKind(null), 420); };

  const chooseDifficulty = (k) => { setDifficulty(k); setShowDifficulty(false); };

  // ── passive power drain — never pauses except on a real stop condition ─
  useEffect(() => {
    const t = setInterval(() => {
      if (pausedRef.current) return;
      setPower((p) => Math.max(0, p - diffCfgRef.current.passiveDrainPerTick));
    }, 400);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (power <= 0 && !gameOver && !victory) setGameOver(true);
  }, [power, gameOver, victory]);

  // ── mob spawning ──────────────────────────────────────────────────
  useEffect(() => {
    if (!difficulty) return;
    const t = setInterval(() => {
      if (pausedRef.current) return;
      setMobs((prev) => {
        if (prev.length >= diffCfgRef.current.maxMobs) return prev;
        const cell = spawnCells[Math.floor(Math.random() * spawnCells.length)];
        const id = mobIdSeqRef.current + 1;
        mobIdSeqRef.current = id;
        setMobIdSeq(id);
        return [...prev, { id, r: cell.r, c: cell.c }];
      });
    }, diffCfg.mobSpawnMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficulty, spawnCells]);

  // ── mob AI: every tick, each bot greedily steps toward the core along
  // the precomputed core-distance field, avoiding obstacles. Reaching the
  // core drains power and consumes the bot. ──────────────────────────
  useEffect(() => {
    if (!difficulty) return;
    const t = setInterval(() => {
      if (pausedRef.current) return;
      setMobs((prev) => {
        const survivors = [];
        let coreHits = 0;
        for (const mob of prev) {
          if (mob.r === core.r && mob.c === core.c) continue; // shouldn't happen, safety
          const options = DIR4
            .map(([, dr, dc]) => ({ dr, dc, nr: mob.r + dr, nc: mob.c + dc }))
            .filter((o) => o.nr >= 0 && o.nr < size && o.nc >= 0 && o.nc < size && !blocked.has(key(o.nr, o.nc)))
            .map((o) => ({ ...o, dist: distFromCore[o.nr]?.[o.nc] ?? Infinity }))
            .filter((o) => o.dist !== Infinity);
          if (!options.length) { survivors.push(mob); continue; }
          options.sort((a, b) => a.dist - b.dist);
          const best = options[0];
          const nr = best.nr, nc = best.nc;
          if (nr === core.r && nc === core.c) {
            coreHits += 1; // absorbed by the core, doesn't survive
          } else {
            survivors.push({ ...mob, r: nr, c: nc });
          }
        }
        if (coreHits > 0) {
          setPower((p) => Math.max(0, p - diffCfgRef.current.mobDamage * coreHits));
          flash("coreHit");
          say(coreHits > 1 ? `🚨 ${coreHits} bots breached the core!` : "🚨 A bot breached the core!");
        }
        return survivors;
      });
    }, diffCfg.mobMoveMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficulty, size, blocked, distFromCore, core.r, core.c]);

  // ── gun auto-fire: zaps the nearest bot within range every tick while a
  // blaster is armed, no contact required. ───────────────────────────
  useEffect(() => {
    const t = setInterval(() => {
      if (pausedRef.current) return;
      const w = weaponRef.current;
      if (!w || w.type !== "gun") return;
      const p = playerRef.current;
      setMobs((prev) => {
        let nearestIdx = -1, nearestDist = Infinity;
        prev.forEach((m, i) => {
          const d = Math.abs(m.r - p.r) + Math.abs(m.c - p.c);
          if (d <= 3 && d < nearestDist) { nearestDist = d; nearestIdx = i; }
        });
        if (nearestIdx === -1) return prev;
        setKills((k) => k + 1);
        flash("kill");
        return prev.filter((_, i) => i !== nearestIdx);
      });
    }, 550);
    return () => clearInterval(t);
  }, []);

  // ── weapon expiry ─────────────────────────────────────────────────
  useEffect(() => {
    if (!weapon) return;
    const remaining = weapon.until - Date.now();
    if (remaining <= 0) { setWeapon(null); return; }
    const t = setTimeout(() => { setWeapon(null); say("🔋 Your weapon ran out of charge!"); }, remaining);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weapon]);

  // ── melee / slow collision: independent of the player's own move tick,
  // since bots move on their own timer too. Armed = defeat on contact.
  // Unarmed = the player is slowed (briefly frozen) and the bot bounces
  // back a step, instead of ever hurting the player directly. ─────────
  useEffect(() => {
    if (paused) return;
    const idx = mobs.findIndex((m) => m.r === player.r && m.c === player.c);
    if (idx === -1) return;
    if (weapon && weapon.type === "sword") {
      setMobs((prev) => prev.filter((_, i) => i !== idx));
      setKills((k) => k + 1);
      flash("kill");
      say("⚔️ Defeated a bot!");
    } else {
      setFrozenUntil(Date.now() + 850);
      flash("slow");
      say("🥶 A bot slowed you down!");
      setMobs((prev) => prev.map((m, i) => {
        if (i !== idx) return m;
        const away = DIR4
          .map(([, dr, dc]) => ({ dr, dc, nr: m.r + dr, nc: m.c + dc }))
          .filter((o) => o.nr >= 0 && o.nr < size && o.nc >= 0 && o.nc < size && !blocked.has(key(o.nr, o.nc)))
          .sort((a, b) => (distFromCore[b.nr]?.[b.nc] ?? 0) - (distFromCore[a.nr]?.[a.nc] ?? 0))[0];
        return away ? { ...m, r: away.nr, c: away.nc } : m;
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobs, player]);

  const tryMove = useCallback((dr, dc) => {
    if (pausedRef.current || Date.now() < frozenUntil) return;
    setPlayer((p) => {
      const nr = p.r + dr, nc = p.c + dc;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) return p;
      if (blocked.has(key(nr, nc))) return p;
      const k = key(nr, nc);
      if (qMap.has(k) && !qUsed.has(k)) {
        setActiveEncounter({ r: nr, c: nc, question: qMap.get(k) });
        return { r: nr, c: nc };
      }
      if (weaponMap.has(k) && !weaponUsed.has(k)) {
        const type = weaponMap.get(k);
        setWeaponUsed((s) => new Set(s).add(k));
        setWeapon({ type, until: Date.now() + (type === "sword" ? diffCfg.weaponMs * 1.3 : diffCfg.weaponMs) });
        flash("pickup");
        say(type === "sword" ? "⚔️ Sword equipped — defeat bots on contact!" : "🔫 Blaster equipped — auto-fires at nearby bots!");
      }
      return { r: nr, c: nc };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, blocked, qMap, qUsed, weaponMap, weaponUsed, diffCfg, frozenUntil]);

  useEffect(() => {
    const onKey = (e) => {
      const map = {
        ArrowUp: [-1, 0], w: [-1, 0], W: [-1, 0],
        ArrowDown: [1, 0], s: [1, 0], S: [1, 0],
        ArrowLeft: [0, -1], a: [0, -1], A: [0, -1],
        ArrowRight: [0, 1], d: [0, 1], D: [0, 1],
      };
      if (map[e.key]) { e.preventDefault(); tryMove(...map[e.key]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tryMove]);

  const resolveEncounter = (response) => {
    const { r, c, question } = activeEncounter;
    setAnswers((a) => ({ ...a, [question.id]: response }));
    onAnswer?.(question.id, response);
    setQUsed((s) => new Set(s).add(key(r, c)));
    setPower((p) => Math.min(100, p + diffCfg.healAmount));
    flash("heal");
    say(`💙 Data restored! +${diffCfg.healAmount} power`);
    setActiveEncounter(null);
  };

  const reboot = () => {
    setPower(45);
    setMobs([]);
    setPlayer(start);
    setGameOver(false);
    setFrozenUntil(0);
  };

  useEffect(() => {
    if (allFound && !victory && !gameOver && difficulty) {
      setVictory(true);
      const powerBonus = Math.round((power / 100) * questions.length * 3);
      const base = questions.length * 3;
      const killBonus = kills * 2;
      const coins = Math.round((base + powerBonus + killBonus) * diffCfg.coinMult);
      const t = setTimeout(() => onComplete(answers, coins), 1500);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allFound]);

  // ───────────────────────── pseudo-3D render ─────────────────────────
  const cellPx = size >= 12 ? 42 : size >= 10 ? 48 : 54;
  const boardPx = size * cellPx;
  const frozen = Date.now() < frozenUntil;

  return (
    <div style={{ maxWidth: 740, margin: "0 auto" }}>
      <style>{`
        @keyframes adPop { from{transform:scale(.85);opacity:0} to{transform:scale(1);opacity:1} }
        @keyframes adFloat { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-3px) rotate(-2deg)} }
        @keyframes adPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.55;transform:scale(.82)} }
        @keyframes adSpin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes adFlashHeal { 0%{box-shadow:0 0 0 0 rgba(34,211,238,.6)} 100%{box-shadow:0 0 0 26px rgba(34,211,238,0)} }
        @keyframes adFlashCore { 0%{box-shadow:0 0 0 0 rgba(244,63,94,.65)} 100%{box-shadow:0 0 0 26px rgba(244,63,94,0)} }
        @keyframes adFlashKill { 0%{box-shadow:0 0 0 0 rgba(34,197,94,.55)} 100%{box-shadow:0 0 0 26px rgba(34,197,94,0)} }
        @keyframes adShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-5px)} 75%{transform:translateX(5px)} }
        @keyframes adBob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
        @keyframes adCoreGlow { 0%,100%{ box-shadow: 0 0 22px 6px rgba(34,211,238,.5), inset 0 0 18px rgba(34,211,238,.3) } 50%{ box-shadow: 0 0 34px 12px rgba(34,211,238,.75), inset 0 0 22px rgba(34,211,238,.45) } }
        @keyframes adCoreCritical { 0%,100%{ box-shadow: 0 0 22px 6px rgba(244,63,94,.55), inset 0 0 18px rgba(244,63,94,.35) } 50%{ box-shadow: 0 0 40px 16px rgba(244,63,94,.85), inset 0 0 26px rgba(244,63,94,.55) } }
      `}</style>

      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#fff" }}>🤖 {title}</div>
          <div style={{ fontSize: ".78rem", color: "#8a8474" }}>
            {qUsed.size} / {questions.length} data nodes found · 💥 {kills} bots defeated
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

      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".72rem", fontWeight: 700, color: "#7a7568", marginBottom: 3 }}>
          <span>⚡ AI Power</span><span>{Math.round(power)}/100</span>
        </div>
        <div style={{ height: 12, borderRadius: 999, background: "#2a2440", overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${power}%`, borderRadius: 999, transition: "width .3s ease",
            background: power > 50 ? "linear-gradient(90deg,#22d3ee,#67e8f9)" : power > 22 ? "linear-gradient(90deg,#f59e0b,#fbbf24)" : "linear-gradient(90deg,#ef4444,#f87171)",
          }} />
        </div>
      </div>

      {weapon ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".76rem", fontWeight: 700, color: "#c9c4e0", marginBottom: 10 }}>
          <span style={{ fontSize: "1.1rem" }}>{WEAPONS[weapon.type].icon}</span>
          {WEAPONS[weapon.type].label} armed — {WEAPONS[weapon.type].note}
        </div>
      ) : (
        <div style={{ fontSize: ".76rem", color: "#7a7568", marginBottom: 10 }}>No weapon — find a ⚔️ or 🔫 to fight back!</div>
      )}

      {toast && (
        <div style={{ textAlign: "center", fontSize: ".82rem", fontWeight: 700, color: "#0e7490", background: "#e0fbff", borderRadius: 10, padding: "6px 10px", marginBottom: 10, animation: "adPop .2s ease-out" }}>
          {toast}
        </div>
      )}

      {/* Battlefield — flat tile grid tilted with pure CSS perspective/rotateX
          to simulate 3D depth, no WebGL/three.js involved. */}
      <div
        style={{
          perspective: 1300, padding: "36px 0 6px", borderRadius: 20,
          background: "radial-gradient(ellipse at 50% 20%, #1c1436 0%, #0a0716 75%)",
          boxShadow: "0 0 0 1px #3d3560, 0 20px 50px -20px rgba(34,211,238,.35)",
          animation: flashKind === "coreHit" ? "adFlashCore .45s, adShake .35s" : "none",
        }}
      >
        <div
          style={{
            width: boardPx, height: boardPx, margin: "0 auto", position: "relative",
            transformStyle: "preserve-3d", transform: "rotateX(52deg)", transformOrigin: "50% 100%",
          }}
        >
          {/* floor tiles */}
          {Array.from({ length: size }, (_, r) =>
            Array.from({ length: size }, (_, c) => {
              const isBlocked = blocked.has(key(r, c));
              const checker = (r + c) % 2 === 0;
              return (
                <div
                  key={`f${r}-${c}`}
                  style={{
                    position: "absolute", left: c * cellPx, top: r * cellPx, width: cellPx, height: cellPx,
                    boxSizing: "border-box", border: "1px solid rgba(124,92,252,.14)",
                    background: isBlocked ? "transparent" : checker ? "#181140" : "#150f34",
                  }}
                />
              );
            })
          )}

          {/* obstacles — lifted with translateZ so they visibly stick up */}
          {Array.from({ length: size }, (_, r) =>
            Array.from({ length: size }, (_, c) => {
              if (!blocked.has(key(r, c))) return null;
              return (
                <div
                  key={`b${r}-${c}`}
                  style={{
                    position: "absolute", left: c * cellPx, top: r * cellPx, width: cellPx, height: cellPx,
                    transformStyle: "preserve-3d", transform: "translateZ(16px)",
                  }}
                >
                  <div style={{
                    position: "absolute", inset: 3, borderRadius: 6,
                    background: "linear-gradient(155deg,#4c4570,#2a2648)",
                    boxShadow: "0 18px 0 -2px rgba(0,0,0,.55), inset 0 0 0 1px rgba(255,255,255,.06)",
                  }} />
                </div>
              );
            })
          )}

          {/* AI core */}
          <div style={{
            position: "absolute", left: core.c * cellPx, top: core.r * cellPx, width: cellPx, height: cellPx,
            transformStyle: "preserve-3d", transform: "translateZ(30px)", zIndex: 4,
          }}>
            <div style={{ transform: "rotateX(-52deg)", transformOrigin: "50% 50%", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{
                width: cellPx * 0.86, height: cellPx * 0.86, borderRadius: "50%",
                background: "radial-gradient(circle,#0e2e3a,#0a1a24)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: cellPx * 0.5,
                animation: power <= 22 ? "adCoreCritical 1s infinite" : "adCoreGlow 2.2s ease-in-out infinite",
              }}>
                🤖
              </div>
            </div>
          </div>

          {/* Q-nodes */}
          {qCells.map((q, i) => {
            const k = key(q.r, q.c);
            if (qUsed.has(k)) return null;
            const question = questions[i];
            return (
              <div key={`q${k}`} style={{ position: "absolute", left: q.c * cellPx, top: q.r * cellPx, width: cellPx, height: cellPx, transformStyle: "preserve-3d", transform: "translateZ(10px)", zIndex: 3 }}>
                <div style={{ transform: "rotateX(-52deg)", transformOrigin: "50% 50%", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", animation: "adBob 1.4s ease-in-out infinite" }}>
                  <div style={{
                    width: cellPx * 0.62, height: cellPx * 0.62, borderRadius: "50%",
                    background: "radial-gradient(circle,#22d3ee,#0e7490)", boxShadow: "0 0 12px #22d3ee",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: cellPx * 0.3, color: "#04222a", fontWeight: 900,
                  }}>
                    {ICONS[question?.question_type] || "Q"}
                  </div>
                </div>
              </div>
            );
          })}

          {/* weapon pickups */}
          {weaponCells.map((w) => {
            const k = key(w.r, w.c);
            if (weaponUsed.has(k)) return null;
            return (
              <div key={`w${k}`} style={{ position: "absolute", left: w.c * cellPx, top: w.r * cellPx, width: cellPx, height: cellPx, transformStyle: "preserve-3d", transform: "translateZ(10px)", zIndex: 3 }}>
                <div style={{ transform: "rotateX(-52deg)", transformOrigin: "50% 50%", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: cellPx * 0.42, animation: "adFloat 1.6s ease-in-out infinite" }}>
                  {WEAPONS[w.type].icon}
                </div>
              </div>
            );
          })}

          {/* mobs */}
          {mobs.map((m) => (
            <div key={m.id} style={{
              position: "absolute", left: 0, top: 0, width: cellPx, height: cellPx,
              transformStyle: "preserve-3d", transform: `translate(${m.c * cellPx}px, ${m.r * cellPx}px) translateZ(10px)`,
              transition: "transform .3s linear", zIndex: 5,
            }}>
              <div style={{ transform: "rotateX(-52deg)", transformOrigin: "50% 50%", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: cellPx * 0.42, filter: "drop-shadow(0 0 6px rgba(244,63,94,.7))" }}>
                👾
              </div>
            </div>
          ))}

          {/* player */}
          <div style={{
            position: "absolute", left: 0, top: 0, width: cellPx, height: cellPx,
            transformStyle: "preserve-3d", transform: `translate(${player.c * cellPx}px, ${player.r * cellPx}px) translateZ(14px)`,
            transition: "transform .14s linear", zIndex: 6,
          }}>
            <div style={{
              transform: "rotateX(-52deg)", transformOrigin: "50% 50%", width: "100%", height: "100%",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: cellPx * 0.46,
              animation: frozen ? "adPulse .3s infinite" : "none",
              filter: "drop-shadow(0 0 8px rgba(124,92,252,.8))",
            }}>
              🧑‍🚀
            </div>
          </div>
        </div>
      </div>

      {/* D-pad for mobile */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 48px)", gridTemplateRows: "repeat(2, 48px)", gap: 6, justifyContent: "center", margin: "16px auto 0" }}>
        <div />
        <DpadBtn onClick={() => tryMove(-1, 0)}>↑</DpadBtn>
        <div />
        <DpadBtn onClick={() => tryMove(0, -1)}>←</DpadBtn>
        <DpadBtn onClick={() => tryMove(1, 0)}>↓</DpadBtn>
        <DpadBtn onClick={() => tryMove(0, 1)}>→</DpadBtn>
      </div>
      <p style={{ textAlign: "center", fontSize: ".72rem", color: "#8a8474", marginTop: 6 }}>Arrow keys / WASD also work</p>

      {showIntro && <IntroWalkthrough onClose={() => { setShowIntro(false); setShowDifficulty(true); }} />}
      {showDifficulty && <DifficultyModal onChoose={chooseDifficulty} />}
      {activeEncounter && <EncounterModal encounter={activeEncounter} onResolve={resolveEncounter} />}

      {gameOver && (
        <Overlay burnt>
          <div style={{ fontSize: "2.6rem" }}>💀</div>
          <h2 style={{ margin: "8px 0", color: "#ff8c6a" }}>AI DIED</h2>
          <p style={{ color: "#c9a99a", marginBottom: 18 }}>The core ran out of power before you found every data node. Data nodes you already found stay found — reboot and keep going.</p>
          <button className="btn btn-primary" onClick={reboot} style={{ background: "linear-gradient(135deg,#22d3ee,#0ea5e9)", border: "none" }}>Reboot AI</button>
        </Overlay>
      )}

      {victory && (
        <Overlay>
          <div style={{ fontSize: "2.6rem" }}>🏆</div>
          <h2 style={{ margin: "8px 0" }}>AI fully restored!</h2>
          <p style={{ color: "#a09a89" }}>Submitting your run…</p>
        </Overlay>
      )}
    </div>
  );
}

function DpadBtn({ children, onClick }) {
  return (
    <button onClick={onClick} style={{ width: 48, height: 48, borderRadius: 12, border: "none", fontSize: "1.2rem", fontWeight: 800, background: "linear-gradient(135deg,#1a2c40,#22364f)", color: "#e6e2f5", cursor: "pointer" }}>
      {children}
    </button>
  );
}

function Overlay({ children, burnt }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,6,24,.75)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{
        background: burnt ? "linear-gradient(180deg,#2a1414,#140b0b)" : "#181228", color: "#fff", borderRadius: 20,
        padding: "32px 28px", textAlign: "center", maxWidth: 380, width: "100%", animation: "adPop .25s ease-out",
        border: burnt ? "1px solid rgba(255,110,80,.25)" : "none",
      }}>
        {children}
      </div>
    </div>
  );
}

// ───────────────────────── intro walkthrough ─────────────────────────

const AID_INTRO_SLIDES = [
  { icon: "🤖", grad: "linear-gradient(135deg,#22d3ee,#0ea5e9)", title: "The AI Is Powering Down!", body: "Its power is fading fast. Explore the map, find every glowing data node, and answer its question to restore power to the core." },
  { icon: "🕹️", grad: "linear-gradient(135deg,#7c5cfc,#a78bfa)", title: "Move Around", body: "Use WASD or the Arrow Keys — or the on-screen D-pad on mobile — to explore the whole battlefield." },
  { icon: "💠", grad: "linear-gradient(135deg,#06b6d4,#67e8f9)", title: "Find the Data Nodes", body: "Glowing nodes hide a quick question pulled from what you've been learning. Answer it and the AI's power goes up!" },
  { icon: "👾", grad: "linear-gradient(135deg,#ff5c8a,#f97316)", title: "Bots Are Marching on the Core", body: "Hostile bots keep spawning at the edges and heading straight for the AI. If one reaches the core, it drains a big chunk of power!" },
  { icon: "⚔️", grad: "linear-gradient(135deg,#eab308,#fde047)", title: "Fight Back!", body: "Grab a sword or blaster to defeat bots on contact — or from range with the blaster. Without a weapon, touching a bot just slows you down; it won't hurt you." },
  { icon: "⚡", grad: "linear-gradient(135deg,#22c55e,#86efac)", title: "Power Never Stops Draining", body: "The core loses a little power constantly, on top of any bot hits. Keep finding nodes to heal it faster than it's draining." },
  { icon: "🏆", grad: "linear-gradient(135deg,#f43f5e,#fda4af)", title: "Save the AI", body: "Find every data node before the power hits zero and you win! Let it hit zero and it's game over — AI DIED. Reboot to try again." },
];

function IntroWalkthrough({ onClose }) {
  const [step, setStep] = useState(0);
  const [dontShow, setDontShow] = useState(false);
  const last = step === AID_INTRO_SLIDES.length - 1;
  const slide = AID_INTRO_SLIDES[step];

  const finish = () => {
    if (dontShow) { try { localStorage.setItem("aid_hide_intro", "1"); } catch { /* ignore */ } }
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(4,8,16,.93)", backdropFilter: "blur(2px)", zIndex: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: 18, animation: "adPop .25s ease-out" }}>
      <button
        onClick={finish}
        style={{ position: "absolute", top: 22, right: 22, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.18)", color: "#e6e2f5", borderRadius: 999, padding: "8px 16px", fontSize: ".76rem", fontWeight: 700, cursor: "pointer" }}
      >
        Skip ✕
      </button>

      <div style={{ width: "100%", maxWidth: 400, borderRadius: 26, overflow: "hidden", background: "#0e1730", boxShadow: "0 40px 90px -20px rgba(0,0,0,.7), 0 0 0 1px rgba(34,211,238,.25)" }}>
        <div key={step} style={{ background: slide.grad, padding: "40px 24px 30px", textAlign: "center", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 0%, rgba(255,255,255,.25), transparent 60%)" }} />
          <div style={{ fontSize: "3.4rem", animation: "adFloat 1.6s ease-in-out infinite", filter: "drop-shadow(0 0 16px rgba(255,255,255,.55))", position: "relative" }}>
            {slide.icon}
          </div>
        </div>

        <div style={{ padding: "22px 26px 22px", color: "#e6e2f5" }}>
          <h2 style={{ margin: "0 0 8px", fontSize: "1.18rem", fontWeight: 800 }}>{slide.title}</h2>
          <p style={{ fontSize: ".92rem", lineHeight: 1.55, color: "#c9c4e0", marginBottom: 20, minHeight: 66 }}>{slide.body}</p>

          <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 18 }}>
            {AID_INTRO_SLIDES.map((_, i) => (
              <span key={i} style={{ width: i === step ? 20 : 7, height: 7, borderRadius: 999, background: i === step ? slide.grad : "#243252", transition: "all .25s ease" }} />
            ))}
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            {step > 0 && (
              <button onClick={() => setStep((s) => s - 1)} style={{ padding: "12px 16px", borderRadius: 12, border: "1px solid #2b3a5c", background: "transparent", color: "#e6e2f5", fontWeight: 700, cursor: "pointer" }}>
                ←
              </button>
            )}
            {!last ? (
              <button onClick={() => setStep((s) => s + 1)} style={{ flex: 1, padding: "12px 16px", borderRadius: 12, border: "none", fontWeight: 800, cursor: "pointer", background: slide.grad, color: "#04222a" }}>
                Next →
              </button>
            ) : (
              <button onClick={finish} style={{ flex: 1, padding: "14px 16px", borderRadius: 12, border: "none", fontWeight: 800, fontSize: "1rem", cursor: "pointer", background: slide.grad, color: "#04222a", boxShadow: "0 10px 24px -8px rgba(34,211,238,.6)" }}>
                Defend the AI! 🤖
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

function DifficultyModal({ onChoose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(4,8,16,.93)", backdropFilter: "blur(2px)", zIndex: 690, display: "flex", alignItems: "center", justifyContent: "center", padding: 18, animation: "adPop .22s ease-out" }}>
      <div style={{ width: "100%", maxWidth: 420, borderRadius: 26, background: "#0e1730", boxShadow: "0 40px 90px -20px rgba(0,0,0,.7), 0 0 0 1px rgba(34,211,238,.25)", padding: "26px 24px 22px" }}>
        <div style={{ textAlign: "center", marginBottom: 6 }}>
          <div style={{ fontSize: "2rem" }}>🛡️</div>
          <h2 style={{ margin: "6px 0 4px", fontSize: "1.2rem", fontWeight: 800, color: "#fff" }}>Choose Your Defense</h2>
          <p style={{ fontSize: ".8rem", color: "#a09a89", marginBottom: 18 }}>Harder difficulties send more (and faster) bots at the core and drain power quicker — but pay out way more Coins.</p>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {Object.entries(DIFFICULTY).map(([k, cfg]) => (
            <button
              key={k}
              onClick={() => onChoose(k)}
              style={{
                display: "flex", alignItems: "center", gap: 14, textAlign: "left", padding: "14px 16px", borderRadius: 16,
                border: "1px solid rgba(34,211,238,.22)", background: "#141f3d", cursor: "pointer", color: "#e6e2f5",
              }}
            >
              <div style={{ fontSize: "1.7rem", flexShrink: 0 }}>{cfg.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 800, fontSize: ".95rem" }}>{cfg.label}</span>
                  <span style={{
                    fontSize: ".72rem", fontWeight: 800, padding: "3px 9px", borderRadius: 999,
                    background: cfg.coinMult >= 1.5 ? "linear-gradient(135deg,#eab308,#fde047)" : cfg.coinMult === 1 ? "linear-gradient(135deg,#22d3ee,#0ea5e9)" : "#243252",
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

// ───────────────────────── question modal (shared question-type renderers) ─────────────────────────

function EncounterModal({ encounter, onResolve }) {
  const { question } = encounter;
  const content = question.content || {};
  const theme = TYPE_THEME[question.question_type] || TYPE_THEME.multiple_choice;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(4,8,16,.82)", backdropFilter: "blur(3px)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <div style={{
        width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto", overflowX: "hidden", borderRadius: 24,
        background: "#0e1730", border: "1px solid rgba(34,211,238,.18)",
        boxShadow: "0 30px 70px -20px rgba(0,0,0,.65), 0 0 0 1px rgba(255,255,255,.03) inset",
        animation: "adPop .22s ease-out",
      }}>
        <div style={{ background: theme.grad, padding: "24px 30px", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 46, height: 46, borderRadius: 15, background: "rgba(255,255,255,.2)", border: "1px solid rgba(255,255,255,.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem", flexShrink: 0 }}>
            {ICONS[question.question_type] || "💠"}
          </div>
          <div>
            <div style={{ fontSize: ".68rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", color: "rgba(255,255,255,.85)", marginBottom: 2 }}>
              Data Node
            </div>
            <div style={{ fontWeight: 800, color: "#fff", fontSize: "1.08rem" }}>{theme.label}</div>
          </div>
        </div>

        <div style={{ padding: "30px 30px 32px", color: "#e6e2f5", touchAction: "manipulation" }}>
          <QuestionBody question={question} content={content} verb="Restore" onResolve={onResolve} theme={theme} />
        </div>
      </div>
    </div>
  );
}

function QuestionBody({ question, content, verb, onResolve, theme }) {
  const type = question.question_type;

  if (type === "multiple_choice") return <ChoiceBody prompt={content.question} options={content.options || []} onPick={(i) => onResolve(i)} verb={verb} theme={theme} />;
  if (type === "true_false") return <ChoiceBody prompt={content.question} options={["True", "False"]} onPick={(i) => onResolve(i === 0)} verb={verb} theme={theme} />;
  if (type === "fill_blank") return <TextBody prompt={content.question} placeholder="Type your answer..." onSubmit={(v) => onResolve(v)} verb={verb} theme={theme} />;
  if (type === "prompt_build") return <TextBody prompt={content.task} placeholder="Write your prompt..." multiline onSubmit={(v) => onResolve(v)} verb={verb} theme={theme} />;
  if (type === "image_reveal") return <TextBody prompt={content.question} placeholder="Your guess..." onSubmit={(v) => onResolve(v)} verb={verb} theme={theme} />;
  if (type === "match_pairs") return <MatchPairsBody content={content} onSubmit={(v) => onResolve(v)} verb={verb} theme={theme} />;
  if (type === "drag_order") return <DragOrderBody content={content} onResolve={(v) => onResolve(v)} verb={verb} theme={theme} />;
  if (type === "memory_tiles") return <MemoryTilesBody content={content} onResolve={() => onResolve(true)} />;
  if (type === "word_search") return <WordSearchBody content={content} onResolve={(v) => onResolve(v)} />;
  return <TextBody prompt="Complete this activity" placeholder="..." onSubmit={(v) => onResolve(v)} verb={verb} theme={theme} />;
}

const inputStyle = { width: "100%", borderRadius: 13, padding: "13px 15px", border: "1px solid #263460", background: "#141f3d", color: "#fff", marginBottom: 16, fontSize: ".95rem", boxSizing: "border-box" };
function submitBtnStyle(theme, enabled) {
  return { width: "100%", padding: "14px 16px", borderRadius: 13, border: "none", fontWeight: 800, fontSize: ".92rem", cursor: enabled ? "pointer" : "default", background: theme.grad, color: "#04222a", opacity: enabled ? 1 : 0.4, boxShadow: enabled ? "0 8px 22px -8px rgba(34,211,238,.6)" : "none", transition: "opacity .15s ease, transform .1s ease" };
}

function ChoiceBody({ prompt, options, onPick, verb, theme }) {
  return (
    <>
      {prompt && <p style={{ fontWeight: 700, marginBottom: 18, fontSize: "1.02rem", lineHeight: 1.45 }}>{prompt}</p>}
      <div style={{ display: "grid", gap: 10 }}>
        {options.map((o, i) => (
          <button key={i} onClick={() => onPick(i)} style={{ padding: "14px 17px", borderRadius: 13, border: "1px solid #263460", background: "#141f3d", color: "#e6e2f5", fontWeight: 600, cursor: "pointer", textAlign: "left", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: ".92rem", transition: "border-color .15s ease, background .15s ease", touchAction: "manipulation" }}>
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
                  border: isHoverTarget ? "2px solid #86efac" : matchedIdx != null ? "2px solid #22c55e" : "1px solid #263460",
                  background: "#141f3d", color: "#fff", fontSize: ".82rem",
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
                border: selRight === i ? "2px solid #22d3ee" : "1px solid #263460",
                background: used.has(i) ? "#0d1329" : "#141f3d", color: "#fff", fontSize: ".82rem",
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

  const submit = () => onResolve(order);

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
              border: overIndex === i && dragIndex !== null && dragIndex !== i ? "2px solid #86efac" : "1px solid #263460",
              background: dragIndex === i ? "#1a2748" : "#141f3d", opacity: dragIndex === i ? 0.55 : 1,
              transition: "opacity .12s ease, border-color .12s ease, background .12s ease",
              cursor: "grab", touchAction: "none",
            }}
          >
            <span style={{
              width: 26, height: 26, borderRadius: "50%", background: theme.grad, color: "#04222a",
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
  width: 24, height: 18, borderRadius: 5, border: "none", background: "#1a2748", color: "#e6e2f5",
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
              style={{ background: isFlipped ? "#0ea5e9" : "#141f3d", color: isFlipped ? "#fff" : "transparent", animation: isWrong ? "adShake .35s" : "none", cursor: isMatched ? "default" : "pointer", touchAction: "manipulation" }}>
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
                borderRadius: 6, cursor: "pointer", border: "1px solid #1c2846",
                background: isFound ? "linear-gradient(135deg,#06b6d4,#22d3ee)" : isSel ? "linear-gradient(135deg,#7c5cfc,#a78bfa)" : "#141f3d",
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
              background: found.has(word) ? "linear-gradient(135deg,#06b6d4,#22d3ee)" : "#141f3d",
              color: found.has(word) ? "#fff" : "#a09a89",
              textDecoration: found.has(word) ? "line-through" : "none",
              border: found.has(word) ? "none" : "1px solid #263460",
            }}
          >
            {word}
          </span>
        ))}
      </div>
    </>
  );
}