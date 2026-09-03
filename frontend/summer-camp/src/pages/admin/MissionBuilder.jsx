import { useEffect, useState } from "react";
import {
  adminGetMissions, adminUpdateMission,
  adminGetLostGridRounds, adminCreateLostGridRound, adminUpdateLostGridRound, adminDeleteLostGridRound,
  adminGetLostGridQuestions, adminCreateLostGridQuestion, adminUpdateLostGridQuestion, adminDeleteLostGridQuestion,
  adminQuestionCatalog,
} from "../../api/client";
import AdminLayout from "./AdminLayout";
import InteractiveCodingEditor from "../../editors/InteractiveCodingEditor";
import AdminCodingChallengeEditor from "../../editors/Admincodingchallengeeditor";
import ProjectSubmissionEditor from "../../editors/ProjectSubmissionEditor";
import "./MissionBuilder.css";

// Same 11 types ChallengeQuestion supports. `example` is the default content
// dropped in when an admin picks that type for a brand-new question.
const TYPES = {
  multiple_choice: ["❓", "Multiple Choice", { question: "What does HTML stand for?", options: ["HyperText Markup Language", "High-Tech Modern Language"], answer: "HyperText Markup Language" }],
  true_false: ["✅", "True / False", { question: "CSS is used to style web pages.", answer: true }],
  drag_order: ["🔀", "Drag Order", { question: "Put these in order.", items: ["First", "Second", "Third"] }],
  match_pairs: ["🔗", "Match Pairs", { question: "Match the term to its meaning.", pairs: { HTML: "Structure", CSS: "Style" } }],
  fill_blank: ["✏️", "Fill in the Blank", { question: "The ___ tag creates a link.", answer: "a" }],
  prompt_build: ["🤖", "Prompt Build", { task: "Write a prompt that asks an AI to summarize an article." }],
  memory_tiles: ["🧠", "Memory Tiles", { pairs: [["HTML", "Structure"], ["CSS", "Style"]] }],
  word_search: ["🔎", "Word Search", { words: ["HTML", "CSS", "JS"] }],
  image_reveal: ["🖼️", "Image Reveal", { question: "What is shown in the image?", answer: "cat" }],
  interactive_coding: ["💻", "Interactive Coding", { instruction: "Make the h1 say 'Hello'.", languages: ["html"], files: [{ path: "index.html", content: "<h1></h1>" }], checks: [{ type: "element_text", selector: "h1", expected: "Hello" }] }],
  coding_challenge: ["🧩", "Coding Challenge", { instruction: "Style the button blue.", languages: ["html", "css"], files: [], checks: [] }],
  project_submission: ["🚀", "Project Submission", { instruction: "Submit your finished site.", submission: { url: true, zip: true }, checks: [] }],
};

// These three question types get their real, purpose-built editors
// (same components + {content, onChange} contract the Challenge/Quest
// builder uses) instead of the plain-field TypeForm below — their content
// shape (files, checks, submission targets) isn't a handful of text
// fields, it's a small structured builder in its own right.
const RICH_EDITORS = {
  interactive_coding: InteractiveCodingEditor,
  coding_challenge: AdminCodingChallengeEditor,
  project_submission: ProjectSubmissionEditor,
};

const ROUND_EMPTY = { title: "", icon: "⚡", xp_reward: 0, coin_reward: 0 };

// ── content <-> friendly form state, per type ───────────────────────────────
function stateFromContent(type, content = {}) {
  switch (type) {
    case "multiple_choice": {
      const options = content.options?.length ? content.options : ["", ""];
      const correctIndex = Math.max(0, options.indexOf(content.answer));
      return { question: content.question || "", options, correctIndex };
    }
    case "true_false":
      return { question: content.question || "", answer: content.answer !== false };
    case "fill_blank":
      return { question: content.question || "", answer: content.answer || "" };
    case "prompt_build":
      return { task: content.task || "" };
    case "image_reveal":
      return { question: content.question || "", answer: content.answer || "" };
    case "match_pairs":
      return {
        question: content.question || "",
        pairs: content.pairs && Object.keys(content.pairs).length
          ? Object.entries(content.pairs).map(([term, meaning]) => ({ term, meaning }))
          : [{ term: "", meaning: "" }, { term: "", meaning: "" }],
      };
    case "drag_order":
      return { question: content.question || "", items: content.items?.length ? content.items : ["", "", ""] };
    case "memory_tiles":
      return {
        pairs: content.pairs?.length
          ? content.pairs.map(([a, b]) => ({ a, b }))
          : [{ a: "", b: "" }, { a: "", b: "" }],
      };
    case "word_search":
      return { words: content.words?.length ? content.words : ["", "", ""] };
    default:
      return {};
  }
}

