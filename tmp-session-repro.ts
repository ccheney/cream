import { Hono } from "hono";
import { liveProtection } from "./apps/dashboard-api/src/auth/session.js";

const app = new Hono();
app.use("/*", (c, next) => {
	c.set("session", {
		session: { id: "session-123" },
		user: { id: "user-123", email: "test@example.com", twoFactorEnabled: true },
	});
	return next();
});
app.use("/*", liveProtection({ requireMFA: true, requireConfirmation: false, auditLog: false }));
app.get("/test", () => new Response("ok"));

Bun.env.CREAM_ENV = "PAPER";
console.log("paper", Bun.env.CREAM_ENV);
const r1 = await app.request("/test");
console.log("paper status", r1.status, await r1.text());

Bun.env.CREAM_ENV = "LIVE";
const r2 = await app.request("/test");
console.log("live status", r2.status, await r2.text());
