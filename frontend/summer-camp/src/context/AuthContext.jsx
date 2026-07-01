import { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [accessToken, setAccessToken] = useState(localStorage.getItem("access_token"));
  const [parentEmail, setParentEmail] = useState(localStorage.getItem("parent_email"));

  useEffect(() => {
    if (accessToken) {
      localStorage.setItem("access_token", accessToken);
    } else {
      localStorage.removeItem("access_token");
    }
  }, [accessToken]);

  const login = (tokens, email) => {
    setAccessToken(tokens.access);
    localStorage.setItem("refresh_token", tokens.refresh);
    localStorage.setItem("parent_email", email);
    setParentEmail(email);
  };

  const logout = () => {
    setAccessToken(null);
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("parent_email");
    setParentEmail(null);
  };

  return (
    <AuthContext.Provider value={{ accessToken, parentEmail, login, logout, isAuthenticated: !!accessToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
