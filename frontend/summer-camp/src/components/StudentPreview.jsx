import { activityMeta } from "./activityTypes";

export default function StudentPreview({ type, content }) {
  const meta = activityMeta(type);
  const c = content || {};
  const questionText = c.question || c.task;

  const hasContent =
    type === "memory_tiles" ? (c.pairs || []).length > 0
    : type === "word_search" ? (c.words || []).length > 0
    : type === "image_reveal" ? !!c.image
    : !!questionText;

  return (
    <div className="cb-preview-panel" style={{ "--tint": meta.tint }}>
      <span className="cb-eyebrow" style={{ color: meta.tint }}>
        Student preview
      </span>
      <div className="cb-preview-stage">
        {!hasContent && (
          <div className="cb-preview-empty">
            {meta.icon} Start typing to see how students will experience this.
          </div>
        )}

        {hasContent && questionText && type !== "image_reveal" && (
          <p className="cb-preview-question">{questionText}</p>
        )}

        {hasContent && type === "multiple_choice" && (
          <div className="cb-opt-grid">
            {(c.options || []).map((opt, i) => (
              <div key={i} className={`cb-opt ${c.answer === i ? "correct" : ""}`}>
                {opt || <span style={{ opacity: 0.4 }}>Option {"ABCD"[i]}</span>}
              </div>
            ))}
          </div>
        )}

        {hasContent && type === "true_false" && (
          <div className="cb-opt-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className={`cb-opt ${c.answer === true ? "correct" : ""}`} style={{ textAlign: "center" }}>True</div>
            <div className={`cb-opt ${c.answer === false ? "correct" : ""}`} style={{ textAlign: "center" }}>False</div>
          </div>
        )}

        {hasContent && type === "drag_order" && (
          <div className="cb-opt-grid">
            {(c.items || []).map((item, i) => (
              <div key={i} className="cb-opt" style={{ display: "flex", gap: 8 }}>
                <span className="cb-order-num" style={{ background: meta.tint }}>{i + 1}</span>
                {item}
              </div>
            ))}
          </div>
        )}

        {hasContent && type === "match_pairs" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(c.pairs || {}).map(([left, right], i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div className="cb-opt" style={{ flex: 1 }}>{left}</div>
                <span className="cb-pair-link">↔</span>
                <div className="cb-opt" style={{ flex: 1 }}>{right}</div>
              </div>
            ))}
          </div>
        )}

        {hasContent && type === "fill_blank" && (
          <div className="cb-opt" style={{ color: "#a09a89" }}>Type your answer here…</div>
        )}

        {hasContent && type === "prompt_build" && (
          <div className="cb-opt" style={{ minHeight: 70, color: "#a09a89" }}>Write your prompt here…</div>
        )}

        {hasContent && type === "memory_tiles" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {(c.pairs || []).flatMap(([l, r], i) => [l, r]).map((label, i) => (
              <div
                key={i}
                className="cb-opt"
                style={{
                  aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center",
                  textAlign: "center", fontSize: ".72rem", fontWeight: 700, padding: 6,
                  background: `color-mix(in srgb, ${meta.tint} 12%, white)`,
                }}
              >
                {label || "?"}
              </div>
            ))}
          </div>
        )}

        {hasContent && type === "word_search" && (
          <div>
            <div className="cb-opt" style={{ fontFamily: "monospace", letterSpacing: 3, fontSize: ".8rem", marginBottom: 10 }}>
              A puzzle grid with {c.words.length} word{c.words.length === 1 ? "" : "s"} hidden is generated at play time.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {c.words.map((w, i) => (
                <span key={i} className="cb-chip" style={{ "--tint": meta.tint }}>{w}</span>
              ))}
            </div>
          </div>
        )}

        {hasContent && type === "image_reveal" && (
          <div>
            <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", marginBottom: 10 }}>
              <img
                src={c.image}
                alt="preview"
                style={{ width: "100%", maxHeight: 180, objectFit: "cover", filter: "blur(10px)" }}
              />
              <span style={{
                position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(0,0,0,.15)", color: "white", fontWeight: 800, fontSize: ".8rem",
              }}>
                Starts blurred
              </span>
            </div>
            {questionText && <p className="cb-preview-question" style={{ fontSize: ".9rem" }}>{questionText}</p>}
            <div className="cb-opt" style={{ color: "#a09a89" }}>Student types their guess…</div>
          </div>
        )}
      </div>
    </div>
  );
}
