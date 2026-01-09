/**
 * Auth Context
 *
 * Provides authentication state and methods using better-auth.
 * Simplified to authentication-only (no role-based access control).
 *
 * @see docs/plans/30-better-auth-migration.md
 */

"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { authClient, twoFactor as twoFactorClient, useSession } from "@/lib/auth-client";

// ============================================
// Types
// ============================================

/**
 * User type from better-auth session.
 * Note: No role field - all authenticated users have full access.
 */
export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  emailVerified: boolean;
  twoFactorEnabled?: boolean;
}

interface AuthContextValue {
  /** The authenticated user, or null if not logged in */
  user: AuthUser | null;
  /** Whether the user is authenticated */
  isAuthenticated: boolean;
  /** Whether the session is loading */
  isLoading: boolean;
  /** Whether 2FA is enabled for the current user */
  twoFactorEnabled: boolean;
  /** Authentication error, if any */
  error: Error | null;
  /** Sign in with Google OAuth */
  signInWithGoogle: () => Promise<void>;
  /** Sign out the current user */
  signOut: () => Promise<void>;
  /** Verify 2FA TOTP code during login */
  verifyTwoFactor: (code: string) => Promise<boolean>;
  /** Manually refresh the session */
  refreshSession: () => void;
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
  const { data: session, isPending, error, refetch } = useSession();

  // Map better-auth user to AuthUser type
  const user: AuthUser | null = session?.user
    ? {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name ?? null,
        image: session.user.image ?? null,
        emailVerified: session.user.emailVerified ?? false,
        twoFactorEnabled: (session.user as { twoFactorEnabled?: boolean }).twoFactorEnabled,
      }
    : null;

  const twoFactorEnabled = user?.twoFactorEnabled ?? false;

  // Sign in with Google OAuth
  const signInWithGoogle = useCallback(async () => {
    await authClient.signIn.social({
      provider: "google",
      callbackURL: "/dashboard",
    });
  }, []);

  // Sign out
  const handleSignOut = useCallback(async () => {
    await authClient.signOut();
    // Redirect to login page
    window.location.href = "/login";
  }, []);

  // Verify 2FA TOTP code during login
  const verifyTwoFactor = useCallback(async (code: string) => {
    try {
      await twoFactorClient.verifyTotp({ code });
      return true;
    } catch {
      return false;
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!session?.user,
      isLoading: isPending,
      twoFactorEnabled,
      error: error ?? null,
      signInWithGoogle,
      signOut: handleSignOut,
      verifyTwoFactor,
      refreshSession: refetch,
    }),
    [
      user,
      session?.user,
      isPending,
      twoFactorEnabled,
      error,
      signInWithGoogle,
      handleSignOut,
      verifyTwoFactor,
      refetch,
    ]
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
