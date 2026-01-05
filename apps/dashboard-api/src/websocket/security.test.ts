/**
 * WebSocket Security Tests
 *
 * Tests for authentication, authorization, and rate limiting.
 *
 * @see docs/plans/ui/06-websocket.md
 */

import { beforeEach, describe, expect, it } from "bun:test";
import type { Channel } from "../../../../packages/domain/src/websocket/channel.js";
import {
  addAllowedOrigin,
  CHANNEL_PERMISSIONS,
  CONNECTION_LIMITS,
  canAccessChannel,
  canAccessChannels,
  checkConnectionSecurity,
  checkMessageRateLimit,
  checkSubscribeRateLimit,
  checkSubscriptionSecurity,
  checkSymbolSubscriptionSecurity,
  clearAuditLog,
  createConnectionTracker,
  createRateLimiter,
  createSymbolTracker,
  decodeTokenPayload,
  filterAccessibleChannels,
  getAuditLog,
  isTokenExpired,
  isTokenExpiringSoon,
  logSecurityEvent,
  messageRateLimiterMinute,
  RATE_LIMITS,
  recordSubscribe,
  type SecurityEventType,
  subscribeRateLimiter,
  symbolTracker,
  type TokenErrorCode,
  type UserRole,
  validateOrigin,
  validateToken,
} from "./security";

// ============================================
// Token Validation Tests
// ============================================

describe("validateToken", () => {
  it("rejects null token", () => {
    const result = validateToken(null);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe("MISSING_TOKEN");
  });

  it("rejects empty token", () => {
    const result = validateToken("");
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe("MISSING_TOKEN");
  });

  it("rejects short token", () => {
    const result = validateToken("short");
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe("INVALID_FORMAT");
  });

  it("strips Bearer prefix", () => {
    const token = "Bearer somevalidtoken123";
    const result = validateToken(token);
    expect(result.valid).toBe(true);
    expect(result.userId).toBeDefined();
  });

  it("accepts token without Bearer prefix", () => {
    const token = "somevalidtoken123";
    const result = validateToken(token);
    expect(result.valid).toBe(true);
  });

  it("returns userId on success", () => {
    const token = "user123.user.9999999999";
    const result = validateToken(token);
    expect(result.valid).toBe(true);
    expect(result.userId).toBe("user123");
  });

  it("returns role on success", () => {
    const token = "user123.admin.9999999999";
    const result = validateToken(token);
    expect(result.valid).toBe(true);
    expect(result.role).toBe("admin");
  });

  it("returns expiresAt on success", () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = `user123.user.${exp}`;
    const result = validateToken(token);
    expect(result.valid).toBe(true);
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  it("rejects expired token", () => {
    const expiredTime = Math.floor(Date.now() / 1000) - 100;
    const token = `user123.user.${expiredTime}`;
    const result = validateToken(token);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe("EXPIRED");
  });
});

describe("decodeTokenPayload", () => {
  it("parses structured token", () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const payload = decodeTokenPayload(`user123.admin.${exp}`);
    expect(payload.sub).toBe("user123");
    expect(payload.role).toBe("admin");
    expect(payload.exp).toBe(exp);
  });

  it("returns default payload for unstructured token", () => {
    const payload = decodeTokenPayload("randomtoken12345");
    expect(payload.sub).toMatch(/^user-/);
    expect(payload.role).toBe("user");
    expect(payload.exp).toBeGreaterThan(Date.now() / 1000);
  });
});

describe("isTokenExpiringSoon", () => {
  it("returns true when expiring within warning period", () => {
    const expiresAt = new Date(Date.now() + 20000); // 20 seconds
    expect(isTokenExpiringSoon(expiresAt)).toBe(true);
  });

  it("returns false when not expiring soon", () => {
    const expiresAt = new Date(Date.now() + 300000); // 5 minutes
    expect(isTokenExpiringSoon(expiresAt)).toBe(false);
  });

  it("returns false when already expired", () => {
    const expiresAt = new Date(Date.now() - 1000);
    expect(isTokenExpiringSoon(expiresAt)).toBe(false);
  });
});

describe("isTokenExpired", () => {
  it("returns true for past date", () => {
    const expiresAt = new Date(Date.now() - 1000);
    expect(isTokenExpired(expiresAt)).toBe(true);
  });

  it("returns false for future date", () => {
    const expiresAt = new Date(Date.now() + 1000);
    expect(isTokenExpired(expiresAt)).toBe(false);
  });
});

// ============================================
// Channel Authorization Tests
// ============================================

describe("canAccessChannel", () => {
  it("allows user to access quotes", () => {
    const result = canAccessChannel("quotes", "user");
    expect(result.authorized).toBe(true);
  });

  it("allows user to access orders", () => {
    const result = canAccessChannel("orders", "user");
    expect(result.authorized).toBe(true);
  });

  it("allows user to access decisions", () => {
    const result = canAccessChannel("decisions", "user");
    expect(result.authorized).toBe(true);
  });

  it("denies user access to agents", () => {
    const result = canAccessChannel("agents", "user");
    expect(result.authorized).toBe(false);
    expect(result.reason).toContain("Insufficient permissions");
  });

  it("denies user access to cycles", () => {
    const result = canAccessChannel("cycles", "user");
    expect(result.authorized).toBe(false);
  });

  it("denies user access to system", () => {
    const result = canAccessChannel("system", "user");
    expect(result.authorized).toBe(false);
  });

  it("allows admin to access agents", () => {
    const result = canAccessChannel("agents", "admin");
    expect(result.authorized).toBe(true);
  });

  it("allows admin to access cycles", () => {
    const result = canAccessChannel("cycles", "admin");
    expect(result.authorized).toBe(true);
  });

  it("allows admin to access system", () => {
    const result = canAccessChannel("system", "admin");
    expect(result.authorized).toBe(true);
  });

  it("allows admin to access all channels", () => {
    const channels: Channel[] = [
      "quotes",
      "orders",
      "decisions",
      "agents",
      "cycles",
      "alerts",
      "system",
      "portfolio",
    ];
    for (const channel of channels) {
      const result = canAccessChannel(channel, "admin");
      expect(result.authorized).toBe(true);
    }
  });
});

