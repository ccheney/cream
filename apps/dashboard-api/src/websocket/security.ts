/**
 * WebSocket Security Module
 *
 * Implements authentication and rate limiting for WebSocket connections.
 * Role-based authorization has been removed - all authenticated users
 * have access to all channels.
 *
 * @see docs/plans/ui/06-websocket.md lines 14-18
 * @see docs/plans/30-better-auth-migration.md
 */

import type { Channel } from "@cream/domain/websocket";
import type { Session } from "../auth/better-auth.js";

export interface AuthResult {
	authenticated: boolean;
	userId?: string;
	error?: string;
}

export interface AuthorizationResult {
	authorized: boolean;
	reason?: string;
}

export interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	resetAt: Date;
	reason?: string;
}

export interface SecurityAuditEvent {
	timestamp: string;
	eventType: SecurityEventType;
	userId?: string;
	connectionId?: string;
	channel?: string;
	symbol?: string;
	success: boolean;
	reason?: string;
	metadata?: Record<string, unknown>;
}

export type SecurityEventType =
	| "connection.attempt"
	| "connection.rejected"
	| "connection.accepted"
	| "auth.failure"
	| "auth.success"
	| "authorization.denied"
	| "rate_limit.exceeded"
	| "symbol_limit.exceeded"
	| "connection_limit.exceeded";

export const RATE_LIMITS = {
	/** Max subscribe/unsubscribe per second */
	SUBSCRIBE_PER_SECOND: 10,
	/** Max messages per minute */
	MESSAGES_PER_MINUTE: 100,
	/** Max messages per hour */
	MESSAGES_PER_HOUR: 1000,
} as const;

export const CONNECTION_LIMITS = {
	/** Max symbols per connection */
	MAX_SYMBOLS_PER_CONNECTION: 50,
	/** Max connections per user */
	MAX_CONNECTIONS_PER_USER: 5,
} as const;

export const ALLOWED_ORIGINS = [
	"http://localhost:3000",
	"http://localhost:3001",
	"https://cream.app",
	"https://dashboard.cream.app",
];

/**
 * All authenticated users can access all channels.
 */
export function canAccessChannel(_channel: Channel, session: Session | null): AuthorizationResult {
	if (!session) {
		return {
			authorized: false,
			reason: "Authentication required",
		};
	}

	return { authorized: true };
}

export function canAccessChannels(
	channels: Channel[],
	session: Session | null
): Map<Channel, AuthorizationResult> {
	const results = new Map<Channel, AuthorizationResult>();
	for (const channel of channels) {
		results.set(channel, canAccessChannel(channel, session));
	}
	return results;
}

export function filterAccessibleChannels(channels: Channel[], session: Session | null): Channel[] {
	return session ? channels : [];
}

export interface RateLimiter {
	check(key: string): RateLimitResult;
	record(key: string): void;
	reset(key: string): void;
	getState(key: string): { count: number; windowStart: Date } | undefined;
}

interface RateLimitBucket {
	count: number;
	windowStart: number;
}

export function createRateLimiter(maxRequests: number, windowMs: number): RateLimiter {
	const buckets = new Map<string, RateLimitBucket>();

	const getOrCreateBucket = (key: string): RateLimitBucket => {
		const now = Date.now();
		let bucket = buckets.get(key);

		// If bucket doesn't exist or window has passed, create new one
		if (!bucket || now - bucket.windowStart >= windowMs) {
			bucket = { count: 0, windowStart: now };
			buckets.set(key, bucket);
		}

		return bucket;
	};

	return {
		check(key: string): RateLimitResult {
			const bucket = getOrCreateBucket(key);
			const remaining = maxRequests - bucket.count;
			const resetAt = new Date(bucket.windowStart + windowMs);

			if (bucket.count >= maxRequests) {
				return {
					allowed: false,
					remaining: 0,
					resetAt,
					reason: `Rate limit exceeded: ${maxRequests} per ${windowMs}ms`,
				};
			}

			return {
				allowed: true,
				remaining: remaining - 1,
				resetAt,
			};
		},

		record(key: string): void {
			const bucket = getOrCreateBucket(key);
			bucket.count++;
		},

		reset(key: string): void {
			buckets.delete(key);
		},

		getState(key: string) {
			const bucket = buckets.get(key);
			if (!bucket) {
				return undefined;
			}
			return {
				count: bucket.count,
				windowStart: new Date(bucket.windowStart),
			};
		},
	};
}

