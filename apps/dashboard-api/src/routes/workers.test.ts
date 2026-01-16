import { beforeAll, describe, expect, mock, test } from "bun:test";
import workersRoutes from "./workers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiResponse = any;

interface MockRun {
	id: string;
	run_type: string;
	started_at: string;
	completed_at: string | null;
	symbols_processed: number;
	symbols_failed: number;
	status: string;
	error_message: string | null;
	environment: string;
}

// Mock database data
const mockRuns: MockRun[] = [
	{
		id: "run-001",
		run_type: "macro_watch",
		started_at: "2024-01-15T10:00:00Z",
		completed_at: "2024-01-15T10:05:00Z",
		symbols_processed: 100,
		symbols_failed: 2,
		status: "completed",
		error_message: null,
		environment: "PAPER",
	},
	{
		id: "run-002",
		run_type: "newspaper",
		started_at: "2024-01-15T06:30:00Z",
		completed_at: "2024-01-15T06:32:00Z",
		symbols_processed: 50,
		symbols_failed: 0,
		status: "completed",
		error_message: null,
		environment: "PAPER",
	},
	{
		id: "run-003",
		run_type: "filings_sync",
		started_at: "2024-01-15T08:00:00Z",
		completed_at: "2024-01-15T08:03:00Z",
		symbols_processed: 8,
		symbols_failed: 0,
		status: "completed",
		error_message: null,
		environment: "PAPER",
	},
	{
		id: "run-004",
		run_type: "short_interest",
		started_at: "2024-01-15T10:10:00Z",
		completed_at: null,
		symbols_processed: 25,
		symbols_failed: 0,
		status: "running",
		error_message: null,
		environment: "PAPER",
	},
	{
		id: "run-005",
		run_type: "sentiment",
		started_at: "2024-01-15T09:00:00Z",
		completed_at: "2024-01-15T09:01:00Z",
		symbols_processed: 0,
		symbols_failed: 100,
		status: "failed",
		error_message: "API rate limit exceeded",
		environment: "PAPER",
	},
	{
		id: "run-006",
		run_type: "corporate_actions",
		started_at: "2024-01-15T10:15:00Z",
		completed_at: "2024-01-15T10:16:00Z",
		symbols_processed: 100,
		symbols_failed: 0,
		status: "completed",
		error_message: null,
		environment: "PAPER",
	},
	{
		id: "run-007",
		run_type: "fundamentals",
		started_at: "2024-01-15T07:00:00Z",
		completed_at: "2024-01-15T07:10:00Z",
		symbols_processed: 200,
		symbols_failed: 5,
		status: "completed",
		error_message: null,
		environment: "PAPER",
	},
];

let insertedRuns: MockRun[] = [];

beforeAll(() => {
	Bun.env.CREAM_ENV = "BACKTEST";
	insertedRuns = [];
});

