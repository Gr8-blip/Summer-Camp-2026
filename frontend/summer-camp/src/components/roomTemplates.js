// roomTemplates.js
//
// Pure data. This file knows about room *flavor* (title/description/icon/
// accent) — it knows NOTHING about gameplay, scoring, or the shape of a
// question. EscapeRoom.jsx never hardcodes a room name; it only ever asks
// this file "give me a template compatible with this puzzle type."
//
// To add a new room: drop a new object into the matching bucket below (or
// add a new bucket + wire it into TYPE_TO_BUCKET). No other file needs to
// change — buildRoomSequence() and getRoomTemplate() pick it up for free.

const ROOM_TEMPLATES = {
  memory_tiles: [
    { id: "memory_bank", title: "The Memory Bank", description: "Rows of humming data cells line the walls. Something in here has been scrambled — and only a sharp memory can put it back together.", icon: "🗄️" },
    { id: "robot_logs", title: "Robot Logs", description: "Old maintenance logs flicker on cracked screens. Match the fragments before the archive purges itself.", icon: "🤖" },
    { id: "ai_memory_vault", title: "AI Memory Vault", description: "A vault built to store an AI's memories, now half-corrupted. Recall the right pairs to stabilize it.", icon: "🧠" },
    { id: "digital_storage", title: "Digital Storage", description: "Stacks of storage drives blink in the dark. Find the matching pairs before the backup window closes.", icon: "💾" },
    { id: "cold_archive", title: "The Cold Archive", description: "A frost-covered server room, kept just above freezing to protect what's stored inside. Match what you can before your fingers go numb.", icon: "🧊" },
  ],

  drag_order: [
    { id: "assembly_station", title: "Assembly Station", description: "Half-built components sit on a conveyor, out of order. Line up the steps correctly to get the line moving again.", icon: "🛠️" },
    { id: "circuit_repair", title: "Circuit Repair Bay", description: "A scorched circuit board waits on the bench. Trace the correct sequence to route power back through it.", icon: "🔌" },
    { id: "data_pipeline", title: "Data Pipeline", description: "Packets are stuck mid-transit. Reorder the pipeline stages so the data can flow through cleanly.", icon: "🧵" },
    { id: "machine_workshop", title: "Machine Workshop", description: "Gears and tools are scattered across the floor. Put the process back in the right order before the machine seizes up.", icon: "⚙️" },
    { id: "ai_factory", title: "The AI Factory", description: "A production line built to train models step by step. One stage is out of place — find it.", icon: "🏭" },
  ],

  match_pairs: [
    { id: "neural_network", title: "Neural Network Chamber", description: "Glowing nodes pulse across a suspended web of connections. Reconnect the right pairs to bring the network back online.", icon: "🕸️" },
    { id: "connection_matrix", title: "Connection Matrix", description: "A wall of cables, unplugged and mismatched. Match each one to its proper socket.", icon: "🔗" },
    { id: "signal_routing", title: "Signal Routing Room", description: "Signals are bouncing to the wrong receivers. Route each one to where it belongs.", icon: "📡" },
    { id: "pattern_matching", title: "Pattern Matching Lab", description: "Panels of shapes and symbols line the walls, waiting to be paired up correctly.", icon: "🧩" },
    { id: "knowledge_graph", title: "The Knowledge Graph", description: "A floating diagram of linked ideas, with several links severed. Reconnect what belongs together.", icon: "🌐" },
  ],

  word_search: [
    { id: "research_archive", title: "Research Archive", description: "Shelves of forgotten research surround you. Somewhere in the noise, the key terms are hiding.", icon: "📚" },
    { id: "database_search", title: "Database Search Room", description: "A wall of scrolling text — mostly static, but the words you need are buried in there somewhere.", icon: "🗃️" },
    { id: "hidden_files", title: "Hidden Files", description: "A cluttered directory of half-deleted files. Search carefully — what you need is still in there.", icon: "🗂️" },
    { id: "knowledge_library", title: "The Knowledge Library", description: "Endless rows of encoded text stretch in every direction. Find the words worth remembering.", icon: "📖" },
    { id: "ai_records", title: "AI Records Room", description: "Old records of an AI's training data, jumbled together. Hunt down the terms that matter.", icon: "🧾" },
  ],

  // Shared fallback bucket for quick-answer puzzle types (multiple choice,
  // true/false, fill in the blank, prompt building, image reveal) — these
  // all play the same way (read a prompt, respond), so they share one
  // "terminal" flavor of room.
  terminal: [
    { id: "security_terminal", title: "Security Terminal", description: "A locked terminal blinks with a single prompt. Answer correctly to override the lock.", icon: "🖥️" },
    { id: "ai_console", title: "AI Console", description: "An old AI console hums to life, waiting for the right input before it will cooperate.", icon: "🤖" },
    { id: "authentication_check", title: "Authentication Check", description: "A voice-less system demands verification. Answer its question to prove you belong here.", icon: "🔐" },
    { id: "command_center", title: "Command Center", description: "Screens flicker with a single unresolved query. Solve it to regain control of the room.", icon: "🎛️" },
    { id: "control_room", title: "Control Room", description: "Every switch in this room is locked behind one last question. Get it right to flip them all.", icon: "🕹️" },
  ],
};

