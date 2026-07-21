import { useEffect, useState } from "react";
import { adminGetCampSettings, adminUpdateCampSettings } from "../../api/client";
import AdminLayout from "./AdminLayout";
import { useToast, ToastContainer } from "../../components/Toast";

export default function AdminCampControl() {
  const { toasts, toast } = useToast();
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    adminGetCampSettings()
      .then((d) => setStarted(d.camp_started))
      .finally(() => setLoading(false));
  }, []);

  const toggle = async () => {
    const next = !started;
    setSaving(true);
    try {
      await adminUpdateCampSettings({ camp_started: next });
      setStarted(next);
      toast(next ? "Camp is now LIVE 🚀" : "Camp switched off — content locked for students.");
    } catch (e) {
      toast(e.data?.detail || "Couldn't update camp status.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout title="🎛️ Camp Control">
      <div className="a-table-wrap" style={{ padding: 32, maxWidth: 520 }}>
        {loading ? (
          <div className="a-loading"><span className="spinner spinner-dark" /><span>Loading...</span></div>
        ) : (
          <>
            <h2 style={{ marginBottom: 6 }}>Bootcamp Status</h2>
            <p style={{ color: "var(--color-text-soft)", marginBottom: 24 }}>
              When OFF, missions/lessons/quests/challenges stay visible to students
              but locked. Publish flags still control what's <em>visible</em> —
              this switch controls what's <em>playable</em>.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <button
                onClick={toggle}
                disabled={saving}
                style={{
                  width: 64, height: 34, borderRadius: 999, border: "none", cursor: "pointer",
                  background: started ? "linear-gradient(135deg,#22c55e,#4ade80)" : "#d1d5db",
                  position: "relative", transition: "background .2s ease",
                }}
              >
                <span style={{
                  position: "absolute", top: 3, left: started ? 33 : 3,
                  width: 28, height: 28, borderRadius: "50%", background: "#fff",
                  transition: "left .2s ease", boxShadow: "0 2px 4px rgba(0,0,0,.25)",
                }} />
              </button>
              <strong style={{ fontSize: "1.05rem", color: started ? "#16a34a" : "#6b7280" }}>
                {started ? "🟢 Camp is LIVE" : "⚪ Camp not started"}
              </strong>
            </div>
          </>
        )}
      </div>
      <ToastContainer toasts={toasts} />
    </AdminLayout>
  );
}