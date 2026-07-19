import { ACTIVITY_TYPES } from "./activityTypes";

export default function ActivityTypePicker({ onPick }) {
  return (
    <div>
      <span className="cb-eyebrow">Add an activity</span>
      <h2 style={{ margin: "0 0 4px" }}>What kind of challenge is this?</h2>
      <p style={{ margin: "0 0 16px", color: "#7a7568", fontSize: ".85rem" }}>
        Pick a cartridge — each one opens its own editor built just for it.
      </p>
      <div className="cb-picker-grid">
        {ACTIVITY_TYPES.map((a) => (
          <button
            key={a.type}
            className="cb-picker-card"
            style={{ "--tint": a.tint }}
            onClick={() => onPick(a.type)}
          >
            <span className="cb-picker-icon">{a.icon}</span>
            <h3>{a.label}</h3>
            <p>{a.blurb}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
