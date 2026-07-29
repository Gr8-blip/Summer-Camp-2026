// Small shared component so avatars render identically everywhere
// (leaderboard rows, completion modals, profile page, future games).
// Falls back to a neutral default if the student hasn't equipped one.

const AVATAR_EMOJI = {
  rookie_bot: "🤖",
  cadet: "🧑‍🚀",
  coder: "👨‍💻",
  scout: "🥷",
  ai_defender: "🛡",
  glitch_entity: "👾",
  galaxy_traveler: "🌌",
  neura_champion: "👑",
};

export default function Avatar({ avatarKey, size = 28, className = "" }) {
  const emoji = AVATAR_EMOJI[avatarKey] || "🙂";
  return (
    <span
      className={`avatar-badge ${className}`}
      style={{ fontSize: size, lineHeight: 1, display: "inline-block" }}
      title={avatarKey || "default"}
    >
      {emoji}
    </span>
  );
}