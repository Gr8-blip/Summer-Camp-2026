import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getStudentDashboard, getMissionDetail, getProfile, checkInAttendance, submitLessonQuestion } from "../../api/client";
import { getWeekSixMission } from "../../utils/week6";
import MissionCompleteCelebration from "../../components/MissionCompleteCelebration";
import "./Week6Hub.css";

// Purely decorative per-position flavor — icon + roman-numeral kicker only.
// Every bit of actual content (title, description, unlock state) comes
// from the Lesson records under the Week 6 Mission, same as every other
// week. Add/remove/reorder lessons in the admin and the hub follows.
const CHAPTER_ICONS = ["🧠", "🚀", "🏆"];
const CHAPTER_KICKERS = ["CHAPTER I", "CHAPTER II", "CHAPTER III", "CHAPTER IV", "CHAPTER V"];

// Idea-starter categories for the Q&A box. Purely a prompt — tapping one
// just seeds the textarea, it never restricts what gets submitted.
const QA_CATEGORIES = [
  { key: "ai", icon: "🤖", label: "AI & The Future", starter: "What I'm curious about with AI is..." },
  { key: "tech", icon: "💻", label: "Coding & Tech", starter: "About coding/tech, I wonder..." },
  { key: "academy", icon: "🌐", label: "Behind the Academy", starter: "About how the Academy works, I wonder..." },
  { key: "camp", icon: "🏕️", label: "The Camp", starter: "About camp, I wanted to ask..." },
  { key: "wild", icon: "🚀", label: "Your Craziest Ideas", starter: "Ok this might be a wild idea but..." },
];

function QASection({ lesson }) {
  const [category, setCategory] = useState(null);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handlePickCategory = (cat) => {
    setCategory(cat.key);
    if (!text.trim()) setText(cat.starter);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim()) { setError("Type something first!"); return; }
    setSubmitting(true); setError("");
    try {
      await submitLessonQuestion(lesson.id, text.trim(), category || "");
      setSubmitted(true);
      setText("");
      setCategory(null);
    } catch (err) {
      setError(err.data?.error || "Couldn't send that — try again?");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w6-qa">
      <div className="w6-qa-header">
        <div className="w6-qa-icon">❓</div>
        <div>
          <h2 className="w6-qa-title">Got Something on Your Mind?</h2>
          <p className="w6-qa-sub">
            Ask anything — AI, coding, the Academy, camp, or your wildest ideas. Your
            name stays with the teacher only, never shown to other students.
          </p>
        </div>
      </div>

      <div className="w6-qa-categories">
        {QA_CATEGORIES.map((cat) => (
          <button
            type="button"
            key={cat.key}
            className={`w6-qa-cat ${category === cat.key ? "w6-qa-cat-active" : ""}`}
            onClick={() => handlePickCategory(cat)}
          >
            <span className="w6-qa-cat-icon">{cat.icon}</span>
            <span>{cat.label}</span>
          </button>
        ))}
      </div>

      {submitted ? (
        <div className="w6-qa-confirm">
          <span className="w6-qa-confirm-icon">✅</span>
          <div>
            <div className="w6-qa-confirm-title">Sent!</div>
            <div className="w6-qa-confirm-sub">Your question's in — anonymously. Ask another?</div>
          </div>
          <button type="button" className="w6-qa-again" onClick={() => setSubmitted(false)}>
            Ask Another
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="w6-qa-form">
          <textarea
            className="w6-qa-textarea"
            placeholder="What's on your mind?"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
          />
          {error && <div className="w6-modal-error">⚠️ {error}</div>}
          <button type="submit" className="w6-qa-submit" disabled={submitting}>
            {submitting ? <span className="w6-spinner" /> : "Send it →"}
          </button>
        </form>
      )}
    </div>
  );
}

