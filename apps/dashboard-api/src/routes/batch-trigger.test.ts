import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { resolve } from "node:path";

type TriggerResponse = {
	run_id: string;
	job_type: string;
	status: string;
	message: string;
	symbols_count?: number;
};

type CancelResponse = {
	success: boolean;
	message: string;
};

interface MockRun {
	id: string;
	runType: string;
	startedAt: string;
	completedAt: string | null;
	status: string;
	symbolsProcessed: number;
	symbolsFailed: number;
	environment: string;
	errorMessage: string | null;
}

// Mock data for indicator_sync_runs
let mockSyncRuns: MockRun[] = [];

beforeAll(() => {
	Bun.env.CREAM_ENV = "PAPER";
});

beforeEach(() => {
	mockSyncRuns = [];
});

// Mock repository
const createMockIndicatorSyncRunsRepo = () => ({
	findRunningByType: async (runType: string): Promise<MockRun | null> => {
		return mockSyncRuns.find((r) => r.runType === runType && r.status === "running") ?? null;
	},

	findById: async (id: string): Promise<MockRun | null> => {
		return mockSyncRuns.find((r) => r.id === id) ?? null;
	},

	create: async (input: {
		id?: string;
		runType: string;
		environment: string;
		errorMessage?: string;
	}): Promise<MockRun> => {
		const newRun: MockRun = {
			id: input.id ?? `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			runType: input.runType,
			startedAt: new Date().toISOString(),
			completedAt: null,
			status: "pending",
			symbolsProcessed: 0,
			symbolsFailed: 0,
			environment: input.environment,
			errorMessage: input.errorMessage ?? null,
		};
		mockSyncRuns.push(newRun);
		return newRun;
	},

	cancel: async (id: string): Promise<MockRun | null> => {
		const run = mockSyncRuns.find((r) => r.id === id);
		if (run) {
			run.status = "failed";
			run.errorMessage = "Cancelled by user";
			run.completedAt = new Date().toISOString();
		}
		return run ?? null;
	},
});

// Mock db module using absolute path for cross-platform consistency
const dbPath = resolve(import.meta.dir, "../db.ts");
mock.module(dbPath, () => ({
	getIndicatorSyncRunsRepo: createMockIndicatorSyncRunsRepo,
	getMacroWatchRepo: () => ({}),
	getShortInterestRepo: () => ({}),
	getSentimentRepo: () => ({}),
	getCorporateActionsRepo: () => ({}),
	getFilingsRepo: () => ({}),
	// Provide stub implementations for other exports that might be needed
	getDrizzleDb: () => ({}),
	closeDb: async () => {},
	getDecisionsRepo: () => ({}),
	getAlertsRepo: () => ({}),
	getAlertSettingsRepo: () => ({}),
	getOrdersRepo: () => ({}),
	getAgentOutputsRepo: () => ({}),
	getPortfolioSnapshotsRepo: () => ({}),
	getConfigVersionsRepo: () => ({}),
	getThesesRepo: () => ({}),
	getRegimeLabelsRepo: () => ({}),
	getTradingConfigRepo: () => ({}),
	getAgentConfigsRepo: () => ({}),
	getUniverseConfigsRepo: () => ({}),
	getUserPreferencesRepo: () => ({}),
	getAuditLogRepo: () => ({}),
	getConstraintsConfigRepo: () => ({}),
	getCyclesRepo: () => ({}),
	getFilingSyncRunsRepo: () => ({}),
	getSystemStateRepo: () => ({}),
	getFundamentalsRepo: () => ({}),
	getPredictionMarketsRepo: () => ({}),
	getRuntimeConfigService: () => ({}),
}));

// Import after mock is set up
const batchTriggerRoutes = (await import("./batch-trigger")).default;

describe("Batch Trigger Routes", () => {
	describe("POST /batch/trigger", () => {
		test("creates a trigger request for fundamentals job", async () => {
			const res = await batchTriggerRoutes.request("/batch/trigger", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					job_type: "fundamentals",
					priority: "normal",
				}),
			});

			expect(res.status).toBe(202);
			const data = (await res.json()) as TriggerResponse;
			expect(data.run_id).toBeDefined();
			expect(data.job_type).toBe("fundamentals");
			expect(data.status).toBe("pending");
			expect(data.message).toContain("fundamentals");
		});

		test("creates a trigger request with specific symbols", async () => {
			const symbols = ["AAPL", "GOOGL", "MSFT"];
			const res = await batchTriggerRoutes.request("/batch/trigger", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					job_type: "short_interest",
					symbols,
					priority: "high",
				}),
			});

			expect(res.status).toBe(202);
			const data = (await res.json()) as TriggerResponse;
			expect(data.symbols_count).toBe(3);
			expect(data.message).toContain("3 symbols");
		});

		test("creates trigger request for sentiment job", async () => {
			const res = await batchTriggerRoutes.request("/batch/trigger", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					job_type: "sentiment",
				}),
			});

			expect(res.status).toBe(202);
			const data = (await res.json()) as TriggerResponse;
			expect(data.job_type).toBe("sentiment");
		});

		test("creates trigger request for corporate_actions job", async () => {
			const res = await batchTriggerRoutes.request("/batch/trigger", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					job_type: "corporate_actions",
				}),
			});

			expect(res.status).toBe(202);
			const data = (await res.json()) as TriggerResponse;
			expect(data.job_type).toBe("corporate_actions");
		});

		test("returns 400 for invalid job type", async () => {
			const res = await batchTriggerRoutes.request("/batch/trigger", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					job_type: "invalid_type",
				}),
			});

			expect(res.status).toBe(400);
		});

		test("returns 400 for missing job_type", async () => {
			const res = await batchTriggerRoutes.request("/batch/trigger", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			});

			expect(res.status).toBe(400);
		});

		test("returns 400 for too many symbols", async () => {
			const symbols = Array.from({ length: 501 }, (_, i) => `SYM${i}`);
			const res = await batchTriggerRoutes.request("/batch/trigger", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					job_type: "fundamentals",
					symbols,
				}),
			});

			expect(res.status).toBe(400);
		});

		test("returns 409 when job of same type is already running", async () => {
			// Add a running job to mock data
			mockSyncRuns.push({
				id: "run-existing",
				runType: "fundamentals",
				startedAt: new Date().toISOString(),
				completedAt: null,
				status: "running",
				symbolsProcessed: 50,
				symbolsFailed: 0,
				environment: "PAPER",
				errorMessage: null,
			});

			const res = await batchTriggerRoutes.request("/batch/trigger", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					job_type: "fundamentals",
				}),
			});

			expect(res.status).toBe(409);
		});
	});

	describe("POST /batch/cancel/:id", () => {
		test("cancels a pending job", async () => {
			// Add a pending job
			mockSyncRuns.push({
				id: "run-to-cancel",
				runType: "fundamentals",
				startedAt: new Date().toISOString(),
				completedAt: null,
				status: "pending",
				symbolsProcessed: 0,
				symbolsFailed: 0,
				environment: "PAPER",
				errorMessage: null,
			});

			const res = await batchTriggerRoutes.request("/batch/cancel/run-to-cancel", {
				method: "POST",
			});

			expect(res.status).toBe(200);
			const data = (await res.json()) as CancelResponse;
			expect(data.success).toBe(true);
			expect(data.message).toContain("run-to-cancel");
		});

		test("cancels a running job", async () => {
			mockSyncRuns.push({
				id: "run-running",
				runType: "sentiment",
				startedAt: new Date().toISOString(),
				completedAt: null,
				status: "running",
				symbolsProcessed: 25,
				symbolsFailed: 0,
				environment: "PAPER",
				errorMessage: null,
			});

			const res = await batchTriggerRoutes.request("/batch/cancel/run-running", {
				method: "POST",
			});

			expect(res.status).toBe(200);
			const data = (await res.json()) as CancelResponse;
			expect(data.success).toBe(true);
		});

		test("returns 404 for non-existent job", async () => {
			const res = await batchTriggerRoutes.request("/batch/cancel/non-existent", {
				method: "POST",
			});

			expect(res.status).toBe(404);
		});

		test("returns 409 when trying to cancel completed job", async () => {
			mockSyncRuns.push({
				id: "run-completed",
				runType: "fundamentals",
				startedAt: new Date().toISOString(),
				completedAt: new Date().toISOString(),
				status: "completed",
				symbolsProcessed: 100,
				symbolsFailed: 0,
				environment: "PAPER",
				errorMessage: null,
			});

			const res = await batchTriggerRoutes.request("/batch/cancel/run-completed", {
				method: "POST",
			});

			expect(res.status).toBe(409);
		});

		test("returns 409 when trying to cancel failed job", async () => {
			mockSyncRuns.push({
				id: "run-failed",
				runType: "short_interest",
				startedAt: new Date().toISOString(),
				completedAt: new Date().toISOString(),
				status: "failed",
				symbolsProcessed: 0,
				symbolsFailed: 100,
				environment: "PAPER",
				errorMessage: "API error",
			});

			const res = await batchTriggerRoutes.request("/batch/cancel/run-failed", {
				method: "POST",
			});

			expect(res.status).toBe(409);
		});
	});
});
