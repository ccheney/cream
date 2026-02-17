import { beforeEach, describe, expect, it } from "bun:test";
import type { Channel } from "@cream/domain/websocket";
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

describe("channel access", () => {
	it("allows authenticated user to access all channels", () => {
		const session = createMockSession();
		const channels: Channel[] = [
			"quotes",
			"trades",
			"options",
			"orders",
			"decisions",
			"agents",
			"cycles",
			"alerts",
			"system",
			"portfolio",
		];
		for (const channel of channels) {
			expect(canAccessChannel(channel, session).authorized).toBe(true);
		}
	});

	it("denies unauthenticated channel access", () => {
		const result = canAccessChannel("quotes", null);
		expect(result.authorized).toBe(false);
		expect(result.reason).toBe("Authentication required");
	});

	it("returns map for canAccessChannels", () => {
		const channels: Channel[] = ["quotes", "agents", "system"];
		const allowed = canAccessChannels(channels, createMockSession());
		expect(allowed.size).toBe(3);
		expect(allowed.get("quotes")?.authorized).toBe(true);
		const denied = canAccessChannels(["quotes", "agents"], null);
		expect(denied.get("quotes")?.authorized).toBe(false);
		expect(denied.get("agents")?.authorized).toBe(false);
	});

	it("filters channels based on authentication", () => {
		const channels: Channel[] = ["quotes", "agents", "orders", "system"];
		expect(filterAccessibleChannels(channels, createMockSession())).toEqual(channels);
		expect(filterAccessibleChannels(channels, null)).toEqual([]);
	});
});

describe("rate limiting", () => {
	it("createRateLimiter allows under limit and denies over limit", () => {
		const limiter = createRateLimiter(3, 1000);
		expect(limiter.check("test").allowed).toBe(true);
		limiter.record("test");
		limiter.record("test");
		limiter.record("test");
		const result = limiter.check("test");
		expect(result.allowed).toBe(false);
		expect(result.remaining).toBe(0);
		expect(result.resetAt).toBeInstanceOf(Date);
	});

	it("tracks state and resets keys", () => {
		const limiter = createRateLimiter(5, 1000);
		limiter.record("test");
		limiter.record("test");
		expect(limiter.getState("test")?.count).toBe(2);
		limiter.reset("test");
		expect(limiter.getState("test")).toBeUndefined();
	});

	it("resets after window", async () => {
		const limiter = createRateLimiter(3, 50);
		limiter.record("test");
		limiter.record("test");
		limiter.record("test");
		await new Promise((resolve) => setTimeout(resolve, 60));
		expect(limiter.check("test").allowed).toBe(true);
	});
});

describe("module rate limit helpers", () => {
	beforeEach(() => {
		subscribeRateLimiter.reset("conn-test");
		messageRateLimiterMinute.reset("conn-test");
	});

	it("checkSubscribeRateLimit and recordSubscribe enforce 10/sec", () => {
		expect(checkSubscribeRateLimit("conn-test").allowed).toBe(true);
		for (let i = 0; i < 10; i++) {
			recordSubscribe("conn-test-2");
		}
		expect(checkSubscribeRateLimit("conn-test-2").allowed).toBe(false);
	});

	it("checkMessageRateLimit allows messages under limit", () => {
		expect(checkMessageRateLimit("conn-test").allowed).toBe(true);
	});
});

