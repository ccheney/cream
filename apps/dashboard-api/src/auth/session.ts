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
import { getAuth, type Session, type User } from "./better-auth.js";

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
			const session = await getAuth().api.getSession({
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

function getClientIp(headers: { get: (name: string) => string | null | undefined }): string {
	return (
		headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ?? headers.get("X-Real-IP") ?? "unknown"
	);
}

function requireLiveUser(session: Session | null, user: User | null): User {
	if (!session || !user) {
		throw new HTTPException(401, { message: "Authentication required for LIVE environment" });
	}
	return user;
}

function requireIpWhitelisted(options: LiveProtectionOptions, clientIp: string): void {
	if (!options.ipWhitelist || options.ipWhitelist.length === 0) {
		return;
	}
	if (!options.ipWhitelist.includes(clientIp)) {
		throw new HTTPException(403, {
			message: "Access denied: IP not whitelisted for LIVE environment",
		});
	}
}

function requireMfaEnabled(options: LiveProtectionOptions, user: User): void {
	if (!options.requireMFA) {
		return;
	}
	const twoFactorEnabled = (user as unknown as { twoFactorEnabled?: boolean }).twoFactorEnabled;
	if (!twoFactorEnabled) {
		throw new HTTPException(403, {
			message: "Two-factor authentication must be enabled for LIVE environment",
			cause: { code: "MFA_REQUIRED" },
		});
	}
}

function requireLiveConfirmation(
	options: LiveProtectionOptions,
	confirmation: string | undefined,
): void {
	if (!options.requireConfirmation) {
		return;
	}
	if (confirmation !== "true") {
		throw new HTTPException(428, {
			message: "Action confirmation required for LIVE environment",
			cause: { code: "CONFIRMATION_REQUIRED" },
		});
	}
}

function writeAuditEntry(
	options: LiveProtectionOptions,
	user: User,
	context: { req: { method: string; path: string; header: (name: string) => string | undefined } },
): void {
	if (!options.auditLog) {
		return;
	}
	const auditEntry = {
		userId: user.id,
		userEmail: user.email,
		action: `${context.req.method} ${context.req.path}`,
		ipAddress: getClientIp({ get: context.req.header }),
		userAgent: context.req.header("User-Agent") ?? null,
		environment: "LIVE",
	};
	import("../db.js").then(async ({ getAuditLogRepo }) => {
		try {
			const repo = await getAuditLogRepo();
			await repo.create(auditEntry);
		} catch {}
	});
}

/**
 * Middleware to protect LIVE environment operations.
 *
 * Only applies restrictions when CREAM_ENV=LIVE.
 */
export function liveProtection(
	options: LiveProtectionOptions = DEFAULT_LIVE_PROTECTION,
): MiddlewareHandler<{ Variables: SessionVariables }> {
	return async (c, next) => {
		if (requireEnv() !== "LIVE") {
			await next();
			return;
		}

		const session = c.get("session");
		const user = requireLiveUser(session, c.get("user"));

		const clientIp = getClientIp({ get: (name) => c.req.header(name) });
		requireIpWhitelisted(options, clientIp);
		requireMfaEnabled(options, user);
		requireLiveConfirmation(options, c.req.header("X-Confirm-Action"));
		writeAuditEntry(options, user, c);

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