mock.module("../db", () => ({
	getDbClient: async () => ({
		execute: async (query: string, args?: unknown[]) => {
			const allRuns = [...mockRuns, ...insertedRuns];

			// Handle running services query (for status endpoint)
			if (query.includes("status = 'running'") && !query.includes("WHERE id")) {
				return allRuns.filter((r) => r.status === "running").map((r) => ({ run_type: r.run_type }));
			}

			// Handle last completed query
			if (
				query.includes("status IN ('completed', 'failed')") &&
				query.includes("MAX(started_at)")
			) {
				const completed = allRuns.filter((r) => r.status === "completed" || r.status === "failed");
				const byType: Record<string, (typeof completed)[0] | null> = {};
				for (const run of completed) {
					const existing = byType[run.run_type];
					if (!existing || new Date(run.started_at) > new Date(existing.started_at)) {
						byType[run.run_type] = run;
					}
				}
				return Object.values(byType).filter(Boolean);
			}

			// Handle check for already running (for trigger endpoint)
			if (query.includes("status IN ('running', 'pending')") && args?.[0]) {
				const runType = args[0] as string;
				return allRuns.filter(
					(r) => r.run_type === runType && (r.status === "running" || r.status === "pending")
				);
			}

			// Handle COUNT query
			if (query.includes("COUNT(*)")) {
				let filtered = allRuns;
				if (query.includes("run_type = ?") && args) {
					filtered = filtered.filter((r) => r.run_type === args[0]);
				}
				if (query.includes("status = ?") && args) {
					const statusIdx = query.includes("run_type = ?") ? 1 : 0;
					filtered = filtered.filter((r) => r.status === args[statusIdx]);
				}
				return [{ total: filtered.length }];
			}

			// Handle single run query
			if (query.includes("WHERE id = ?")) {
				const id = args?.[0];
				const run = allRuns.find((r) => r.id === id);
				return run ? [run] : [];
			}

			// Handle main list query for runs
			let filtered = [...allRuns];

			if (args && args.length > 0) {
				// Check for service filter
				if (query.includes("run_type = ?")) {
					const typeArg = args[0] as string;
					filtered = filtered.filter((r) => r.run_type === typeArg);
				}

				// Check for status filter
				if (query.includes("status = ?")) {
					const statusIdx = query.includes("run_type = ?") ? 1 : 0;
					const statusArg = args[statusIdx] as string;
					filtered = filtered.filter((r) => r.status === statusArg);
				}

				// Get limit (last numeric arg)
				const limit =
					typeof args[args.length - 1] === "number" ? (args[args.length - 1] as number) : 20;

				// Sort by started_at DESC and limit
				filtered.sort(
					(a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
				);
				filtered = filtered.slice(0, limit);
			}

			return filtered;
		},
		run: async (_query: string, args?: unknown[]) => {
			// Handle INSERT for trigger
			if (args && args.length >= 5) {
				const newRun = {
					id: args[0] as string,
					run_type: args[1] as string,
					started_at: args[2] as string,
					completed_at: null,
					symbols_processed: 0,
					symbols_failed: 0,
					status: "pending",
					error_message: args[4] as string,
					environment: args[3] as string,
				};
				insertedRuns.push(newRun);
			}
		},
	}),
}));

describe("Workers Routes", () => {
	describe("GET /status", () => {
		test("returns status of all worker services", async () => {
			const res = await workersRoutes.request("/status");
			expect(res.status).toBe(200);

			const data = (await res.json()) as ApiResponse;
			expect(data.services).toBeDefined();
			expect(Array.isArray(data.services)).toBe(true);
			expect(data.services.length).toBe(7);

			const serviceNames = data.services.map((s: { name: string }) => s.name);
			expect(serviceNames).toContain("macro_watch");
			expect(serviceNames).toContain("newspaper");
			expect(serviceNames).toContain("filings_sync");
			expect(serviceNames).toContain("short_interest");
			expect(serviceNames).toContain("sentiment");
			expect(serviceNames).toContain("corporate_actions");
			expect(serviceNames).toContain("fundamentals");
		});

		test("includes display names for all services", async () => {
			const res = await workersRoutes.request("/status");
			const data = (await res.json()) as ApiResponse;

			for (const service of data.services) {
				expect(service.displayName).toBeDefined();
				expect(typeof service.displayName).toBe("string");
				expect(service.displayName.length).toBeGreaterThan(0);
			}
		});

		test("identifies running services", async () => {
			const res = await workersRoutes.request("/status");
			const data = (await res.json()) as ApiResponse;

			const shortInterest = data.services.find(
				(s: { name: string }) => s.name === "short_interest"
			);
			expect(shortInterest.status).toBe("running");

			const macroWatch = data.services.find((s: { name: string }) => s.name === "macro_watch");
			expect(macroWatch.status).toBe("idle");
		});

		test("includes last run info for services with history", async () => {
			const res = await workersRoutes.request("/status");
			const data = (await res.json()) as ApiResponse;

			const macroWatch = data.services.find((s: { name: string }) => s.name === "macro_watch");
			expect(macroWatch.lastRun).toBeDefined();
			expect(macroWatch.lastRun.status).toBe("completed");
			expect(macroWatch.lastRun.startedAt).toBeDefined();
		});
	});

	describe("GET /runs", () => {
		test("returns recent runs across all services", async () => {
			const res = await workersRoutes.request("/runs");
			expect(res.status).toBe(200);

			const data = (await res.json()) as ApiResponse;
			expect(data.runs).toBeDefined();
			expect(Array.isArray(data.runs)).toBe(true);
			expect(data.total).toBeDefined();
		});

		test("respects limit parameter", async () => {
			const res = await workersRoutes.request("/runs?limit=3");
			expect(res.status).toBe(200);

			const data = (await res.json()) as ApiResponse;
			expect(data.runs.length).toBeLessThanOrEqual(3);
		});

		test("filters by service", async () => {
			const res = await workersRoutes.request("/runs?service=macro_watch");
			expect(res.status).toBe(200);

			const data = (await res.json()) as ApiResponse;
			expect(data.runs.every((r: { service: string }) => r.service === "macro_watch")).toBe(true);
		});

		test("filters by status", async () => {
			const res = await workersRoutes.request("/runs?status=completed");
			expect(res.status).toBe(200);

			const data = (await res.json()) as ApiResponse;
			expect(data.runs.every((r: { status: string }) => r.status === "completed")).toBe(true);
		});

		test("includes duration for completed runs", async () => {
			const res = await workersRoutes.request("/runs?status=completed");
			const data = (await res.json()) as ApiResponse;

			for (const run of data.runs) {
				expect(run.duration).toBeDefined();
				expect(run.duration).toBeGreaterThanOrEqual(0);
			}
		});

		test("returns null duration for running jobs", async () => {
			const res = await workersRoutes.request("/runs?status=running");
			const data = (await res.json()) as ApiResponse;

			for (const run of data.runs) {
				expect(run.duration).toBeNull();
			}
		});

		test("validates service enum", async () => {
			const res = await workersRoutes.request("/runs?service=invalid_service");
			expect(res.status).toBe(400);
		});

		test("validates status enum", async () => {
			const res = await workersRoutes.request("/runs?status=invalid_status");
			expect(res.status).toBe(400);
		});

		test("validates limit range", async () => {
			const res = await workersRoutes.request("/runs?limit=0");
			expect(res.status).toBe(400);

			const res2 = await workersRoutes.request("/runs?limit=101");
			expect(res2.status).toBe(400);
		});
	});

	describe("GET /runs/:id", () => {
		test("returns single run by id", async () => {
			const res = await workersRoutes.request("/runs/run-001");
			expect(res.status).toBe(200);

			const data = (await res.json()) as ApiResponse;
			expect(data.run).toBeDefined();
			expect(data.run.id).toBe("run-001");
			expect(data.run.service).toBe("macro_watch");
			expect(data.run.status).toBe("completed");
		});

		test("returns 404 for non-existent run", async () => {
			const res = await workersRoutes.request("/runs/non-existent");
			expect(res.status).toBe(404);
		});
	});

	describe("POST /:service/trigger", () => {
		test("triggers a service and returns run id", async () => {
			const res = await workersRoutes.request("/fundamentals/trigger", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});

			expect(res.status).toBe(202);

			const data = (await res.json()) as ApiResponse;
			expect(data.runId).toBeDefined();
			expect(data.status).toBe("started");
			expect(data.message).toContain("Fundamentals");
		});

		test("accepts optional symbols array", async () => {
			const res = await workersRoutes.request("/sentiment/trigger", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ symbols: ["AAPL", "MSFT"] }),
			});

			expect(res.status).toBe(202);
		});

		test("accepts optional priority", async () => {
			const res = await workersRoutes.request("/corporate_actions/trigger", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ priority: "high" }),
			});

			expect(res.status).toBe(202);
		});

		test("returns 409 if service is already running", async () => {
			// short_interest is mocked as running
			const res = await workersRoutes.request("/short_interest/trigger", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});

			expect(res.status).toBe(409);
		});

		test("validates service enum", async () => {
			const res = await workersRoutes.request("/invalid_service/trigger", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});

			expect(res.status).toBe(400);
		});
	});
});
