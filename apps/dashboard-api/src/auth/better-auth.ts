/**
 * Better Auth Configuration
 *
 * Core authentication configuration using better-auth with:
 * - Google OAuth provider
 * - Two-factor authentication (TOTP)
 * - PostgreSQL database via Drizzle ORM
 *
 * This replaces the previous JWT-based authentication system.
 *
 * @see docs/plans/30-better-auth-migration.md
 */

import { getDb } from "@cream/storage/db";
import * as authSchema from "@cream/storage/schema/auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor } from "better-auth/plugins";

// ============================================
// Environment Helpers
// ============================================

const isLive = Bun.env.CREAM_ENV === "LIVE";

// ============================================
// Better Auth Instance (Lazy Initialization)
// ============================================

let _auth: ReturnType<typeof betterAuth> | null = null;

const USER_FIELDS = {
	emailVerified: "email_verified",
	createdAt: "created_at",
	updatedAt: "updated_at",
	twoFactorEnabled: "two_factor_enabled",
};

const ACCOUNT_FIELDS = {
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
};

const VERIFICATION_FIELDS = {
	expiresAt: "expires_at",
	createdAt: "created_at",
	updatedAt: "updated_at",
};

const SESSION_FIELDS = {
	expiresAt: "expires_at",
	createdAt: "created_at",
	updatedAt: "updated_at",
	userId: "user_id",
	ipAddress: "ip_address",
	userAgent: "user_agent",
};

function createGoogleProviderConfig() {
	return {
		clientId: Bun.env.GOOGLE_CLIENT_ID ?? "",
		clientSecret: Bun.env.GOOGLE_CLIENT_SECRET ?? "",
		accessType: "offline" as const,
		prompt: "select_account consent" as const,
	};
}

function createTwoFactorPlugin() {
	return twoFactor({
		skipVerificationOnEnable: false,
		issuer: "Cream Dashboard",
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
	});
}

function getTrustedOrigins(): string[] {
	return [
		"http://localhost:3000",
		"http://localhost:3001",
		Bun.env.DASHBOARD_URL,
		Bun.env.BETTER_AUTH_URL,
	].filter((origin): origin is string => Boolean(origin));
}

/**
 * Get the Better Auth instance.
 * Lazy initialization to avoid database connection at import time,
 * which allows tests to import this module without requiring a database.
 */
export function getAuth(): ReturnType<typeof betterAuth> {
	if (!_auth) {
		_auth = createAuth();
	}
	return _auth;
}

/**
 * Create the Better Auth configuration for Cream Dashboard.
 *
 * Features:
 * - Google OAuth for user authentication
 * - TOTP-based two-factor authentication
 * - Session-based auth with secure cookies
 * - 7-day session expiry with daily refresh
 */
function createAuth() {
	return betterAuth({
		appName: "Cream Dashboard",
		baseURL: Bun.env.BETTER_AUTH_URL ?? "http://localhost:3001",
		database: drizzleAdapter(getDb(), {
			provider: "pg",
			schema: authSchema,
		}),
		user: {
			fields: USER_FIELDS,
		},
		account: {
			fields: ACCOUNT_FIELDS,
		},
		verification: {
			fields: VERIFICATION_FIELDS,
		},
		socialProviders: {
			google: createGoogleProviderConfig(),
		},
		plugins: [createTwoFactorPlugin()],
		session: {
			fields: SESSION_FIELDS,
			expiresIn: 60 * 60 * 24 * 7,
			updateAge: 60 * 60 * 24,
			cookieCache: {
				enabled: true,
				maxAge: 60 * 5,
			},
		},
		advanced: {
			cookiePrefix: "cream",
			useSecureCookies: isLive,
			defaultCookieAttributes: {
				httpOnly: true,
				secure: isLive,
				sameSite: "lax",
				path: "/",
			},
			database: {
				generateId: false,
			},
		},
		trustedOrigins: getTrustedOrigins(),
	});
}

// ============================================
// Type Exports
// ============================================

/**
 * Better Auth instance type.
 */
export type Auth = ReturnType<typeof createAuth>;

/**
 * User type for authenticated users.
 */
export interface User {
	id: string;
	email: string;
	name: string;
	emailVerified: boolean;
	image?: string | null;
	createdAt: Date;
	updatedAt: Date;
	twoFactorEnabled?: boolean;
}

/**
 * Session type for authenticated sessions.
 * Use this for type-safe session access in route handlers.
 */
export interface Session {
	session: {
		id: string;
		userId: string;
		expiresAt: Date;
		createdAt: Date;
		updatedAt: Date;
		ipAddress?: string | null;
		userAgent?: string | null;
		token: string;
	};
	user: User;
}

/**
 * Re-export getAuth as default for convenience.
 */
export default getAuth;