function contentFromState(type, s) {
  switch (type) {
    case "multiple_choice": {
      const options = s.options.map((o) => o.trim()).filter(Boolean);
      const answer = s.options[s.correctIndex]?.trim();
      return { question: s.question.trim(), options, answer };
    }
    case "true_false":
      return { question: s.question.trim(), answer: !!s.answer };
    case "fill_blank":
      return { question: s.question.trim(), answer: s.answer.trim() };
    case "prompt_build":
      return { task: s.task.trim() };
    case "image_reveal":
      return { question: s.question.trim(), answer: s.answer.trim() };
    case "match_pairs":
      return {
        question: s.question.trim(),
        pairs: Object.fromEntries(
          s.pairs.filter((p) => p.term.trim() && p.meaning.trim()).map((p) => [p.term.trim(), p.meaning.trim()])
        ),
      };
    case "drag_order":
      return { question: s.question.trim(), items: s.items.map((i) => i.trim()).filter(Boolean) };
    case "memory_tiles":
      return { pairs: s.pairs.filter((p) => p.a.trim() && p.b.trim()).map((p) => [p.a.trim(), p.b.trim()]) };
    case "word_search":
      return { words: s.words.map((w) => w.trim().toUpperCase()).filter(Boolean) };
    default:
      return {};
  }
}

function validateState(type, s) {
  switch (type) {
    case "multiple_choice":
      if (!s.question.trim()) return "Add the question text.";
      if (s.options.filter((o) => o.trim()).length < 2) return "Add at least 2 answer options.";
      if (!s.options[s.correctIndex]?.trim()) return "Pick which option is correct.";
      return null;
    case "true_false":
      if (!s.question.trim()) return "Add the statement to judge true or false.";
      return null;
    case "fill_blank":
      if (!s.question.trim()) return "Add the sentence, with ___ where the blank goes.";
      if (!s.answer.trim()) return "Add the correct answer for the blank.";
      return null;
    case "prompt_build":
      if (!s.task.trim()) return "Describe the prompting task.";
      return null;
    case "image_reveal":
      if (!s.question.trim()) return "Add the question shown with the image.";
      if (!s.answer.trim()) return "Add the correct answer.";
      return null;
    case "match_pairs":
      if (!s.question.trim()) return "Add the instruction text.";
      if (s.pairs.filter((p) => p.term.trim() && p.meaning.trim()).length < 2) return "Add at least 2 complete pairs.";
      return null;
    case "drag_order":
      if (!s.question.trim()) return "Add the instruction text.";
      if (s.items.map((i) => i.trim()).filter(Boolean).length < 2) return "Add at least 2 items to order.";
      return null;
    case "memory_tiles":
      if (s.pairs.filter((p) => p.a.trim() && p.b.trim()).length < 2) return "Add at least 2 complete pairs.";
      return null;
    case "word_search":
      if (s.words.map((w) => w.trim()).filter(Boolean).length < 1) return "Add at least 1 word to hide in the grid.";
      return null;
    default:
      return null;
  }
}

