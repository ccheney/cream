/**
 * Session Middleware Tests
 *
 * Tests for better-auth session middleware functions.
 *
 * @see docs/plans/30-better-auth-migration.md
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

// Mock the better-auth module to avoid secret validation at import time
const mockGetSession = mock(() => Promise.resolve(null as unknown));
const mockAuth = {
	api: {
		getSession: mockGetSession,
	},
	$Infer: {
		Session: {} as const,
	},
};
mock.module("./better-auth.js", () => ({
	getAuth: () => mockAuth,
	default: () => mockAuth,
}));

import {
	getSession,
	getUser,
	liveProtection,
	optionalAuth,
	requireAuth,
	type SessionVariables,
	sessionMiddleware,
} from "./session.js";

// ============================================
// Test Fixtures
// ============================================

function createMockSession() {
	return {
		session: {
			id: "session-123",
			createdAt: new Date(),
			updatedAt: new Date(),
			userId: "user-123",
			expiresAt: new Date(Date.now() + 3600000),
			token: "mock-token",
		},
		user: {
			id: "user-123",
			email: "test@example.com",
			name: "Test User",
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date(),
			twoFactorEnabled: false,
		},
	};
}

function createMockSessionWithMFA() {
	const session = createMockSession();
	session.user.twoFactorEnabled = true;
	return session;
}

// ============================================
// sessionMiddleware Tests
// ============================================

describe("sessionMiddleware", () => {
	beforeEach(() => {
		mockGetSession.mockClear();
	});

	it("sets session and user when authenticated", async () => {
		const mockSessionData = createMockSession();
		mockGetSession.mockResolvedValue(mockSessionData);

		const app = new Hono<{ Variables: SessionVariables }>();
		app.use("/*", sessionMiddleware());
		app.get("/test", (c) => {
			const session = c.get("session");
			const user = c.get("user");
			return c.json({ hasSession: !!session, hasUser: !!user, userId: user?.id });
		});

		const res = await app.request("/test");
		const data = (await res.json()) as { hasSession: boolean; hasUser: boolean; userId: string };

		expect(data.hasSession).toBe(true);
		expect(data.hasUser).toBe(true);
		expect(data.userId).toBe("user-123");
	});

	it("sets session and user to null when not authenticated", async () => {
		mockGetSession.mockResolvedValue(null);

		const app = new Hono<{ Variables: SessionVariables }>();
		app.use("/*", sessionMiddleware());
		app.get("/test", (c) => {
			const session = c.get("session");
			const user = c.get("user");
			return c.json({ session, user });
		});

		const res = await app.request("/test");
		const data = (await res.json()) as { session: null; user: null };

		expect(data.session).toBeNull();
		expect(data.user).toBeNull();
	});

	it("sets session and user to null on error", async () => {
		mockGetSession.mockRejectedValue(new Error("Auth error"));

		const app = new Hono<{ Variables: SessionVariables }>();
		app.use("/*", sessionMiddleware());
		app.get("/test", (c) => {
			const session = c.get("session");
			const user = c.get("user");
			return c.json({ session, user });
		});

		const res = await app.request("/test");
		const data = (await res.json()) as { session: null; user: null };

		expect(data.session).toBeNull();
		expect(data.user).toBeNull();
	});

	it("calls next() after setting context", async () => {
		mockGetSession.mockResolvedValue(null);
		let nextCalled = false;

		const app = new Hono<{ Variables: SessionVariables }>();
		app.use("/*", sessionMiddleware());
		app.use("/*", async (_, next) => {
			nextCalled = true;
			await next();
		});
		app.get("/test", () => new Response("ok"));

		await app.request("/test");

		expect(nextCalled).toBe(true);
	});
});

// ============================================
// requireAuth Tests
// ============================================

describe("requireAuth", () => {
	it("throws 401 when session is null", async () => {
		const app = new Hono<{ Variables: SessionVariables }>();
		app.use("/*", async (c, next) => {
			c.set("session", null);
			c.set("user", null);
			await next();
		});
		app.use("/*", requireAuth());
		app.get("/test", () => new Response("ok"));

		const res = await app.request("/test");

		expect(res.status).toBe(401);
	});

	it("calls next() when session exists", async () => {
		const mockSession = createMockSession();

		const app = new Hono<{ Variables: SessionVariables }>();
		app.use("/*", async (c, next) => {
			c.set("session", mockSession);
			c.set("user", mockSession.user);
			await next();
		});
		app.use("/*", requireAuth());
		app.get("/test", () => new Response("ok"));

		const res = await app.request("/test");

		expect(res.status).toBe(200);
	});

	it("returns error message in JSON response", async () => {
		const app = new Hono<{ Variables: SessionVariables }>();
		app.use("/*", async (c, next) => {
			c.set("session", null);
			c.set("user", null);
			await next();
		});
		app.use("/*", requireAuth());
		app.get("/test", () => new Response("ok"));
		app.onError((err, c) => {
			if (err instanceof HTTPException) {
				return c.json({ error: err.message }, err.status);
			}
			return c.json({ error: "Unknown error" }, 500);
		});

		const res = await app.request("/test");
		const data = (await res.json()) as { error: string };

		expect(res.status).toBe(401);
		expect(data.error).toBe("Authentication required");
	});
});

// ============================================
// optionalAuth Tests
// ============================================

describe("optionalAuth", () => {
	it("allows unauthenticated requests", async () => {
		const app = new Hono<{ Variables: SessionVariables }>();
		app.use("/*", async (c, next) => {
			c.set("session", null);
			c.set("user", null);
			await next();
		});
		app.use("/*", optionalAuth());
		app.get("/test", () => new Response("ok"));

		const res = await app.request("/test");

		expect(res.status).toBe(200);
	});

	it("allows authenticated requests", async () => {
		const mockSession = createMockSession();

		const app = new Hono<{ Variables: SessionVariables }>();
		app.use("/*", async (c, next) => {
			c.set("session", mockSession);
			c.set("user", mockSession.user);
			await next();
		});
		app.use("/*", optionalAuth());
		app.get("/test", () => new Response("ok"));

		const res = await app.request("/test");

		expect(res.status).toBe(200);
	});
});

// ============================================
// liveProtection Tests
// ============================================

describe("liveProtection", () => {
	const originalEnv = Bun.env.CREAM_ENV;

	afterEach(() => {
		Bun.env.CREAM_ENV = originalEnv;
	});

	it("passes through in non-LIVE environments", async () => {
		Bun.env.CREAM_ENV = "PAPER";

		const app = new Hono<{ Variables: SessionVariables }>();
		app.use("/*", async (c, next) => {
			c.set("session", null);
			c.set("user", null);
			await next();
		});
		app.use("/*", liveProtection());
		app.get("/test", () => new Response("ok"));

		const res = await app.request("/test");

		expect(res.status).toBe(200);
	});

	it("returns 401 when not authenticated in LIVE", async () => {
		Bun.env.CREAM_ENV = "LIVE";

		const app = new Hono<{ Variables: SessionVariables }>();
		app.use("/*", async (c, next) => {
			c.set("session", null);
			c.set("user", null);
			await next();
		});
		app.use("/*", liveProtection());
		app.get("/test", () => new Response("ok"));
		app.onError((err, c) => {
			if (err instanceof HTTPException) {
				return c.json({ error: err.message }, err.status);
			}
			return c.json({ error: "Unknown error" }, 500);
		});

		const res = await app.request("/test");

		expect(res.status).toBe(401);
	});

	it("returns 403 when MFA not enabled in LIVE", async () => {
		Bun.env.CREAM_ENV = "LIVE";
		const mockSession = createMockSession(); // MFA disabled by default

		const app = new Hono<{ Variables: SessionVariables }>();
		app.use("/*", async (c, next) => {
			c.set("session", mockSession);
			c.set("user", mockSession.user);
			await next();
		});
		app.use("/*", liveProtection({ requireMFA: true, requireConfirmation: false }));
		app.get("/test", () => new Response("ok"));
		app.onError((err, c) => {
			if (err instanceof HTTPException) {
				return c.json({ error: err.message, cause: err.cause }, err.status);
			}
			return c.json({ error: "Unknown error" }, 500);
		});

		const res = await app.request("/test");
		const data = (await res.json()) as { error: string; cause: { code: string } };

		expect(res.status).toBe(403);
		expect(data.error).toContain("Two-factor authentication");
		expect(data.cause.code).toBe("MFA_REQUIRED");
	});

	it("passes through when MFA enabled in LIVE", async () => {
		Bun.env.CREAM_ENV = "LIVE";
		const mockSession = createMockSessionWithMFA();

		const app = new Hono<{ Variables: SessionVariables }>();
		app.use("/*", async (c, next) => {
			c.set("session", mockSession);
			c.set("user", mockSession.user);
			await next();
		});
		app.use(
			"/*",
			liveProtection({
				requireMFA: true,
				requireConfirmation: false,
				auditLog: false,
			})
		);
		app.get("/test", () => new Response("ok"));

		const res = await app.request("/test");

		expect(res.status).toBe(200);
	});

	it("returns 428 when confirmation header missing in LIVE", async () => {
		Bun.env.CREAM_ENV = "LIVE";
		const mockSession = createMockSessionWithMFA();

		const app = new Hono<{ Variables: SessionVariables }>();
		app.use("/*", async (c, next) => {
			c.set("session", mockSession);
			c.set("user", mockSession.user);
			await next();
		});
		app.use(
			"/*",
			liveProtection({
				requireMFA: true,
				requireConfirmation: true,
				auditLog: false,
			})
		);
		app.get("/test", () => new Response("ok"));
		app.onError((err, c) => {
			if (err instanceof HTTPException) {
				return c.json({ error: err.message, cause: err.cause }, err.status);
			}
			return c.json({ error: "Unknown error" }, 500);
		});

		const res = await app.request("/test");
		const data = (await res.json()) as { cause: { code: string } };

		expect(res.status).toBe(428);
		expect(data.cause.code).toBe("CONFIRMATION_REQUIRED");
	});

	it("passes through with confirmation header in LIVE", async () => {
		Bun.env.CREAM_ENV = "LIVE";
		const mockSession = createMockSessionWithMFA();

		const app = new Hono<{ Variables: SessionVariables }>();
		app.use("/*", async (c, next) => {
			c.set("session", mockSession);
			c.set("user", mockSession.user);
			await next();
		});
		app.use(
			"/*",
			liveProtection({
				requireMFA: true,
				requireConfirmation: true,
				auditLog: false,
			})
		);
		app.get("/test", () => new Response("ok"));

		const res = await app.request("/test", {
			headers: {
				"X-Confirm-Action": "true",
			},
		});

		expect(res.status).toBe(200);
	});

	it("returns 403 when IP not in whitelist", async () => {
		Bun.env.CREAM_ENV = "LIVE";
		const mockSession = createMockSessionWithMFA();

		const app = new Hono<{ Variables: SessionVariables }>();
		app.use("/*", async (c, next) => {
			c.set("session", mockSession);
			c.set("user", mockSession.user);
			await next();
		});
		app.use(
			"/*",
			liveProtection({
				requireMFA: false,
				requireConfirmation: false,
				auditLog: false,
				ipWhitelist: ["192.168.1.100"],
			})
		);
		app.get("/test", () => new Response("ok"));
		app.onError((err, c) => {
			if (err instanceof HTTPException) {
				return c.json({ error: err.message }, err.status);
			}
			return c.json({ error: "Unknown error" }, 500);
		});

		const res = await app.request("/test", {
			headers: {
				"X-Forwarded-For": "10.0.0.1",
			},
		});

		expect(res.status).toBe(403);
	});

	it("passes through when IP in whitelist", async () => {
		Bun.env.CREAM_ENV = "LIVE";
		const mockSession = createMockSessionWithMFA();

		const app = new Hono<{ Variables: SessionVariables }>();
		app.use("/*", async (c, next) => {
			c.set("session", mockSession);
			c.set("user", mockSession.user);
			await next();
		});
		app.use(
			"/*",
			liveProtection({
				requireMFA: false,
				requireConfirmation: false,
				auditLog: false,
				ipWhitelist: ["192.168.1.100"],
			})
		);
		app.get("/test", () => new Response("ok"));

		const res = await app.request("/test", {
			headers: {
				"X-Forwarded-For": "192.168.1.100",
			},
		});

		expect(res.status).toBe(200);
	});
});

// ============================================
// getSession Tests
// ============================================

describe("getSession", () => {
	it("returns session when present", () => {
		const mockSession = createMockSession();
		const mockContext = {
			get: (key: "session") => (key === "session" ? mockSession : null),
		};

		const session = getSession(mockContext);

		expect(session).toBe(mockSession);
	});

	it("throws 401 when session is null", () => {
		const mockContext = {
			get: () => null,
		};

		expect(() => getSession(mockContext)).toThrow(HTTPException);
	});
});

// ============================================
// getUser Tests
// ============================================

describe("getUser", () => {
	it("returns user when present", () => {
		const mockSession = createMockSession();
		const mockContext = {
			get: (key: "user") => (key === "user" ? mockSession.user : null),
		};

		const user = getUser(mockContext);

		expect(user).toBe(mockSession.user);
	});

	it("throws 401 when user is null", () => {
		const mockContext = {
			get: () => null,
		};

		expect(() => getUser(mockContext)).toThrow(HTTPException);
	});
});
