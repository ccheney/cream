/**
 * WebSocket Security Tests
 *
 * Tests for authentication and rate limiting.
 * Role-based authorization has been removed - all authenticated users
 * have access to all channels.
 *
 * @see docs/plans/ui/06-websocket.md
 * @see docs/plans/30-better-auth-migration.md
 */

import { beforeEach, describe, expect, it } from "bun:test";
import type { Channel } from "../../../../packages/domain/src/websocket/channel.js";
import type { Session } from "../auth/better-auth.js";
import {
	ALLOWED_ORIGINS,
	addAllowedOrigin,
	CONNECTION_LIMITS,
	canAccessChannel,
	canAccessChannels,
	checkConnectionSecurity,
	checkMessageRateLimit,
	checkSubscribeRateLimit,
	checkSubscriptionSecurity,
	checkSymbolSubscriptionSecurity,
	clearAuditLog,
	connectionTracker,
	createConnectionTracker,
	createRateLimiter,
	createSymbolTracker,
	filterAccessibleChannels,
	getAuditLog,
	logSecurityEvent,
	messageRateLimiterMinute,
	RATE_LIMITS,
	recordSubscribe,
	type SecurityEventType,
	subscribeRateLimiter,
	symbolTracker,
	validateOrigin,
} from "./security";

// ============================================
// Test Helpers
// ============================================

/**
 * Create a mock session for testing.
 */
function createMockSession(userId = "user-123"): Session {
	return {
		session: {
			id: "session-123",
			createdAt: new Date(),
			updatedAt: new Date(),
			userId,
			expiresAt: new Date(Date.now() + 3600000),
			token: "mock-token",
		},
		user: {
			id: userId,
			email: "test@example.com",
			name: "Test User",
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date(),
			twoFactorEnabled: false,
		},
	};
}

// ============================================
// Channel Authorization Tests (Simplified)
// ============================================

describe("canAccessChannel", () => {
	it("allows authenticated user to access any channel", () => {
		const session = createMockSession();
		const channels: Channel[] = [
			"quotes",
			"trades",
			"options",
			"orders",
			"decisions",
			"agents",
			"cycles",
			"backtests",
			"alerts",
			"system",
			"portfolio",
		];

		for (const channel of channels) {
			const result = canAccessChannel(channel, session);
			expect(result.authorized).toBe(true);
		}
	});

	it("denies unauthenticated user", () => {
		const result = canAccessChannel("quotes", null);
		expect(result.authorized).toBe(false);
		expect(result.reason).toBe("Authentication required");
	});
});

describe("canAccessChannels", () => {
	it("returns map of results for authenticated user", () => {
		const session = createMockSession();
		const channels: Channel[] = ["quotes", "agents", "system"];
		const results = canAccessChannels(channels, session);

		expect(results.size).toBe(3);
		expect(results.get("quotes")?.authorized).toBe(true);
		expect(results.get("agents")?.authorized).toBe(true);
		expect(results.get("system")?.authorized).toBe(true);
	});

	it("returns map of denied results for unauthenticated user", () => {
		const channels: Channel[] = ["quotes", "agents"];
		const results = canAccessChannels(channels, null);

		expect(results.size).toBe(2);
		expect(results.get("quotes")?.authorized).toBe(false);
		expect(results.get("agents")?.authorized).toBe(false);
	});
});

describe("filterAccessibleChannels", () => {
	it("returns all channels for authenticated user", () => {
		const session = createMockSession();
		const channels: Channel[] = ["quotes", "agents", "orders", "system"];
		const filtered = filterAccessibleChannels(channels, session);

		expect(filtered.length).toBe(4);
		expect(filtered).toContain("quotes");
		expect(filtered).toContain("agents");
		expect(filtered).toContain("orders");
		expect(filtered).toContain("system");
	});

	it("returns empty array for unauthenticated user", () => {
		const channels: Channel[] = ["quotes", "agents", "orders", "system"];
		const filtered = filterAccessibleChannels(channels, null);

		expect(filtered.length).toBe(0);
	});
});

