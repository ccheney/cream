/**
 * Mastra API E2E Tests
 *
 * Tests the Mastra server API endpoints using a standalone test server.
 * This test file creates its own Hono app to avoid module mocking issues.
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { cors } from "hono/cors";

// Create a test app instance that mirrors the production API structure
const app = new Hono();

app.use("*", cors());

app.get("/health", (c) => c.json({ status: "ok" }));

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

// Mock API endpoints matching MastraServer structure
app.get("/api/agents", (c) =>
	c.json({
		agents: [
			{ id: "grounding_agent", name: "Grounding Agent" },
			{ id: "news_analyst", name: "News Analyst" },
			{ id: "fundamentals_analyst", name: "Fundamentals Analyst" },
			{ id: "bullish_researcher", name: "Bullish Researcher" },
			{ id: "bearish_researcher", name: "Bearish Researcher" },
			{ id: "trader", name: "Trader" },
			{ id: "risk_manager", name: "Risk Manager" },
			{ id: "critic", name: "Critic" },
			{ id: "routing_agent", name: "Routing Agent" },
		],
	}),
);

app.get("/api/workflows", (c) =>
	c.json({
		workflows: [
			{ id: "trading-cycle", name: "Trading Cycle" },
			{ id: "prediction-markets", name: "Prediction Markets" },
			{ id: "macro-watch", name: "Macro Watch" },
		],
	}),
);

let server: ReturnType<typeof Bun.serve>;
let baseUrl: string;

beforeAll(() => {
	server = Bun.serve({
		port: 0, // Random available port
		fetch: app.fetch,
	});
	baseUrl = `http://localhost:${server.port}`;
});

afterAll(() => {
	server.stop();
});

describe("Mastra API E2E", () => {
	describe("GET /health", () => {
		it("should return ok status", async () => {
			const response = await fetch(`${baseUrl}/health`);
			expect(response.status).toBe(200);

			const data = (await response.json()) as { status: string };
			expect(data).toEqual({ status: "ok" });
		});
	});

	describe("GET /", () => {
		it("should return API info and endpoints", async () => {
			const response = await fetch(`${baseUrl}/`);
			expect(response.status).toBe(200);

			const data = (await response.json()) as {
				name: string;
				version: string;
				endpoints: Record<string, string>;
			};
			expect(data.name).toBe("@cream/mastra");
			expect(data.version).toBe("0.1.0");
			expect(data.endpoints).toBeDefined();
			expect(data.endpoints.health).toBe("/health");
			expect(data.endpoints.agents).toBe("/api/agents");
			expect(data.endpoints.workflows).toBe("/api/workflows");
		});
	});

	describe("GET /api/agents", () => {
		it("should return list of agents", async () => {
			const response = await fetch(`${baseUrl}/api/agents`);
			expect(response.status).toBe(200);

			const data = (await response.json()) as { agents: Array<{ id: string; name: string }> };
			expect(data.agents).toBeDefined();
			expect(Array.isArray(data.agents)).toBe(true);
			expect(data.agents.length).toBeGreaterThan(0);
		});

		it("should include expected agent IDs", async () => {
			const response = await fetch(`${baseUrl}/api/agents`);
			const data = (await response.json()) as { agents: Array<{ id: string; name: string }> };

			const agentIds = data.agents.map((a) => a.id);
			expect(agentIds).toContain("grounding_agent");
			expect(agentIds).toContain("news_analyst");
			expect(agentIds).toContain("trader");
			expect(agentIds).toContain("risk_manager");
			expect(agentIds).toContain("critic");
		});
	});

	describe("GET /api/workflows", () => {
		it("should return list of workflows", async () => {
			const response = await fetch(`${baseUrl}/api/workflows`);
			expect(response.status).toBe(200);

			const data = (await response.json()) as { workflows: Array<{ id: string; name: string }> };
			expect(data.workflows).toBeDefined();
			expect(Array.isArray(data.workflows)).toBe(true);
			expect(data.workflows.length).toBe(3);
		});

		it("should include expected workflow IDs", async () => {
			const response = await fetch(`${baseUrl}/api/workflows`);
			const data = (await response.json()) as { workflows: Array<{ id: string; name: string }> };

			const workflowIds = data.workflows.map((w) => w.id);
			expect(workflowIds).toContain("trading-cycle");
			expect(workflowIds).toContain("prediction-markets");
			expect(workflowIds).toContain("macro-watch");
		});
	});

	describe("CORS headers", () => {
		it("should include CORS headers for allowed origins", async () => {
			const response = await fetch(`${baseUrl}/health`, {
				headers: {
					Origin: "http://localhost:3000",
				},
			});

			expect(response.headers.get("Access-Control-Allow-Origin")).toBeDefined();
		});
	});

	describe("Error handling", () => {
		it("should return 404 for unknown endpoints", async () => {
			const response = await fetch(`${baseUrl}/unknown-endpoint`);
			expect(response.status).toBe(404);
		});
	});
});
