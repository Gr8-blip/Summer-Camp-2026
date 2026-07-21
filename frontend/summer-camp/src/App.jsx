import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";

import { BadgeQueueProvider } from "./components/BadgeQueueProvider";

import LandingPage from "./pages/LandingPage";
import RegisterWizard from "./pages/RegisterWizard";
import PlanReview from "./pages/PlanReview";
import PaymentCallback from "./pages/PaymentCallback";
import ParentLogin from "./pages/ParentLogin";
import StudentLogin from "./pages/StudentLogin";
import Dashboard from "./pages/Dashboard";
import ParentWeekScheme from "./pages/ParentWeekScheme";

// Student pages
import Missions from "./pages/student/Missions";
import MissionDetail from "./pages/student/MissionDetail";
import LessonDetail from "./pages/student/LessonDetail";
import Assignments from "./pages/student/Assignments";
import Submissions from "./pages/student/Submissions";
import Badges from "./pages/student/Badges";
import XPLog from "./pages/student/XPLog";
import Challenges from "./pages/student/Challenges";
import ChallengePlay from "./pages/student/ChallengePlay";
import ChallengeStats from "./pages/student/ChallengeStats";
import Attendance from "./pages/student/Attendance";
import QuestPlay from "./pages/student/QuestPlay";

// Admin pages
import AdminLogin from "./pages/admin/AdminLogin";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminMissions from "./pages/admin/AdminMissions";
import AdminLessons from "./pages/admin/AdminLessons";
import AdminAssignments from "./pages/admin/AdminAssignments";
import AdminSubmissions from "./pages/admin/AdminSubmissions";
import AdminAttendance from "./pages/admin/AdminAttendance";
import AdminXP from "./pages/admin/AdminXP";
import AdminBadges from "./pages/admin/AdminBadges";
import AdminChallenges from "./pages/admin/AdminChallenges";
import AdminCampControl from "./pages/admin/Admincampcontrol";

function ProtectedRoute({ children }) {
  const { isAuthenticated, isStudentAuthenticated } = useAuth();
  if (!isAuthenticated && !isStudentAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function RedirectRoute({ children }) {
  const { isAuthenticated, isStudentAuthenticated } = useAuth();
  if (isAuthenticated || isStudentAuthenticated) return <Navigate to="/dashboard" />

  return children;
}

function StudentRoute({ children }) {
  const { isStudentAuthenticated } = useAuth();
  if (!isStudentAuthenticated) return <Navigate to="/student-login" replace />;
  return children;
}

function AdminRoute({ children }) {
  const { isAdminAuthenticated } = useAuth();
  if (!isAdminAuthenticated) return <Navigate to="/camp-admin/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/" element={<RedirectRoute><LandingPage /></RedirectRoute>} />
          <Route path="/register" element={<RedirectRoute><RegisterWizard /></RedirectRoute>} />
          <Route path="/plan/:familyId" element={<RedirectRoute><PlanReview /></RedirectRoute>} />
          <Route path="/payment/callback/:reference" element={<PaymentCallback />} />
          <Route path="/login" element={<RedirectRoute><ParentLogin /></RedirectRoute>} />
          <Route path="/student-login" element={<RedirectRoute><StudentLogin /></RedirectRoute>} />

          {/* Parent + Student shared dashboard */}
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />


          {/* Parent platform */}
          <Route path="/parent/week-scheme" element={<ProtectedRoute><ParentWeekScheme /></ProtectedRoute>} />


          {/* Student platform */}
          <Route path="/missions" element={<StudentRoute><Missions /></StudentRoute>} />
          <Route path="/missions/:id" element={<StudentRoute><MissionDetail /></StudentRoute>} />
          <Route path="/lessons/:id" element={<StudentRoute><LessonDetail /></StudentRoute>} />
          <Route path="/assignments" element={<StudentRoute><Assignments /></StudentRoute>} />
          <Route path="/submissions" element={<StudentRoute><Submissions /></StudentRoute>} />
          <Route path="/badges" element={<StudentRoute><Badges /></StudentRoute>} />
          <Route path="/xp" element={<StudentRoute><XPLog /></StudentRoute>} />
          <Route path="/challenges" element={<StudentRoute><Challenges /></StudentRoute>} />
          <Route path="/challenges/stats" element={<StudentRoute><ChallengeStats /></StudentRoute>} />
          <Route path="/challenges/:id" element={<StudentRoute><ChallengePlay /></StudentRoute>} />
          <Route path="/attendance" element={<StudentRoute><Attendance /></StudentRoute>} />
          <Route path="/quests/:id" element={<StudentRoute><QuestPlay /></StudentRoute>} />  


          {/* Admin */}
          <Route path="/camp-admin/login" element={<AdminLogin />} />
          <Route path="/camp-admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
          <Route path="/camp-admin/missions" element={<AdminRoute><AdminMissions /></AdminRoute>} />
          <Route path="/camp-admin/lessons" element={<AdminRoute><AdminLessons /></AdminRoute>} />
          <Route path="/camp-admin/assignments" element={<AdminRoute><AdminAssignments /></AdminRoute>} />
          <Route path="/camp-admin/submissions" element={<AdminRoute><AdminSubmissions /></AdminRoute>} />
          <Route path="/camp-admin/attendance" element={<AdminRoute><AdminAttendance /></AdminRoute>} />
          <Route path="/camp-admin/xp" element={<AdminRoute><AdminXP /></AdminRoute>} />
          <Route path="/camp-admin/badges" element={<AdminRoute><AdminBadges /></AdminRoute>} />
          <Route path="/camp-admin/challenges" element={<AdminRoute><AdminChallenges /></AdminRoute>} />
          <Route path="/admin/camp-control" element={<AdminCampControl />} />  // admin router

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