function CheckInModal({ onClose, onSuccess }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!code.trim()) { setError("Enter a code first!"); return; }
    setLoading(true); setError("");
    try {
      const res = await checkInAttendance(code.trim().toUpperCase());
      onSuccess(res);
    } catch (err) {
      setError(err.data?.error || "Check-in failed. Double-check the code!");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w6-modal-overlay" onClick={onClose}>
      <div className="w6-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="w6-modal-title">📅 Check In</h2>
        <p className="w6-modal-sub">Enter today's code to unlock this chapter's seal.</p>
        <form onSubmit={handleSubmit}>
          <input
            className="w6-modal-input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. ABC123"
            autoFocus
            required
          />
          {error && <div className="w6-modal-error">⚠️ {error}</div>}
          <div className="w6-modal-actions">
            <button type="button" className="w6-modal-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="w6-modal-submit" disabled={loading}>
              {loading ? <span className="w6-spinner" /> : "Check In ✅"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Week6Hub() {
  const navigate = useNavigate();
  const { logoutStudent } = useAuth();

  const [studentName, setStudentName] = useState("Student");
  const [xp, setXp] = useState(null);
  const [coins, setCoins] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [entered, setEntered] = useState(false);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [toast, setToast] = useState("");
  const [celebration, setCelebration] = useState(null);

  const chaptersRef = useRef(null);

  const loadWeek6 = useCallback(async () => {
    const dash = await getStudentDashboard();
    setStudentName(dash?.student?.name || "Student");
    setXp(typeof dash?.student?.xp === "number" ? dash.student.xp : null);

    const mission = getWeekSixMission(dash?.missions);
    if (mission) {
      const detail = await getMissionDetail(mission.id);
      const ordered = [...(detail?.lessons || [])].sort((a, b) => a.order - b.order);
      setLessons(ordered);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await loadWeek6();
      } catch (err) {
        if (!cancelled) setError(err?.data?.error || "Couldn't load Week 6 yet.");
      } finally {
        if (!cancelled) setLoading(false);
      }

      // Coins live behind /profile/ and are genuinely optional for this
      // page — never let a marketplace hiccup block the finale hub.
      try {
        const profile = await getProfile();
        if (!cancelled) setCoins(typeof profile?.coins === "number" ? profile.coins : null);
      } catch {
        /* coins stay hidden, no big deal */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadWeek6]);

  // Chapters are driven entirely by whatever lessons the admin has actually
  // published under the Week 6 mission — no fixed count, no fixed names.
  const chapters = useMemo(() => {
    return lessons.map((lesson, i) => {
      const prevLesson = lessons[i - 1];
      const publishedAndOpen = !lesson.locked;
      const prevDone = i === 0 || prevLesson?.completed;
      const unlocked = Boolean(publishedAndOpen && prevDone);
      return {
        key: lesson.id,
        icon: CHAPTER_ICONS[i] || "⭐",
        kicker: CHAPTER_KICKERS[i] || `CHAPTER ${i + 1}`,
        lesson,
        unlocked,
        completed: Boolean(lesson.completed),
      };
    });
  }, [lessons]);

  const totalChapters = chapters.length;
  const completedCount = chapters.filter((c) => c.completed).length;
  const allComplete = totalChapters > 0 && completedCount === totalChapters;
  const progressPct = totalChapters ? (completedCount / totalChapters) * 100 : 0;

  // Not every lesson carries Q&A — the admin flips `qa_enabled` per lesson.
  // Only offer the box once that lesson is actually reachable.
  const qaChapter = chapters.find((c) => c.lesson.qa_enabled && c.unlocked);

  // Circle math for the medallion ring.
  const RADIUS = 54;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const dashOffset = CIRCUMFERENCE - (progressPct / 100) * CIRCUMFERENCE;

  const handleEnter = () => {
    setEntered(true);
    requestAnimationFrame(() => {
      chaptersRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const handleChapterClick = (chapter) => {
    if (!chapter.unlocked || !chapter.lesson) return;
    navigate(`/lessons/${chapter.lesson.id}`);
  };

  const handleLogout = () => {
    logoutStudent();
    navigate("/");
  };

  // Attendance check-in is what actually flips a lesson's `completed` flag
  // server-side (same mechanism as the normal Attendance page) — so on
  // success we just re-pull mission detail and the chapter grid updates
  // itself (unlocks the next chapter, fills the medallion, etc).
  const handleCheckInSuccess = async (res) => {
    setShowCheckIn(false);
    setToast("✅ Checked in — chapter unlocked!");
    setTimeout(() => setToast(""), 3500);

    try {
      await loadWeek6();
    } catch {
      /* the toast already told them it worked — a stale grid isn't fatal */
    }

    if (res?.mission_complete) {
      setTimeout(() => {
        setCelebration({ ...res.mission_complete, badges: res.new_badges || [] });
      }, 400);
    }
  };

  return (
    <div className={`w6-shell ${entered ? "w6-entered" : ""}`}>
      <div className="w6-stars" aria-hidden="true" />

      <header className="w6-topbar">
        <div className="w6-topbar-left">🎓 SUMMER CAMP · FINALE</div>
        <div className="w6-topbar-right">
          <span className="w6-pill w6-pill-name">👋 {studentName}</span>
          {xp !== null && <span className="w6-pill w6-pill-xp">✨ {xp} XP</span>}
          {coins !== null && <span className="w6-pill w6-pill-coins">🪙 {coins}</span>}
          <button className="w6-checkin-pill" onClick={() => setShowCheckIn(true)}>
            📅 Check In
          </button>
          <button className="w6-logout" onClick={handleLogout} aria-label="Log out">
            ← Log Out
          </button>
        </div>
      </header>

      {toast && <div className="w6-toast">{toast}</div>}

      <section className="w6-hero">
        <div className="w6-hero-inner">
          <div className="w6-eyebrow">
            <span className="w6-eyebrow-dot" />
            🎓 WEEK 6
          </div>
          <h1 className="w6-headline">
            THE FINAL
            <br />
            CHAPTER
          </h1>
          <p className="w6-hype">
            Everything you've built has led here. {totalChapters || "A few"} chapter
            {totalChapters === 1 ? "" : "s"} stand between you and graduation — ask big
            questions, show off your work, and face the finale. Let's go.
          </p>

          <div className="w6-medallion" role="img" aria-label={`${completedCount} of ${totalChapters} chapters complete`}>
            <svg viewBox="0 0 120 120" className="w6-medallion-svg">
              <defs>
                <linearGradient id="w6-ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ffc857" />
                  <stop offset="100%" stopColor="#a78bfa" />
                </linearGradient>
              </defs>
              <circle cx="60" cy="60" r={RADIUS} className="w6-medallion-track" />
              <circle
                cx="60"
                cy="60"
                r={RADIUS}
                className="w6-medallion-fill"
                style={{
                  strokeDasharray: CIRCUMFERENCE,
                  strokeDashoffset: dashOffset,
                }}
              />
            </svg>
            <div className="w6-medallion-label">
              <span className="w6-medallion-count">{completedCount}</span>
              <span className="w6-medallion-total">of {totalChapters || "–"}</span>
            </div>
          </div>

          <button className="w6-cta" onClick={handleEnter}>
            <span>ENTER WEEK 6</span>
            <span className="w6-cta-arrow">→</span>
          </button>

          <div className="w6-scroll-cue" aria-hidden="true">
            <span />
          </div>
        </div>
      </section>

      <section className="w6-chapters" ref={chaptersRef}>
        {loading && (
          <div className="w6-status">
            <span className="w6-spinner" />
            Opening the final chapter...
          </div>
        )}

        {!loading && error && <div className="w6-status w6-status-error">{error}</div>}

        {!loading && !error && totalChapters === 0 && (
          <div className="w6-status">The chapters are still being written — check back soon.</div>
        )}

        {!loading && !error && totalChapters > 0 && (
          <>
            <div className="w6-progress-bar" aria-hidden="true">
              <div className="w6-progress-bar-fill" style={{ width: `${progressPct}%` }} />
            </div>

            <div className="w6-chapters-grid">
              {chapters.map((chapter, i) => (
                <button
                  key={chapter.key}
                  className={[
                    "w6-card",
                    chapter.unlocked ? "w6-card-unlocked" : "w6-card-locked",
                    chapter.completed ? "w6-card-complete" : "",
                  ].join(" ")}
                  style={{ "--w6-delay": `${i * 120}ms` }}
                  onClick={() => handleChapterClick(chapter)}
                  disabled={!chapter.unlocked}
                >
                  <div className="w6-card-kicker">{chapter.kicker}</div>
                  <div className="w6-card-icon">{chapter.unlocked ? chapter.icon : "🔒"}</div>
                  <div className="w6-card-title">
                    {chapter.unlocked ? chapter.lesson.title : "???"}
                  </div>
                  <div className="w6-card-sub">
                    {chapter.unlocked
                      ? chapter.lesson.description
                      : "Finish the previous chapter to break the seal."}
                  </div>
                  {chapter.completed && <div className="w6-card-badge">✓ COMPLETE</div>}
                  {chapter.unlocked && !chapter.completed && (
                    <div className="w6-card-badge w6-card-badge-open">🟢 OPEN</div>
                  )}
                </button>
              ))}
            </div>

            {qaChapter && <QASection lesson={qaChapter.lesson} />}

            <div className="w6-mystery">
              <div className="w6-mystery-icon">{allComplete ? "🏆" : "👁️"}</div>
              <p className="w6-mystery-text">
                {allComplete
                  ? "You made it through every chapter. The finale is yours — well earned."
                  : "Something is waiting at the end..."}
              </p>
            </div>
          </>
        )}
      </section>

      {showCheckIn && (
        <CheckInModal onClose={() => setShowCheckIn(false)} onSuccess={handleCheckInSuccess} />
      )}

      {celebration && (
        <MissionCompleteCelebration
          missionTitle={celebration.mission_title}
          xpAwarded={celebration.xp_awarded}
          newBadges={celebration.badges}
          onDone={() => setCelebration(null)}
        />
      )}
    </div>
  );
}