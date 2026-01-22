/**
 * Mastra Server with Hono Adapter
 *
 * Runs Mastra directly with Bun, bypassing the `mastra dev` bundler.
 * This avoids bundler issues with workspace packages and native dependencies.
 *
 * Usage: bun run src/server.ts
 */

import { type HonoBindings, type HonoVariables, MastraServer } from "@mastra/hono";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { mastra } from "./mastra/index.js";

const app = new Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>();

// Enable CORS for development
app.use(
	"*",
	cors({
		origin: ["http://localhost:3000", "http://localhost:3001"],
		credentials: true,
	}),
);

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

// Root handler - show available endpoints
app.get("/", (c) =>
	c.json({
		name: "@cream/api",
		version: "0.1.0",
		endpoints: {
			openapi: "/openapi.json",
			health: "/health",
			agents: "/api/agents",
			workflows: "/api/workflows",
		},
	}),
);

// Initialize Mastra server with OpenAPI enabled
const server = new MastraServer({
	app,
	mastra,
	openapiPath: "/openapi.json",
});

await server.init();

const port = Number(Bun.env.PORT) || 4111;

export default {
	port,
	fetch: app.fetch,
};
