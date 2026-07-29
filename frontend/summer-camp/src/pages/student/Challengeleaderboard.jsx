import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getChallenge, getChallengeLeaderboard } from "../../api/client";
import StudentLayout from "./StudentLayout";
import Avatar from "../../components/Avatar";
import "./student.css";

export default function ChallengeLeaderboard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [challenge, setChallenge] = useState(null);
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([getChallenge(id), getChallengeLeaderboard(id)])
      .then(([c, b]) => {
        setChallenge(c);
        setBoard(b);
      })
      .catch((err) => setError(err.data?.detail || "Couldn't load leaderboard."))
      .finally(() => setLoading(false));
  }, [id]);

  // Keep polling while the challenge is still live — this is what catches
  // the moment the deadline passes and finalization happens. If the
  // current student turns out to be the champion, getChallengeLeaderboard's
  // response will include new_badges, which client.js auto-publishes to
  // the badge queue — so the Hall of Fame modal fires without a reload.
  useEffect(() => {
    if (!board || board.is_finalized) return;
    const interval = setInterval(() => {
      getChallengeLeaderboard(id).then(setBoard).catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, [id, board?.is_finalized]);

  const getRankBadge = (rank, isChampion) => {
    if (isChampion || rank === 1) return <span className="lb-rank-badge lb-rank-1">👑 #1</span>;
    if (rank === 2) return <span className="lb-rank-badge lb-rank-2">🥈 #2</span>;
    if (rank === 3) return <span className="lb-rank-badge lb-rank-3">🥉 #3</span>;
    return <span className="lb-rank-badge lb-rank-other">#{rank}</span>;
  };

  return (
    <StudentLayout title="🏆 Leaderboard">
      {loading && (
        <div className="s-loading">
          <span className="spinner spinner-dark" />
          <span>Loading leaderboard...</span>
        </div>
      )}
      {error && <div className="s-error">⚠️ {error}</div>}

      {!loading && !error && board && (
        <div className="lb-wrapper">
          {/* Header Card */}
          <div className="s-card lb-header-card">
            <div className="s-card-top">
              <div>
                <span className="lb-subtitle">CHALLENGE LEADERBOARD</span>
                <h3 className="lb-title">{challenge?.title}</h3>
              </div>
              <button className="sd-link s-back-btn" onClick={() => navigate("/challenges")}>
                ← Back to Challenges
              </button>
            </div>

            {board.is_finalized ? (
              board.champion_id ? (
                <div className="lb-banner lb-banner-champion">
                  <span className="lb-banner-icon">🌌</span>
                  <div>
                    <strong>Hall of Fame Champion Locked!</strong>
                    <p>
                      <strong>{board.champion_name}</strong> conquered this challenge and earned the legendary Hall of Fame badge!
                    </p>
                  </div>
                </div>
              ) : (
                <div className="lb-banner lb-banner-ended">
                  <span className="lb-banner-icon">🏁</span>
                  <div>
                    <strong>Challenge Ended</strong>
                    <p>This challenge ended with no completions — no champion was crowned.</p>
                  </div>
                </div>
              )
            ) : (
              <div className="lb-banner lb-banner-live">
                <span className="lb-banner-icon">🔥</span>
                <div>
                  <strong>
                    {board.results?.[0]?.is_current_student
                      ? "You're currently #1!"
                      : "Live Battle in Progress!"}
                  </strong>
                  <p>
                    {board.results?.[0]?.is_current_student
                      ? "Nobody's beaten your score yet — but standings can still shift until the deadline. The Hall of Fame badge only locks in for good once the challenge ends."
                      : "Standings can shift until the deadline. The Hall of Fame badge is only awarded once the challenge officially ends — not before."}
                    {challenge?.end_date && (
                      <> Ends <strong>{new Date(challenge.end_date).toLocaleString()}</strong>.</>
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Standings Table Card */}
          <div className="s-card lb-table-card">
            {board.results.length === 0 ? (
              <div className="s-empty">
                <div className="s-empty-icon">⚔️</div>
                <p>No completions yet. Be the first to claim the top spot!</p>
              </div>
            ) : (
              <div className="lb-table-responsive">
                <table className="lb-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Student</th>
                      <th>Score</th>
                      <th>Time Taken</th>
                    </tr>
                  </thead>
                  <tbody>
                    {board.results.map((row) => {
                      const isPodium = row.rank <= 3;
                      return (
                        <tr
                          key={row.id}
                          className={`lb-tr ${row.is_current_student ? "lb-row-me" : ""} ${
                            row.is_champion ? "lb-row-champion" : ""
                          } ${isPodium ? `lb-row-top-${row.rank}` : ""}`}
                        >
                          <td className="lb-td-rank">
                            {getRankBadge(row.rank, row.is_champion)}
                          </td>
                          <td className="lb-td-student">
                            <span className="lb-student-name" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                              <Avatar avatarKey={row.student_avatar} size={18} />
                              {row.student_name}
                            </span>
                            {row.is_current_student && <span className="lb-you-tag">YOU</span>}
                            {row.is_champion && <span className="lb-hof-tag">HALL OF FAME</span>}
                          </td>
                          <td className="lb-td-score">
                            <div className="lb-acc-pill">{row.accuracy}%</div>
                          </td>
                          <td className="lb-td-time">{row.time_taken}s</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </StudentLayout>
  );
}