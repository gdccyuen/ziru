"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api, type User } from "@/lib/api";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const me = await api.me();
      setUser(me);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        router.replace("/login");
        return;
      }
      if (
        err instanceof ApiError &&
        err.status === 403 &&
        err.code === "PASSWORD_CHANGE_REQUIRED"
      ) {
        setUser(null);
        router.replace("/force-change-password");
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load session");
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [router]);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // The session is dropped locally regardless; /login is safe.
    }
    setUser(null);
    router.replace("/login");
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then((me) => {
        if (cancelled) return;
        setUser(me);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          setUser(null);
          router.replace("/login");
          return;
        }
        if (
          err instanceof ApiError &&
          err.status === 403 &&
          err.code === "PASSWORD_CHANGE_REQUIRED"
        ) {
          setUser(null);
          router.replace("/force-change-password");
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load session");
        setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const value = useMemo(
    () => ({ user, loading, error, refresh, logout }),
    [user, loading, error, refresh, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return value;
}