export const subscribeRateLimiter = createRateLimiter(RATE_LIMITS.SUBSCRIBE_PER_SECOND, 1000);
export const messageRateLimiterMinute = createRateLimiter(RATE_LIMITS.MESSAGES_PER_MINUTE, 60000);
export const messageRateLimiterHour = createRateLimiter(RATE_LIMITS.MESSAGES_PER_HOUR, 3600000);

export function checkMessageRateLimit(connectionId: string): RateLimitResult {
	const minuteResult = messageRateLimiterMinute.check(connectionId);
	if (!minuteResult.allowed) {
		return minuteResult;
	}

	const hourResult = messageRateLimiterHour.check(connectionId);
	if (!hourResult.allowed) {
		return hourResult;
	}

	return minuteResult;
}

export function recordMessage(connectionId: string): void {
	messageRateLimiterMinute.record(connectionId);
	messageRateLimiterHour.record(connectionId);
}

export function checkSubscribeRateLimit(connectionId: string): RateLimitResult {
	return subscribeRateLimiter.check(connectionId);
}

export function recordSubscribe(connectionId: string): void {
	subscribeRateLimiter.record(connectionId);
}

interface ConnectionTracker {
	canConnect(userId: string): boolean;
	addConnection(userId: string, connectionId: string): void;
	removeConnection(userId: string, connectionId: string): void;
	getConnectionCount(userId: string): number;
	getConnectionIds(userId: string): string[];
}

export function createConnectionTracker(): ConnectionTracker {
	const userConnections = new Map<string, Set<string>>();

	return {
		canConnect(userId: string): boolean {
			const connections = userConnections.get(userId);
			const count = connections?.size ?? 0;
			return count < CONNECTION_LIMITS.MAX_CONNECTIONS_PER_USER;
		},

		addConnection(userId: string, connectionId: string): void {
			let connections = userConnections.get(userId);
			if (!connections) {
				connections = new Set();
				userConnections.set(userId, connections);
			}
			connections.add(connectionId);
		},

		removeConnection(userId: string, connectionId: string): void {
			const connections = userConnections.get(userId);
			if (connections) {
				connections.delete(connectionId);
				if (connections.size === 0) {
					userConnections.delete(userId);
				}
			}
		},

		getConnectionCount(userId: string): number {
			return userConnections.get(userId)?.size ?? 0;
		},

		getConnectionIds(userId: string): string[] {
			return Array.from(userConnections.get(userId) ?? []);
		},
	};
}

export const connectionTracker = createConnectionTracker();

interface SymbolTracker {
	canSubscribe(connectionId: string, symbolCount: number): boolean;
	getSymbolCount(connectionId: string): number;
	setSymbolCount(connectionId: string, count: number): void;
	removeConnection(connectionId: string): void;
}

export function createSymbolTracker(): SymbolTracker {
	const symbolCounts = new Map<string, number>();

	return {
		canSubscribe(connectionId: string, symbolCount: number): boolean {
			const current = symbolCounts.get(connectionId) ?? 0;
			const total = current + symbolCount;
			return total <= CONNECTION_LIMITS.MAX_SYMBOLS_PER_CONNECTION;
		},

		getSymbolCount(connectionId: string): number {
			return symbolCounts.get(connectionId) ?? 0;
		},

		setSymbolCount(connectionId: string, count: number): void {
			if (count <= 0) {
				symbolCounts.delete(connectionId);
			} else {
				symbolCounts.set(connectionId, count);
			}
		},

		removeConnection(connectionId: string): void {
			symbolCounts.delete(connectionId);
		},
	};
}

export const symbolTracker = createSymbolTracker();

export function validateOrigin(origin: string | null): boolean {
	if (!origin) {
		return false;
	}

	// In development, allow all localhost origins
	if (origin.startsWith("http://localhost:")) {
		return true;
	}

	return ALLOWED_ORIGINS.includes(origin);
}

export function addAllowedOrigin(origin: string): void {
	if (!ALLOWED_ORIGINS.includes(origin)) {
		(ALLOWED_ORIGINS as string[]).push(origin);
	}
}

const auditLog: SecurityAuditEvent[] = [];
const MAX_AUDIT_LOG_SIZE = 10000;

