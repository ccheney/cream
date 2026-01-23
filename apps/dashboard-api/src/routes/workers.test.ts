import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

type WorkerServiceStatus = {
	name: string;
	displayName: string;
	status: string;
	lastRun?: { status: string; startedAt?: string };
};

type WorkerStatusResponse = {
	services: WorkerServiceStatus[];
};

type WorkerRun = {
	id: string;
	service: string;
	status: string;
	duration: number | null;
};

type WorkerRunsResponse = {
	runs: WorkerRun[];
	total: number;
};

type WorkerRunResponse = {
	run: WorkerRun;
};

type WorkerTriggerResponse = {
	runId: string;
	status: string;
	message: string;
};

interface MockRun {
	id: string;
	runType: string;
	startedAt: string;
	completedAt: string | null;
	symbolsProcessed: number;
	symbolsFailed: number;
	status: string;
	errorMessage: string | null;
	environment: string;
}

// Mock database data
const mockRuns: MockRun[] = [
	{
		id: "run-001",
		runType: "macro_watch",
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
		runType: "newspaper",
		startedAt: "2024-01-15T06:30:00Z",
		completedAt: "2024-01-15T06:32:00Z",
		symbolsProcessed: 50,
		symbolsFailed: 0,
		status: "completed",
		errorMessage: null,
		environment: "PAPER",
	},
	{
		id: "run-003",
		runType: "filings_sync",
		startedAt: "2024-01-15T08:00:00Z",
		completedAt: "2024-01-15T08:03:00Z",
		symbolsProcessed: 8,
		symbolsFailed: 0,
		status: "completed",
		errorMessage: null,
		environment: "PAPER",
	},
	{
		id: "run-004",
		runType: "short_interest",
		startedAt: "2024-01-15T10:10:00Z",
		completedAt: null,
		symbolsProcessed: 25,
		symbolsFailed: 0,
		status: "running",
		errorMessage: null,
		environment: "PAPER",
	},
	{
		id: "run-005",
		runType: "sentiment",
		startedAt: "2024-01-15T09:00:00Z",
		completedAt: "2024-01-15T09:01:00Z",
		symbolsProcessed: 0,
		symbolsFailed: 100,
		status: "failed",
		errorMessage: "API rate limit exceeded",
		environment: "PAPER",
	},
	{
		id: "run-006",
		runType: "corporate_actions",
		startedAt: "2024-01-15T10:15:00Z",
		completedAt: "2024-01-15T10:16:00Z",
		symbolsProcessed: 100,
		symbolsFailed: 0,
		status: "completed",
		errorMessage: null,
		environment: "PAPER",
	},
	{
		id: "run-007",
		runType: "fundamentals",
		startedAt: "2024-01-15T07:00:00Z",
		completedAt: "2024-01-15T07:10:00Z",
		symbolsProcessed: 200,
		symbolsFailed: 5,
		status: "completed",
		errorMessage: null,
		environment: "PAPER",
	},
];

let insertedRuns: MockRun[] = [];

beforeAll(() => {
	Bun.env.CREAM_ENV = "PAPER";
});

beforeEach(() => {
	insertedRuns = [];
});

