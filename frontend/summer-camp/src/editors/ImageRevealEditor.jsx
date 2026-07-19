export default function ImageRevealEditor({ content, onChange }) {
  const set = (patch) => onChange({ ...content, ...patch });

  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set({ image: reader.result });
    reader.readAsDataURL(file);
  };

  return (
    <>
      <div className="cb-field">
        <label>Image</label>
        {content.image ? (
          <div style={{ position: "relative", marginBottom: 10 }}>
            <img
              src={content.image}
              alt="preview"
              style={{ width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 12, border: "2px solid var(--cb-line)" }}
            />
            <button
              type="button"
              onClick={() => set({ image: "" })}
              className="cb-btn cb-btn-ghost"
              style={{ position: "absolute", top: 8, right: 8, padding: "4px 10px", fontSize: ".75rem" }}
            >
              Remove
            </button>
          </div>
        ) : (
          <label
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "2px dashed var(--cb-line)", borderRadius: 12, padding: "30px 10px",
              cursor: "pointer", color: "#7a7568", fontSize: ".85rem", fontWeight: 600,
            }}
          >
            🖼️ Click to upload an image
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleFile(e.target.files?.[0])}
              style={{ display: "none" }}
            />
          </label>
        )}

        <div className="cb-field" style={{ marginTop: 10 }}>
          <label>Or paste an image URL</label>
          <input
            type="text"
            placeholder="https://…"
            value={content.image && content.image.startsWith("http") ? content.image : ""}
            onChange={(e) => set({ image: e.target.value })}
          />
        </div>
      </div>

      <div className="cb-field">
        <label>Question</label>
        <input
          type="text"
          placeholder="Who is this?"
          value={content.question}
          onChange={(e) => set({ question: e.target.value })}
        />
      </div>

      <div className="cb-field">
        <label>Correct answer</label>
        <input
          type="text"
          placeholder="ChatGPT"
          value={content.answer}
          onChange={(e) => set({ answer: e.target.value })}
        />
      </div>
    </>
  );
}
