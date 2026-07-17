const BASE_URL = import.meta.env.VITE_API_URL;
const CAMP_URL = import.meta.env.VITE_API_CAMP_URL;

async function request(baseUrl, path, { method = "GET", body, auth = false, studentAuth = false, adminAuth = false } = {}) {
  const headers = { "Content-Type": "application/json" };

  if (auth)        { const t = localStorage.getItem("access_token");         if (t) headers["Authorization"] = `Bearer ${t}`; }
  if (studentAuth) { const t = localStorage.getItem("student_access_token"); if (t) headers["Authorization"] = `Bearer ${t}`; }
  if (adminAuth)   { const t = localStorage.getItem("admin_access_token");   if (t) headers["Authorization"] = `Bearer ${t}`; }

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = new Error(data.error || data.message || "Request failed");
    error.status = res.status;
    error.data   = data;
    throw error;
  }
  return data;
}

const users = (path, opts) => request(BASE_URL, path, opts);
const camp  = (path, opts) => request(CAMP_URL,  path, opts);

// ── Users / Auth ───────────────────────────────────────────────────────────────
export const registerFamily = (payload)         => users("/register/",                    { method: "POST", body: payload });
export const initPayment    = (familyId)        => users(`/initiate-payment/${familyId}/`, { method: "POST" });
export const verifyPayment  = (reference)       => users(`/verify-payment/${reference}/`,  { method: "GET"  });
export const loginParent    = (email, password) => users("/parent-login/",                { method: "POST", body: { email, password } });
export const loginStudent   = (login_code)      => users("/student-login/",               { method: "POST", body: { login_code } });
export const loginAdmin     = (email, password) => users("/camp-admin-login/",                 { method: "POST", body: { email, password } });

// ── Parent ─────────────────────────────────────────────────────────────────────
export const getParentDashboard = () => camp("/parent/dashboard/", { method: "GET", auth: true });
export const getParentStudents  = () => camp("/parent/students/",  { method: "GET", auth: true });
export const getParentWeekScheme = () => camp("/parent/week-scheme/", { method: "GET", auth: true });
export const getParentLessons = () => camp("/parent/lessons/", { method: "GET", auth: true });

// ── Student platform ───────────────────────────────────────────────────────────
export const getStudentDashboard = ()         => camp("/dashboard/",               { method: "GET",  studentAuth: true });
export const getMissions         = ()         => camp("/missions/",                { method: "GET",  studentAuth: true });
export const getMissionDetail    = (id)       => camp(`/missions/${id}/`,           { method: "GET",  studentAuth: true });
export const getLessonDetail     = (id)       => camp(`/lessons/${id}/`,            { method: "GET",  studentAuth: true });
export const getAssignments      = ()         => camp("/assignments/",             { method: "GET",  studentAuth: true });
export const submitAssignment    = (id, text) => camp(`/assignments/${id}/submit/`, { method: "POST", studentAuth: true, body: { submission_text: text } });
export const getSubmissions      = ()         => camp("/submissions/",             { method: "GET",  studentAuth: true });
export const getXPLog            = ()         => camp("/xp/",                      { method: "GET",  studentAuth: true });
export const getBadges           = ()         => camp("/badges/",                  { method: "GET",  studentAuth: true });
export const getChallenges       = ()         => camp("/challenges/",              { method: "GET",  studentAuth: true });
export const getChallenge        = (id)       => camp(`/challenges/${id}/`,         { method: "GET", studentAuth: true });
export const startChallenge      = (id)       => camp(`/challenges/${id}/start/`,   { method: "POST", studentAuth: true });
export const submitChallenge     = (id, body) => camp(`/challenges/${id}/submit/`,  { method: "POST", studentAuth: true, body });
export const getChallengeLeaderboard = (id)   => camp(`/challenges/${id}/leaderboard/`, { method: "GET", studentAuth: true });
export const getChallengeStats = ()           => camp("/challenges/stats/", { method: "GET", studentAuth: true });
export const getAttendance       = ()         => camp("/attendance/",              { method: "GET",  studentAuth: true });
export const checkInAttendance   = (code)     => camp("/attendance/check-in/",     { method: "POST", studentAuth: true, body: { code } });

// ── Admin ──────────────────────────────────────────────────────────────────────
export const getAdminDashboard = () => camp("/camp-admin/dashboard/", { method: "GET", adminAuth: true });

