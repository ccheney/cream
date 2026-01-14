/**
 * Better Auth Session Middleware
 *
 * Session middleware for Hono that uses better-auth for authentication.
 * Replaces the old JWT-based authentication.
 *
 * @see docs/plans/30-better-auth-migration.md
 */

import { requireEnv } from "@cream/domain";
import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { auth, type Session, type User } from "./better-auth.js";

// ============================================
// Session Types
// ============================================

/**
 * Variables added to Hono context by session middleware.
 */
export interface SessionVariables {
	/** The better-auth session (includes user) */
	session: Session | null;
	/** The authenticated user */
	user: User | null;
}

// ============================================
// Session Middleware
// ============================================

/**
 * Session middleware that extracts and validates better-auth sessions.
 *
 * This middleware should be applied globally to all routes.
 * It sets the session in the context if a valid session cookie is present.
 */
export function sessionMiddleware(): MiddlewareHandler<{ Variables: SessionVariables }> {
	return async (c, next) => {
		try {
			// Get session from better-auth using request headers (cookies)
			const session = await auth.api.getSession({
				headers: c.req.raw.headers,
			});

			// Set session and user in context (may be null for unauthenticated requests)
			c.set("session", session);
			c.set("user", session?.user ?? null);

			await next();
		} catch {
			// On error, continue without session
			c.set("session", null);
			c.set("user", null);
			await next();
		}
	};
}

// ============================================
// Auth Guard Middleware
// ============================================

/**
 * Middleware that requires authentication.
 *
 * Returns 401 if no valid session is present.
 * Must be used after sessionMiddleware.
 */
export function requireAuth(): MiddlewareHandler<{ Variables: SessionVariables }> {
	return async (c, next) => {
		const session = c.get("session");

		if (!session) {
			throw new HTTPException(401, { message: "Authentication required" });
		}

		await next();
	};
}

/**
 * Middleware for optional authentication.
 *
 * Allows unauthenticated requests to proceed.
 * The route handler should check for session presence.
 */
export function optionalAuth(): MiddlewareHandler<{ Variables: SessionVariables }> {
	return async (_c, next) => {
		// Session is already set by sessionMiddleware
		await next();
	};
}

// ============================================
// LIVE Environment Protection
// ============================================

/**
 * LIVE environment protection options.
 */
export interface LiveProtectionOptions {
	/** Require MFA verification (2FA must be enabled and verified) */
	requireMFA?: boolean;
	/** Require confirmation header */
	requireConfirmation?: boolean;
	/** Log all actions */
	auditLog?: boolean;
	/** Allowed IP addresses (if set, only these IPs can access) */
	ipWhitelist?: string[];
}

/**
 * Default LIVE protection configuration.
 */
export const DEFAULT_LIVE_PROTECTION: LiveProtectionOptions = {
	requireMFA: true,
	requireConfirmation: true,
	auditLog: true,
	ipWhitelist: undefined,
};

/**
 * Middleware to protect LIVE environment operations.
 *
 * Only applies restrictions when CREAM_ENV=LIVE.
 */
export function liveProtection(
	options: LiveProtectionOptions = DEFAULT_LIVE_PROTECTION
): MiddlewareHandler<{ Variables: SessionVariables }> {
	return async (c, next) => {
		const env = requireEnv();

		// Skip protection for non-LIVE environments
		if (env !== "LIVE") {
			await next();
			return;
		}

		const session = c.get("session");
		const user = c.get("user");

		if (!session || !user) {
			throw new HTTPException(401, { message: "Authentication required for LIVE environment" });
		}

		// Check IP whitelist
		if (options.ipWhitelist && options.ipWhitelist.length > 0) {
			const clientIP =
				c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
				c.req.header("X-Real-IP") ??
				"unknown";

			if (!options.ipWhitelist.includes(clientIP)) {
				throw new HTTPException(403, {
					message: "Access denied: IP not whitelisted for LIVE environment",
				});
			}
		}

		// Check MFA verification (2FA enabled status)
		// Note: In better-auth, 2FA status is on the user object
		if (options.requireMFA) {
			// Check if user has 2FA enabled - this is stored in the user record
			const twoFactorEnabled = (user as unknown as { twoFactorEnabled?: boolean }).twoFactorEnabled;
			if (!twoFactorEnabled) {
				throw new HTTPException(403, {
					message: "Two-factor authentication must be enabled for LIVE environment",
					cause: { code: "MFA_REQUIRED" },
				});
			}
		}

		// Check confirmation header
		if (options.requireConfirmation) {
			const confirmation = c.req.header("X-Confirm-Action");
			if (confirmation !== "true") {
				throw new HTTPException(428, {
					message: "Action confirmation required for LIVE environment",
					cause: { code: "CONFIRMATION_REQUIRED" },
				});
			}
		}

		// Audit logging
		if (options.auditLog) {
			const auditEntry = {
				id: crypto.randomUUID(),
				userId: user.id,
				userEmail: user.email,
				action: `${c.req.method} ${c.req.path}`,
				ipAddress: c.req.header("X-Forwarded-For") ?? c.req.header("X-Real-IP") ?? "unknown",
				userAgent: c.req.header("User-Agent") ?? null,
				environment: "LIVE",
			};
			// Persist audit entry to database (non-blocking)
			import("../db.js").then(async ({ getAuditLogRepo }) => {
				try {
					const repo = await getAuditLogRepo();
					await repo.create(auditEntry);
				} catch {}
			});
		}

		await next();
	};
}

// ============================================
// Helper Functions
// ============================================

/**
 * Get the current session from context.
 * Throws if no session is present (use after requireAuth).
 */
export function getSession(c: { get: (key: "session") => Session | null }): Session {
	const session = c.get("session");
	if (!session) {
		throw new HTTPException(401, { message: "No session found" });
	}
	return session;
}

/**
 * Get the current user from context.
 * Throws if no user is present (use after requireAuth).
 */
export function getUser(c: { get: (key: "user") => User | null }): User {
	const user = c.get("user");
	if (!user) {
		throw new HTTPException(401, { message: "No user found" });
	}
	return user;
}
