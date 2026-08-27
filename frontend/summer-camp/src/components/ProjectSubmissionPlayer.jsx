import { useState } from "react";
import Markdown from "./Markdown";
import "./projectsubmissionplayer.css";

/**
 * Student-facing input for `project_submission` questions. This is
 * intentionally "dumb" — it only collects a URL and/or a ZIP file and
 * reports them upward via onAnswer({ url, zip }). It does NOT verify
 * anything itself: verification happens once, server-side, at the moment
 * the student hits Finish (see finishWithProjectChecks in
 * ChallengePlay.jsx / QuestPlay.jsx). That way a student can't get full
 * credit just by skipping a "check" step — there isn't one to skip.
 */
export default function ProjectSubmissionPlayer({ question, onAnswer }) {
  const content = question.content || {};
  const submission = content.submission || {};
  const [url, setUrl] = useState("");
  const [zip, setZip] = useState(null);

  const updateUrl = (value) => {
    setUrl(value);
    onAnswer({ url: value, zip });
  };

  const updateZip = (file) => {
    setZip(file);
    onAnswer({ url, zip: file });
  };

  return (
    <div className="psp">
      {content.instruction && (
        <Markdown as="div" className="psp-instruction" text={content.instruction} />
      )}

      <div className="psp-inputs">
        {submission.url && (
          <div className="psp-field">
            <label>🔗 Your live website link</label>
            <input
              type="url"
              placeholder="https://your-project.example.com"
              value={url}
              onChange={(e) => updateUrl(e.target.value)}
            />
          </div>
        )}
        {submission.zip && (
          <div className="psp-field">
            <label>📦 Your project as a .zip file</label>
            <label className="psp-file-drop">
              <input type="file" accept=".zip" onChange={(e) => updateZip(e.target.files?.[0] || null)} />
              {zip ? `📄 ${zip.name}` : "Tap to choose a .zip file"}
            </label>
          </div>
        )}
      </div>

      <p className="psp-note">
        We'll check your {submission.url && submission.zip ? "link and zip file" : submission.url ? "link" : "zip file"} when you hit{" "}
        {question.question_type === "project_submission" ? "Finish" : "Next"} 👇
      </p>
    </div>
  );
}