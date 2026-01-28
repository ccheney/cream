import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import marketRoutes from "./market";

const originalAlpacaKey = Bun.env.ALPACA_KEY;
const originalAlpacaSecret = Bun.env.ALPACA_SECRET;

beforeAll(() => {
	Bun.env.ALPACA_KEY = "test";
	Bun.env.ALPACA_SECRET = "test";
});

afterAll(() => {
	// Restore original env vars to avoid polluting other tests
	if (originalAlpacaKey !== undefined) {
		Bun.env.ALPACA_KEY = originalAlpacaKey;
	} else {
		delete Bun.env.ALPACA_KEY;
	}
	if (originalAlpacaSecret !== undefined) {
		Bun.env.ALPACA_SECRET = originalAlpacaSecret;
	} else {
		delete Bun.env.ALPACA_SECRET;
	}
});

// Mock database - must export all functions from db.ts
mock.module("../db", () => ({
	getRegimeLabelsRepo: () => ({
		getCurrent: async (symbol: string) => {
			if (symbol === "_MARKET") {
				return {
					symbol: "_MARKET",
					regime: "bull_trend",
					confidence: 0.8,
					timestamp: "2024-01-01T00:00:00Z",
					timeframe: "1d",
				};
			}
			return null;
		},
	}),
	// Stub implementations for all other exports
	getDrizzleDb: () => ({}),
	closeDb: async () => {},
	getDecisionsRepo: () => ({}),
	getAlertsRepo: () => ({}),
	getAlertSettingsRepo: () => ({}),
	getOrdersRepo: () => ({}),
	getPositionsRepo: () => ({}),
	getAgentOutputsRepo: () => ({}),
	getPortfolioSnapshotsRepo: () => ({}),
	getConfigVersionsRepo: () => ({}),
	getThesesRepo: () => ({}),
	getTradingConfigRepo: () => ({}),
	getAgentConfigsRepo: () => ({}),
	getUniverseConfigsRepo: () => ({}),
	getUserPreferencesRepo: () => ({}),
	getAuditLogRepo: () => ({}),
	getConstraintsConfigRepo: () => ({}),
	getCyclesRepo: () => ({}),
	getFilingsRepo: () => ({}),
	getFilingSyncRunsRepo: () => ({}),
	getSystemStateRepo: () => ({}),
	getIndicatorSyncRunsRepo: () => ({}),
	getMacroWatchRepo: () => ({}),
	getFundamentalsRepo: () => ({}),
	getShortInterestRepo: () => ({}),
	getSentimentRepo: () => ({}),
	getCorporateActionsRepo: () => ({}),
	getPredictionMarketsRepo: () => ({}),
	getRuntimeConfigService: () => ({}),
}));

// Mock Alpaca market data client
mock.module("@cream/marketdata", () => ({
	createAlpacaClientFromEnv: () => ({
		getSnapshots: () => Promise.resolve(new Map()),
	}),
	isAlpacaConfigured: () => true,
}));

describe("Market Routes", () => {
	test("GET /regime returns regime status", async () => {
		const res = await marketRoutes.request("/regime");
		expect(res.status).toBe(200);
		const data = await res.json();
		expect(data).toMatchObject({
			label: "BULL_TREND",
			confidence: 0.8,
			vix: 0, // VIX is 0 since Alpaca doesn't provide real VIX data
			sectorRotation: {},
			updatedAt: "2024-01-01T00:00:00Z",
		});
	});
});