export function logSecurityEvent(event: Omit<SecurityAuditEvent, "timestamp">): void {
	const fullEvent: SecurityAuditEvent = {
		...event,
		timestamp: new Date().toISOString(),
	};

	auditLog.push(fullEvent);

	if (auditLog.length > MAX_AUDIT_LOG_SIZE) {
		auditLog.splice(0, auditLog.length - MAX_AUDIT_LOG_SIZE);
	}
}

export function getAuditLog(
	filter?: {
		eventType?: SecurityEventType;
		userId?: string;
		connectionId?: string;
		success?: boolean;
		since?: Date;
	},
	limit = 100
): SecurityAuditEvent[] {
	let filtered = auditLog;

	if (filter) {
		filtered = auditLog.filter((event) => {
			if (filter.eventType && event.eventType !== filter.eventType) {
				return false;
			}
			if (filter.userId && event.userId !== filter.userId) {
				return false;
			}
			if (filter.connectionId && event.connectionId !== filter.connectionId) {
				return false;
			}
			if (filter.success !== undefined && event.success !== filter.success) {
				return false;
			}
			if (filter.since && new Date(event.timestamp) < filter.since) {
				return false;
			}
			return true;
		});
	}

	return filtered.slice(-limit);
}

export function clearAuditLog(): void {
	auditLog.length = 0;
}

/**
 * Simplified to authentication-only (no role checks).
 */
export function checkConnectionSecurity(
	session: Session | null,
	origin: string | null
): { allowed: boolean; error?: string } {
	if (!validateOrigin(origin)) {
		logSecurityEvent({
			eventType: "connection.rejected",
			userId: session?.user?.id,
			success: false,
			reason: "Invalid origin",
			metadata: { origin },
		});
		return { allowed: false, error: "Invalid origin" };
	}

	if (!session) {
		logSecurityEvent({
			eventType: "auth.failure",
			success: false,
			reason: "No valid session",
		});
		return { allowed: false, error: "Authentication required" };
	}

	const userId = session.user.id;
	if (!connectionTracker.canConnect(userId)) {
		logSecurityEvent({
			eventType: "connection_limit.exceeded",
			userId,
			success: false,
			reason: `Max ${CONNECTION_LIMITS.MAX_CONNECTIONS_PER_USER} connections per user`,
		});
		return {
			allowed: false,
			error: "Connection limit exceeded",
		};
	}

	logSecurityEvent({
		eventType: "connection.accepted",
		userId,
		success: true,
	});

	return { allowed: true };
}

/**
 * All channels accessible to authenticated users.
 */
export function checkSubscriptionSecurity(
	connectionId: string,
	session: Session | null,
	channels: Channel[]
): { allowed: boolean; authorizedChannels: Channel[]; errors: string[] } {
	const errors: string[] = [];

	if (!session) {
		logSecurityEvent({
			eventType: "auth.failure",
			connectionId,
			success: false,
			reason: "Authentication required",
		});
		return { allowed: false, authorizedChannels: [], errors: ["Authentication required"] };
	}

	const userId = session.user.id;
	const rateResult = checkSubscribeRateLimit(connectionId);
	if (!rateResult.allowed) {
		const reason = rateResult.reason ?? "Rate limit exceeded";
		logSecurityEvent({
			eventType: "rate_limit.exceeded",
			connectionId,
			userId,
			success: false,
			reason,
		});
		return { allowed: false, authorizedChannels: [], errors: [reason] };
	}

	const authorizedChannels = channels;
	recordSubscribe(connectionId);

	return {
		allowed: authorizedChannels.length > 0,
		authorizedChannels,
		errors,
	};
}

export function checkSymbolSubscriptionSecurity(
	connectionId: string,
	userId: string,
	newSymbols: string[]
): { allowed: boolean; error?: string } {
	if (!symbolTracker.canSubscribe(connectionId, newSymbols.length)) {
		logSecurityEvent({
			eventType: "symbol_limit.exceeded",
			connectionId,
			userId,
			success: false,
			reason: `Max ${CONNECTION_LIMITS.MAX_SYMBOLS_PER_CONNECTION} symbols per connection`,
			metadata: { requestedCount: newSymbols.length },
		});
		return {
			allowed: false,
			error: `Symbol limit exceeded: max ${CONNECTION_LIMITS.MAX_SYMBOLS_PER_CONNECTION} symbols`,
		};
	}

	return { allowed: true };
}

export default {
	canAccessChannel,
	checkConnectionSecurity,
	checkSubscriptionSecurity,
	checkSymbolSubscriptionSecurity,
	logSecurityEvent,
	getAuditLog,
};