describe("connection tracking", () => {
	let tracker: ReturnType<typeof createConnectionTracker>;

	beforeEach(() => {
		tracker = createConnectionTracker();
	});

	it("tracks connection count and IDs", () => {
		expect(tracker.canConnect("user-1")).toBe(true);
		tracker.addConnection("user-1", "conn-1");
		tracker.addConnection("user-1", "conn-2");
		expect(tracker.getConnectionCount("user-1")).toBe(2);
		expect(tracker.getConnectionIds("user-1")).toContain("conn-1");
		expect(tracker.getConnectionIds("user-1")).toContain("conn-2");
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

describe("symbol tracking", () => {
	let tracker: ReturnType<typeof createSymbolTracker>;

	beforeEach(() => {
		tracker = createSymbolTracker();
	});

	it("tracks symbol counts and limits", () => {
		expect(tracker.canSubscribe("conn-1", 10)).toBe(true);
		tracker.setSymbolCount("conn-1", 20);
		expect(tracker.getSymbolCount("conn-1")).toBe(20);
		tracker.setSymbolCount("conn-1", 45);
		expect(tracker.canSubscribe("conn-1", 10)).toBe(false);
		tracker.setSymbolCount("conn-1", 40);
		expect(tracker.canSubscribe("conn-1", 10)).toBe(true);
		tracker.removeConnection("conn-1");
		expect(tracker.getSymbolCount("conn-1")).toBe(0);
	});
});

describe("origin validation", () => {
	it("accepts localhost and configured origins", () => {
		expect(validateOrigin("http://localhost:3000")).toBe(true);
		expect(validateOrigin("http://localhost:3001")).toBe(true);
		expect(validateOrigin("http://localhost:8080")).toBe(true);
		expect(validateOrigin("https://cream.app")).toBe(true);
		expect(validateOrigin("https://dashboard.cream.app")).toBe(true);
	});

	it("rejects invalid and null origins", () => {
		expect(validateOrigin(null)).toBe(false);
		expect(validateOrigin("https://evil.com")).toBe(false);
	});

	it("allows adding a custom origin", () => {
		addAllowedOrigin("https://custom.example.com");
		expect(validateOrigin("https://custom.example.com")).toBe(true);
	});
});

describe("audit logging", () => {
	beforeEach(() => {
		clearAuditLog();
	});

	it("logs events with timestamps and fields", () => {
		logSecurityEvent({ eventType: "connection.attempt", userId: "user-123", success: true });
		logSecurityEvent({
			eventType: "auth.failure",
			userId: "user-123",
			connectionId: "conn-456",
			success: false,
			reason: "No valid session",
		});
		const log = getAuditLog();
		expect(log.length).toBe(2);
		expect(log[0]?.timestamp).toBeDefined();
		expect(log[1]?.eventType).toBe("auth.failure");
		expect(log[1]?.connectionId).toBe("conn-456");
		expect(log[1]?.reason).toBe("No valid session");
	});

	it("filters and limits audit log results", () => {
		logSecurityEvent({ eventType: "connection.attempt", userId: "user-1", success: true });
		logSecurityEvent({ eventType: "auth.failure", userId: "user-2", success: false });
		logSecurityEvent({ eventType: "connection.attempt", userId: "user-1", success: true });
		expect(getAuditLog({ eventType: "auth.failure" }).length).toBe(1);
		expect(getAuditLog({ userId: "user-1" }).length).toBe(2);
		expect(getAuditLog({ success: false }).length).toBe(1);
		for (let i = 0; i < 10; i++) {
			logSecurityEvent({ eventType: "connection.attempt", success: true });
		}
		expect(getAuditLog({}, 5).length).toBe(5);
	});
});

describe("checkConnectionSecurity", () => {
	beforeEach(() => {
		clearAuditLog();
		for (let i = 0; i < 10; i++) {
			connectionTracker.removeConnection("user-123", `conn-${i}`);
		}
	});

	it("rejects invalid origin and null session", () => {
		expect(checkConnectionSecurity(createMockSession(), "https://evil.com")).toEqual({
			allowed: false,
			error: "Invalid origin",
		});
		expect(checkConnectionSecurity(null, "http://localhost:3000")).toEqual({
			allowed: false,
			error: "Authentication required",
		});
	});

	it("accepts valid connection and logs accepted/rejected events", () => {
		expect(checkConnectionSecurity(createMockSession(), "http://localhost:3000").allowed).toBe(
			true,
		);
		checkConnectionSecurity(null, "http://localhost:3000");
		const log = getAuditLog();
		expect(log.some((event) => event.eventType === "connection.accepted")).toBe(true);
		expect(log.some((event) => event.eventType === "auth.failure")).toBe(true);
	});
});

describe("checkSubscriptionSecurity", () => {
	beforeEach(() => {
		clearAuditLog();
		subscribeRateLimiter.reset("conn-test");
	});

	it("allows channels for authenticated users", () => {
		const result = checkSubscriptionSecurity("conn-test", createMockSession(), [
			"quotes",
			"agents",
			"system",
		]);
		expect(result.allowed).toBe(true);
		expect(result.authorizedChannels).toEqual(["quotes", "agents", "system"]);
		expect(result.errors.length).toBe(0);
	});

	it("rejects unauthenticated users and rate-limited connections", () => {
		const unauth = checkSubscriptionSecurity("conn-test", null, ["quotes"]);
		expect(unauth.allowed).toBe(false);
		expect(unauth.errors).toContain("Authentication required");
		for (let i = 0; i < 10; i++) {
			recordSubscribe("conn-rate-test");
		}
		const limited = checkSubscriptionSecurity("conn-rate-test", createMockSession(), ["quotes"]);
		expect(limited.allowed).toBe(false);
		expect(limited.errors.length).toBeGreaterThan(0);
	});
});

describe("checkSymbolSubscriptionSecurity", () => {
	beforeEach(() => {
		clearAuditLog();
		symbolTracker.removeConnection("conn-test");
	});

	it("allows under limit and rejects over limit", () => {
		expect(checkSymbolSubscriptionSecurity("conn-test", "user-1", ["AAPL", "GOOGL"]).allowed).toBe(
			true,
		);
		symbolTracker.setSymbolCount("conn-test", 49);
		const denied = checkSymbolSubscriptionSecurity("conn-test", "user-1", ["AAPL", "GOOGL"]);
		expect(denied.allowed).toBe(false);
		expect(denied.error).toContain("limit");
	});
});

describe("constants", () => {
	it("expose expected rate and connection limits", () => {
		expect(RATE_LIMITS.SUBSCRIBE_PER_SECOND).toBe(10);
		expect(RATE_LIMITS.MESSAGES_PER_MINUTE).toBe(100);
		expect(RATE_LIMITS.MESSAGES_PER_HOUR).toBe(1000);
		expect(CONNECTION_LIMITS.MAX_SYMBOLS_PER_CONNECTION).toBe(50);
		expect(CONNECTION_LIMITS.MAX_CONNECTIONS_PER_USER).toBe(5);
	});

	it("include localhost and production allowed origins", () => {
		expect(ALLOWED_ORIGINS).toContain("http://localhost:3000");
		expect(ALLOWED_ORIGINS).toContain("http://localhost:3001");
		expect(ALLOWED_ORIGINS).toContain("https://cream.app");
		expect(ALLOWED_ORIGINS).toContain("https://dashboard.cream.app");
	});
});

describe("SecurityEventType", () => {
	it("includes connection, auth, and limit events", () => {
		const connectionEvents: SecurityEventType[] = [
			"connection.attempt",
			"connection.rejected",
			"connection.accepted",
		];
		const authEvents: SecurityEventType[] = ["auth.failure", "auth.success"];
		const limitEvents: SecurityEventType[] = [
			"rate_limit.exceeded",
			"symbol_limit.exceeded",
			"connection_limit.exceeded",
		];
		expect(connectionEvents).toHaveLength(3);
		expect(authEvents).toHaveLength(2);
		expect(limitEvents).toHaveLength(3);
	});
});

describe("module exports", () => {
	it("exports key functions, constants, and default object", async () => {
		const module = await import("./security");
		for (const fn of [
			"canAccessChannel",
			"createRateLimiter",
			"createConnectionTracker",
			"createSymbolTracker",
			"validateOrigin",
			"logSecurityEvent",
			"checkConnectionSecurity",
			"checkSubscriptionSecurity",
			"checkSymbolSubscriptionSecurity",
		] as const) {
			expect(typeof module[fn]).toBe("function");
		}
		expect(module.RATE_LIMITS).toBeDefined();
		expect(module.CONNECTION_LIMITS).toBeDefined();
		expect(module.ALLOWED_ORIGINS).toBeDefined();
		expect(module.default).toBeDefined();
		expect(typeof module.default.canAccessChannel).toBe("function");
	});
});
