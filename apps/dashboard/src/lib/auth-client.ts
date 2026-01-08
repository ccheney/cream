/**
 * Better Auth React Client
 *
 * Client-side authentication using better-auth with React hooks.
 * Provides signIn, signOut, useSession, and 2FA functionality.
 *
 * @see docs/plans/30-better-auth-migration.md
 */

import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { config } from "./config";

/**
 * Better Auth client instance configured for the Cream Dashboard.
 *
 * Features:
 * - Google OAuth sign-in
 * - Two-factor authentication (TOTP)
 * - Automatic session management via cookies
 * - React hooks for session state
 */
export const authClient = createAuthClient({
  baseURL: config.api.baseUrl,
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect() {
        // Redirect to 2FA verification page when required
        window.location.href = "/two-factor";
      },
    }),
  ],
});

// ============================================
// Destructured Exports
// ============================================

/**
 * Sign in with a social provider (Google).
 *
 * @example
 * ```tsx
 * await signIn.social({ provider: "google" });
 * ```
 */
export const signIn = authClient.signIn;

/**
 * Sign out the current user.
 *
 * @example
 * ```tsx
 * await signOut();
 * ```
 */
export const signOut = authClient.signOut;

/**
 * React hook to access the current session.
 *
 * @example
 * ```tsx
 * const { data: session, isPending, error } = useSession();
 *
 * if (isPending) return <Loading />;
 * if (!session) return <LoginButton />;
 * return <UserProfile user={session.user} />;
 * ```
 */
export const useSession = authClient.useSession;

/**
 * Two-factor authentication methods.
 *
 * Available methods:
 * - `twoFactor.enable()` - Enable 2FA for current user
 * - `twoFactor.disable()` - Disable 2FA for current user
 * - `twoFactor.verifyTotp()` - Verify TOTP code
 * - `twoFactor.generateBackupCodes()` - Generate new backup codes
 *
 * @example
 * ```tsx
 * // Enable 2FA
 * const { data } = await twoFactor.enable({ password: "..." });
 * // data.totpURI contains the QR code URI
 *
 * // Verify TOTP during login
 * await twoFactor.verifyTotp({ code: "123456" });
 * ```
 */
export const twoFactor = authClient.twoFactor;

/**
 * Get current session data (non-hook version for use outside components).
 *
 * @example
 * ```ts
 * const session = await getSession();
 * ```
 */
export const getSession = authClient.getSession;
