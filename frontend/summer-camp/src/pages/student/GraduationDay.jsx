import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { useAuth } from "../../context/AuthContext";
import { getStudentDashboard, getCampSettings, getSubmissions, getChallengeStats, getAssignments, getBadges, getAwards, claimAward, getLeaderboard } from "../../api/client";
import "./GraduationDay.css";

const CERTIFICATE_TRACK = "AI & Technology Summer Camp 2026";

const RARITY_RANK = { common: 1, rare: 2, epic: 3, legendary: 4, mythical: 5 };

// Icons mirror the AWARD_TYPES choices on the backend — the label already
// comes through as award_label ("🏆 Builder Award"), this is just a
// standalone glyph for the big locked/claimed card face.
const AWARD_ICONS = {
  builder: "🏆",
  problem_solver: "🧠",
  ai_explorer: "🤖",
  future_innovator: "🚀",
  creative_mind: "🎨",
  fast_learner: "⚡",
  never_give_up: "💪",
  rising_developer: "🌟",
  quest_master: "🎯",
  tech_trailblazer: "💻",
};

// How often we re-check the lock while a student is sitting on the page —
// so if the admin flips the switch in Camp Control mid-scroll, the
// certificate can unseal itself without a refresh.
const LOCK_POLL_MS = 20000;

// The 5 leaderboard categories — each just points at the matching
// value/rank fields the backend already computed per student.
const LEADERBOARD_CATEGORIES = [
  { key: "overall", label: "🏆 Overall Score", valueKey: "overall_score", rankKey: "overall_rank", fmt: (v) => v?.toFixed?.(1) ?? "—" },
  { key: "xp", label: "⚡ Highest XP", valueKey: "xp", rankKey: "xp_rank", fmt: (v) => v ?? "—" },
  { key: "quests", label: "🎯 Quest Performance", valueKey: "quest_score", rankKey: "quest_rank", fmt: (v) => (v != null ? `${v}%` : "—") },
  { key: "attendance", label: "📅 Attendance", valueKey: "attendance_count", rankKey: "attendance_rank", fmt: (v) => v ?? "—" },
  { key: "challenges", label: "🔥 Challenge Participation", valueKey: "challenge_count", rankKey: "challenge_rank", fmt: (v) => v ?? "—" },
];

