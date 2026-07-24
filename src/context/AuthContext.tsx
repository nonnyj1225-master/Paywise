import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { apiFetch, setAuthToken, setOnUnauthorized } from "../lib/api";

interface User {
  id: number;
  email: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(async () => {
    if (token) {
      try {
        await apiFetch("/api/auth/logout", { method: "POST" });
      } catch {
        // ignore network errors during logout
      }
    }
    setAuthToken(null);
    setToken(null);
    setUser(null);
    sessionStorage.removeItem("paywise_token");
  }, [token]);

  // Set up the onUnauthorized global callback
  useEffect(() => {
    setOnUnauthorized(() => {
      logout();
    });
  }, [logout]);

  // Sync token -> global api helper
  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  // On mount, validate saved token
  useEffect(() => {
    const savedToken = sessionStorage.getItem("paywise_token");
    if (!savedToken) {
      setLoading(false);
      return;
    }

    setAuthToken(savedToken);

    apiFetch("/api/auth/me")
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          setToken(savedToken);
          sessionStorage.setItem("paywise_token", savedToken);
        } else {
          sessionStorage.removeItem("paywise_token");
          setAuthToken(null);
        }
      })
      .catch(() => {
        sessionStorage.removeItem("paywise_token");
        setAuthToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Login failed");
    }

    setUser(data.user);
    setToken(data.token);
    sessionStorage.setItem("paywise_token", data.token);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Registration failed");
    }

    setUser(data.user);
    setToken(data.token);
    sessionStorage.setItem("paywise_token", data.token);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
