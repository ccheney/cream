import { afterEach, beforeAll, beforeEach, describe, mock } from "bun:test";
import { resolve } from "node:path";
import { createMockIndicatorSyncRunsRepo, resetMockRuns } from "./workers.test.fixtures.js";
import {
	registerRunByIdSuite,
	registerRunsSuite,
	registerStatusSuite,
	registerTriggerSuite,
} from "./workers.test.suites.js";

beforeAll(() => {
	Bun.env.CREAM_ENV = "PAPER";
});

const originalFetch = globalThis.fetch;

beforeEach(() => {
	resetMockRuns();
	const mockedFetch = mock(async (input: string | URL | Request) => {
		const url =
			typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

		if (url.endsWith("/health")) {
			return Response.json({
				next_run: {
					macro_watch: "2026-02-22T18:00:00.000Z",
					prediction_markets: "2026-02-22T18:00:00.000Z",
					filings_sync: "2026-02-22T18:00:00.000Z",
				},
				indicator_batch_jobs: {
					shortInterest: { next_run: "2026-02-22T18:00:00.000Z" },
					sentiment: { next_run: "2026-02-22T18:00:00.000Z" },
					corporateActions: { next_run: "2026-02-22T18:00:00.000Z" },
				},
			});
		}

		throw new Error(`Unexpected fetch URL in workers tests: ${url}`);
	}) as unknown as typeof fetch;
	globalThis.fetch = mockedFetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

const dbPath = resolve(import.meta.dir, "../db.ts");
mock.module(dbPath, () => ({
	getIndicatorSyncRunsRepo: createMockIndicatorSyncRunsRepo,
	getMacroWatchRepo: () => ({}),
	getShortInterestRepo: () => ({}),
	getSentimentRepo: () => ({}),
	getCorporateActionsRepo: () => ({}),
	getFilingsRepo: () => ({}),
	getPredictionMarketsRepo: () => ({}),
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
	getScannerConfigsRepo: () => ({}),
	getUserPreferencesRepo: () => ({}),
	getAuditLogRepo: () => ({}),
	getConstraintsConfigRepo: () => ({}),
	getCyclesRepo: () => ({}),
	getFilingSyncRunsRepo: () => ({}),
	getSystemStateRepo: () => ({}),
	getFundamentalsRepo: () => ({}),
	getRuntimeConfigService: () => ({}),
}));

mock.module("../websocket/channels.js", () => ({
	broadcastWorkerRunUpdate: () => {},
}));

const workersRoutes = (await import("./workers")).default;

describe("Workers Routes", () => {
	registerStatusSuite(workersRoutes);
	registerRunsSuite(workersRoutes);
	registerRunByIdSuite(workersRoutes);
	registerTriggerSuite(workersRoutes);
});
