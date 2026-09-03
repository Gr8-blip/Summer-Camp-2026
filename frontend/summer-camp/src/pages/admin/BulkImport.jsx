import { useState } from "react";
import {
  adminCreateLostGridRound,
  adminCreateLostGridQuestion,
} from "../../api/client";

/**
 * Drop this component anywhere inside MissionBuilder (e.g. as a new tab
 * next to your round list) and pass it the current `missionId`.
 *
 * Expected JSON shape (paste an array of rounds):
 *
 * [
 *   {
 *     "title": "⚡ Quick Fire",
 *     "icon": "⚡",
 *     "xp_reward": 50,
 *     "coin_reward": 10,
 *     "questions": [
 *       {
 *         "question_type": "multiple_choice",
 *         "points": 10,
 *         "time_limit": 20,          // optional, omit/null = no limit
 *         "content": {
 *           "question": "What does HTML stand for?",
 *           "options": ["HyperText Markup Language", "High-Tech Modern Language"],
 *           "answer": "HyperText Markup Language"
 *         }
 *       }
 *     ]
 *   }
 * ]
 *
 * It creates each round via adminCreateLostGridRound, then loops its
 * questions via adminCreateLostGridQuestion (order = array index).
 * Everything runs sequentially so you get a clean per-item log and a
 * partial import doesn't silently vanish if one question is malformed —
 * it just gets flagged and the rest keep going.
 */
export default function BulkImport({ missionId, onDone }) {
  const [raw, setRaw] = useState("");
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(false);
  const [parseError, setParseError] = useState("");

  function pushLog(line, tone = "info") {
    setLog((l) => [...l, { line, tone, id: l.length }]);
  }

  function validate(rounds) {
    if (!Array.isArray(rounds)) throw new Error("Top level JSON must be an array of rounds.");
    rounds.forEach((r, i) => {
      if (!r.title) throw new Error(`Round ${i + 1} is missing a "title".`);
      if (!Array.isArray(r.questions)) throw new Error(`Round "${r.title}" needs a "questions" array.`);
      r.questions.forEach((q, qi) => {
        if (!q.question_type) throw new Error(`Round "${r.title}", question ${qi + 1} is missing "question_type".`);
        if (!q.content || typeof q.content !== "object") {
          throw new Error(`Round "${r.title}", question ${qi + 1} is missing "content".`);
        }
      });
    });
  }

  async function handleImport() {
    setParseError("");
    setLog([]);
    let rounds;
    try {
      rounds = JSON.parse(raw);
      validate(rounds);
    } catch (err) {
      setParseError(err.message);
      return;
    }

    setRunning(true);
    let roundsOk = 0, questionsOk = 0, questionsFailed = 0;

    for (const round of rounds) {
      let createdRound;
      try {
        createdRound = await adminCreateLostGridRound(missionId, {
          title: round.title,
          icon: round.icon || "⚡",
          xp_reward: round.xp_reward || 0,
          coin_reward: round.coin_reward || 0,
          order: round.order ?? rounds.indexOf(round),
        });
        roundsOk += 1;
        pushLog(`✅ Round created: ${round.title} (${round.questions.length} questions)`, "good");
      } catch (err) {
        pushLog(`❌ Round FAILED: ${round.title} — ${err.message || err}`, "bad");
        continue; // can't add questions to a round that didn't get created
      }

      for (let qi = 0; qi < round.questions.length; qi++) {
        const q = round.questions[qi];
        try {
          await adminCreateLostGridQuestion(createdRound.id, {
            question_type: q.question_type,
            points: q.points ?? 10,
            content: q.content,
            order: qi,
            time_limit: q.time_limit ?? null,
          });
          questionsOk += 1;
        } catch (err) {
          questionsFailed += 1;
          pushLog(
            `   ⚠️ Q${qi + 1} (${q.question_type}) in "${round.title}" failed — ${err.message || err}`,
            "warn"
          );
        }
      }
    }

    pushLog(
      `🏁 Done: ${roundsOk}/${rounds.length} rounds, ${questionsOk} questions imported, ${questionsFailed} failed.`,
      "good"
    );
    setRunning(false);
    onDone?.();
  }

  return (
    <div className="gb-card">
      <div className="gb-form-heading">
        <span>📥</span>
        <div>
          <h2>Bulk Import (JSON)</h2>
          <p>Paste an array of rounds + questions and it'll create everything for this mission in order.</p>
        </div>
      </div>

      <div className="gb-advanced">
        <label>Rounds JSON</label>
        <textarea
          rows={16}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder='[{ "title": "⚡ Quick Fire", "questions": [ ... ] }]'
        />
      </div>

      {parseError && <div className="gb-message gb-message-bad">{parseError}</div>}

      <div className="gb-save-row">
        <button className="btn" disabled={running || !raw.trim()} onClick={handleImport}>
          {running ? "Importing…" : "Import Rounds"}
        </button>
      </div>

      {log.length > 0 && (
        <div className="gb-empty" style={{ textAlign: "left", marginTop: 16, maxHeight: 260, overflowY: "auto" }}>
          {log.map((entry) => (
            <div
              key={entry.id}
              style={{
                fontFamily: "ui-monospace, Menlo, Consolas, monospace",
                fontSize: ".8rem",
                marginBottom: 4,
                color: entry.tone === "bad" ? "#a51c2c" : entry.tone === "warn" ? "#8a5a00" : "#16734e",
              }}
            >
              {entry.line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}