// Maps a backend `question_type` to the bucket of rooms that's thematically
// appropriate for it. This is the ONLY place puzzle types are referenced —
// gameplay code never touches ROOM_TEMPLATES directly.
const TYPE_TO_BUCKET = {
  memory_tiles: "memory_tiles",
  drag_order: "drag_order",
  match_pairs: "match_pairs",
  word_search: "word_search",
  multiple_choice: "terminal",
  true_false: "terminal",
  fill_blank: "terminal",
  prompt_build: "terminal",
  image_reveal: "terminal",
};

/**
 * Which "flavor" bucket a puzzle type belongs to — useful for the gameplay
 * layer to pick a consistent accent color/animation per room without
 * needing to know individual template names.
 */
export function bucketFor(questionType) {
  return TYPE_TO_BUCKET[questionType] || "terminal";
}

/**
 * Give me a room template compatible with this puzzle type.
 * Optionally excludes a list of template ids (e.g. the one just used) so
 * back-to-back checkpoints of the same puzzle type don't feel repetitive.
 */
export function getRoomTemplate(questionType, excludeIds = []) {
  const bucket = TYPE_TO_BUCKET[questionType] || "terminal";
  const pool = ROOM_TEMPLATES[bucket] || ROOM_TEMPLATES.terminal;
  const available = pool.filter((t) => !excludeIds.includes(t.id));
  const choices = available.length ? available : pool;
  return choices[Math.floor(Math.random() * choices.length)];
}

/**
 * Turns a flat question list into an ordered list of rooms — one per
 * checkpoint — each carrying its own randomly-chosen, non-repeating (per
 * puzzle type) template. This is the only entry point EscapeRoom.jsx needs.
 */
export function buildRoomSequence(questions) {
  const lastUsedByBucket = {};
  return questions.map((question, i) => {
    const bucket = TYPE_TO_BUCKET[question.question_type] || "terminal";
    const exclude = lastUsedByBucket[bucket] ? [lastUsedByBucket[bucket]] : [];
    const template = getRoomTemplate(question.question_type, exclude);
    lastUsedByBucket[bucket] = template.id;
    return { key: `${question.id}-${i}`, question, template };
  });
}

// Flavor text keyed by BUCKET, not by individual room — this is what
// powers the "investigating" transition screen (status + objective).
// It's about the puzzle *mechanic* ("recover missing memory fragments"),
// not about any one room's name, so it lives at the bucket level.
export const BUCKET_FLAVOR = {
  memory_tiles: { status: "Corrupted", objective: "Recover the missing memory fragments." },
  drag_order: { status: "Jammed", objective: "Reassemble the components in the correct order." },
  match_pairs: { status: "Disconnected", objective: "Reconnect the severed links." },
  word_search: { status: "Encrypted", objective: "Search the noise for the terms that matter." },
  terminal: { status: "Locked", objective: "Answer the prompt to override the lock." },
};

export function flavorFor(questionType) {
  return BUCKET_FLAVOR[bucketFor(questionType)] || BUCKET_FLAVOR.terminal;
}

// Purely decorative objects — no puzzle attached. Investigating one just
// gives a flavor line and nothing else. Their whole job is to make the
// room worth exploring instead of every object being a guaranteed puzzle.
export const DECOR_TEMPLATES = [
  { id: "supply_crate", title: "Supply Crate", icon: "📦", flavor: "Just old supplies. Nothing useful here." },
  { id: "power_generator", title: "Power Generator", icon: "🔋", flavor: "Still humming along fine. Nothing to fix here." },
  { id: "air_vent", title: "Air Vent", icon: "🌀", flavor: "Just an air vent. Moving on." },
  { id: "dead_terminal", title: "Burnt-Out Terminal", icon: "💻", flavor: "This one's completely fried. Not salvageable." },
  { id: "storage_locker", title: "Storage Locker", icon: "🗄️", flavor: "Locked, and probably empty anyway." },
  { id: "broken_drone", title: "Broken Drone", icon: "🤖", flavor: "Its rotors are shot. Nothing you can do here." },
];

export function pickDecorObjects(count) {
  return shuffled(DECOR_TEMPLATES).slice(0, count);
}

function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default ROOM_TEMPLATES;