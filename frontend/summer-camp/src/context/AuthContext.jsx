import { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [accessToken,   setAccessToken]   = useState(localStorage.getItem("access_token"));
  const [parentEmail,   setParentEmail]   = useState(localStorage.getItem("parent_email"));
  const [studentToken,  setStudentToken]  = useState(localStorage.getItem("student_access_token"));
  const [adminToken,    setAdminToken]    = useState(localStorage.getItem("admin_access_token"));
  const [adminInfo,     setAdminInfo]     = useState(() => {
    try { return JSON.parse(localStorage.getItem("admin_info") || "null"); } catch { return null; }
  });

  useEffect(() => {
    if (accessToken) localStorage.setItem("access_token", accessToken);
    else             localStorage.removeItem("access_token");
  }, [accessToken]);

  useEffect(() => {
    if (studentToken) localStorage.setItem("student_access_token", studentToken);
    else              localStorage.removeItem("student_access_token");
  }, [studentToken]);

  useEffect(() => {
    if (adminToken) localStorage.setItem("admin_access_token", adminToken);
    else            localStorage.removeItem("admin_access_token");
  }, [adminToken]);

  // Parent login
  const login = (tokens, email) => {
    setAccessToken(tokens.access);
    localStorage.setItem("refresh_token", tokens.refresh);
    localStorage.setItem("parent_email", email);
    setParentEmail(email);
  };

  // Student login
  const loginStudentSession = (tokens, studentObj) => {
    setStudentToken(tokens.access);
    localStorage.setItem("student_refresh_token", tokens.refresh);
    localStorage.setItem("student_info", JSON.stringify(studentObj));
  };

  // Admin login
  const loginAdminSession = (tokens, admin) => {
    setAdminToken(tokens.access);
    localStorage.setItem("admin_refresh_token", tokens.refresh);
    localStorage.setItem("admin_info", JSON.stringify(admin));
    setAdminInfo(admin);
  };

  const logout = () => {
    setAccessToken(null);
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("parent_email");
    setParentEmail(null);
  };

  const logoutStudent = () => {
    setStudentToken(null);
    localStorage.removeItem("student_refresh_token");
    localStorage.removeItem("student_info");
  };

  const logoutAdmin = () => {
    setAdminToken(null);
    localStorage.removeItem("admin_refresh_token");
    localStorage.removeItem("admin_info");
    setAdminInfo(null);
  };

  return (
    <AuthContext.Provider value={{
      accessToken,
      parentEmail,
      studentToken,
      adminToken,
      adminInfo,
      login,
      loginStudentSession,
      loginAdminSession,
      logout,
      logoutStudent,
      logoutAdmin,
      isAuthenticated:        !!accessToken,
      isStudentAuthenticated: !!studentToken,
      isAdminAuthenticated:   !!adminToken,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
