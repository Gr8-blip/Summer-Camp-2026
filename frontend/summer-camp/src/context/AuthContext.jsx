import { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext(null);

function isTokenExpired(token) {
  if (!token) return true;
  try {
    const base64Url = token.split('.')[1]; // Great catch adding [1] here!
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map((c) => {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    const { exp } = JSON.parse(jsonPayload);
    return Date.now() >= exp * 1000;
  } catch (err) {
    return true; 
  }
}

export function AuthProvider({ children }) {
  const [accessToken, setAccessToken] = useState(() => {
    const token = localStorage.getItem("access_token");
    return isTokenExpired(token) ? null : token;
  });
  
  const [parentEmail, setParentEmail] = useState(localStorage.getItem("parent_email"));
  
  const [studentToken, setStudentToken] = useState(() => {
    const token = localStorage.getItem("student_access_token");
    return isTokenExpired(token) ? null : token;
  });
  
  const [adminToken, setAdminToken] = useState(() => {
    const token = localStorage.getItem("admin_access_token");
    return isTokenExpired(token) ? null : token;
  });
  
  const [adminInfo, setAdminInfo] = useState(() => {
    try { return JSON.parse(localStorage.getItem("admin_info") || "null"); } catch { return null; }
  });

  useEffect(() => {
    if (accessToken) localStorage.setItem("access_token", accessToken);
    else localStorage.removeItem("access_token");
  }, [accessToken]);

  useEffect(() => {
    if (studentToken) localStorage.setItem("student_access_token", studentToken);
    else localStorage.removeItem("student_access_token");
  }, [studentToken]);

  useEffect(() => {
    if (adminToken) localStorage.setItem("admin_access_token", adminToken);
    else localStorage.removeItem("admin_access_token");
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
      isAuthenticated: !!accessToken,
      isStudentAuthenticated: !!studentToken,
      isAdminAuthenticated: !!adminToken,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
