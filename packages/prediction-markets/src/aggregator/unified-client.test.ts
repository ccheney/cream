/**
 * Unified Prediction Market Client Tests
 */

Bun.env.CREAM_ENV = "PAPER";

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { PredictionMarketsConfig } from "@cream/config";
import type { PredictionMarketEvent } from "@cream/domain";
import { requireValue } from "@cream/test-utils";
import {
	createUnifiedClient,
	DEFAULT_UNIFIED_CONFIG,
	UnifiedPredictionMarketClient,
} from "./unified-client.js";

const mockKalshiEvents: PredictionMarketEvent[] = [
	{
		eventType: "PREDICTION_MARKET",
		eventTime: "2024-12-18T00:00:00Z",
		eventId: "kalshi-1",
		payload: {
			platform: "KALSHI",
			marketTicker: "FED-24DEC-T4.75",
			marketType: "FED_RATE",
			marketQuestion: "Will the Fed cut rates in December 2024?",
			outcomes: [
				{ outcome: "Cut", probability: 0.75, price: 0.75 },
				{ outcome: "Hold", probability: 0.2, price: 0.2 },
				{ outcome: "Hike", probability: 0.05, price: 0.05 },
			],
			liquidityScore: 0.85,
			volume24h: 150000,
		},
	},
	{
		eventType: "PREDICTION_MARKET",
		eventTime: "2025-01-15T00:00:00Z",
		eventId: "kalshi-2",
		payload: {
			platform: "KALSHI",
			marketTicker: "CPI-25JAN",
			marketType: "ECONOMIC_DATA",
			marketQuestion: "What will CPI be in January 2025?",
			outcomes: [
				{ outcome: "Above 3%", probability: 0.3, price: 0.3 },
				{ outcome: "2.5-3%", probability: 0.5, price: 0.5 },
				{ outcome: "Below 2.5%", probability: 0.2, price: 0.2 },
			],
			liquidityScore: 0.7,
			volume24h: 75000,
		},
	},
	{
		eventType: "PREDICTION_MARKET",
		eventTime: "2025-12-31T00:00:00Z",
		eventId: "kalshi-3",
		payload: {
			platform: "KALSHI",
			marketTicker: "RECESSION-2025",
			marketType: "RECESSION",
			marketQuestion: "Will there be a recession in 2025?",
			outcomes: [
				{ outcome: "Yes", probability: 0.25, price: 0.25 },
				{ outcome: "No", probability: 0.75, price: 0.75 },
			],
			liquidityScore: 0.6,
			volume24h: 100000,
		},
	},
];

const mockPolymarketEvents: PredictionMarketEvent[] = [
	{
		eventType: "PREDICTION_MARKET",
		eventTime: "2024-12-18T00:00:00Z",
		eventId: "poly-1",
		payload: {
			platform: "POLYMARKET",
			marketTicker: "fed-december-2024",
			marketType: "FED_RATE",
			marketQuestion: "Fed rate decision December 2024",
			outcomes: [
				{ outcome: "Decrease", probability: 0.78, price: 0.78 },
				{ outcome: "Unchanged", probability: 0.18, price: 0.18 },
				{ outcome: "Increase", probability: 0.04, price: 0.04 },
			],
			liquidityScore: 0.9,
			volume24h: 250000,
		},
	},
	{
		eventType: "PREDICTION_MARKET",
		eventTime: "2025-01-01T00:00:00Z",
		eventId: "poly-2",
		payload: {
			platform: "POLYMARKET",
			marketTicker: "govt-shutdown-2025",
			marketType: "GEOPOLITICAL",
			marketQuestion: "Will there be a government shutdown in Q1 2025?",
			outcomes: [
				{ outcome: "Yes", probability: 0.45, price: 0.45 },
				{ outcome: "No", probability: 0.55, price: 0.55 },
			],
			liquidityScore: 0.65,
			volume24h: 80000,
		},
	},
];

