/**
 * Auth Context
 *
 * Provides authentication state and methods to the app.
 * Uses httpOnly cookies for secure token storage.
 *
 * @see docs/plans/ui/09-security.md
 */

"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { get, post } from "@/lib/api/client";
import type { AuthUser, LoginResponse, MFAVerifyResponse, SessionResponse } from "@/lib/api/types";

// ============================================
// Types
// ============================================

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  mfaRequired: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<LoginResponse>;
  logout: () => Promise<void>;
  verifyMFA: (code: string) => Promise<void>;
  refreshSession: () => Promise<void>;
}

// ============================================
// Context
// ============================================

const AuthContext = createContext<AuthContextValue | null>(null);

// ============================================
// Provider
// ============================================

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    mfaRequired: false,
  });

  const checkSession = useCallback(async () => {
    try {
      const { data } = await get<SessionResponse>("/api/auth/session");

      if (data.authenticated && data.user) {
        setState({
          user: data.user,
          isAuthenticated: true,
          isLoading: false,
          mfaRequired: false,
        });
      } else {
        setState({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          mfaRequired: false,
        });
      }
    } catch {
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        mfaRequired: false,
      });
    }
  }, []);

  // Check session on mount
  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const login = useCallback(async (email: string, password: string): Promise<LoginResponse> => {
    const { data } = await post<LoginResponse>("/api/auth/login", { email, password });

    if (data.mfaRequired) {
      setState((prev) => ({
        ...prev,
        mfaRequired: true,
      }));
    } else {
      setState({
        user: {
          ...data.user,
          mfaVerified: false,
        },
        isAuthenticated: true,
        isLoading: false,
        mfaRequired: false,
      });
    }

    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await post<{ success: boolean }>("/api/auth/logout");
    } finally {
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        mfaRequired: false,
      });
    }
  }, []);

  const verifyMFA = useCallback(
    async (code: string) => {
      await post<MFAVerifyResponse>("/api/auth/mfa/verify", { code });

      // Refresh session to get updated user data
      await checkSession();
    },
    [checkSession]
  );

  const refreshSession = useCallback(async () => {
    try {
      await post<{ success: boolean }>("/api/auth/refresh");
      await checkSession();
    } catch {
      // Session refresh failed, user needs to re-login
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        mfaRequired: false,
      });
    }
  }, [checkSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login,
      logout,
      verifyMFA,
      refreshSession,
    }),
    [state, login, logout, verifyMFA, refreshSession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ============================================
// Hook
// ============================================

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export default AuthContext;
