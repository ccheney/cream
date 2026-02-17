import { Hono } from "hono";
import { liveProtection } from "./src/auth/session.js";

const app = new Hono();
app.use("/*", (c, next) => {
	const session = {
		session: { id: "session-123" },
		user: { id: "user-123", email: "test@example.com", twoFactorEnabled: true },
	};
	c.set("session", session);
	c.set("user", session.user);
	return next();
});
app.use("/*", liveProtection({ requireMFA: true, requireConfirmation: false, auditLog: false }));
app.get("/test", () => new Response("ok"));

Bun.env.CREAM_ENV = "PAPER";
const r1 = await app.request("/test");
console.log("paper", r1.status, await r1.text());

Bun.env.CREAM_ENV = "LIVE";
const r2 = await app.request("/test");
console.log("live", r2.status, await r2.text());
