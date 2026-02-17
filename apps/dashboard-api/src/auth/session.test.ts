import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

const mockGetSession = mock(() => Promise.resolve(null as unknown));
const mockAuth = {
	api: { getSession: mockGetSession },
	$Infer: { Session: {} as const },
};
mock.module("./better-auth.js", () => ({ getAuth: () => mockAuth, default: () => mockAuth }));

import {
	getSession,
	getUser,
	liveProtection,
	optionalAuth,
	requireAuth,
	type SessionVariables,
	sessionMiddleware,
} from "./session.js";

type SessionData = ReturnType<typeof createMockSession>;

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

function withSessionData(sessionData: SessionData | null) {
	return async (
		c: Parameters<Hono<{ Variables: SessionVariables }>["use"]>[1] extends (
			...args: infer A
		) => unknown
			? A[0]
			: never,
		next: Parameters<Hono<{ Variables: SessionVariables }>["use"]>[1] extends (
			...args: infer A
		) => unknown
			? A[1]
			: never,
	) => {
		c.set("session", sessionData);
		c.set("user", sessionData?.user ?? null);
		await next();
	};
}

function addErrorHandler(app: Hono<{ Variables: SessionVariables }>, includeCause = false) {
	app.onError((err, c) => {
		if (err instanceof HTTPException) {
			return includeCause
				? c.json({ error: err.message, cause: err.cause }, err.status)
				: c.json({ error: err.message }, err.status);
		}
		return c.json({ error: "Unknown error" }, 500);
	});
}

function createProtectedApp(
	sessionData: SessionData | null,
	middleware:
		| ReturnType<typeof requireAuth>
		| ReturnType<typeof optionalAuth>
		| ReturnType<typeof liveProtection>,
	includeCause = false,
) {
	const app = new Hono<{ Variables: SessionVariables }>();
	app.use("/*", withSessionData(sessionData));
	app.use("/*", middleware);
	app.get("/test", () => new Response("ok"));
	addErrorHandler(app, includeCause);
	return app;
}

describe("sessionMiddleware - auth resolution", () => {
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
		app.get("/test", (c) => c.json({ session: c.get("session"), user: c.get("user") }));
		const res = await app.request("/test");
		const data = (await res.json()) as { session: null; user: null };
		expect(data.session).toBeNull();
		expect(data.user).toBeNull();
	});
});

