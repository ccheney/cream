/**
 * Mastra v1 Server with Hono Adapter
 *
 * Runs Mastra directly with Bun, bypassing the `mastra dev` bundler.
 * This avoids bundler issues with workspace packages and native dependencies.
 *
 * Usage: bun run src/server.ts
 *
 * @see docs/plans/53-mastra-v1-migration.md
 */

import { type HonoBindings, type HonoVariables, MastraServer } from "@mastra/hono";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { mastra } from "./mastra/index.js";

const app = new Hono<{ Bindings: HonoBindings; Variables: HonoVariables }>();

// Enable CORS for development and consumer access
app.use(
	"*",
	cors({
		origin: [
			"http://localhost:3000", // Dashboard
			"http://localhost:3001", // Dashboard API
			"http://localhost:3002", // Worker
		],
		credentials: true,
	}),
);

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

// Root handler - show available endpoints
app.get("/", (c) =>
	c.json({
		name: "@cream/mastra",
		version: "0.1.0",
		description: "Mastra v1 trading agents and workflows",
		endpoints: {
			openapi: "/openapi.json",
			swaggerUi: "/swagger-ui",
			health: "/health",
			agents: "/api/agents",
			workflows: "/api/workflows",
			memory: "/api/memory",
			tools: "/api/tools",
			scores: "/api/scores",
		},
	}),
);

// Initialize Mastra server with OpenAPI enabled
const server = new MastraServer({
	app,
	mastra,
	openapiPath: "/openapi.json",
	streamOptions: { redact: true },
});

await server.init();

const port = Number(Bun.env.PORT) || 4111;

export default {
	port,
	fetch: app.fetch,
};