describe("canAccessChannels", () => {
  it("returns map of results", () => {
    const channels: Channel[] = ["quotes", "agents"];
    const results = canAccessChannels(channels, "user");
    expect(results.size).toBe(2);
    expect(results.get("quotes")?.authorized).toBe(true);
    expect(results.get("agents")?.authorized).toBe(false);
  });
});

describe("filterAccessibleChannels", () => {
  it("filters to accessible channels for user", () => {
    const channels: Channel[] = ["quotes", "agents", "orders", "system"];
    const filtered = filterAccessibleChannels(channels, "user");
    expect(filtered).toContain("quotes");
    expect(filtered).toContain("orders");
    expect(filtered).not.toContain("agents");
    expect(filtered).not.toContain("system");
  });

  it("returns all channels for admin", () => {
    const channels: Channel[] = ["quotes", "agents", "orders", "system"];
    const filtered = filterAccessibleChannels(channels, "admin");
    expect(filtered.length).toBe(4);
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
      reason: "Invalid token",
    });
    const log = getAuditLog();
    const firstEntry = log[0];
    expect(firstEntry?.eventType).toBe("auth.failure");
    expect(firstEntry?.userId).toBe("user-123");
    expect(firstEntry?.connectionId).toBe("conn-456");
    expect(firstEntry?.success).toBe(false);
    expect(firstEntry?.reason).toBe("Invalid token");
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
  });

  it("rejects invalid origin", () => {
    const result = checkConnectionSecurity("validtoken123", "user-1", "https://evil.com");
    expect(result.allowed).toBe(false);
    expect(result.error).toBe("Invalid origin");
  });

  it("rejects invalid token", () => {
    const result = checkConnectionSecurity(null, "user-1", "http://localhost:3000");
    expect(result.allowed).toBe(false);
    expect(result.error).toContain("Missing");
  });

  it("accepts valid connection", () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = `user123.user.${exp}`;
    const result = checkConnectionSecurity(token, "user-1", "http://localhost:3000");
    expect(result.allowed).toBe(true);
    expect(result.tokenResult?.valid).toBe(true);
  });

  it("logs audit event", () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = `user123.user.${exp}`;
    checkConnectionSecurity(token, "user-1", "http://localhost:3000");
    const log = getAuditLog();
    expect(log.some((e) => e.eventType === "connection.accepted")).toBe(true);
  });
});

describe("checkSubscriptionSecurity", () => {
  beforeEach(() => {
    clearAuditLog();
    subscribeRateLimiter.reset("conn-test");
  });

  it("filters to authorized channels", () => {
    const result = checkSubscriptionSecurity("conn-test", "user-1", "user", [
      "quotes",
      "agents",
      "orders",
    ]);
    expect(result.authorizedChannels).toContain("quotes");
    expect(result.authorizedChannels).toContain("orders");
    expect(result.authorizedChannels).not.toContain("agents");
  });

  it("returns errors for unauthorized channels", () => {
    const result = checkSubscriptionSecurity("conn-test", "user-1", "user", ["agents", "system"]);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("allows admin all channels", () => {
    const result = checkSubscriptionSecurity("conn-test", "admin-1", "admin", [
      "quotes",
      "agents",
      "system",
    ]);
    expect(result.authorizedChannels.length).toBe(3);
    expect(result.errors.length).toBe(0);
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

describe("CHANNEL_PERMISSIONS", () => {
  it("has permissions for all channels", () => {
    const channels: Channel[] = [
      "quotes",
      "orders",
      "decisions",
      "agents",
      "cycles",
      "alerts",
      "system",
      "portfolio",
    ];
    for (const channel of channels) {
      expect(CHANNEL_PERMISSIONS[channel]).toBeDefined();
      expect(Array.isArray(CHANNEL_PERMISSIONS[channel])).toBe(true);
    }
  });
});

// ============================================
// Type Tests
// ============================================

describe("UserRole Type", () => {
  it("includes user", () => {
    const role: UserRole = "user";
    expect(role).toBe("user");
  });

  it("includes admin", () => {
    const role: UserRole = "admin";
    expect(role).toBe("admin");
  });
});

describe("TokenErrorCode Type", () => {
  it("includes all error codes", () => {
    const codes: TokenErrorCode[] = [
      "MISSING_TOKEN",
      "INVALID_FORMAT",
      "EXPIRED",
      "INVALID_SIGNATURE",
      "MALFORMED",
    ];
    expect(codes.length).toBe(5);
  });
});

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
  it("exports validateToken", async () => {
    const module = await import("./security");
    expect(typeof module.validateToken).toBe("function");
  });

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
    expect(module.CHANNEL_PERMISSIONS).toBeDefined();
    expect(module.ALLOWED_ORIGINS).toBeDefined();
  });

  it("exports default object", async () => {
    const module = await import("./security");
    expect(module.default).toBeDefined();
    expect(typeof module.default.validateToken).toBe("function");
  });
});
