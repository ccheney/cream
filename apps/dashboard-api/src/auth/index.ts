/**
 * Authentication Module
 *
 * Exports authentication utilities for the dashboard API.
 * Uses better-auth for session management and OAuth.
 *
 * @see docs/plans/30-better-auth-migration.md
 */

// Better Auth instance and types
export { auth, type Session, type User } from "./better-auth.js";

// Session middleware (better-auth based)
export {
	DEFAULT_LIVE_PROTECTION,
	getSession,
	getUser,
	type LiveProtectionOptions,
	liveProtection,
	optionalAuth,
	requireAuth,
	type SessionVariables,
	sessionMiddleware,
} from "./session.js";