const mockLowLiquidityEvent: PredictionMarketEvent = {
	eventType: "PREDICTION_MARKET",
	eventTime: "2025-06-01T00:00:00Z",
	eventId: "low-liq",
	payload: {
		platform: "KALSHI",
		marketTicker: "LOW-LIQ",
		marketType: "OTHER",
		marketQuestion: "Low liquidity market",
		outcomes: [
			{ outcome: "Yes", probability: 0.5, price: 0.5 },
			{ outcome: "No", probability: 0.5, price: 0.5 },
		],
		liquidityScore: 0.1,
		volume24h: 1000,
	},
};

type MockPlatformClient = {
	fetchMarkets: ReturnType<typeof mock>;
	calculateScores: ReturnType<typeof mock>;
};

const baseConfig: PredictionMarketsConfig = {
	enabled: true,
	kalshi: {
		enabled: true,
		apiKey: "test-kalshi-key",
		refreshIntervalSeconds: 300,
	},
	polymarket: {
		enabled: true,
		refreshIntervalSeconds: 300,
	},
	signals: {
		fedRateEnabled: true,
		recessionEnabled: true,
		economicDataEnabled: true,
		minLiquidityScore: 0.3,
	},
};

let mockKalshiClient: MockPlatformClient | null = null;
let mockPolymarketClient: MockPlatformClient | null = null;

mock.module("../providers/kalshi", () => ({
	createKalshiClient: () => mockKalshiClient,
}));

mock.module("../providers/polymarket", () => ({
	createPolymarketClient: () => mockPolymarketClient,
}));

function createClient(config: PredictionMarketsConfig = baseConfig): UnifiedPredictionMarketClient {
	return new UnifiedPredictionMarketClient(config);
}

function kalshiClient(): MockPlatformClient {
	return requireValue(mockKalshiClient, "mock Kalshi client");
}

function polymarketClient(): MockPlatformClient {
	return requireValue(mockPolymarketClient, "mock Polymarket client");
}

function createJobsEvent(): PredictionMarketEvent {
	return {
		eventType: "PREDICTION_MARKET",
		eventTime: "2025-01-10T00:00:00Z",
		eventId: "jobs-1",
		payload: {
			platform: "KALSHI",
			marketTicker: "NFP-25JAN",
			marketType: "ECONOMIC_DATA",
			marketQuestion: "How many jobs will be added in January 2025?",
			outcomes: [
				{ outcome: "Above 200K", probability: 0.4, price: 0.4 },
				{ outcome: "150-200K", probability: 0.35, price: 0.35 },
				{ outcome: "Below 150K", probability: 0.25, price: 0.25 },
			],
			liquidityScore: 0.55,
			volume24h: 50000,
		},
	};
}

beforeEach(() => {
	mockKalshiClient = {
		fetchMarkets: mock(() => Promise.resolve(mockKalshiEvents)),
		calculateScores: mock(() => ({
			fedCutProbability: 0.75,
			fedHikeProbability: 0.05,
			recessionProbability12m: 0.25,
			macroUncertaintyIndex: 0.35,
		})),
	};
	mockPolymarketClient = {
		fetchMarkets: mock(() => Promise.resolve(mockPolymarketEvents)),
		calculateScores: mock(() => ({
			fedCutProbability: 0.78,
			fedHikeProbability: 0.04,
			macroUncertaintyIndex: 0.4,
		})),
	};
});

afterEach(() => {
	mockKalshiClient = null;
	mockPolymarketClient = null;
});

describe("UnifiedPredictionMarketClient constructor", () => {
	test("creates with default and custom config", () => {
		expect(createClient()).toBeDefined();
		expect(
			new UnifiedPredictionMarketClient(baseConfig, {
				minLiquidityScore: 0.5,
				maxMarketAgeHours: 72,
			}),
		).toBeDefined();
	});

	test("supports disabled platforms", () => {
		const kalshiConfig = requireValue(baseConfig.kalshi, "kalshi config");
		const polymarketConfig = requireValue(baseConfig.polymarket, "polymarket config");
		expect(
			createClient({ ...baseConfig, kalshi: { ...kalshiConfig, enabled: false } }),
		).toBeDefined();
		expect(
			createClient({ ...baseConfig, polymarket: { ...polymarketConfig, enabled: false } }),
		).toBeDefined();
		expect(
			createClient({
				...baseConfig,
				kalshi: { ...kalshiConfig, enabled: false },
				polymarket: { ...polymarketConfig, enabled: false },
			}),
		).toBeDefined();
	});
});