// Mock repository
const createMockIndicatorSyncRunsRepo = () => ({
	findMany: async (
		filters?: { runType?: string; status?: string },
		limit = 20,
	): Promise<MockRun[]> => {
		const allRuns = [...mockRuns, ...insertedRuns];
		let filtered = [...allRuns];

		if (filters?.runType) {
			filtered = filtered.filter((r) => r.runType === filters.runType);
		}
		if (filters?.status) {
			filtered = filtered.filter((r) => r.status === filters.status);
		}

		filtered.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
		return filtered.slice(0, limit);
	},

	findById: async (id: string): Promise<MockRun | null> => {
		const allRuns = [...mockRuns, ...insertedRuns];
		return allRuns.find((r) => r.id === id) ?? null;
	},

	findAllRunning: async (): Promise<MockRun[]> => {
		const allRuns = [...mockRuns, ...insertedRuns];
		return allRuns.filter((r) => r.status === "running");
	},

	findRunningByType: async (runType: string): Promise<MockRun | null> => {
		const allRuns = [...mockRuns, ...insertedRuns];
		return allRuns.find((r) => r.runType === runType && r.status === "running") ?? null;
	},

	getLastRunByType: async (): Promise<Map<string, MockRun>> => {
		const allRuns = [...mockRuns, ...insertedRuns];
		const completed = allRuns.filter((r) => r.status === "completed" || r.status === "failed");
		const byType = new Map<string, MockRun>();

		for (const run of completed) {
			const existing = byType.get(run.runType);
			if (!existing || new Date(run.startedAt) > new Date(existing.startedAt)) {
				byType.set(run.runType, run);
			}
		}

		return byType;
	},

	countByFilters: async (filters?: { runType?: string; status?: string }): Promise<number> => {
		const allRuns = [...mockRuns, ...insertedRuns];
		let filtered = [...allRuns];

		if (filters?.runType) {
			filtered = filtered.filter((r) => r.runType === filters.runType);
		}
		if (filters?.status) {
			filtered = filtered.filter((r) => r.status === filters.status);
		}

		return filtered.length;
	},

	create: async (input: {
		id?: string;
		runType: string;
		environment: string;
	}): Promise<MockRun> => {
		const newRun: MockRun = {
			id: input.id ?? `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			runType: input.runType,
			startedAt: new Date().toISOString(),
			completedAt: null,
			symbolsProcessed: 0,
			symbolsFailed: 0,
			status: "running",
			errorMessage: null,
			environment: input.environment,
		};
		insertedRuns.push(newRun);
		return newRun;
	},

	update: async (
		id: string,
		input: {
			status?: string;
			symbolsProcessed?: number;
			symbolsFailed?: number;
			errorMessage?: string;
		},
	): Promise<MockRun | null> => {
		const allRuns = [...mockRuns, ...insertedRuns];
		const run = allRuns.find((r) => r.id === id);
		if (run) {
			if (input.status) {
				run.status = input.status;
			}
			if (input.symbolsProcessed !== undefined) {
				run.symbolsProcessed = input.symbolsProcessed;
			}
			if (input.symbolsFailed !== undefined) {
				run.symbolsFailed = input.symbolsFailed;
			}
			if (input.errorMessage !== undefined) {
				run.errorMessage = input.errorMessage;
			}
		}
		return run ?? null;
	},
});

mock.module("../db.js", () => ({
	getIndicatorSyncRunsRepo: createMockIndicatorSyncRunsRepo,
	getMacroWatchRepo: () => ({}),
	getShortInterestRepo: () => ({}),
	getSentimentRepo: () => ({}),
	getCorporateActionsRepo: () => ({}),
	getFilingsRepo: () => ({}),
	getPredictionMarketsRepo: () => ({}),
}));

// Mock the websocket channel
mock.module("../websocket/channels.js", () => ({
	broadcastWorkerRunUpdate: () => {},
}));

// Import after mock is set up
const workersRoutes = (await import("./workers")).default;

describe("Workers Routes", () => {
	describe("GET /status", () => {
		test("returns status of all worker services", async () => {
			const res = await workersRoutes.request("/status");
			expect(res.status).toBe(200);

			const data = (await res.json()) as WorkerStatusResponse;
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
			expect(serviceNames).toContain("prediction_markets");
		});

		test("includes display names for all services", async () => {
			const res = await workersRoutes.request("/status");
			const data = (await res.json()) as WorkerStatusResponse;

			for (const service of data.services) {
				expect(service.displayName).toBeDefined();
				expect(typeof service.displayName).toBe("string");
				expect(service.displayName.length).toBeGreaterThan(0);
			}
		});

		test("identifies running services", async () => {
			const res = await workersRoutes.request("/status");
			const data = (await res.json()) as WorkerStatusResponse;

			const shortInterest = data.services.find(
				(s: { name: string }) => s.name === "short_interest",
			);
			if (!shortInterest) {
				throw new Error("Expected short_interest service");
			}
			expect(shortInterest.status).toBe("running");

			const macroWatch = data.services.find((s: { name: string }) => s.name === "macro_watch");
			if (!macroWatch) {
				throw new Error("Expected macro_watch service");
			}
			expect(macroWatch.status).toBe("idle");
		});

		test("includes last run info for services with history", async () => {
			const res = await workersRoutes.request("/status");
			const data = (await res.json()) as WorkerStatusResponse;

			const macroWatch = data.services.find((s: { name: string }) => s.name === "macro_watch");
			if (!macroWatch) {
				throw new Error("Expected macro_watch service");
			}
			expect(macroWatch.lastRun).toBeDefined();
			if (!macroWatch.lastRun) {
				throw new Error("Expected macro_watch lastRun");
			}
			expect(macroWatch.lastRun.status).toBe("completed");
			expect(macroWatch.lastRun.startedAt).toBeDefined();
		});
	});

	describe("GET /runs", () => {
		test("returns recent runs across all services", async () => {
			const res = await workersRoutes.request("/runs");
			expect(res.status).toBe(200);

			const data = (await res.json()) as WorkerRunsResponse;
			expect(data.runs).toBeDefined();
			expect(Array.isArray(data.runs)).toBe(true);
			expect(data.total).toBeDefined();
		});

		test("respects limit parameter", async () => {
			const res = await workersRoutes.request("/runs?limit=3");
			expect(res.status).toBe(200);

			const data = (await res.json()) as WorkerRunsResponse;
			expect(data.runs.length).toBeLessThanOrEqual(3);
		});

		test("filters by service", async () => {
			const res = await workersRoutes.request("/runs?service=macro_watch");
			expect(res.status).toBe(200);

			const data = (await res.json()) as WorkerRunsResponse;
			expect(data.runs.every((r: { service: string }) => r.service === "macro_watch")).toBe(true);
		});

		test("filters by status", async () => {
			const res = await workersRoutes.request("/runs?status=completed");
			expect(res.status).toBe(200);

			const data = (await res.json()) as WorkerRunsResponse;
			expect(data.runs.every((r: { status: string }) => r.status === "completed")).toBe(true);
		});

		test("includes duration for completed runs", async () => {
			const res = await workersRoutes.request("/runs?status=completed");
			const data = (await res.json()) as WorkerRunsResponse;

			for (const run of data.runs) {
				expect(run.duration).toBeDefined();
				expect(run.duration).toBeGreaterThanOrEqual(0);
			}
		});

		test("returns null duration for running jobs", async () => {
			const res = await workersRoutes.request("/runs?status=running");
			const data = (await res.json()) as WorkerRunsResponse;

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

			const data = (await res.json()) as WorkerRunResponse;
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
			const res = await workersRoutes.request("/macro_watch/trigger", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});

			expect(res.status).toBe(202);

			const data = (await res.json()) as WorkerTriggerResponse;
			expect(data.runId).toBeDefined();
			expect(data.status).toBe("started");
			expect(data.message).toContain("Macro Watch");
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
