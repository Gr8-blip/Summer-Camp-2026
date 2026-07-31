// Drop into your admin Challenge/Quest create-edit form. Controlled
// component — wire it to whatever state holds the rest of the form
// fields (title, xp_reward, etc.) the same way you already do.
//
// <GameTypePicker value={form.game_type} onChange={(v) => setForm(f => ({ ...f, game_type: v }))} />
//
// `value` should default to "classic" for brand-new Challenges/Quests so
// nothing changes for admins who don't touch this field.

const GAMES = [
  { value: "classic", label: "Classic", icon: "📋", blurb: "Plain question list — today's default flow.", ready: true },
  { value: "dungeon_crawler", label: "Dungeon Crawler", icon: "🏰", blurb: "Explore a maze, fight rooms tied to each question.", ready: true },
  { value: "target_shooter", label: "Target Shooter", icon: "🎯", blurb: "Shoot the correct falling answer.", ready: false },
  { value: "escape_room", label: "Escape Room", icon: "🔑", blurb: "Answer to unlock doors and escape.", ready: true },
  { value: "floor_is_lava", label: "Floor Is Lava", icon: "🌋", blurb: "True/False only — climb before lava catches you.", ready: true },
  { value: "ai_defense", label: "AI Defense", icon: "🛡️", blurb: "Defend the AI core from corrupted bots.", ready: false },
];

export default function GameTypePicker({ value, onChange }) {
  return (
    <div>
      <label style={{ display: "block", fontWeight: 700, fontSize: ".85rem", marginBottom: 8 }}>
        Game
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
        {GAMES.map((g) => {
          const selected = value === g.value;
          return (
            <button
              type="button"
              key={g.value}
              disabled={!g.ready}
              onClick={() => onChange(g.value)}
              title={!g.ready ? "Coming soon" : g.blurb}
              style={{
                textAlign: "left", padding: "10px 12px", borderRadius: 12, cursor: g.ready ? "pointer" : "not-allowed",
                border: selected ? "2px solid #7c5cfc" : "1px solid #ddd",
                background: selected ? "#f3f0ff" : "#fff",
                opacity: g.ready ? 1 : 0.45,
              }}
            >
              <div style={{ fontSize: "1.3rem" }}>{g.icon}</div>
              <div style={{ fontWeight: 700, fontSize: ".85rem" }}>{g.label}</div>
              <div style={{ fontSize: ".72rem", color: "#8a8474", marginTop: 2 }}>
                {g.ready ? g.blurb : "Coming soon"}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}