describe("sessionMiddleware - error and next", () => {
	beforeEach(() => {
		mockGetSession.mockClear();
	});

	it("sets session and user to null on error", async () => {
		mockGetSession.mockRejectedValue(new Error("Auth error"));
		const app = new Hono<{ Variables: SessionVariables }>();
		app.use("/*", sessionMiddleware());
		app.get("/test", (c) => c.json({ session: c.get("session"), user: c.get("user") }));
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

describe("requireAuth", () => {
	it("throws 401 when session is null", async () => {
		const res = await createProtectedApp(null, requireAuth()).request("/test");
		expect(res.status).toBe(401);
	});

	it("calls next() when session exists", async () => {
		const res = await createProtectedApp(createMockSession(), requireAuth()).request("/test");
		expect(res.status).toBe(200);
	});

	it("returns error message in JSON response", async () => {
		const res = await createProtectedApp(null, requireAuth()).request("/test");
		const data = (await res.json()) as { error: string };
		expect(res.status).toBe(401);
		expect(data.error).toBe("Authentication required");
	});
});

describe("optionalAuth", () => {
	it("allows unauthenticated requests", async () => {
		const res = await createProtectedApp(null, optionalAuth()).request("/test");
		expect(res.status).toBe(200);
	});

	it("allows authenticated requests", async () => {
		const res = await createProtectedApp(createMockSession(), optionalAuth()).request("/test");
		expect(res.status).toBe(200);
	});
});

const originalEnv = Bun.env.CREAM_ENV;

describe("liveProtection - environment and auth", () => {
	afterEach(() => {
		Bun.env.CREAM_ENV = originalEnv;
	});

	it("passes through in non-LIVE environments", async () => {
		Bun.env.CREAM_ENV = "PAPER";
		const res = await createProtectedApp(null, liveProtection()).request("/test");
		expect(res.status).toBe(200);
	});

	it("returns 401 when not authenticated in LIVE", async () => {
		Bun.env.CREAM_ENV = "LIVE";
		const res = await createProtectedApp(null, liveProtection()).request("/test");
		expect(res.status).toBe(401);
	});
});

describe("liveProtection - MFA", () => {
	afterEach(() => {
		Bun.env.CREAM_ENV = originalEnv;
	});

	it("returns 403 when MFA not enabled in LIVE", async () => {
		Bun.env.CREAM_ENV = "LIVE";
		const res = await createProtectedApp(
			createMockSession(),
			liveProtection({ requireMFA: true, requireConfirmation: false }),
			true,
		).request("/test");
		const data = (await res.json()) as { error: string; cause: { code: string } };
		expect(res.status).toBe(403);
		expect(data.error).toContain("Two-factor authentication");
		expect(data.cause.code).toBe("MFA_REQUIRED");
	});

	it("passes through when MFA enabled in LIVE", async () => {
		Bun.env.CREAM_ENV = "LIVE";
		const res = await createProtectedApp(
			createMockSessionWithMFA(),
			liveProtection({ requireMFA: true, requireConfirmation: false, auditLog: false }),
		).request("/test");
		expect(res.status).toBe(200);
	});
});

describe("liveProtection - confirmation", () => {
	afterEach(() => {
		Bun.env.CREAM_ENV = originalEnv;
	});

	it("returns 428 when confirmation header missing in LIVE", async () => {
		Bun.env.CREAM_ENV = "LIVE";
		const app = createProtectedApp(
			createMockSessionWithMFA(),
			liveProtection({ requireMFA: true, requireConfirmation: true, auditLog: false }),
			true,
		);
		const res = await app.request("/test");
		const data = (await res.json()) as { cause: { code: string } };
		expect(res.status).toBe(428);
		expect(data.cause.code).toBe("CONFIRMATION_REQUIRED");
	});

	it("passes through with confirmation header in LIVE", async () => {
		Bun.env.CREAM_ENV = "LIVE";
		const app = createProtectedApp(
			createMockSessionWithMFA(),
			liveProtection({ requireMFA: true, requireConfirmation: true, auditLog: false }),
		);
		const res = await app.request("/test", { headers: { "X-Confirm-Action": "true" } });
		expect(res.status).toBe(200);
	});
});

describe("liveProtection - IP whitelist", () => {
	afterEach(() => {
		Bun.env.CREAM_ENV = originalEnv;
	});

	it("returns 403 when IP not in whitelist", async () => {
		Bun.env.CREAM_ENV = "LIVE";
		const app = createProtectedApp(
			createMockSessionWithMFA(),
			liveProtection({
				requireMFA: false,
				requireConfirmation: false,
				auditLog: false,
				ipWhitelist: ["192.168.1.100"],
			}),
		);
		const res = await app.request("/test", { headers: { "X-Forwarded-For": "10.0.0.1" } });
		expect(res.status).toBe(403);
	});

	it("passes through when IP in whitelist", async () => {
		Bun.env.CREAM_ENV = "LIVE";
		const app = createProtectedApp(
			createMockSessionWithMFA(),
			liveProtection({
				requireMFA: false,
				requireConfirmation: false,
				auditLog: false,
				ipWhitelist: ["192.168.1.100"],
			}),
		);
		const res = await app.request("/test", { headers: { "X-Forwarded-For": "192.168.1.100" } });
		expect(res.status).toBe(200);
	});
});

describe("getSession", () => {
	it("returns session when present", () => {
		const mockSession = createMockSession();
		const mockContext = { get: (key: "session") => (key === "session" ? mockSession : null) };
		expect(getSession(mockContext)).toBe(mockSession);
	});

	it("throws 401 when session is null", () => {
		const mockContext = { get: () => null };
		expect(() => getSession(mockContext)).toThrow(HTTPException);
	});
});

describe("getUser", () => {
	it("returns user when present", () => {
		const mockSession = createMockSession();
		const mockContext = { get: (key: "user") => (key === "user" ? mockSession.user : null) };
		expect(getUser(mockContext)).toBe(mockSession.user);
	});

	it("throws 401 when user is null", () => {
		const mockContext = { get: () => null };
		expect(() => getUser(mockContext)).toThrow(HTTPException);
	});
});
