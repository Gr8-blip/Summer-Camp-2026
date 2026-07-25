// Runs entirely on the frontend, per the spec: admins only enter words,
// the puzzle grid is generated at play time (not stored in `content`).

const DIRECTIONS = [
  [0, 1],   // →
  [1, 0],   // ↓
  [1, 1],   // ↘
  [0, -1],  // ←
  [-1, 0],  // ↑
  [-1, -1], // ↖
  [1, -1],  // ↙
  [-1, 1],  // ↗
];

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function canPlace(grid, word, row, col, [dr, dc]) {
  const size = grid.length;
  for (let i = 0; i < word.length; i++) {
    const r = row + dr * i;
    const c = col + dc * i;
    if (r < 0 || r >= size || c < 0 || c >= size) return false;
    const existing = grid[r][c];
    if (existing && existing !== word[i]) return false;
  }
  return true;
}

function place(grid, word, row, col, [dr, dc]) {
  const cells = [];
  for (let i = 0; i < word.length; i++) {
    const r = row + dr * i;
    const c = col + dc * i;
    grid[r][c] = word[i];
    cells.push([r, c]);
  }
  return cells;
}

function readWordAt(grid, row, col, [dr, dc], length) {
  const size = grid.length;
  let result = "";
  for (let i = 0; i < length; i++) {
    const r = row + dr * i;
    const c = col + dc * i;
    if (r < 0 || r >= size || c < 0 || c >= size) return null;
    result += grid[r][c];
  }
  return result;
}

// After the grid is fully filled (real words + random letters), the random
// fill can accidentally spell a target word again elsewhere — especially
// short words like "AI" in a dense grid. Rather than trying to prevent
// that (hard to guarantee without wrecking placement), we scan the
// finished grid for every valid straight-line occurrence of each word and
// treat all of them as correct, so a student never gets marked wrong for
// dragging over a real, visually-identical match.
function findAllOccurrences(grid, word) {
  const size = grid.length;
  const found = [];
  const seen = new Set();

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      for (const dir of DIRECTIONS) {
        const candidate = readWordAt(grid, r, c, dir, word.length);
        if (candidate !== word) continue;

        const cells = [];
        for (let i = 0; i < word.length; i++) cells.push([r + dir[0] * i, c + dir[1] * i]);

        const fwdKey = cells.map(([rr, cc]) => `${rr}:${cc}`).join("|");
        const revKey = [...cells].reverse().map(([rr, cc]) => `${rr}:${cc}`).join("|");
        const canonical = fwdKey < revKey ? fwdKey : revKey;
        if (seen.has(canonical)) continue;
        seen.add(canonical);

        found.push({ word, cells });
      }
    }
  }

  return found;
}

/**
 * Builds a square word-search grid.
 * @param {string[]} rawWords
 * @returns {{ grid: string[][], size: number, placements: {word:string, cells:[number,number][]}[] }}
 */
export function generateWordSearch(rawWords) {
  const words = [...new Set(rawWords.map((w) => w.trim().toUpperCase()).filter(Boolean))]
    .sort((a, b) => b.length - a.length);

  const longest = words.reduce((m, w) => Math.max(m, w.length), 0);
  const size = Math.max(longest + 2, Math.ceil(Math.sqrt(words.join("").length * 2.2)), 8);

  const grid = Array.from({ length: size }, () => Array(size).fill(null));

  for (const word of words) {
    let placed = false;
    for (let attempt = 0; attempt < 200 && !placed; attempt++) {
      const dir = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
      const row = Math.floor(Math.random() * size);
      const col = Math.floor(Math.random() * size);
      if (canPlace(grid, word, row, col, dir)) {
        place(grid, word, row, col, dir);
        placed = true;
      }
    }
    // if it never fit after 200 tries, it's skipped — extremely unlikely
    // at these grid sizes, but better to skip than infinite-loop.
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!grid[r][c]) grid[r][c] = ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
  }

  // Scan the finished grid rather than trusting only the placement made
  // above — this is what makes accidental duplicate occurrences (e.g. a
  // second "AI" spelled by chance) count as valid too.
  const placements = words.flatMap((word) => findAllOccurrences(grid, word));

  // `words` is the deduped target list — use this (not `placements`) for
  // rendering a word bank/chip list, since `placements` can now contain
  // more than one entry per word.
  return { grid, size, placements, words };
}

// A drag selection is valid if the cells it covers are a straight line
// (any of the 8 directions) and exactly match a placed word, forwards
// or backwards.
export function matchSelection(selectionCells, placements) {
  const key = (cells) => cells.map(([r, c]) => `${r}:${c}`).join("|");
  const selKey = key(selectionCells);
  const selKeyRev = key([...selectionCells].reverse());

  return placements.find((p) => {
    const pKey = key(p.cells);
    return pKey === selKey || pKey === selKeyRev;
  }) || null;
}

// Builds the straight-line path of cells between two grid coordinates
// (inclusive), or null if they don't sit on one of the 8 directions.
export function straightLine([r1, c1], [r2, c2]) {
  const dr = Math.sign(r2 - r1);
  const dc = Math.sign(c2 - c1);
  const dist = Math.max(Math.abs(r2 - r1), Math.abs(c2 - c1));
  if (dr !== 0 && dc !== 0 && Math.abs(r2 - r1) !== Math.abs(c2 - c1)) return null;
  if (dr === 0 && dc === 0) return [[r1, c1]];

  const cells = [];
  for (let i = 0; i <= dist; i++) cells.push([r1 + dr * i, c1 + dc * i]);
  return cells;
}