export default function GraduationDay() {
  const navigate = useNavigate();
  const { logoutStudent } = useAuth();

  // ── Data: everything below is real, pulled for this student ──────────
  const [dash, setDash] = useState(null);
  const [submissions, setSubmissions] = useState(null);
  const [challengeStats, setChallengeStats] = useState(null);
  const [assignments, setAssignments] = useState(null);
  const [allBadges, setAllBadges] = useState(null);
  const [unlocked, setUnlocked] = useState(null); // null = still checking
  const [loading, setLoading] = useState(true);

  // ── Awards ─────────────────────────────────────────────────────────
  const [awards, setAwards] = useState(null);
  const [claimingId, setClaimingId] = useState(null);
  const [revealingId, setRevealingId] = useState(null); // mid celebration animation
  const [awardsError, setAwardsError] = useState("");

  // ── Leaderboard ────────────────────────────────────────────────────
  const [leaderboard, setLeaderboard] = useState(null); // null = still loading
  const [leaderboardCategory, setLeaderboardCategory] = useState("overall");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const d = await getStudentDashboard();
        if (!cancelled) setDash(d);
      } catch {
        /* the page still works, just less personalized */
      } finally {
        if (!cancelled) setLoading(false);
      }

      // Best-effort extras — never let these block the page or the lock.
      getSubmissions().then((s) => !cancelled && setSubmissions(s)).catch(() => {});
      getChallengeStats().then((s) => !cancelled && setChallengeStats(s)).catch(() => {});
      getAssignments().then((s) => !cancelled && setAssignments(s)).catch(() => {});
      getBadges().then((s) => !cancelled && setAllBadges(s)).catch(() => {});
      getAwards().then((a) => !cancelled && setAwards(Array.isArray(a) ? a : a?.results || [])).catch(() => !cancelled && setAwards([]));
      getLeaderboard().then((l) => !cancelled && setLeaderboard(Array.isArray(l) ? l : l?.results || [])).catch(() => !cancelled && setLeaderboard([]));
    })();

    return () => { cancelled = true; };
  }, []);

  // Only assigned awards ever show up here — the backend only returns
  // rows the admin actually created for this student.
  const awardList = awards || [];
  const allAwardsClaimed = awardList.length > 0 && awardList.every((a) => a.claimed);

  // ── Leaderboard: re-sort the same list by whichever category tab is
  // active, since the backend sends every row with all 5 ranks already
  // computed — no extra fetch needed to switch tabs. ────────────────────
  const activeCategory = LEADERBOARD_CATEGORIES.find((c) => c.key === leaderboardCategory) || LEADERBOARD_CATEGORIES[0];
  const leaderboardRows = useMemo(() => {
    const rows = leaderboard || [];
    return [...rows].sort((a, b) => (a[activeCategory.rankKey] ?? 999) - (b[activeCategory.rankKey] ?? 999));
  }, [leaderboard, activeCategory]);
  const myLeaderboardRow = useMemo(() => (leaderboard || []).find((r) => r.is_you) || null, [leaderboard]);

  const handleClaimAward = async (award) => {
    if (award.claimed || claimingId) return;
    setClaimingId(award.id);
    setAwardsError("");
    try {
      const updated = await claimAward(award.id);
      setAwards((prev) => prev.map((a) => (a.id === award.id ? updated : a)));
      setRevealingId(award.id);
      setTimeout(() => setRevealingId((cur) => (cur === award.id ? null : cur)), 1400);
    } catch (err) {
      setAwardsError(err?.message || "Couldn't claim that award — try again.");
    } finally {
      setClaimingId(null);
    }
  };

  // ── The lock: source of truth is the backend, polled so the admin's
  // Camp Control toggle can unlock the page live. ──────────────────────
  useEffect(() => {
    let cancelled = false;
    const check = () => {
      getCampSettings()
        .then((s) => { if (!cancelled) setUnlocked(Boolean(s?.is_graduation)); })
        .catch(() => { if (!cancelled) setUnlocked((prev) => (prev === null ? false : prev)); });
    };
    check();
    const interval = setInterval(check, LOCK_POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const handleLogout = () => { logoutStudent(); navigate("/"); };

  // ── Derive the personalized chapters from real dashboard data ────────
  const student = dash?.student;
  const firstName = student?.name ? student.name.split(" ")[0] : "";

  const missions = dash?.missions || [];
  const badges = dash?.recent_badges || [];
  const xpLog = dash?.recent_xp || [];
  const attendance = dash?.recent_attendance || [];

  const totalXP = typeof student?.xp === "number" ? student.xp : null;
  const missionsTouched = missions.length;
  const classesAttended = attendance.length;
  const badgeCount = badges.length;

  const projectList = useMemo(() => {
    const list = Array.isArray(submissions) ? submissions : submissions?.results;
    if (!Array.isArray(list)) return [];
    return list
      .filter((s) => s?.assignment?.title)
      .slice(0, 5)
      .map((s) => s.assignment.title);
  }, [submissions]);

  const challengesCompleted = useMemo(() => {
    if (Array.isArray(challengeStats)) {
      return challengeStats.filter((c) => c?.completed || c?.status === "completed" || c?.already_completed).length;
    }
    if (challengeStats && typeof challengeStats === "object") {
      return challengeStats.completed_count ?? challengeStats.completed ?? null;
    }
    return null;
  }, [challengeStats]);

  const finalChapter = useMemo(() => {
    // The Week 6 / finale mission, if we can spot it — otherwise just the
    // most recent mission stands in as "the last one before this page".
    return missions.find((m) => /week\s*6|final/i.test(m.title || "")) || missions[missions.length - 1] || null;
  }, [missions]);

  const missionHighlights = missions.slice(0, 4);

  // ── Quests: struggled ones + a growth trend across attempted quests ──
  const questList = useMemo(() => {
    const list = Array.isArray(assignments) ? assignments : assignments?.results;
    return Array.isArray(list) ? list : [];
  }, [assignments]);

  const attemptedQuests = useMemo(
    () => questList.filter((q) => q?.attempted && typeof q?.best_accuracy === "number").sort((a, b) => a.id - b.id),
    [questList]
  );

  const struggledQuests = useMemo(
    () => attemptedQuests.filter((q) => q.best_accuracy < 60).slice(0, 3),
    [attemptedQuests]
  );

  const growthStory = useMemo(() => {
    if (attemptedQuests.length < 2) return null;
    const first = attemptedQuests[0];
    const last = attemptedQuests[attemptedQuests.length - 1];
    const diff = last.best_accuracy - first.best_accuracy;
    if (diff >= 15) return { first, last, diff };
    return null;
  }, [attemptedQuests]);

  // ── Toughest badge: highest rarity earned, epic/legendary preferred ──
  const toughestBadge = useMemo(() => {
    const list = Array.isArray(allBadges) ? allBadges : allBadges?.results;
    const pool = (Array.isArray(list) ? list : badges).filter((sb) => sb?.badge);
    if (!pool.length) return null;
    return pool.reduce((best, sb) => {
      const rank = RARITY_RANK[sb.badge?.rarity] || 0;
      const bestRank = best ? RARITY_RANK[best.badge?.rarity] || 0 : -1;
      return rank > bestRank ? sb : best;
    }, null);
  }, [allBadges, badges]);

  // ── One orchestrated hero reveal + per-chapter scroll reveal ─────────
  const [heroReady, setHeroReady] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setHeroReady(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const revealRefs = useRef({});
  const [revealed, setRevealed] = useState({});
  useEffect(() => {
    const els = Object.entries(revealRefs.current).filter(([, el]) => el);
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const key = entry.target.dataset.revealKey;
            setRevealed((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
          }
        });
      },
      { threshold: 0.16 }
    );
    els.forEach(([, el]) => io.observe(el));
    return () => io.disconnect();
  }, [loading]);
  const setRevealRef = (key) => (el) => { revealRefs.current[key] = el; };

  // ── Lightweight scroll-driven parallax for the floating shapes ───────
  const shellRef = useRef(null);
  useEffect(() => {
    let raf = null;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        shellRef.current?.style.setProperty("--gd-scroll", String(window.scrollY));
        raf = null;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ── Confetti fires once, only after the lock actually opens ──────────
  const [confettiFired, setConfettiFired] = useState(false);
  useEffect(() => {
    if (unlocked && revealed.certificate && !confettiFired) {
      const t = setTimeout(() => setConfettiFired(true), 200);
      return () => clearTimeout(t);
    }
  }, [unlocked, revealed.certificate, confettiFired]);

  const confettiPieces = useMemo(() => {
    const colors = ["var(--gd-gold)", "var(--gd-cyan)", "var(--gd-pink)", "var(--gd-purple-2)", "var(--gd-orange)"];
    return Array.from({ length: 46 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.6,
      duration: 2.6 + Math.random() * 1.8,
      size: 6 + Math.random() * 8,
      color: colors[i % colors.length],
      rotate: Math.random() * 360,
      drift: (Math.random() - 0.5) * 160,
      shape: i % 3 === 0 ? "50%" : "3px",
    }));
  }, []);

  const goTo = (key) => revealRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "start" });

  // ── Certificate PDF download ───────────────────────────────────────
  // A dedicated, nicely-styled certificate template (.gd-cert-pdf-template)
  // is rendered off-screen — it never appears on the page itself. On click
  // we rasterize that node with html2canvas and drop the image into a
  // same-size jsPDF document, so the download looks like an actual printed
  // certificate rather than a screenshot of the dark glassy on-page card.
  const pdfCertRef = useRef(null);
  const [downloadingCert, setDownloadingCert] = useState(false);
  const [certDownloadError, setCertDownloadError] = useState("");

  const handleDownloadCertificate = async () => {
    if (!pdfCertRef.current || downloadingCert) return;
    setDownloadingCert(true);
    setCertDownloadError("");
    try {
      const canvas = await html2canvas(pdfCertRef.current, {
        scale: 3,
        backgroundColor: "#fbf4e2",
        useCORS: true,
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "px",
        format: [canvas.width, canvas.height],
      });
      pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
      const safeName = (student?.name || "certificate").trim().replace(/[^a-z0-9]+/gi, "_");
      pdf.save(`${safeName}_certificate.pdf`);
    } catch (err) {
      setCertDownloadError(err?.message || "Couldn't generate the certificate PDF — try again.");
    } finally {
      setDownloadingCert(false);
    }
  };

  return (
    <div className="gd-shell" ref={shellRef}>
      <div className="gd-stars" aria-hidden="true" />
      <div className="gd-glow gd-glow-a" aria-hidden="true" />
      <div className="gd-glow gd-glow-b" aria-hidden="true" />
      <div className="gd-glow gd-glow-c" aria-hidden="true" />
      <div className="gd-float gd-float-1" aria-hidden="true">✦</div>
      <div className="gd-float gd-float-2" aria-hidden="true">✧</div>
      <div className="gd-float gd-float-3" aria-hidden="true">✦</div>
      <div className="gd-float gd-float-4" aria-hidden="true">✧</div>

      <header className="gd-topbar">
        <div className="gd-topbar-brand">🚀 Ravilletech</div>
        <button className="gd-logout" onClick={handleLogout}>← Log Out</button>
      </header>

      {/* ── HERO / BEGINNING ─────────────────────────────────────── */}
      <section className="gd-hero">
        <div className={`gd-hero-inner ${heroReady ? "gd-hero-ready" : ""}`}>
          <div className="gd-badge">
            <span className="gd-badge-dot" />
            GRADUATION DAY
          </div>

          <h1 className="gd-headline">
            <span className="gd-headline-line">THE FINAL</span>
            <span className="gd-headline-line gd-headline-accent">CHAPTER.</span>
          </h1>

          <p className="gd-subtext">
            {firstName ? `${firstName}, y` : "Y"}ou came to learn. You stayed to build.
            <br />
            This is your story — every chapter of it.
          </p>

          <div className="gd-hero-cap" aria-hidden="true">
            <svg viewBox="0 0 200 140" className="gd-cap-svg">
              <defs>
                <linearGradient id="gd-cap-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ffd76a" />
                  <stop offset="50%" stopColor="#f472b6" />
                  <stop offset="100%" stopColor="#22d3ee" />
                </linearGradient>
              </defs>
              <polygon points="100,10 190,45 100,80 10,45" fill="url(#gd-cap-grad)" opacity="0.95" />
              <polygon points="100,10 190,45 100,80 10,45" fill="none" stroke="#fff" strokeOpacity="0.25" strokeWidth="1.5" />
              <rect x="94" y="45" width="12" height="55" rx="4" fill="url(#gd-cap-grad)" />
              <circle cx="170" cy="60" r="5" fill="#ffd76a" className="gd-cap-tassel-bead" />
              <line x1="170" y1="45" x2="170" y2="60" stroke="#ffd76a" strokeWidth="2" />
              <line x1="170" y1="60" x2="163" y2="92" stroke="#ffd76a" strokeWidth="2" className="gd-cap-tassel-string" />
            </svg>
          </div>

          <button className="gd-cta-scroll" onClick={() => goTo("learning")}>
            Relive it ↓
          </button>
        </div>
      </section>

      {/* ── LEARNING ──────────────────────────────────────────────── */}
      <section
        className={`gd-section gd-chapter ${revealed.learning ? "gd-revealed" : ""}`}
        ref={setRevealRef("learning")}
        data-reveal-key="learning"
      >
        <div className="gd-chapter-kicker" style={{ "--gd-accent": "var(--gd-cyan)" }}>CHAPTER ONE · LEARNING</div>
        <h2 className="gd-chapter-title">You showed up and figured it out.</h2>
        <p className="gd-chapter-copy">
          {classesAttended > 0
            ? `${classesAttended} class${classesAttended === 1 ? "" : "es"} deep, and every one of them stuck.`
            : "Every session, every new idea — it all stacked up."}
        </p>
        {attendance.length > 0 && (
          <div className="gd-pill-row">
            {attendance.slice(0, 5).map((a, i) => (
              <span className="gd-pill" key={i} style={{ "--gd-i": i }}>✅ {a.lesson?.title || "Lesson"}</span>
            ))}
          </div>
        )}
      </section>

      {/* ── PROJECTS ──────────────────────────────────────────────── */}
      <section
        className={`gd-section gd-chapter ${revealed.projects ? "gd-revealed" : ""}`}
        ref={setRevealRef("projects")}
        data-reveal-key="projects"
      >
        <div className="gd-chapter-kicker" style={{ "--gd-accent": "var(--gd-purple-2)" }}>CHAPTER TWO · PROJECTS</div>
        <h2 className="gd-chapter-title">You built real things.</h2>
        <p className="gd-chapter-copy">Not tutorials. Not copy-paste. Things that actually run.</p>
        {projectList.length > 0 ? (
          <div className="gd-journey-grid">
            {projectList.map((title, i) => (
              <div className="gd-journey-card" key={title + i} style={{ "--gd-i": i }}>
                <div className="gd-journey-icon">💻</div>
                <h3 className="gd-journey-title">{title}</h3>
                <p className="gd-journey-copy">Shipped and submitted — one more thing you can point to and say "I made that."</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="gd-chapter-copy gd-chapter-muted">Your builds are part of this story, even the messy first drafts.</p>
        )}
      </section>

      {/* ── QUESTS ────────────────────────────────────────────────── */}
      <section
        className={`gd-section gd-chapter ${revealed.quests ? "gd-revealed" : ""}`}
        ref={setRevealRef("quests")}
        data-reveal-key="quests"
      >
        <div className="gd-chapter-kicker" style={{ "--gd-accent": "var(--gd-gold)" }}>CHAPTER THREE · QUESTS</div>
        <h2 className="gd-chapter-title">Mission by mission, you leveled up.</h2>
        <p className="gd-chapter-copy">
          {missionsTouched > 0
            ? `${missionsTouched} mission${missionsTouched === 1 ? "" : "s"} down. Every one a little harder than the last.`
            : "Every quest pushed you a little further."}
        </p>
        {missionHighlights.length > 0 && (
          <div className="gd-mission-row-list">
            {missionHighlights.map((m, i) => (
              <div className="gd-mission-row-card" key={m.id} style={{ "--gd-i": i }}>
                <span className="gd-mission-week">Week {m.week}</span>
                <span className="gd-mission-name">{m.title}</span>
                <span className="gd-mission-xp">+{m.xp_reward} XP</span>
              </div>
            ))}
          </div>
        )}

        {struggledQuests.length > 0 && (
          <div className="gd-struggle-block">
            <p className="gd-struggle-label">🥵 The ones that fought back</p>
            <div className="gd-pill-row">
              {struggledQuests.map((q, i) => (
                <span className="gd-pill gd-pill-struggle" key={q.id} style={{ "--gd-i": i }}>
                  {q.title} · {q.best_accuracy}%
                </span>
              ))}
            </div>
          </div>
        )}

        {growthStory && (
          <div className="gd-growth-banner">
            <span className="gd-growth-spark">📈</span>
            <p className="gd-growth-text">
              You scored <strong>{growthStory.first.best_accuracy}%</strong> on "{growthStory.first.title}" —
              and <strong>{growthStory.last.best_accuracy}%</strong> on "{growthStory.last.title}".
              That's not luck. <span className="gd-growth-highlight">That's growth.</span> 🔥
            </p>
          </div>
        )}
      </section>

      {/* ── ACHIEVEMENTS ──────────────────────────────────────────── */}
      <section
        className={`gd-section gd-chapter ${revealed.achievements ? "gd-revealed" : ""}`}
        ref={setRevealRef("achievements")}
        data-reveal-key="achievements"
      >
        <div className="gd-chapter-kicker" style={{ "--gd-accent": "var(--gd-pink)" }}>CHAPTER FOUR · ACHIEVEMENTS</div>
        <h2 className="gd-chapter-title">The receipts.</h2>
        <div className="gd-stat-strip">
          <div className="gd-stat"><span className="gd-stat-num">{totalXP ?? "—"}</span><span className="gd-stat-label">Total XP</span></div>
          <div className="gd-stat"><span className="gd-stat-num">{badgeCount || "—"}</span><span className="gd-stat-label">Badges Earned</span></div>
          <div className="gd-stat"><span className="gd-stat-num">{missionsTouched || "—"}</span><span className="gd-stat-label">Missions</span></div>
          <div className="gd-stat"><span className="gd-stat-num">{classesAttended || "—"}</span><span className="gd-stat-label">Classes</span></div>
        </div>
        {badges.length > 0 && (
          <div className="gd-badge-row">
            {badges.slice(0, 6).map((sb, i) => (
              <div className="gd-badge-chip" key={i} style={{ "--gd-i": i }}>
                <span className="gd-badge-chip-icon">{sb.badge?.icon || "🏅"}</span>
                <span>{sb.badge?.name}</span>
              </div>
            ))}
          </div>
        )}

        {toughestBadge && RARITY_RANK[toughestBadge.badge?.rarity] >= 2 && (
          <div className={`gd-spotlight-badge gd-rarity-glow-${toughestBadge.badge?.rarity || "rare"}`}>
            <span className="gd-spotlight-badge-icon">{toughestBadge.badge?.icon || "🏅"}</span>
            <div>
              <p className="gd-spotlight-badge-label">Hardest-earned badge</p>
              <p className="gd-spotlight-badge-name">{toughestBadge.badge?.name}</p>
              <p className="gd-spotlight-badge-rarity">{toughestBadge.badge?.rarity?.toUpperCase()}</p>
            </div>
          </div>
        )}
        {xpLog.length > 0 && (
          <p className="gd-chapter-copy gd-chapter-muted" style={{ marginTop: 18 }}>
            Most recent: "{xpLog[0].reason}" · +{xpLog[0].amount} XP
          </p>
        )}
      </section>

      {/* ── LEADERBOARD ───────────────────────────────────────────── */}
      {leaderboard !== null && leaderboard.length > 0 && (
        <section
          className={`gd-section gd-chapter gd-leaderboard-section ${revealed.leaderboard ? "gd-revealed" : ""}`}
          ref={setRevealRef("leaderboard")}
          data-reveal-key="leaderboard"
        >
          <div className="gd-chapter-kicker" style={{ "--gd-accent": "var(--gd-cyan)" }}>HALL OF FAME · LEADERBOARD</div>
          <h2 className="gd-chapter-title">See where you stand.</h2>
          <p className="gd-chapter-copy">
            Every camper, ranked five different ways. Nobody's just one number.
          </p>

          {myLeaderboardRow && (
            <div className="gd-leaderboard-you-banner">
              <span className="gd-leaderboard-you-label">YOUR RANK · {activeCategory.label}</span>
              <span className="gd-leaderboard-you-rank">#{myLeaderboardRow[activeCategory.rankKey]}</span>
              <span className="gd-leaderboard-you-value">{activeCategory.fmt(myLeaderboardRow[activeCategory.valueKey])}</span>
            </div>
          )}

          <div className="gd-leaderboard-tabs">
            {LEADERBOARD_CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                className={`gd-leaderboard-tab ${activeCategory.key === cat.key ? "gd-leaderboard-tab-active" : ""}`}
                onClick={() => setLeaderboardCategory(cat.key)}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="gd-leaderboard-table">
            <div className="gd-leaderboard-row gd-leaderboard-head">
              <span className="gd-lb-rank">Rank</span>
              <span className="gd-lb-name">Camper</span>
              <span className="gd-lb-value">{activeCategory.label}</span>
            </div>
            {leaderboardRows.map((row) => (
              <div
                key={row.student_id}
                className={`gd-leaderboard-row ${row.is_you ? "gd-leaderboard-row-you" : ""}`}
              >
                <span className="gd-lb-rank">#{row[activeCategory.rankKey]}</span>
                <span className="gd-lb-name">
                  {row.student_name}
                  {row.is_you && <span className="gd-lb-you-tag">YOU</span>}
                </span>
                <span className="gd-lb-value">{activeCategory.fmt(row[activeCategory.valueKey])}</span>
              </div>
            ))}
          </div>

          {awardList.length > 0 && (
            <button className="gd-leaderboard-awards-cta" onClick={() => goTo("awards")}>
              🏅 See Your Awards ↓
            </button>
          )}
        </section>
      )}

      {/* ── AWARDS ────────────────────────────────────────────────── */}
      {awardList.length > 0 && (
        <section
          className={`gd-section gd-chapter gd-awards-section ${revealed.awards ? "gd-revealed" : ""}`}
          ref={setRevealRef("awards")}
          data-reveal-key="awards"
        >
          <div className="gd-chapter-kicker" style={{ "--gd-accent": "var(--gd-gold)" }}>SPECIAL RECOGNITION · AWARDS</div>
          <h2 className="gd-chapter-title">
            {unlocked ? "Some things had to be earned." : "Something's waiting for you here."}
          </h2>
          <p className="gd-chapter-copy">
            {unlocked
              ? "Your instructors picked these for you — no algorithm, just people who watched you build."
              : "Your instructors already picked these out. They unlock the moment Graduation Day begins."}
          </p>

          {awardsError && <p className="gd-award-error">{awardsError}</p>}

          <div className="gd-award-grid">
            {awardList.map((award) => {
              const isClaimed = award.claimed;
              const isRevealing = revealingId === award.id;
              const canClaim = unlocked && !isClaimed;
              return (
                <div
                  key={award.id}
                  className={[
                    "gd-award-card",
                    isClaimed ? "gd-award-claimed" : "gd-award-locked",
                    isRevealing ? "gd-award-revealing" : "",
                  ].join(" ").trim()}
                >
                  {isRevealing && (
                    <div className="gd-award-burst" aria-hidden="true">
                      {Array.from({ length: 16 }).map((_, i) => (
                        <span className="gd-award-spark" key={i} style={{ "--gd-i": i }} />
                      ))}
                    </div>
                  )}

                  <div className="gd-award-card-inner">
                    <div className="gd-award-icon">
                      {isClaimed ? (AWARD_ICONS[award.award_type] || "🏅") : "❔"}
                    </div>

                    {isClaimed ? (
                      <>
                        <h3 className="gd-award-name">{award.award_label}</h3>
                        <p className="gd-award-desc">{award.description}</p>
                        <span className="gd-award-stamp">CLAIMED ✦</span>
                      </>
                    ) : (
                      <>
                        <h3 className="gd-award-name gd-award-mystery">Mystery Award</h3>
                        <p className="gd-award-desc gd-chapter-muted">
                          {unlocked ? "Ready to open." : "Sealed until Graduation Day."}
                        </p>
                        <button
                          className="gd-award-claim-btn"
                          disabled={!canClaim || claimingId === award.id}
                          onClick={() => handleClaimAward(award)}
                        >
                          {!unlocked ? "🔒 Locked" : claimingId === award.id ? "Opening…" : "✨ Claim Award"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {allAwardsClaimed && (
            <div className="gd-awards-done">
              <p className="gd-awards-done-title">🏆 ALL AWARDS CLAIMED</p>
              <p className="gd-awards-done-sub">One final reward remains…</p>
              <span className="gd-awards-done-lock">🔒 COMING NEXT</span>
            </div>
          )}
        </section>
      )}

      {/* ── CHALLENGES ────────────────────────────────────────────── */}
      <section
        className={`gd-section gd-chapter ${revealed.challenges ? "gd-revealed" : ""}`}
        ref={setRevealRef("challenges")}
        data-reveal-key="challenges"
      >
        <div className="gd-chapter-kicker" style={{ "--gd-accent": "var(--gd-orange)" }}>CHAPTER FIVE · CHALLENGES</div>
        <h2 className="gd-chapter-title">You got stuck. You didn't quit.</h2>
        <p className="gd-chapter-copy">
          {challengesCompleted
            ? `${challengesCompleted} challenge${challengesCompleted === 1 ? "" : "s"} cleared under the clock.`
            : "Every timed round, every tricky question — faced head-on."}
        </p>
      </section>

      {/* ── FINAL CHALLENGE ───────────────────────────────────────── */}
      <section
        className={`gd-section gd-chapter gd-final-challenge ${revealed.finalchallenge ? "gd-revealed" : ""}`}
        ref={setRevealRef("finalchallenge")}
        data-reveal-key="finalchallenge"
      >
        <div className="gd-chapter-kicker" style={{ "--gd-accent": "var(--gd-gold)" }}>CHAPTER SIX · THE FINAL CHALLENGE</div>
        <h2 className="gd-chapter-title">Then came the boss fight.</h2>
        <p className="gd-chapter-copy">
          {finalChapter
            ? `"${finalChapter.title}" — the hardest thing on the schedule. And you were ready for it.`
            : "The hardest thing on the schedule. And you were ready for it."}
        </p>
        <div className="gd-final-challenge-glow" aria-hidden="true" />
      </section>

      {/* ── GRADUATION (locked → reveal) ─────────────────────────── */}
      <section
        className={`gd-section gd-moment ${revealed.certificate ? "gd-revealed" : ""}`}
        ref={setRevealRef("certificate")}
        data-reveal-key="certificate"
      >
        <div className="gd-moment-head">
          <p className="gd-moment-lead">AND NOW…</p>
          <h2 className="gd-moment-title">{unlocked ? "YOU GRADUATE." : "ONE CHAPTER LEFT."}</h2>
        </div>

        {unlocked === false && (
          <div className="gd-locked">
            <div className="gd-locked-orb">
              <span className="gd-locked-icon">🔒</span>
              <span className="gd-locked-ring" aria-hidden="true" />
              <span className="gd-locked-ring gd-locked-ring-2" aria-hidden="true" />
            </div>
            <p className="gd-locked-title">Your certificate is sealed.</p>
            <p className="gd-locked-copy">
              Everything above is already yours — every XP point, every badge, every
              build. This last part unlocks the moment Graduation Day officially
              begins. Sit tight{firstName ? `, ${firstName}` : ""} — it's close.
            </p>
          </div>
        )}

        {unlocked === null && (
          <div className="gd-locked gd-locked-checking">
            <span className="gd-spinner" aria-hidden="true" />
            <p className="gd-locked-copy">Checking graduation status…</p>
          </div>
        )}

        {unlocked && (
          <>
            <div className="gd-fireworks" aria-hidden="true">
              {confettiFired && [0, 1, 2, 3, 4].map((i) => (
                <span className={`gd-firework gd-firework-${i}`} key={i} />
              ))}
            </div>

            <div className="gd-confetti-field" aria-hidden="true">
              {confettiFired &&
                confettiPieces.map((p) => (
                  <span
                    key={p.id}
                    className="gd-confetti-piece"
                    style={{
                      left: `${p.left}%`,
                      width: `${p.size}px`,
                      height: `${p.size * 0.4}px`,
                      background: p.color,
                      borderRadius: p.shape,
                      animationDelay: `${p.delay}s`,
                      animationDuration: `${p.duration}s`,
                      "--gd-drift": `${p.drift}px`,
                      "--gd-rot": `${p.rotate}deg`,
                    }}
                  />
                ))}
            </div>

            <div className="gd-certificate">
              <div className="gd-certificate-corner gd-cc-tl" aria-hidden="true" />
              <div className="gd-certificate-corner gd-cc-tr" aria-hidden="true" />
              <div className="gd-certificate-corner gd-cc-bl" aria-hidden="true" />
              <div className="gd-certificate-corner gd-cc-br" aria-hidden="true" />

              <div className="gd-certificate-seal">🎓</div>
              <p className="gd-certificate-eyebrow">Certificate of Completion</p>
              <h3 className="gd-certificate-name">{student?.name || "[STUDENT NAME]"}</h3>
              <div className="gd-certificate-rule" />
              <p className="gd-certificate-line">has successfully completed</p>
              <p className="gd-certificate-program">AI &amp; Technology Summer Camp 2026</p>

              <div className="gd-certificate-footer">
                <div className="gd-certificate-sig">
                  <span className="gd-certificate-sig-line" />
                  <span>Ravilletech Academy</span>
                </div>
                <div className="gd-certificate-stamp">VERIFIED ✦ 2026</div>
              </div>
            </div>

            <button
              className="gd-certificate-download"
              onClick={handleDownloadCertificate}
              disabled={downloadingCert}
            >
              {downloadingCert ? "Preparing…" : "⬇️ Download Certificate (PDF)"}
            </button>
            {certDownloadError && <p className="gd-cert-download-error">{certDownloadError}</p>}

            <p className="gd-moment-name-shout">
              Nice work{firstName ? `, ${firstName}` : ""}. Seriously. You did all of this. 🔥
            </p>

            {/* ── Off-screen PDF export template ─────────────────────
                Never shown on the page — rasterized by html2canvas only.
                Styled independently from the on-screen glass card so the
                downloaded PDF reads like a real printed certificate. ── */}
            <div className="gd-cert-pdf-offstage" aria-hidden="true">
              <div className="gd-cert-pdf-template" ref={pdfCertRef}>
                <div className="gd-cert-pdf-border">
                  <div className="gd-cert-pdf-corner gd-cert-pdf-tl" />
                  <div className="gd-cert-pdf-corner gd-cert-pdf-tr" />
                  <div className="gd-cert-pdf-corner gd-cert-pdf-bl" />
                  <div className="gd-cert-pdf-corner gd-cert-pdf-br" />

                  <div className="gd-cert-pdf-seal">🎓</div>
                  <p className="gd-cert-pdf-eyebrow">Ravilletech Academy</p>
                  <h1 className="gd-cert-pdf-title">Certificate of Completion</h1>
                  <div className="gd-cert-pdf-rule" />

                  <p className="gd-cert-pdf-presented">This certificate is proudly presented to</p>
                  <h2 className="gd-cert-pdf-name">{student?.name || "Student Name"}</h2>

                  <p className="gd-cert-pdf-body">
                    for successfully completing the
                  </p>
                  <p className="gd-cert-pdf-track">{CERTIFICATE_TRACK}</p>

                  <div className="gd-cert-pdf-footer">
                    <div className="gd-cert-pdf-sig">
                      <span className="gd-cert-pdf-sig-line" />
                      <span className="gd-cert-pdf-sig-label">Program Director</span>
                    </div>
                    <div className="gd-cert-pdf-stamp">
                      <span>VERIFIED</span>
                      <span className="gd-cert-pdf-stamp-year">2026</span>
                    </div>
                    <div className="gd-cert-pdf-sig">
                      <span className="gd-cert-pdf-sig-line" />
                      <span className="gd-cert-pdf-sig-label">Date</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      {/* ── WHAT'S NEXT ───────────────────────────────────────────── */}
      <section
        className={`gd-section gd-next ${revealed.next ? "gd-revealed" : ""}`}
        ref={setRevealRef("next")}
        data-reveal-key="next"
      >
        <h2 className="gd-next-title">THIS ISN'T THE END.</h2>
        <p className="gd-next-sub">The camp is over. The building isn't.</p>
        <div className="gd-next-chain">
          {["Learn", "Build", "Create", "Invent"].map((step, i) => (
            <span className="gd-next-step" key={step} style={{ "--gd-i": i }}>
              {step}
              {i < 3 && <span className="gd-next-arrow">→</span>}
            </span>
          ))}
        </div>
      </section>

      {/* ── FINAL CTA ─────────────────────────────────────────────── */}
      <section className="gd-final">
        <h2 className="gd-final-title">WELCOME TO YOUR NEXT CHAPTER.</h2>
        <button className="gd-final-cta" onClick={() => navigate("/dashboard")}>
          🚀 KEEP BUILDING
        </button>
      </section>
    </div>
  );
}