// ============================================
// Rate Limiting Tests
// ============================================

describe("createRateLimiter", () => {
	it("allows requests under limit", () => {
		const limiter = createRateLimiter(5, 1000);
		const result = limiter.check("test-key");
		expect(result.allowed).toBe(true);
		expect(result.remaining).toBe(4);
	});

	it("tracks request count", () => {
		const limiter = createRateLimiter(5, 1000);
		limiter.record("test-key");
		limiter.record("test-key");
		const state = limiter.getState("test-key");
		expect(state?.count).toBe(2);
	});

	it("denies requests over limit", () => {
		const limiter = createRateLimiter(3, 1000);
		limiter.record("test-key");
		limiter.record("test-key");
		limiter.record("test-key");
		const result = limiter.check("test-key");
		expect(result.allowed).toBe(false);
		expect(result.remaining).toBe(0);
	});

	it("provides reset time", () => {
		const limiter = createRateLimiter(5, 1000);
		const result = limiter.check("test-key");
		expect(result.resetAt).toBeInstanceOf(Date);
		expect(result.resetAt.getTime()).toBeGreaterThan(Date.now());
	});

	it("resets after window", async () => {
		const limiter = createRateLimiter(3, 50);
		limiter.record("test-key");
		limiter.record("test-key");
		limiter.record("test-key");

		// Wait for window to pass
		await new Promise((resolve) => setTimeout(resolve, 60));

		const result = limiter.check("test-key");
		expect(result.allowed).toBe(true);
	});

	it("reset clears key", () => {
		const limiter = createRateLimiter(5, 1000);
		limiter.record("test-key");
		limiter.reset("test-key");
		const state = limiter.getState("test-key");
		expect(state).toBeUndefined();
	});
});

describe("checkSubscribeRateLimit", () => {
	beforeEach(() => {
		subscribeRateLimiter.reset("conn-test");
	});

	it("allows subscribe under limit", () => {
		const result = checkSubscribeRateLimit("conn-test");
		expect(result.allowed).toBe(true);
	});

	it("has limit of 10 per second", () => {
		// Record 10 subscribes
		for (let i = 0; i < 10; i++) {
			recordSubscribe("conn-test-2");
		}
		const result = checkSubscribeRateLimit("conn-test-2");
		expect(result.allowed).toBe(false);
	});
});

describe("checkMessageRateLimit", () => {
	beforeEach(() => {
		messageRateLimiterMinute.reset("conn-test");
	});

	it("allows messages under limit", () => {
		const result = checkMessageRateLimit("conn-test");
		expect(result.allowed).toBe(true);
	});
});

// ============================================
// Connection Tracking Tests
// ============================================

describe("createConnectionTracker", () => {
	let tracker: ReturnType<typeof createConnectionTracker>;

	beforeEach(() => {
		tracker = createConnectionTracker();
	});

	it("allows first connection", () => {
		expect(tracker.canConnect("user-1")).toBe(true);
	});

	it("tracks connection count", () => {
		tracker.addConnection("user-1", "conn-1");
		tracker.addConnection("user-1", "conn-2");
		expect(tracker.getConnectionCount("user-1")).toBe(2);
	});

	it("returns connection IDs", () => {
		tracker.addConnection("user-1", "conn-1");
		tracker.addConnection("user-1", "conn-2");
		const ids = tracker.getConnectionIds("user-1");
		expect(ids).toContain("conn-1");
		expect(ids).toContain("conn-2");
	});

	it("removes connections", () => {
		tracker.addConnection("user-1", "conn-1");
		tracker.addConnection("user-1", "conn-2");
		tracker.removeConnection("user-1", "conn-1");
		expect(tracker.getConnectionCount("user-1")).toBe(1);
	});

	it("enforces max connections per user", () => {
		for (let i = 0; i < 5; i++) {
			tracker.addConnection("user-1", `conn-${i}`);
		}
		expect(tracker.canConnect("user-1")).toBe(false);
	});
});

