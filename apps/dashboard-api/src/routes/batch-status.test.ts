import { beforeAll, describe, expect, mock, test } from "bun:test";
import batchStatusRoutes from "./batch-status";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiResponse = any;

// Mock database
const mockSyncRuns = [
	{
		id: "run-001",
		run_type: "fundamentals",
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
		run_type: "short_interest",
		started_at: "2024-01-15T10:10:00Z",
		completed_at: "2024-01-15T10:12:00Z",
		symbols_processed: 100,
		symbols_failed: 0,
		status: "completed",
		error_message: null,
		environment: "PAPER",
	},
	{
		id: "run-003",
		run_type: "sentiment",
		started_at: "2024-01-15T10:15:00Z",
		completed_at: null,
		symbols_processed: 50,
		symbols_failed: 0,
		status: "running",
		error_message: null,
		environment: "PAPER",
	},
	{
		id: "run-004",
		run_type: "corporate_actions",
		started_at: "2024-01-15T09:00:00Z",
		completed_at: "2024-01-15T09:01:00Z",
		symbols_processed: 0,
		symbols_failed: 100,
		status: "failed",
		error_message: "API rate limit exceeded",
		environment: "PAPER",
	},
];

beforeAll(() => {
	process.env.CREAM_ENV = "BACKTEST";
});

mock.module("../db", () => ({
	getDbClient: async () => ({
		execute: async (query: string, args?: unknown[]) => {
			// Handle different queries
			if (query.includes("COUNT(*)")) {
				// Summary query
				return [
					{
						total: mockSyncRuns.length,
						running: mockSyncRuns.filter((r) => r.status === "running").length,
						completed: mockSyncRuns.filter((r) => r.status === "completed").length,
						failed: mockSyncRuns.filter((r) => r.status === "failed").length,
					},
				];
			}

			if (query.includes("MAX(completed_at)")) {
				// Last completed query
				const completed = mockSyncRuns.filter((r) => r.status === "completed");
				const byType: Record<string, string | null> = {};
				for (const run of completed) {
					if (!byType[run.run_type] || run.completed_at! > byType[run.run_type]!) {
						byType[run.run_type] = run.completed_at;
					}
				}
				return Object.entries(byType).map(([run_type, last_completed]) => ({
					run_type,
					last_completed,
				}));
			}

			if (query.includes("WHERE id = ?")) {
				// Single run query
				const id = args?.[0];
				const run = mockSyncRuns.find((r) => r.id === id);
				return run ? [run] : [];
			}

			// Main list query - apply filters
			let filtered = [...mockSyncRuns];

			if (args && args.length > 0) {
				const lastArg = args[args.length - 1];
				const limit = typeof lastArg === "number" ? lastArg : 20;

				// Check for type filter
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

				// Sort by started_at DESC and limit
				filtered.sort(
					(a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
				);
				filtered = filtered.slice(0, limit);
			}

			return filtered;
		},
	}),
}));

describe("Batch Status Routes", () => {
	test("GET /batch/status returns recent runs with summary", async () => {
		const res = await batchStatusRoutes.request("/batch/status");
		expect(res.status).toBe(200);

		const data = (await res.json()) as ApiResponse;
		expect(data.runs).toBeDefined();
		expect(Array.isArray(data.runs)).toBe(true);
		expect(data.summary).toBeDefined();
		expect(data.summary.total_runs).toBe(4);
		expect(data.summary.running).toBe(1);
		expect(data.summary.completed).toBe(2);
		expect(data.summary.failed).toBe(1);
	});

	test("GET /batch/status respects limit parameter", async () => {
		const res = await batchStatusRoutes.request("/batch/status?limit=2");
		expect(res.status).toBe(200);

		const data = (await res.json()) as ApiResponse;
		expect(data.runs.length).toBeLessThanOrEqual(2);
	});

	test("GET /batch/status filters by type", async () => {
		const res = await batchStatusRoutes.request("/batch/status?type=fundamentals");
		expect(res.status).toBe(200);

		const data = (await res.json()) as ApiResponse;
		expect(data.runs.every((r: { run_type: string }) => r.run_type === "fundamentals")).toBe(true);
	});

	test("GET /batch/status filters by status", async () => {
		const res = await batchStatusRoutes.request("/batch/status?status=completed");
		expect(res.status).toBe(200);

		const data = (await res.json()) as ApiResponse;
		expect(data.runs.every((r: { status: string }) => r.status === "completed")).toBe(true);
	});

	test("GET /batch/status includes last_completed per run type", async () => {
		const res = await batchStatusRoutes.request("/batch/status");
		expect(res.status).toBe(200);

		const data = (await res.json()) as ApiResponse;
		expect(data.summary.last_completed).toBeDefined();
		expect(data.summary.last_completed).toHaveProperty("fundamentals");
		expect(data.summary.last_completed).toHaveProperty("short_interest");
		expect(data.summary.last_completed).toHaveProperty("sentiment");
		expect(data.summary.last_completed).toHaveProperty("corporate_actions");
	});

	test("GET /batch/status/:id returns single run", async () => {
		const res = await batchStatusRoutes.request("/batch/status/run-001");
		expect(res.status).toBe(200);

		const data = (await res.json()) as ApiResponse;
		expect(data.run).toBeDefined();
		expect(data.run.id).toBe("run-001");
		expect(data.run.run_type).toBe("fundamentals");
		expect(data.run.status).toBe("completed");
		expect(data.run.symbols_processed).toBe(100);
		expect(data.run.symbols_failed).toBe(2);
	});

	test("GET /batch/status/:id returns 404 for non-existent run", async () => {
		const res = await batchStatusRoutes.request("/batch/status/non-existent");
		expect(res.status).toBe(404);
	});

	test("GET /batch/status validates type enum", async () => {
		const res = await batchStatusRoutes.request("/batch/status?type=invalid_type");
		expect(res.status).toBe(400);
	});

	test("GET /batch/status validates status enum", async () => {
		const res = await batchStatusRoutes.request("/batch/status?status=invalid_status");
		expect(res.status).toBe(400);
	});

	test("GET /batch/status validates limit range", async () => {
		const res = await batchStatusRoutes.request("/batch/status?limit=0");
		expect(res.status).toBe(400);

		const res2 = await batchStatusRoutes.request("/batch/status?limit=101");
		expect(res2.status).toBe(400);
	});
});