export default function MissionBuilder() {
  const [missions, setMissions] = useState([]);
  const [missionId, setMissionId] = useState("");
  const [mission, setMission] = useState(null);
  const [rounds, setRounds] = useState([]);
  const [activeRoundId, setActiveRoundId] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [message, setMessage] = useState(null); // { text, tone }
  const [roundForm, setRoundForm] = useState(ROUND_EMPTY);
  const [editingRoundId, setEditingRoundId] = useState(null);
  const [savingRound, setSavingRound] = useState(false);

  const reloadMissions = () => adminGetMissions().then(setMissions);
  const reloadRounds = () => missionId && adminGetLostGridRounds(missionId).then(setRounds);

  const flash = (text, tone = "good") => setMessage({ text, tone });

  useEffect(() => { reloadMissions(); adminQuestionCatalog().then(setCatalog); }, []);
  useEffect(() => { reloadRounds(); setActiveRoundId(null); }, [missionId]); // eslint-disable-line
  useEffect(() => { setMission(missions.find((m) => m.id === Number(missionId)) || null); }, [missions, missionId]);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 4500);
    return () => clearTimeout(t);
  }, [message]);

  const activate = async () => {
    await adminUpdateMission(missionId, { game_active: true });
    reloadMissions();
    flash("✓ QuizGrid activated for students.");
  };

  const saveRound = async () => {
    if (!roundForm.title.trim()) return flash("Give the round a title first.", "warn");
    setSavingRound(true);
    try {
      if (editingRoundId) await adminUpdateLostGridRound(editingRoundId, roundForm);
      else await adminCreateLostGridRound(missionId, { ...roundForm, order: rounds.length });
      flash(editingRoundId ? "✓ Round updated." : "✓ Round added.");
      setEditingRoundId(null);
      setRoundForm(ROUND_EMPTY);
      reloadRounds();
    } finally {
      setSavingRound(false);
    }
  };

  const editRound = (round) => {
    setEditingRoundId(round.id);
    setRoundForm({ title: round.title, icon: round.icon, xp_reward: round.xp_reward, coin_reward: round.coin_reward });
  };

  const moveRound = async (round, dir) => {
    const idx = rounds.findIndex((r) => r.id === round.id);
    const swapWith = rounds[idx + dir];
    if (!swapWith) return;
    await Promise.all([
      adminUpdateLostGridRound(round.id, { order: swapWith.order }),
      adminUpdateLostGridRound(swapWith.id, { order: round.order }),
    ]);
    reloadRounds();
  };

  const removeRound = async (round) => {
    if (!window.confirm(`Remove "${round.title}"? This deletes all questions in it too.`)) return;
    await adminDeleteLostGridRound(round.id);
    if (activeRoundId === round.id) setActiveRoundId(null);
    reloadRounds();
  };

  const activeRound = rounds.find((r) => r.id === activeRoundId);
  const totalQuestions = rounds.reduce((sum, r) => sum + r.questions.length, 0);

  return (
    <AdminLayout title="🧠 QuizGrid Builder">
      <div className="grid-builder">
        <section className="gb-intro">
          <div className="gb-intro-icon">🕹️</div>
          <div>
            <h2>Build the QuizGrid arena</h2>
            <p>Group questions into rounds. Students play through them in order, game-show style — no code required to write a question.</p>
          </div>
        </section>

        <section className="gb-card gb-mission-picker">
          <div>
            <label>1. Choose a mission</label>
            <select value={missionId} onChange={(e) => setMissionId(e.target.value)}>
              <option value="">Select a Week 6 mission</option>
              {missions.map((m) => <option key={m.id} value={m.id}>Week {m.week} — {m.title}</option>)}
            </select>
            <small>Activate once at least one round has questions.</small>
          </div>
          <div className="gb-mission-status">
            {missionId && (
              <span className={`gb-status-pill ${mission?.game_active ? "live" : totalQuestions ? "ready" : "empty"}`}>
                {mission?.game_active ? "🟢 Live" : totalQuestions ? `🟡 ${totalQuestions} question${totalQuestions === 1 ? "" : "s"} ready` : "⚪ No questions yet"}
              </span>
            )}
            <button className="btn btn-primary" disabled={!missionId || mission?.game_active || !totalQuestions} onClick={activate}>
              {mission?.game_active ? "✓ Live for students" : "🚀 Activate QuizGrid"}
            </button>
          </div>
        </section>

        {message && <div className={`gb-message gb-message-${message.tone}`}>{message.text}</div>}

        {missionId && (
          <>
            <section className="gb-card">
              <h2>2. Rounds</h2>
              <p>Each round is a themed batch of questions — e.g. "⚡ Quick Fire" or "🔥 Final Round".</p>

              {rounds.length ? (
                <div className="gb-round-list">
                  {rounds.map((round, i) => (
                    <div key={round.id} className={`gb-round-row ${activeRoundId === round.id ? "active" : ""}`}>
                      <span className="gb-round-icon">{round.icon}</span>
                      <div className="gb-round-info" onClick={() => setActiveRoundId(round.id === activeRoundId ? null : round.id)}>
                        <strong>Round {i + 1} — {round.title}</strong>
                        <p>{round.questions.length} question{round.questions.length === 1 ? "" : "s"} · +{round.xp_reward} XP / {round.coin_reward} coins</p>
                      </div>
                      <div className="gb-round-actions">
                        <button className="btn btn-secondary" title="Move up" disabled={i === 0} onClick={() => moveRound(round, -1)}>▲</button>
                        <button className="btn btn-secondary" title="Move down" disabled={i === rounds.length - 1} onClick={() => moveRound(round, 1)}>▼</button>
                        <button className="btn btn-secondary" title="Edit round" onClick={() => editRound(round)}>✏️</button>
                        <button className="btn btn-danger" onClick={() => removeRound(round)}>Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <div className="gb-empty">🧩 No rounds yet — add your first one below.</div>}

              <div className="gb-round-form">
                <label>Round title<input value={roundForm.title} onChange={(e) => setRoundForm((f) => ({ ...f, title: e.target.value }))} placeholder="Quick Fire" /></label>
                <label>Icon<input value={roundForm.icon} onChange={(e) => setRoundForm((f) => ({ ...f, icon: e.target.value }))} placeholder="⚡" /></label>
                <label>Bonus XP<input type="number" min="0" value={roundForm.xp_reward} onChange={(e) => setRoundForm((f) => ({ ...f, xp_reward: Number(e.target.value) || 0 }))} /></label>
                <label>Bonus coins<input type="number" min="0" value={roundForm.coin_reward} onChange={(e) => setRoundForm((f) => ({ ...f, coin_reward: Number(e.target.value) || 0 }))} /></label>
                <button className="btn btn-primary" disabled={savingRound} onClick={saveRound}>
                  {savingRound ? "…" : editingRoundId ? "💾 Save round" : "✨ Add round"}
                </button>
                {editingRoundId && <button className="btn btn-secondary" onClick={() => { setEditingRoundId(null); setRoundForm(ROUND_EMPTY); }}>Cancel</button>}
              </div>
            </section>

            {activeRound && (
              <RoundQuestions
                round={activeRound}
                catalog={catalog}
                onChanged={reloadRounds}
                flash={flash}
              />
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}

function RoundQuestions({ round, catalog, onChanged, flash }) {
  const [mode, setMode] = useState("bank"); // "bank" | "new"
  const [bankPick, setBankPick] = useState("");
  const [bankTimeLimit, setBankTimeLimit] = useState("");
  const [newType, setNewType] = useState("multiple_choice");
  const [points, setPoints] = useState(10);
  const [timeLimit, setTimeLimit] = useState("");
  const [formState, setFormState] = useState(() => stateFromContent("multiple_choice", TYPES.multiple_choice[2]));
  const [richContent, setRichContent] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const RichEditor = RICH_EDITORS[newType];

  const pickType = (type) => {
    setNewType(type);
    if (RICH_EDITORS[type]) setRichContent(TYPES[type][2]);
    else setFormState(stateFromContent(type, TYPES[type][2]));
  };

  const addFromBank = async () => {
    if (!bankPick) return flash("Pick a question first.", "warn");
    const [kind, rawId] = bankPick.split(":");
    const id = Number(rawId);
    const payload = kind === "assignment"
      ? { clone_from_assignment_question: id, order: round.questions.length }
      : { source_question: id, order: round.questions.length };
    payload.time_limit = bankTimeLimit ? Number(bankTimeLimit) : null;
    try {
      await adminCreateLostGridQuestion(round.id, payload);
      setBankPick("");
      setBankTimeLimit("");
      flash(kind === "assignment" ? "✓ Question copied in from that Quest." : "✓ Question added from the Challenge bank.");
      onChanged();
    } catch (err) {
      flash(err.data?.detail || "Couldn't add that question.", "bad");
    }
  };

  // Group by week so admins can find "everything already written for
  // Week 6" instead of scrolling one long flat list — questions can come
  // from either a Challenge or a Quest for that same week.
  const byWeek = catalog.reduce((acc, q) => {
    const key = q.week == null ? "No week" : `Week ${q.week}`;
    (acc[key] ||= []).push(q);
    return acc;
  }, {});

  const selectedBankQuestion = bankPick
    ? catalog.find((q) => `${q.kind}:${q.id}` === bankPick)
    : null;

  const resetNewForm = () => {
    setEditingId(null);
    setTimeLimit("");
    if (RICH_EDITORS[newType]) setRichContent(TYPES[newType][2]);
    else setFormState(stateFromContent(newType, TYPES[newType][2]));
  };

  const saveNew = async () => {
    let content;
    if (RichEditor) {
      if (!richContent?.instruction?.trim()) return flash("Add an instruction for students.", "warn");
      content = richContent;
    } else {
      const err = validateState(newType, formState);
      if (err) return flash(err, "warn");
      content = contentFromState(newType, formState);
    }
    setSaving(true);
    const payload = {
      question_type: newType,
      points: Number(points) || 10,
      time_limit: timeLimit ? Number(timeLimit) : null,
      content,
      order: round.questions.length,
    };
    try {
      if (editingId) await adminUpdateLostGridQuestion(editingId, payload);
      else await adminCreateLostGridQuestion(round.id, payload);
      flash(editingId ? "✓ Question updated." : "✓ Question added.");
      resetNewForm();
      onChanged();
    } catch (err) {
      flash(err.data?.detail || Object.values(err.data || {})[0] || "Couldn't save that question.", "bad");
    } finally {
      setSaving(false);
    }
  };

  const editQuestion = (q) => {
    if (q.source_question) return flash("Bank-linked questions are edited from the question bank itself.", "warn");
    setMode("new");
    setEditingId(q.id);
    setNewType(q.question_type);
    setPoints(q.points);
    setTimeLimit(q.time_limit ? String(q.time_limit) : "");
    if (RICH_EDITORS[q.question_type]) setRichContent(q.content);
    else setFormState(stateFromContent(q.question_type, q.content));
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  };

  const removeQuestion = async (q) => {
    if (!window.confirm("Remove this question from the round?")) return;
    await adminDeleteLostGridQuestion(q.id);
    onChanged();
  };

  return (
    <section className="gb-card">
      <h2>3. Questions in "{round.title}"</h2>

      {round.questions.length ? (
        <div className="gb-object-list">
          {round.questions.map((q, i) => (
            <div className="gb-object-row" key={q.id}>
              <span className="gb-object-icon">{TYPES[q.effective_type]?.[0] || "❓"}</span>
              <div>
                <strong>{i + 1}. {q.source_label || TYPES[q.effective_type]?.[1] || q.effective_type} {q.time_limit ? <span className="gb-timer-badge">⏱ {q.time_limit}s</span> : null}</strong>
                <p>{q.source_question ? "From question bank" : "Custom for this round"} · {TYPES[q.effective_type]?.[1] || q.effective_type} · {q.points} pts</p>
              </div>
              <button className="btn btn-secondary" onClick={() => editQuestion(q)}>✏️ Edit</button>
              <button className="btn btn-danger" onClick={() => removeQuestion(q)}>Remove</button>
            </div>
          ))}
        </div>
      ) : <div className="gb-empty">No questions in this round yet.</div>}

      <div className="gb-add-tabs">
        <button className={mode === "bank" ? "active" : ""} onClick={() => setMode("bank")}>📚 Use existing question</button>
        <button className={mode === "new" ? "active" : ""} onClick={() => setMode("new")}>✨ Write a new question</button>
      </div>

      {mode === "bank" ? (
        <div className="gb-bank-picker">
          <label className="gb-list-label">Search the question bank</label>
          <select className="gb-bank-select" value={bankPick} onChange={(e) => setBankPick(e.target.value)}>
            <option value="">Select a question — from any existing Challenge or Quest</option>
            {Object.entries(byWeek).map(([week, questions]) => (
              <optgroup key={week} label={week}>
                {questions.map((q) => (
                  <option key={`${q.kind}:${q.id}`} value={`${q.kind}:${q.id}`}>{q.label}</option>
                ))}
              </optgroup>
            ))}
          </select>

          {selectedBankQuestion ? (
            <div className="gb-bank-selected">
              <span className="gb-bank-selected-icon">{selectedBankQuestion.kind === "assignment" ? "🧭" : "⚡"}</span>
              <div className="gb-bank-selected-info">
                <strong>{selectedBankQuestion.label}</strong>
                <p>
                  {selectedBankQuestion.kind === "assignment" ? "From a Quest — will be copied in" : "From a Challenge — stays linked to the bank"}
                  {selectedBankQuestion.week != null ? ` · Week ${selectedBankQuestion.week}` : ""}
                </p>
                <label className="gb-bank-timer-field">⏱ Time limit (seconds, optional)
                  <input type="number" min="1" placeholder="No limit" value={bankTimeLimit} onChange={(e) => setBankTimeLimit(e.target.value)} />
                </label>
              </div>
              <button className="btn btn-primary" onClick={addFromBank}>Add to round</button>
            </div>
          ) : (
            <p className="gb-bank-note">Pick a question above to see a preview here, then add it to this round.</p>
          )}
        </div>
      ) : (
        <div className="gb-new-question">
          <div className="gb-type-grid">
            {Object.entries(TYPES).map(([key, [icon, label]]) => (
              <button key={key} className={`gb-type ${newType === key ? "active" : ""}`} onClick={() => pickType(key)}>
                <span>{icon}</span><strong>{label}</strong>
              </button>
            ))}
          </div>

          <div className="gb-points-row">
            <label>Points this question is worth
              <input type="number" min="1" value={points} onChange={(e) => setPoints(e.target.value)} />
            </label>
            <label>⏱ Time limit (seconds, optional)
              <input type="number" min="1" placeholder="No limit" value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} />
              <small>Students see a countdown. Running out auto-skips the question and counts it wrong.</small>
            </label>
          </div>

          {RichEditor ? (
            <div className="gb-rich-editor">
              <RichEditor content={richContent || TYPES[newType][2]} onChange={setRichContent} />
            </div>
          ) : (
            <TypeForm type={newType} state={formState} setState={setFormState} />
          )}

          <div className="gb-save-row">
            <button className="btn btn-primary" disabled={saving} onClick={saveNew}>
              {saving ? "…" : editingId ? "💾 Save changes" : "✨ Add question"}
            </button>
            {editingId && <button className="btn btn-secondary" onClick={resetNewForm}>Cancel edit</button>}
          </div>
        </div>
      )}
    </section>
  );
}

// ── Friendly, no-JSON editors — one per simple question type ───────────────
function TypeForm({ type, state, setState }) {
  const set = (patch) => setState((s) => ({ ...s, ...patch }));

  switch (type) {
    case "multiple_choice":
      return (
        <div className="gb-simple-form">
          <label>Question
            <input value={state.question} onChange={(e) => set({ question: e.target.value })} placeholder="What does HTML stand for?" />
          </label>
          <label className="gb-list-label">Answer options <small>— tap the circle next to the correct one</small></label>
          <div className="gb-option-list">
            {state.options.map((opt, i) => (
              <div className="gb-option-row" key={i}>
                <button
                  type="button"
                  className={`gb-correct-dot ${state.correctIndex === i ? "checked" : ""}`}
                  title="Mark as correct answer"
                  onClick={() => set({ correctIndex: i })}
                >{state.correctIndex === i ? "✓" : ""}</button>
                <input
                  value={opt}
                  placeholder={`Option ${i + 1}`}
                  onChange={(e) => {
                    const options = [...state.options]; options[i] = e.target.value; set({ options });
                  }}
                />
                {state.options.length > 2 && (
                  <button type="button" className="gb-remove-x" title="Remove option" onClick={() => {
                    const options = state.options.filter((_, x) => x !== i);
                    const correctIndex = state.correctIndex === i ? 0 : state.correctIndex > i ? state.correctIndex - 1 : state.correctIndex;
                    set({ options, correctIndex });
                  }}>✕</button>
                )}
              </div>
            ))}
          </div>
          {state.options.length < 6 && (
            <button type="button" className="btn btn-secondary gb-add-row" onClick={() => set({ options: [...state.options, ""] })}>+ Add option</button>
          )}
        </div>
      );

    case "true_false":
      return (
        <div className="gb-simple-form">
          <label>Statement
            <input value={state.question} onChange={(e) => set({ question: e.target.value })} placeholder="CSS is used to style web pages." />
          </label>
          <label className="gb-list-label">Correct answer</label>
          <div className="gb-toggle-pair">
            <button type="button" className={`gb-toggle ${state.answer ? "active" : ""}`} onClick={() => set({ answer: true })}>✅ True</button>
            <button type="button" className={`gb-toggle ${!state.answer ? "active" : ""}`} onClick={() => set({ answer: false })}>❌ False</button>
          </div>
        </div>
      );

    case "fill_blank":
      return (
        <div className="gb-simple-form">
          <label>Sentence with a blank
            <input value={state.question} onChange={(e) => set({ question: e.target.value })} placeholder="The ___ tag creates a link." />
            <small>Use three underscores <code>___</code> where the missing word goes.</small>
          </label>
          <label>Correct answer
            <input value={state.answer} onChange={(e) => set({ answer: e.target.value })} placeholder="a" />
          </label>
        </div>
      );

    case "prompt_build":
      return (
        <div className="gb-simple-form">
          <label>Prompting task
            <textarea rows={4} value={state.task} onChange={(e) => set({ task: e.target.value })} placeholder="Write a prompt that asks an AI to summarize an article." />
            <small>Students will write their own AI prompt to complete this task — there's no single "correct" answer to grade.</small>
          </label>
        </div>
      );

    case "image_reveal":
      return (
        <div className="gb-simple-form">
          <label>Question shown with the image
            <input value={state.question} onChange={(e) => set({ question: e.target.value })} placeholder="What is shown in the image?" />
          </label>
          <label>Correct answer
            <input value={state.answer} onChange={(e) => set({ answer: e.target.value })} placeholder="cat" />
          </label>
        </div>
      );

    case "match_pairs":
      return (
        <div className="gb-simple-form">
          <label>Instruction
            <input value={state.question} onChange={(e) => set({ question: e.target.value })} placeholder="Match the term to its meaning." />
          </label>
          <label className="gb-list-label">Pairs to match</label>
          <div className="gb-pair-list">
            {state.pairs.map((p, i) => (
              <div className="gb-pair-row" key={i}>
                <input value={p.term} placeholder="Term (e.g. HTML)" onChange={(e) => {
                  const pairs = [...state.pairs]; pairs[i] = { ...pairs[i], term: e.target.value }; set({ pairs });
                }} />
                <span className="gb-pair-arrow">→</span>
                <input value={p.meaning} placeholder="Meaning (e.g. Structure)" onChange={(e) => {
                  const pairs = [...state.pairs]; pairs[i] = { ...pairs[i], meaning: e.target.value }; set({ pairs });
                }} />
                {state.pairs.length > 2 && (
                  <button type="button" className="gb-remove-x" onClick={() => set({ pairs: state.pairs.filter((_, x) => x !== i) })}>✕</button>
                )}
              </div>
            ))}
          </div>
          {state.pairs.length < 8 && (
            <button type="button" className="btn btn-secondary gb-add-row" onClick={() => set({ pairs: [...state.pairs, { term: "", meaning: "" }] })}>+ Add pair</button>
          )}
        </div>
      );

    case "drag_order":
      return (
        <div className="gb-simple-form">
          <label>Instruction
            <input value={state.question} onChange={(e) => set({ question: e.target.value })} placeholder="Put these in order." />
          </label>
          <label className="gb-list-label">Items <small>— listed in the correct order</small></label>
          <div className="gb-item-list">
            {state.items.map((item, i) => (
              <div className="gb-item-row" key={i}>
                <span className="gb-item-num">{i + 1}</span>
                <input value={item} placeholder={`Step ${i + 1}`} onChange={(e) => {
                  const items = [...state.items]; items[i] = e.target.value; set({ items });
                }} />
                <div className="gb-item-nudges">
                  <button type="button" disabled={i === 0} onClick={() => {
                    const items = [...state.items]; [items[i - 1], items[i]] = [items[i], items[i - 1]]; set({ items });
                  }}>▲</button>
                  <button type="button" disabled={i === state.items.length - 1} onClick={() => {
                    const items = [...state.items]; [items[i + 1], items[i]] = [items[i], items[i + 1]]; set({ items });
                  }}>▼</button>
                </div>
                {state.items.length > 2 && (
                  <button type="button" className="gb-remove-x" onClick={() => set({ items: state.items.filter((_, x) => x !== i) })}>✕</button>
                )}
              </div>
            ))}
          </div>
          {state.items.length < 8 && (
            <button type="button" className="btn btn-secondary gb-add-row" onClick={() => set({ items: [...state.items, ""] })}>+ Add item</button>
          )}
        </div>
      );

    case "memory_tiles":
      return (
        <div className="gb-simple-form">
          <label className="gb-list-label">Matching pairs <small>— each pair becomes two tiles students flip to match</small></label>
          <div className="gb-pair-list">
            {state.pairs.map((p, i) => (
              <div className="gb-pair-row" key={i}>
                <input value={p.a} placeholder="Tile A (e.g. HTML)" onChange={(e) => {
                  const pairs = [...state.pairs]; pairs[i] = { ...pairs[i], a: e.target.value }; set({ pairs });
                }} />
                <span className="gb-pair-arrow">↔</span>
                <input value={p.b} placeholder="Tile B (e.g. Structure)" onChange={(e) => {
                  const pairs = [...state.pairs]; pairs[i] = { ...pairs[i], b: e.target.value }; set({ pairs });
                }} />
                {state.pairs.length > 2 && (
                  <button type="button" className="gb-remove-x" onClick={() => set({ pairs: state.pairs.filter((_, x) => x !== i) })}>✕</button>
                )}
              </div>
            ))}
          </div>
          {state.pairs.length < 8 && (
            <button type="button" className="btn btn-secondary gb-add-row" onClick={() => set({ pairs: [...state.pairs, { a: "", b: "" }] })}>+ Add pair</button>
          )}
        </div>
      );

    case "word_search":
      return (
        <div className="gb-simple-form">
          <label className="gb-list-label">Words to hide in the grid</label>
          <div className="gb-item-list">
            {state.words.map((w, i) => (
              <div className="gb-item-row" key={i}>
                <input value={w} placeholder={`Word ${i + 1}`} onChange={(e) => {
                  const words = [...state.words]; words[i] = e.target.value; set({ words });
                }} style={{ textTransform: "uppercase" }} />
                {state.words.length > 1 && (
                  <button type="button" className="gb-remove-x" onClick={() => set({ words: state.words.filter((_, x) => x !== i) })}>✕</button>
                )}
              </div>
            ))}
          </div>
          {state.words.length < 12 && (
            <button type="button" className="btn btn-secondary gb-add-row" onClick={() => set({ words: [...state.words, ""] })}>+ Add word</button>
          )}
        </div>
      );

    default:
      return null;
  }
}