import { useEffect, useMemo, useState } from "react";
import {
  apiRequest,
  clearAccessToken,
  getAccessToken,
  storeAccessToken,
} from "../api/client.js";
import { AuthContext } from "./auth-context.js";

const USER_KEY = "dms.user";

function readStoredUser() {
  try {
    const storedUser = window.sessionStorage.getItem(USER_KEY);
    return storedUser ? JSON.parse(storedUser) : null;
  } catch {
    window.sessionStorage.removeItem(USER_KEY);
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser);
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => Boolean(getAccessToken() && readStoredUser()),
  );

  useEffect(() => {
    const handleUnauthorized = () => {
      clearAccessToken();
      window.sessionStorage.removeItem(USER_KEY);
      setUser(null);
      setIsAuthenticated(false);
    };

    window.addEventListener("dms:unauthorized", handleUnauthorized);
    return () =>
      window.removeEventListener("dms:unauthorized", handleUnauthorized);
  }, []);

  async function login(email, password, role) {
    const result = await apiRequest("/api/auth/login", {
      method: "POST",
      body: { email, password, role },
      authenticated: false,
    });

    if (
      !result?.access_token ||
      !["admin", "teacher", "student"].includes(result?.user?.role)
    ) {
      throw new Error("The server returned an incomplete sign-in response.");
    }

    storeAccessToken(result.access_token);
    window.sessionStorage.setItem(USER_KEY, JSON.stringify(result.user));
    setUser(result.user);
    setIsAuthenticated(true);
    return result.user;
  }

  function logout() {
    clearAccessToken();
    window.sessionStorage.removeItem(USER_KEY);
    setUser(null);
    setIsAuthenticated(false);
    return apiRequest("/api/auth/logout", {
      method: "POST",
      authenticated: false,
    });
  }

  const value = useMemo(
    () => ({ user, isAuthenticated, login, logout }),
    [user, isAuthenticated],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
