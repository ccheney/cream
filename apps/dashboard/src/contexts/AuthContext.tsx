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
	const user = mapAuthUser(session?.user);
	const twoFactorEnabled = user?.twoFactorEnabled ?? false;
	const { signInWithGoogle, signOut, verifyTwoFactor } = useAuthActions();

	const value = useMemo<AuthContextValue>(
		() => ({
			user,
			isAuthenticated: !!session?.user,
			isLoading: isPending,
			twoFactorEnabled,
			error: error ?? null,
			signInWithGoogle,
			signOut,
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
			signOut,
			verifyTwoFactor,
			refetch,
		],
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function mapAuthUser(user: { [key: string]: unknown } | undefined): AuthUser | null {
	if (!user) {
		return null;
	}

	return {
		id: user.id as string,
		email: user.email as string,
		name: (user.name as string | null | undefined) ?? null,
		image: (user.image as string | null | undefined) ?? null,
		emailVerified: (user.emailVerified as boolean | undefined) ?? false,
		twoFactorEnabled: (user.twoFactorEnabled as boolean | undefined) ?? false,
	};
}

function useAuthActions() {
	const signInWithGoogle = useCallback(async () => {
		const callbackURL = `${window.location.origin}/portfolio`;
		await authClient.signIn.social({
			provider: "google",
			callbackURL,
		});
	}, []);

	const signOut = useCallback(async () => {
		await authClient.signOut();
		window.location.href = "/login";
	}, []);

	const verifyTwoFactor = useCallback(async (code: string) => {
		try {
			await twoFactorClient.verifyTotp({ code });
			return true;
		} catch {
			return false;
		}
	}, []);

	return { signInWithGoogle, signOut, verifyTwoFactor };
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
