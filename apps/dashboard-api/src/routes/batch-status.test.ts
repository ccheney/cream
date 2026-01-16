import { beforeAll, describe, expect, mock, test } from "bun:test";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiResponse = any;

// Mock database
const mockSyncRuns = [
	{
		id: "run-001",
		runType: "fundamentals",
		startedAt: "2024-01-15T10:00:00Z",
		completedAt: "2024-01-15T10:05:00Z",
		symbolsProcessed: 100,
		symbolsFailed: 2,
		status: "completed",
		errorMessage: null,
		environment: "PAPER",
	},
	{
		id: "run-002",
		runType: "short_interest",
		startedAt: "2024-01-15T10:10:00Z",
		completedAt: "2024-01-15T10:12:00Z",
		symbolsProcessed: 100,
		symbolsFailed: 0,
		status: "completed",
		errorMessage: null,
		environment: "PAPER",
	},
	{
		id: "run-003",
		runType: "sentiment",
		startedAt: "2024-01-15T10:15:00Z",
		completedAt: null,
		symbolsProcessed: 50,
		symbolsFailed: 0,
		status: "running",
		errorMessage: null,
		environment: "PAPER",
	},
	{
		id: "run-004",
		runType: "corporate_actions",
		startedAt: "2024-01-15T09:00:00Z",
		completedAt: "2024-01-15T09:01:00Z",
		symbolsProcessed: 0,
		symbolsFailed: 100,
		status: "failed",
		errorMessage: "API rate limit exceeded",
		environment: "PAPER",
	},
];

beforeAll(() => {
	Bun.env.CREAM_ENV = "BACKTEST";
});

// Mock repository
const mockIndicatorSyncRunsRepo = {
	findMany: async (
		filters?: { runType?: string; status?: string },
		limit = 20
	): Promise<typeof mockSyncRuns> => {
		let filtered = [...mockSyncRuns];

		if (filters?.runType) {
			filtered = filtered.filter((r) => r.runType === filters.runType);
		}
		if (filters?.status) {
			filtered = filtered.filter((r) => r.status === filters.status);
		}

		filtered.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
		return filtered.slice(0, limit);
	},

	findById: async (id: string) => {
		return mockSyncRuns.find((r) => r.id === id) ?? null;
	},

	getSummary: async () => {
		const completed = mockSyncRuns.filter((r) => r.status === "completed");
		const lastCompleted: Record<string, string | null> = {
			fundamentals: null,
			short_interest: null,
			sentiment: null,
			corporate_actions: null,
		};
		for (const run of completed) {
			if (!lastCompleted[run.runType] || run.completedAt! > lastCompleted[run.runType]!) {
				lastCompleted[run.runType] = run.completedAt;
			}
		}

		return {
			totalRuns: mockSyncRuns.length,
			running: mockSyncRuns.filter((r) => r.status === "running").length,
			completed: mockSyncRuns.filter((r) => r.status === "completed").length,
			failed: mockSyncRuns.filter((r) => r.status === "failed").length,
			lastCompleted,
		};
	},
};

mock.module("../db.js", () => ({
	getIndicatorSyncRunsRepo: () => mockIndicatorSyncRunsRepo,
	getMacroWatchRepo: () => ({}),
	getShortInterestRepo: () => ({}),
	getSentimentRepo: () => ({}),
	getCorporateActionsRepo: () => ({}),
	getFilingsRepo: () => ({}),
}));

// Import after mock is set up
const batchStatusRoutes = (await import("./batch-status")).default;

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