describe("UnifiedPredictionMarketClient constructor edge cases", () => {
	test("handles missing provider config", () => {
		expect(
			new UnifiedPredictionMarketClient(
				{ ...baseConfig, kalshi: undefined },
				{ kalshiEnabled: true },
			),
		).toBeDefined();
		expect(
			new UnifiedPredictionMarketClient(
				{ ...baseConfig, polymarket: undefined },
				{ polymarketEnabled: true },
			),
		).toBeDefined();
	});
});

describe("getAllMarketData basic behavior", () => {
	test("fetches and aggregates data from both platforms", async () => {
		const data = await createClient().getAllMarketData();
		expect(data.events.length).toBeGreaterThan(0);
		expect(data.matchedMarkets).toBeDefined();
		expect(data.arbitrageAlerts).toBeDefined();
		expect(data.arbitrageSummary).toBeDefined();
		expect(data.scores).toBeDefined();
		expect(data.signals).toBeDefined();
	});

	test("filters out low-liquidity markets", async () => {
		kalshiClient().fetchMarkets.mockImplementation(() =>
			Promise.resolve([...mockKalshiEvents, mockLowLiquidityEvent]),
		);
		const data = await createClient().getAllMarketData();
		expect(data.events.some((event) => event.payload.marketTicker === "LOW-LIQ")).toBe(false);
	});

	test("passes market type filters to providers", async () => {
		await createClient().getAllMarketData(["FED_RATE"]);
		expect(kalshiClient().fetchMarkets).toHaveBeenCalledWith(["FED_RATE"]);
		expect(polymarketClient().fetchMarkets).toHaveBeenCalledWith(["FED_RATE"]);
	});
});

describe("getAllMarketData provider failure handling", () => {
	test("continues with Polymarket if Kalshi fetch fails", async () => {
		kalshiClient().fetchMarkets.mockImplementation(() =>
			Promise.reject(new Error("Kalshi API error")),
		);
		const data = await createClient().getAllMarketData();
		expect(data.events.length).toBeGreaterThan(0);
		expect(data.events.every((event) => event.payload.platform === "POLYMARKET")).toBe(true);
	});

	test("continues with Kalshi if Polymarket fetch fails", async () => {
		polymarketClient().fetchMarkets.mockImplementation(() =>
			Promise.reject(new Error("Polymarket API error")),
		);
		const data = await createClient().getAllMarketData();
		expect(data.events.length).toBeGreaterThan(0);
		expect(data.events.every((event) => event.payload.platform === "KALSHI")).toBe(true);
	});
});

describe("getAllMarketData computed outputs", () => {
	test("produces matched markets", async () => {
		const data = await createClient().getAllMarketData();
		expect(data.matchedMarkets).toBeDefined();
	});

	test("averages platform scores", async () => {
		const data = await createClient().getAllMarketData();
		expect(data.scores.fedCutProbability).toBeCloseTo(0.765, 2);
	});

	test("generates macro signals", async () => {
		const data = await createClient().getAllMarketData();
		expect(data.signals.timestamp).toBeDefined();
		expect(data.signals.marketCount).toBe(data.events.length);
		expect(data.signals.platforms).toBeDefined();
	});
});

