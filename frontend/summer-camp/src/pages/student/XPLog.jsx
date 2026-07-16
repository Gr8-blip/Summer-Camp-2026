import { useEffect, useState } from "react";
import { getXPLog } from "../../api/client";
import StudentLayout from "./StudentLayout";
import "./student.css";

export default function XPLog() {
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => {
    getXPLog()
      .then(setLogs)
      .catch((err) => setError(err.data?.error || "Couldn't load XP history."))
      .finally(() => setLoading(false));
  }, []);

  const total = logs.reduce((sum, l) => sum + (l.amount || 0), 0);

  return (
    <StudentLayout title="✨ XP History">
      {loading && <div className="s-loading"><span className="spinner spinner-dark" /><span>Loading...</span></div>}
      {error   && <div className="s-error">⚠️ {error}</div>}
      {!loading && !error && logs.length === 0 && <div className="s-empty"><div className="s-empty-icon">✨</div><p>No XP earned yet. Complete missions to start!</p></div>}
      {!loading && !error && logs.length > 0 && (
        <>
          <div className="s-card s-xp-total-card"><span>Total XP</span><span className="s-xp-total-num">✨ {total} XP</span></div>
          <div className="s-xp-timeline">
            {logs.map((log, i) => (
              <div key={i} className="s-xp-timeline-item">
                <div className="s-xp-dot" />
                <div className="s-xp-timeline-card">
                  <span className="s-xp-timeline-reason">{log.reason}</span>
                  <span className="s-xp-timeline-amount">+{log.amount} XP</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </StudentLayout>
  );
}