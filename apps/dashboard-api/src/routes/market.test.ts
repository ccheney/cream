import { beforeAll, describe, expect, mock, test } from "bun:test";
import marketRoutes from "./market";

beforeAll(() => {
	process.env.ALPACA_KEY = "test";
	process.env.ALPACA_SECRET = "test";
});

// Mock database
mock.module("../db", () => ({
	getRegimeLabelsRepo: async () => ({
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
