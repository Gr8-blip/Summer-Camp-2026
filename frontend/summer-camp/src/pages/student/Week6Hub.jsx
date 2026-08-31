import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getStudentDashboard, getMissionDetail, getProfile } from "../../api/client";
import { getWeekSixMission } from "../../utils/week6";
import "./Week6Hub.css";

// Purely decorative per-position flavor — icon + roman-numeral kicker only.
// Every bit of actual content (title, description, unlock state) comes
// from the Lesson records under the Week 6 Mission, same as every other
// week. Add/remove/reorder lessons in the admin and the hub follows.
const CHAPTER_ICONS = ["🧠", "🚀", "🏆"];
const CHAPTER_KICKERS = ["CHAPTER I", "CHAPTER II", "CHAPTER III", "CHAPTER IV", "CHAPTER V"];

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

  const chaptersRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const dash = await getStudentDashboard();
        if (cancelled) return;
        setStudentName(dash?.student?.name || "Student");
        setXp(typeof dash?.student?.xp === "number" ? dash.student.xp : null);

        const mission = getWeekSixMission(dash?.missions);
        if (mission) {
          const detail = await getMissionDetail(mission.id);
          if (cancelled) return;
          const ordered = [...(detail?.lessons || [])].sort((a, b) => a.order - b.order);
          setLessons(ordered);
        }
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
  }, []);

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

  return (
    <div className={`w6-shell ${entered ? "w6-entered" : ""}`}>
      <div className="w6-stars" aria-hidden="true" />
      <div className="w6-aurora" aria-hidden="true" />

      <header className="w6-topbar">
        <div className="w6-topbar-left">🎓 RAVMATHS · FINALE</div>
        <div className="w6-topbar-right">
          <span className="w6-pill w6-pill-name">👋 {studentName}</span>
          {xp !== null && <span className="w6-pill w6-pill-xp">✨ {xp} XP</span>}
          {coins !== null && <span className="w6-pill w6-pill-coins">🪙 {coins}</span>}
          <button className="w6-logout" onClick={handleLogout} aria-label="Log out">
            ← Log Out
          </button>
        </div>
      </header>

      <section className="w6-hero">
        <div className="w6-hero-inner">
          <div className="w6-eyebrow">🎓 WEEK 6</div>
          <h1 className="w6-headline">
            THE FINAL
            <br />
            CHAPTER
          </h1>
          <p className="w6-hype">
            Everything you've built has led here. Three chapters stand between
            you and graduation — ask big questions, show off your work, and
            face the finale. Let's go.
          </p>

          <div className="w6-medallion" role="img" aria-label={`${completedCount} of ${totalChapters} chapters complete`}>
            <svg viewBox="0 0 120 120" className="w6-medallion-svg">
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
                  {!chapter.unlocked && <div className="w6-card-shimmer" aria-hidden="true" />}
                </button>
              ))}
            </div>

            <div className="w6-mystery">
              <div className="w6-mystery-icon">{allComplete ? "🏆" : "👁️"}</div>
              <p className="w6-mystery-text">
                {allComplete
                  ? "You made it through all three chapters. The finale is yours — well earned."
                  : "Something is waiting at the end..."}
              </p>
            </div>
          </>
        )}
      </section>
    </div>
  );
}