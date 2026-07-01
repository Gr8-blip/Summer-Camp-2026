import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { registerFamily } from "../api/client";
import AuthNav from "../components/AuthNav";
import "./RegisterWizard.css";

const STEPS = ["Parent Info", "Add Kids", "Review"];

const emptyStudent = () => ({ full_name: "", age: "", email: "", _key: crypto.randomUUID() });

// Per-field validation rules for the parent step.
// Returns an error string if invalid, empty string if clean.
function validateParentFields(parent, phone, confirmPassword) {
  const errs = {};

  if (!parent.first_name.trim()) errs.first_name = "First name is required.";
  if (!parent.last_name.trim()) errs.last_name = "Last name is required.";

  if (!parent.email.trim()) {
    errs.email = "Email is required.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parent.email)) {
    errs.email = "That doesn't look like a valid email.";
  }

  if (!phone.trim()) {
    errs.phone = "Phone number is required.";
  } else if (!/^\+?[\d\s\-()]{7,15}$/.test(phone)) {
    errs.phone = "Enter a valid phone number.";
  }

  if (!parent.password) {
    errs.password = "Password is required.";
  } else if (parent.password.length < 8) {
    errs.password = "Password must be at least 8 characters.";
  }

  if (!confirmPassword) {
    errs.confirmPassword = "Please confirm your password.";
  } else if (parent.password !== confirmPassword) {
    errs.confirmPassword = "Passwords don't match.";
  }

  return errs;
}

function validateStudents(students) {
  return students.map((s) => {
    const errs = {};
    if (!s.full_name.trim()) errs.full_name = "Name is required.";
    if (!s.age) {
      errs.age = "Age is required.";
    } else if (Number(s.age) < 9 || Number(s.age) > 16) {
      errs.age = "Age must be between 9 and 16.";
    }
    if (s.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email)) {
      errs.email = "Invalid email format.";
    }
    return errs;
  });
}

// Small inline error message component
function FieldError({ msg }) {
  if (!msg) return null;
  return <span className="field-error">⚠ {msg}</span>;
}

