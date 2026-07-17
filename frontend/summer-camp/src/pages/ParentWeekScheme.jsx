import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getParentWeekScheme, getParentLessons } from "../api/client";
import "./ParentWeekScheme.css";

// ── Language mapping: student → parent ─────────────────────────────────────
// Mission  → Week
// Lesson   → Lesson       (same)
// Challenge→ Activity / Practice Challenge
// XP       → Learning Points
// Badge    → Achievement

function formatDuration(dur) {
  if (!dur) return null;
  const [h, m] = dur.split(":").map(Number);
  if (h > 0) return `${h}h ${m > 0 ? `${m}m` : ""}`.trim();
  return `${m} min`;
}

export default function ParentWeekScheme() {
  const navigate = useNavigate();
  const [weeks, setWeeks]     = useState([]);
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [expanded, setExpanded] = useState(null); // which week is open

  useEffect(() => {
    Promise.all([getParentWeekScheme(), getParentLessons()])
      .then(([weekData, lessonData]) => {
        // backend returns array directly from ListAPIView
        setWeeks(Array.isArray(weekData) ? weekData : weekData.results || []);
        setLessons(Array.isArray(lessonData) ? lessonData : lessonData.results || []);
      })
      .catch((err) => setError(err.data?.error || "Couldn't load the week schedule."))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id) => setExpanded((prev) => (prev === id ? null : id));

  // Lessons for a given mission id
  const lessonsFor = (missionId) =>
    lessons.filter((l) => l.mission === missionId || l.mission_id === missionId);

  return (
    <div className="pws-shell">
      {/* Back header */}
      <div className="pws-header">
        <button className="pws-back" onClick={() => navigate("/dashboard")}>
          ← Back to Dashboard
        </button>
        <h1 className="pws-title">📅 Weekly Schedule</h1>
        <p className="pws-subtitle">
          Here's what your child will be learning each week. Click any week to see the lessons.
        </p>
      </div>

      <div className="pws-content">
        {loading && (
          <div className="pws-loading">
            <span className="spinner spinner-dark" />
            <span>Loading the schedule…</span>
          </div>
        )}

        {error && <div className="pws-error">⚠️ {error}</div>}

        {!loading && !error && weeks.length === 0 && (
          <div className="pws-empty">
            <div className="pws-empty-icon">📅</div>
            <p>The schedule hasn't been set up yet. Check back soon!</p>
          </div>
        )}

        {!loading && !error && weeks.map((week) => {
          const isOpen = expanded === week.id;
          const weekLessons = lessonsFor(week.id);

          return (
            <div key={week.id} className={`pws-week ${isOpen ? "open" : ""}`}>
              {/* Week header — always visible */}
              <button className="pws-week-header" onClick={() => toggle(week.id)}>
                <div className="pws-week-left">
                  <span className="pws-week-badge">Week {week.week}</span>
                  <div>
                    <h2 className="pws-week-title">{week.title}</h2>
                    {week.description && (
                      <p className="pws-week-desc">{week.description}</p>
                    )}
                  </div>
                </div>
                <div className="pws-week-right">
                  <span className="pws-lesson-count">
                    {week.lesson_count ?? weekLessons.length} lesson{(week.lesson_count ?? weekLessons.length) !== 1 ? "s" : ""}
                  </span>
                  <span className="pws-chevron">{isOpen ? "▲" : "▼"}</span>
                </div>
              </button>

              {/* Lessons — visible when open */}
              {isOpen && (
                <div className="pws-lessons">
                  {weekLessons.length === 0 ? (
                    <p className="pws-no-lessons">Lessons for this week are being prepared.</p>
                  ) : (
                    weekLessons
                      .slice()
                      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                      .map((lesson, i) => (
                        <div key={lesson.id} className="pws-lesson">
                          <div className="pws-lesson-num">{i + 1}</div>
                          <div className="pws-lesson-body">
                            <h3 className="pws-lesson-title">{lesson.title}</h3>
                            {lesson.description && (
                              <p className="pws-lesson-desc">{lesson.description}</p>
                            )}
                            {lesson.duration && (
                              <span className="pws-lesson-duration">
                                ⏱ {formatDuration(lesson.duration)}
                              </span>
                            )}
                          </div>
                        </div>
                      ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}