// ============================================
// Symbol Tracking Tests
// ============================================

describe("createSymbolTracker", () => {
	let tracker: ReturnType<typeof createSymbolTracker>;

	beforeEach(() => {
		tracker = createSymbolTracker();
	});

	it("allows initial subscription", () => {
		expect(tracker.canSubscribe("conn-1", 10)).toBe(true);
	});

	it("tracks symbol count", () => {
		tracker.setSymbolCount("conn-1", 20);
		expect(tracker.getSymbolCount("conn-1")).toBe(20);
	});

	it("enforces max symbols", () => {
		tracker.setSymbolCount("conn-1", 45);
		expect(tracker.canSubscribe("conn-1", 10)).toBe(false);
	});

	it("allows up to max", () => {
		tracker.setSymbolCount("conn-1", 40);
		expect(tracker.canSubscribe("conn-1", 10)).toBe(true);
	});

	it("removes connection tracking", () => {
		tracker.setSymbolCount("conn-1", 20);
		tracker.removeConnection("conn-1");
		expect(tracker.getSymbolCount("conn-1")).toBe(0);
	});
});

// ============================================
// Origin Validation Tests
// ============================================

describe("validateOrigin", () => {
	it("accepts localhost origins", () => {
		expect(validateOrigin("http://localhost:3000")).toBe(true);
		expect(validateOrigin("http://localhost:3001")).toBe(true);
		expect(validateOrigin("http://localhost:8080")).toBe(true);
	});

	it("rejects null origin", () => {
		expect(validateOrigin(null)).toBe(false);
	});

	it("accepts allowed origins", () => {
		expect(validateOrigin("https://cream.app")).toBe(true);
		expect(validateOrigin("https://dashboard.cream.app")).toBe(true);
	});

	it("rejects unknown origins", () => {
		expect(validateOrigin("https://evil.com")).toBe(false);
	});
});

describe("addAllowedOrigin", () => {
	it("adds new origin", () => {
		addAllowedOrigin("https://custom.example.com");
		expect(validateOrigin("https://custom.example.com")).toBe(true);
	});
});

// ============================================
// Audit Logging Tests
// ============================================

describe("logSecurityEvent", () => {
	beforeEach(() => {
		clearAuditLog();
	});

	it("logs event with timestamp", () => {
		logSecurityEvent({
			eventType: "connection.attempt",
			userId: "user-123",
			success: true,
		});
		const log = getAuditLog();
		expect(log.length).toBe(1);
		expect(log[0]?.timestamp).toBeDefined();
	});

	it("includes all event fields", () => {
		logSecurityEvent({
			eventType: "auth.failure",
			userId: "user-123",
			connectionId: "conn-456",
			success: false,
			reason: "No valid session",
		});
		const log = getAuditLog();
		const firstEntry = log[0];
		expect(firstEntry?.eventType).toBe("auth.failure");
		expect(firstEntry?.userId).toBe("user-123");
		expect(firstEntry?.connectionId).toBe("conn-456");
		expect(firstEntry?.success).toBe(false);
		expect(firstEntry?.reason).toBe("No valid session");
	});
});

describe("getAuditLog", () => {
	beforeEach(() => {
		clearAuditLog();
	});

	it("returns empty array when no events", () => {
		const log = getAuditLog();
		expect(log).toEqual([]);
	});

	it("filters by eventType", () => {
		logSecurityEvent({ eventType: "connection.attempt", success: true });
		logSecurityEvent({ eventType: "auth.failure", success: false });
		logSecurityEvent({ eventType: "connection.attempt", success: true });

		const log = getAuditLog({ eventType: "auth.failure" });
		expect(log.length).toBe(1);
		expect(log[0]?.eventType).toBe("auth.failure");
	});

	it("filters by userId", () => {
		logSecurityEvent({ eventType: "connection.attempt", userId: "user-1", success: true });
		logSecurityEvent({ eventType: "connection.attempt", userId: "user-2", success: true });

		const log = getAuditLog({ userId: "user-1" });
		expect(log.length).toBe(1);
		expect(log[0]?.userId).toBe("user-1");
	});

	it("filters by success", () => {
		logSecurityEvent({ eventType: "connection.attempt", success: true });
		logSecurityEvent({ eventType: "auth.failure", success: false });

		const log = getAuditLog({ success: false });
		expect(log.length).toBe(1);
		expect(log[0]?.success).toBe(false);
	});

	it("limits results", () => {
		for (let i = 0; i < 10; i++) {
			logSecurityEvent({ eventType: "connection.attempt", success: true });
		}
		const log = getAuditLog({}, 5);
		expect(log.length).toBe(5);
	});
});