export default function RegisterWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const [parent, setParent] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
  });
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [students, setStudents] = useState([emptyStudent()]);

  // Validation error state — only shown after user attempts to proceed
  const [parentErrs, setParentErrs] = useState({});
  const [studentErrs, setStudentErrs] = useState([]);

  const updateParent = (field, value) => {
    setParent((p) => ({ ...p, [field]: value }));
    // Clear the error for this field as soon as they start fixing it
    setParentErrs((e) => ({ ...e, [field]: "" }));
  };

  const updateStudent = (key, field, value) => {
    setStudents((list) =>
      list.map((s) => (s._key === key ? { ...s, [field]: value } : s))
    );
    // Clear that specific student's field error
    setStudentErrs((list) =>
      list.map((errs, i) =>
        students[i]?._key === key ? { ...errs, [field]: "" } : errs
      )
    );
  };

  const addStudent = () => setStudents((list) => [...list, emptyStudent()]);

  const removeStudent = (key) => {
    setStudents((list) => (list.length > 1 ? list.filter((s) => s._key !== key) : list));
  };

  const goNext = () => {
    setSubmitError("");

    if (step === 0) {
      const errs = validateParentFields(parent, phone, confirmPassword);
      if (Object.keys(errs).length > 0) {
        setParentErrs(errs);
        return; // Block progression — don't move to step 2
      }
    }

    if (step === 1) {
      const errs = validateStudents(students);
      const hasErrors = errs.some((e) => Object.keys(e).length > 0);
      if (hasErrors) {
        setStudentErrs(errs);
        return;
      }
    }

    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const goBack = () => {
    setSubmitError("");
    setStep((s) => Math.max(s - 1, 0));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError("");

    const payload = {
      parent: {
        first_name: parent.first_name,
        last_name: parent.last_name,
        email: parent.email,
        password: parent.password,
      },
      phone,
      student_count: students.length,
      students: students.map((s) => ({
        full_name: s.full_name,
        age: Number(s.age),
        email: s.email || null,
      })),
    };

    try {
      const data = await registerFamily(payload);
      navigate(`/plan/${data.family_id}`);
    } catch (err) {
      setSubmitError(err.data?.error || err.message || "Something went wrong. Try again!");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-shell wizard-page">
      <AuthNav />
      <div className="blob wizard-blob-1" style={{ background: "var(--color-yellow)" }} />
      <div className="blob wizard-blob-2" style={{ background: "var(--color-blue)" }} />

      <div className="container wizard-container fade-up">
        <div className="wizard-card">
          {/* Step indicator */}
          <div className="wizard-steps">
            {STEPS.map((label, i) => (
              <div key={label} className={`wizard-step-dot ${i === step ? "active" : ""} ${i < step ? "done" : ""}`}>
                <span className="dot-num">{i < step ? "✓" : i + 1}</span>
                <span className="dot-label">{label}</span>
              </div>
            ))}
          </div>

          {/* STEP 1: PARENT INFO */}
          {step === 0 && (
            <div className="wizard-panel">
              <h2>👋 Let's get your info first!</h2>
              <p className="wizard-sub">We'll use this to set up your parent account.</p>

              <div className="form-row">
                <div className="form-group">
                  <label>First Name</label>
                  <input
                    className={parentErrs.first_name ? "input-error" : ""}
                    value={parent.first_name}
                    onChange={(e) => updateParent("first_name", e.target.value)}
                    placeholder="Jane"
                  />
                  <FieldError msg={parentErrs.first_name} />
                </div>
                <div className="form-group">
                  <label>Last Name</label>
                  <input
                    className={parentErrs.last_name ? "input-error" : ""}
                    value={parent.last_name}
                    onChange={(e) => updateParent("last_name", e.target.value)}
                    placeholder="Doe"
                  />
                  <FieldError msg={parentErrs.last_name} />
                </div>
              </div>

              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  className={parentErrs.email ? "input-error" : ""}
                  value={parent.email}
                  onChange={(e) => updateParent("email", e.target.value)}
                  placeholder="jane@example.com"
                />
                <FieldError msg={parentErrs.email} />
              </div>

              <div className="form-group">
                <label>Phone Number</label>
                <input
                  className={parentErrs.phone ? "input-error" : ""}
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setParentErrs((e2) => ({ ...e2, phone: "" }));
                  }}
                  placeholder="+234..."
                />
                <FieldError msg={parentErrs.phone} />
              </div>

              <div className="form-group">
                <label>Create a Password</label>
                <input
                  type="password"
                  className={parentErrs.password ? "input-error" : ""}
                  value={parent.password}
                  onChange={(e) => updateParent("password", e.target.value)}
                  placeholder="Min. 8 characters"
                />
                <FieldError msg={parentErrs.password} />
              </div>

              <div className="form-group">
                <label>Confirm Password</label>
                <input
                  type="password"
                  className={parentErrs.confirmPassword ? "input-error" : ""}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setParentErrs((errs) => ({ ...errs, confirmPassword: "" }));
                  }}
                  placeholder="Repeat your password"
                />
                <FieldError msg={parentErrs.confirmPassword} />
              </div>

              <button className="btn btn-primary btn-block" onClick={goNext}>
                Next: Add Your Kids →
              </button>
            </div>
          )}

          {/* STEP 2: ADD KIDS */}
          {step === 1 && (
            <div className="wizard-panel">
              <h2>🧒 Who's joining the bootcamp?</h2>
              <p className="wizard-sub">Add each kid who'll be building their own AI.</p>

              <div className="kids-list">
                {students.map((s, i) => (
                  <div className="kid-card" key={s._key}>
                    <div className="kid-card-header">
                      <span>Kid #{i + 1}</span>
                      {students.length > 1 && (
                        <button className="kid-remove" onClick={() => removeStudent(s._key)}>✕</button>
                      )}
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Full Name</label>
                        <input
                          className={studentErrs[i]?.full_name ? "input-error" : ""}
                          value={s.full_name}
                          onChange={(e) => updateStudent(s._key, "full_name", e.target.value)}
                          placeholder="Full name"
                        />
                        <FieldError msg={studentErrs[i]?.full_name} />
                      </div>
                      <div className="form-group form-group-narrow">
                        <label>Age</label>
                        <input
                          type="number"
                          min="9"
                          max="16"
                          className={studentErrs[i]?.age ? "input-error" : ""}
                          value={s.age}
                          onChange={(e) => updateStudent(s._key, "age", e.target.value)}
                          placeholder="9-16"
                        />
                        <FieldError msg={studentErrs[i]?.age} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Email <span className="optional-tag">(optional)</span></label>
                      <input
                        type="email"
                        className={studentErrs[i]?.email ? "input-error" : ""}
                        value={s.email}
                        onChange={(e) => updateStudent(s._key, "email", e.target.value)}
                        placeholder="kid@example.com"
                      />
                      <FieldError msg={studentErrs[i]?.email} />
                    </div>
                  </div>
                ))}
              </div>

              <button className="btn-add-kid" onClick={addStudent}>+ Add Another Kid</button>

              <div className="wizard-nav-row">
                <button className="btn btn-secondary" onClick={goBack}>← Back</button>
                <button className="btn btn-primary" onClick={goNext}>
                  Next: Review →
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: REVIEW */}
          {step === 2 && (
            <div className="wizard-panel">
              <h2>🔍 Quick Review</h2>
              <p className="wizard-sub">Double-check before we lock it in!</p>

              <div className="review-block">
                <h4>Parent</h4>
                <p>{parent.first_name} {parent.last_name} · {parent.email} · {phone}</p>
              </div>

              <div className="review-block">
                <h4>Kids ({students.length})</h4>
                <ul className="review-kids-list">
                  {students.map((s) => (
                    <li key={s._key}>🧒 {s.full_name}, age {s.age}{s.email ? ` · ${s.email}` : ""}</li>
                  ))}
                </ul>
              </div>

              {submitError && <div className="error-text wizard-error">⚠️ {submitError}</div>}

              <div className="wizard-nav-row">
                <button className="btn btn-secondary" onClick={goBack} disabled={submitting}>← Back</button>
                <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? <span className="spinner" /> : "Confirm & Continue to Plan 🎉"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
