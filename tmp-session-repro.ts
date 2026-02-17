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
process.stdout.write(`paper ${Bun.env.CREAM_ENV}\n`);
const r1 = await app.request("/test");
process.stdout.write(`paper status ${r1.status} ${await r1.text()}\n`);

Bun.env.CREAM_ENV = "LIVE";
const r2 = await app.request("/test");
process.stdout.write(`live status ${r2.status} ${await r2.text()}\n`);