// ============================================
// Convenience Function Tests
// ============================================

describe("checkConnectionSecurity", () => {
	beforeEach(() => {
		clearAuditLog();
		// Reset connection tracker for the test user
		for (let i = 0; i < 10; i++) {
			connectionTracker.removeConnection("user-123", `conn-${i}`);
		}
	});

	it("rejects invalid origin", () => {
		const session = createMockSession();
		const result = checkConnectionSecurity(session, "https://evil.com");
		expect(result.allowed).toBe(false);
		expect(result.error).toBe("Invalid origin");
	});

	it("rejects null session", () => {
		const result = checkConnectionSecurity(null, "http://localhost:3000");
		expect(result.allowed).toBe(false);
		expect(result.error).toBe("Authentication required");
	});

	it("accepts valid connection", () => {
		const session = createMockSession();
		const result = checkConnectionSecurity(session, "http://localhost:3000");
		expect(result.allowed).toBe(true);
	});

	it("logs audit event for accepted connection", () => {
		const session = createMockSession();
		checkConnectionSecurity(session, "http://localhost:3000");
		const log = getAuditLog();
		expect(log.some((e) => e.eventType === "connection.accepted")).toBe(true);
	});

	it("logs audit event for rejected connection", () => {
		checkConnectionSecurity(null, "http://localhost:3000");
		const log = getAuditLog();
		expect(log.some((e) => e.eventType === "auth.failure")).toBe(true);
	});
});

describe("checkSubscriptionSecurity", () => {
	beforeEach(() => {
		clearAuditLog();
		subscribeRateLimiter.reset("conn-test");
	});

	it("allows all channels for authenticated user", () => {
		const session = createMockSession();
		const result = checkSubscriptionSecurity("conn-test", session, ["quotes", "agents", "system"]);

		expect(result.allowed).toBe(true);
		expect(result.authorizedChannels).toContain("quotes");
		expect(result.authorizedChannels).toContain("agents");
		expect(result.authorizedChannels).toContain("system");
		expect(result.errors.length).toBe(0);
	});

	it("rejects unauthenticated user", () => {
		const result = checkSubscriptionSecurity("conn-test", null, ["quotes"]);
		expect(result.allowed).toBe(false);
		expect(result.authorizedChannels.length).toBe(0);
		expect(result.errors).toContain("Authentication required");
	});

	it("enforces rate limiting", () => {
		const session = createMockSession();
		// Exhaust rate limit
		for (let i = 0; i < 10; i++) {
			recordSubscribe("conn-rate-test");
		}

		const result = checkSubscriptionSecurity("conn-rate-test", session, ["quotes"]);
		expect(result.allowed).toBe(false);
		expect(result.errors.length).toBeGreaterThan(0);
	});
});

describe("checkSymbolSubscriptionSecurity", () => {
	beforeEach(() => {
		clearAuditLog();
		symbolTracker.removeConnection("conn-test");
	});

	it("allows under limit", () => {
		const result = checkSymbolSubscriptionSecurity("conn-test", "user-1", ["AAPL", "GOOGL"]);
		expect(result.allowed).toBe(true);
	});

	it("denies over limit", () => {
		symbolTracker.setSymbolCount("conn-test", 49);
		const result = checkSymbolSubscriptionSecurity("conn-test", "user-1", ["AAPL", "GOOGL"]);
		expect(result.allowed).toBe(false);
		expect(result.error).toContain("limit");
	});
});

