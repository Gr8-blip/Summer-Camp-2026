import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";

import LandingPage from "./pages/LandingPage";
import RegisterWizard from "./pages/RegisterWizard";
import PlanReview from "./pages/PlanReview";
import PaymentCallback from "./pages/PaymentCallback";
import ParentLogin from "./pages/ParentLogin";
import StudentLogin from "./pages/StudentLogin";
import Dashboard from "./pages/Dashboard";

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  const hasStudentSession = !!localStorage.getItem("student_info");

  if (!isAuthenticated && !hasStudentSession) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/register" element={<RegisterWizard />} />
          <Route path="/plan/:familyId" element={<PlanReview />} />
          <Route path="/payment/callback/:reference" element={<PaymentCallback />} />
          <Route path="/login" element={<ParentLogin />} />
          <Route path="/student-login" element={<StudentLogin />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