describe("getFedRateMarkets", () => {
	test("returns mapped Fed rate markets", async () => {
		const markets = await createClient().getFedRateMarkets();
		expect(markets.length).toBeGreaterThan(0);
		for (const market of markets) {
			expect(market.ticker).toBeDefined();
			expect(market.platform).toBeDefined();
			expect(market.cutProbability).toBeDefined();
			expect(market.hikeProbability).toBeDefined();
			expect(market.holdProbability).toBeDefined();
		}
	});

	test("maps cut/hike/hold outcomes for both platforms", async () => {
		const markets = await createClient().getFedRateMarkets();
		const kalshiMarket = markets.find((market) => market.platform === "KALSHI");
		if (kalshiMarket) {
			expect(kalshiMarket.cutProbability).toBe(0.75);
			expect(kalshiMarket.hikeProbability).toBe(0.05);
			expect(kalshiMarket.holdProbability).toBe(0.2);
		}
		const polyMarket = markets.find((market) => market.platform === "POLYMARKET");
		if (polyMarket) {
			expect(polyMarket.cutProbability).toBe(0.78);
			expect(polyMarket.hikeProbability).toBe(0.04);
			expect(polyMarket.holdProbability).toBe(0.18);
		}
	});
});

describe("getEconomicDataMarkets", () => {
	test("returns CPI markets", async () => {
		const markets = await createClient().getEconomicDataMarkets("CPI");
		expect(markets.length).toBeGreaterThan(0);
		for (const market of markets) {
			expect(market.indicator).toBe("CPI");
			expect(market.outcomes.length).toBeGreaterThan(0);
		}
	});

	test("returns empty array when indicator is missing", async () => {
		kalshiClient().fetchMarkets.mockImplementation(() =>
			Promise.resolve([requireValue(mockKalshiEvents[1], "CPI market")]),
		);
		polymarketClient().fetchMarkets.mockImplementation(() => Promise.resolve([]));
		const markets = await createClient().getEconomicDataMarkets("GDP");
		expect(markets).toEqual([]);
	});
});

describe("getEconomicDataMarkets keyword matching", () => {
	test("recognizes NFP/jobs markets", async () => {
		kalshiClient().fetchMarkets.mockImplementation(() => Promise.resolve([createJobsEvent()]));
		polymarketClient().fetchMarkets.mockImplementation(() => Promise.resolve([]));
		const markets = await createClient().getEconomicDataMarkets("NFP");
		expect(markets.length).toBe(1);
		expect(requireValue(markets[0], "market").indicator).toBe("NFP");
	});
});

describe("getMacroRiskSignals", () => {
	test("returns platform and market metadata", async () => {
		const signals = await createClient().getMacroRiskSignals();
		expect(signals.timestamp).toBeDefined();
		expect(signals.marketCount).toBeGreaterThan(0);
		expect(signals.platforms).toContain("KALSHI");
		expect(signals.platforms).toContain("POLYMARKET");
	});

	test("computes policy event risk in [0, 1]", async () => {
		const signals = await createClient().getMacroRiskSignals();
		expect(signals.policyEventRisk).toBeDefined();
		expect(signals.policyEventRisk).toBeGreaterThanOrEqual(0);
		expect(signals.policyEventRisk).toBeLessThanOrEqual(1);
	});

	test("computes market confidence from uncertainty", async () => {
		const signals = await createClient().getMacroRiskSignals();
		if (signals.macroUncertaintyIndex !== undefined) {
			expect(signals.marketConfidence).toBeCloseTo(1 - signals.macroUncertaintyIndex, 2);
		}
	});
});

describe("getArbitrageOpportunities", () => {
	test("returns only opportunity alerts", async () => {
		const opportunities = await createClient().getArbitrageOpportunities();
		expect(Array.isArray(opportunities)).toBe(true);
		for (const opportunity of opportunities) {
			expect(opportunity.type).toBe("opportunity");
		}
	});
});

describe("createUnifiedClient", () => {
	test("creates a UnifiedPredictionMarketClient", () => {
		expect(createUnifiedClient(baseConfig)).toBeInstanceOf(UnifiedPredictionMarketClient);
	});
});

describe("DEFAULT_UNIFIED_CONFIG", () => {
	test("contains expected defaults", () => {
		expect(DEFAULT_UNIFIED_CONFIG.kalshiEnabled).toBe(true);
		expect(DEFAULT_UNIFIED_CONFIG.polymarketEnabled).toBe(true);
		expect(DEFAULT_UNIFIED_CONFIG.minLiquidityScore).toBe(0.3);
		expect(DEFAULT_UNIFIED_CONFIG.maxMarketAgeHours).toBe(168);
	});
});