// ============================================
// Constants Tests
// ============================================

describe("RATE_LIMITS", () => {
	it("has subscribe per second limit", () => {
		expect(RATE_LIMITS.SUBSCRIBE_PER_SECOND).toBe(10);
	});

	it("has messages per minute limit", () => {
		expect(RATE_LIMITS.MESSAGES_PER_MINUTE).toBe(100);
	});

	it("has messages per hour limit", () => {
		expect(RATE_LIMITS.MESSAGES_PER_HOUR).toBe(1000);
	});
});

describe("CONNECTION_LIMITS", () => {
	it("has max symbols per connection", () => {
		expect(CONNECTION_LIMITS.MAX_SYMBOLS_PER_CONNECTION).toBe(50);
	});

	it("has max connections per user", () => {
		expect(CONNECTION_LIMITS.MAX_CONNECTIONS_PER_USER).toBe(5);
	});
});

describe("ALLOWED_ORIGINS", () => {
	it("includes localhost origins", () => {
		expect(ALLOWED_ORIGINS).toContain("http://localhost:3000");
		expect(ALLOWED_ORIGINS).toContain("http://localhost:3001");
	});

	it("includes production origins", () => {
		expect(ALLOWED_ORIGINS).toContain("https://cream.app");
		expect(ALLOWED_ORIGINS).toContain("https://dashboard.cream.app");
	});
});

// ============================================
// Type Tests
// ============================================

describe("SecurityEventType Type", () => {
	it("includes connection events", () => {
		const types: SecurityEventType[] = [
			"connection.attempt",
			"connection.rejected",
			"connection.accepted",
		];
		expect(types.length).toBe(3);
	});

	it("includes auth events", () => {
		const types: SecurityEventType[] = ["auth.failure", "auth.success"];
		expect(types.length).toBe(2);
	});

	it("includes limit events", () => {
		const types: SecurityEventType[] = [
			"rate_limit.exceeded",
			"symbol_limit.exceeded",
			"connection_limit.exceeded",
		];
		expect(types.length).toBe(3);
	});
});

// ============================================
// Module Exports Tests
// ============================================

describe("Module Exports", () => {
	it("exports canAccessChannel", async () => {
		const module = await import("./security");
		expect(typeof module.canAccessChannel).toBe("function");
	});

	it("exports createRateLimiter", async () => {
		const module = await import("./security");
		expect(typeof module.createRateLimiter).toBe("function");
	});

	it("exports createConnectionTracker", async () => {
		const module = await import("./security");
		expect(typeof module.createConnectionTracker).toBe("function");
	});

	it("exports createSymbolTracker", async () => {
		const module = await import("./security");
		expect(typeof module.createSymbolTracker).toBe("function");
	});

	it("exports validateOrigin", async () => {
		const module = await import("./security");
		expect(typeof module.validateOrigin).toBe("function");
	});

	it("exports logSecurityEvent", async () => {
		const module = await import("./security");
		expect(typeof module.logSecurityEvent).toBe("function");
	});

	it("exports convenience functions", async () => {
		const module = await import("./security");
		expect(typeof module.checkConnectionSecurity).toBe("function");
		expect(typeof module.checkSubscriptionSecurity).toBe("function");
		expect(typeof module.checkSymbolSubscriptionSecurity).toBe("function");
	});

	it("exports constants", async () => {
		const module = await import("./security");
		expect(module.RATE_LIMITS).toBeDefined();
		expect(module.CONNECTION_LIMITS).toBeDefined();
		expect(module.ALLOWED_ORIGINS).toBeDefined();
	});

	it("exports default object", async () => {
		const module = await import("./security");
		expect(module.default).toBeDefined();
		expect(typeof module.default.canAccessChannel).toBe("function");
	});
});
