import { beforeAll, beforeEach, describe, mock } from "bun:test";
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

beforeEach(() => {
	resetMockRuns();
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
