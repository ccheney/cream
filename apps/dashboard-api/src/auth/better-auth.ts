/**
 * Better Auth Configuration
 *
 * Core authentication configuration using better-auth with:
 * - Google OAuth provider
 * - Two-factor authentication (TOTP)
 * - Turso/libSQL database via Kysely
 *
 * This replaces the previous JWT-based authentication system.
 *
 * @see docs/plans/30-better-auth-migration.md
 */

import { LibsqlDialect } from "@libsql/kysely-libsql";
import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins";

// ============================================
// Database Configuration
// ============================================

/**
 * Create the Kysely dialect for libSQL/Turso.
 * Connects to the same Turso server as @cream/storage.
 */
function createLibsqlDialect(): LibsqlDialect {
  const url = process.env.TURSO_DATABASE_URL ?? "http://localhost:8080";
  const authToken = process.env.TURSO_AUTH_TOKEN;

  return new LibsqlDialect({ url, authToken });
}

// ============================================
// Environment Helpers
// ============================================

const isLive = process.env.CREAM_ENV === "LIVE";

// ============================================
// Better Auth Instance
// ============================================

/**
 * Better Auth configuration for Cream Dashboard.
 *
 * Features:
 * - Google OAuth for user authentication
 * - TOTP-based two-factor authentication
 * - Session-based auth with secure cookies
 * - 7-day session expiry with daily refresh
 */
export const auth = betterAuth({
  appName: "Cream Dashboard",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3001",

  // Database configuration using Kysely with libSQL
  database: {
    dialect: createLibsqlDialect(),
    type: "sqlite",
  },

  // Map camelCase fields to snake_case database columns
  user: {
    fields: {
      emailVerified: "email_verified",
      createdAt: "created_at",
      updatedAt: "updated_at",
      twoFactorEnabled: "two_factor_enabled",
    },
  },
  account: {
    fields: {
      accountId: "account_id",
      providerId: "provider_id",
      userId: "user_id",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      idToken: "id_token",
      accessTokenExpiresAt: "access_token_expires_at",
      refreshTokenExpiresAt: "refresh_token_expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  verification: {
    fields: {
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },

  // Google OAuth provider
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      // Request offline access for refresh tokens
      accessType: "offline",
      // Always show account selector and consent screen
      prompt: "select_account consent",
    },
  },

  // Plugins
  plugins: [
    twoFactor({
      // Require TOTP verification when enabling 2FA
      skipVerificationOnEnable: false,
      // Use app name as TOTP issuer
      issuer: "Cream Dashboard",
      // Map to snake_case columns
      schema: {
        user: {
          fields: {
            twoFactorEnabled: "two_factor_enabled",
          },
        },
        twoFactor: {
          fields: {
            secret: "secret",
            backupCodes: "backup_codes",
            userId: "user_id",
          },
        },
      },
    }),
  ],

  // Session configuration (includes field mappings for snake_case columns)
  session: {
    // Map camelCase fields to snake_case database columns
    fields: {
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
      userId: "user_id",
      ipAddress: "ip_address",
      userAgent: "user_agent",
    },
    // Session expires in 7 days
    expiresIn: 60 * 60 * 24 * 7,
    // Refresh session if older than 1 day
    updateAge: 60 * 60 * 24,
    // Cache session in cookie for 5 minutes to reduce DB lookups
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },

  // Advanced configuration
  advanced: {
    // Prefix all auth cookies with "cream"
    cookiePrefix: "cream",
    // Only use secure cookies in LIVE environment (requires HTTPS)
    useSecureCookies: isLive,
    // Default cookie attributes
    defaultCookieAttributes: {
      httpOnly: true,
      secure: isLive,
      sameSite: "lax",
      path: "/",
    },
  },

  // Trusted origins for CORS
  trustedOrigins: [
    "http://localhost:3000",
    "http://localhost:3001",
    process.env.DASHBOARD_URL,
    process.env.BETTER_AUTH_URL,
  ].filter((origin): origin is string => Boolean(origin)),
});

// ============================================
// Type Exports
// ============================================

/**
 * Inferred session type from better-auth configuration.
 * Use this for type-safe session access in route handlers.
 */
export type Session = typeof auth.$Infer.Session;

/**
 * Inferred user type from better-auth configuration.
 * Represents the authenticated user profile.
 */
export type User = typeof auth.$Infer.Session.user;

/**
 * Re-export auth for convenience.
 */
export default auth;