export const adminGetMissions    = ()         => camp("/camp-admin/missions/",          { method: "GET",    adminAuth: true });
export const adminCreateMission  = (body)     => camp("/camp-admin/missions/",          { method: "POST",   adminAuth: true, body });
export const adminUpdateMission  = (id, body) => camp(`/camp-admin/missions/${id}/`,    { method: "PATCH",  adminAuth: true, body });
export const adminDeleteMission  = (id)       => camp(`/camp-admin/missions/${id}/`,    { method: "DELETE", adminAuth: true });

export const adminGetLessons     = ()         => camp("/camp-admin/lessons/",           { method: "GET",    adminAuth: true });
export const adminCreateLesson   = (body)     => camp("/camp-admin/lessons/",           { method: "POST",   adminAuth: true, body });
export const adminUpdateLesson   = (id, body) => camp(`/camp-admin/lessons/${id}/`,     { method: "PATCH",  adminAuth: true, body });
export const adminDeleteLesson   = (id)       => camp(`/camp-admin/lessons/${id}/`,     { method: "DELETE", adminAuth: true });

export const adminGetAssignments   = ()         => camp("/camp-admin/assignments/",       { method: "GET",    adminAuth: true });
export const adminCreateAssignment = (body)     => camp("/camp-admin/assignments/",       { method: "POST",   adminAuth: true, body });
export const adminUpdateAssignment = (id, body) => camp(`/camp-admin/assignments/${id}/`, { method: "PATCH",  adminAuth: true, body });
export const adminDeleteAssignment = (id)       => camp(`/camp-admin/assignments/${id}/`, { method: "DELETE", adminAuth: true });

export const adminGetSubmissions  = ()         => camp("/camp-admin/submissions/",        { method: "GET",   adminAuth: true });
export const adminGradeSubmission = (id, body) => camp(`/camp-admin/submissions/${id}/`,  { method: "PATCH", adminAuth: true, body });

export const adminGetAttendance = ()         => camp("/camp-admin/attendance/",               { method: "GET",    adminAuth: true });
export const adminGetSessions   = ()         => camp("/camp-admin/attendance/sessions/",      { method: "GET",    adminAuth: true });
export const adminCreateSession = (body)     => camp("/camp-admin/attendance/sessions/",      { method: "POST",   adminAuth: true, body });
export const adminUpdateSession = (id, body) => camp(`/camp-admin/attendance/sessions/${id}/`, { method: "PATCH",  adminAuth: true, body });
export const adminDeleteSession = (id)       => camp(`/camp-admin/attendance/sessions/${id}/`, { method: "DELETE", adminAuth: true });

export const adminGetXP   = ()     => camp("/camp-admin/xp/",       { method: "GET",  adminAuth: true });
export const adminGetStudents = () => camp("/camp-admin/students/", { method: "GET", adminAuth: true });
export const adminAwardXP = (body) => camp("/camp-admin/xp/award/", { method: "POST", adminAuth: true, body });

export const adminGetBadges   = ()         => camp("/camp-admin/badges/",       { method: "GET",    adminAuth: true });
export const adminCreateBadge = (body)     => camp("/camp-admin/badges/",       { method: "POST",   adminAuth: true, body });
export const adminUpdateBadge = (id, body) => camp(`/camp-admin/badges/${id}/`, { method: "PATCH",  adminAuth: true, body });
export const adminDeleteBadge = (id)       => camp(`/camp-admin/badges/${id}/`, { method: "DELETE", adminAuth: true });

export const adminGetChallenges   = ()         => camp("/camp-admin/challenges/",       { method: "GET",    adminAuth: true });
export const adminCreateChallenge = (body)     => camp("/camp-admin/challenges/",       { method: "POST",   adminAuth: true, body });
export const adminUpdateChallenge = (id, body) => camp(`/camp-admin/challenges/${id}/`, { method: "PATCH",  adminAuth: true, body });
export const adminDeleteChallenge = (id)       => camp(`/camp-admin/challenges/${id}/`, { method: "DELETE", adminAuth: true });
export const adminGetChallengeQuestions = (id) => camp(`/camp-admin/challenges/${id}/questions/`, { method: "GET", adminAuth: true });
export const adminCreateChallengeQuestion = (id, body) => camp(`/camp-admin/challenges/${id}/questions/`, { method: "POST", adminAuth: true, body });
export const adminUpdateChallengeQuestion = (id, body) => camp(`/camp-admin/questions/${id}/`, { method: "PATCH", adminAuth: true, body });
export const adminDeleteChallengeQuestion = (id) => camp(`/camp-admin/questions/${id}/`, { method: "DELETE", adminAuth: true });
