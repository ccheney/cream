/**
 * Unified Prediction Market Client Tests
 */

// Set required environment variables before imports
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

// Mock events for testing
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
		liquidityScore: 0.1, // Below default threshold
		volume24h: 1000,
	},
};

// Mock the provider modules
let mockKalshiClient: {
	fetchMarkets: ReturnType<typeof mock>;
	calculateScores: ReturnType<typeof mock>;
} | null = null;

let mockPolymarketClient: {
	fetchMarkets: ReturnType<typeof mock>;
	calculateScores: ReturnType<typeof mock>;
} | null = null;

// Mock the module imports
mock.module("../providers/kalshi", () => ({
	createKalshiClient: () => mockKalshiClient,
}));

mock.module("../providers/polymarket", () => ({
	createPolymarketClient: () => mockPolymarketClient,
}));

describe("UnifiedPredictionMarketClient", () => {
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

	// ========================================
	// Constructor and Configuration
	// ========================================

	describe("constructor", () => {
		test("creates client with default config", () => {
			const client = new UnifiedPredictionMarketClient(baseConfig);
			expect(client).toBeDefined();
		});

		test("creates client with custom unified config", () => {
			const client = new UnifiedPredictionMarketClient(baseConfig, {
				minLiquidityScore: 0.5,
				maxMarketAgeHours: 72,
			});
			expect(client).toBeDefined();
		});

		test("handles disabled Kalshi", () => {
			const kalshiConfig = requireValue(baseConfig.kalshi, "kalshi config");
			const config = {
				...baseConfig,
				kalshi: { ...kalshiConfig, enabled: false },
			};
			const client = new UnifiedPredictionMarketClient(config);
			expect(client).toBeDefined();
		});

		test("handles disabled Polymarket", () => {
			const polymarketConfig = requireValue(baseConfig.polymarket, "polymarket config");
			const config = {
				...baseConfig,
				polymarket: { ...polymarketConfig, enabled: false },
			};
			const client = new UnifiedPredictionMarketClient(config);
			expect(client).toBeDefined();
		});

		test("handles both platforms disabled", () => {
			const kalshiConfig = requireValue(baseConfig.kalshi, "kalshi config");
			const polymarketConfig = requireValue(baseConfig.polymarket, "polymarket config");
			const config = {
				...baseConfig,
				kalshi: { ...kalshiConfig, enabled: false },
				polymarket: { ...polymarketConfig, enabled: false },
			};
			const client = new UnifiedPredictionMarketClient(config);
			expect(client).toBeDefined();
		});

		test("handles missing kalshi config", () => {
			const config = {
				...baseConfig,
				kalshi: undefined,
			};
			const client = new UnifiedPredictionMarketClient(config, { kalshiEnabled: true });
			expect(client).toBeDefined();
		});

		test("handles missing polymarket config", () => {
			const config = {
				...baseConfig,
				polymarket: undefined,
			};
			const client = new UnifiedPredictionMarketClient(config, { polymarketEnabled: true });
			expect(client).toBeDefined();
		});
	});

	// ========================================
	// getAllMarketData
	// ========================================

	describe("getAllMarketData", () => {
		test("fetches and aggregates data from both platforms", async () => {
			const client = new UnifiedPredictionMarketClient(baseConfig);
			const data = await client.getAllMarketData();

			expect(data.events.length).toBeGreaterThan(0);
			expect(data.matchedMarkets).toBeDefined();
			expect(data.arbitrageAlerts).toBeDefined();
			expect(data.arbitrageSummary).toBeDefined();
			expect(data.scores).toBeDefined();
			expect(data.signals).toBeDefined();
		});

		test("filters out low liquidity markets", async () => {
			const kalshiClient = requireValue(mockKalshiClient, "mock Kalshi client");
			kalshiClient.fetchMarkets.mockImplementation(() =>
				Promise.resolve([...mockKalshiEvents, mockLowLiquidityEvent]),
			);

			const client = new UnifiedPredictionMarketClient(baseConfig);
			const data = await client.getAllMarketData();

			// Low liquidity market should be filtered
			const hasLowLiq = data.events.some((e) => e.payload.marketTicker === "LOW-LIQ");
			expect(hasLowLiq).toBe(false);
		});

		test("handles Kalshi fetch failure gracefully", async () => {
			const kalshiClient = requireValue(mockKalshiClient, "mock Kalshi client");
			kalshiClient.fetchMarkets.mockImplementation(() =>
				Promise.reject(new Error("Kalshi API error")),
			);

			const client = new UnifiedPredictionMarketClient(baseConfig);
			const data = await client.getAllMarketData();

			// Should still return Polymarket data
			expect(data.events.length).toBeGreaterThan(0);
			expect(data.events.every((e) => e.payload.platform === "POLYMARKET")).toBe(true);
		});

		test("handles Polymarket fetch failure gracefully", async () => {
			const polymarketClient = requireValue(mockPolymarketClient, "mock Polymarket client");
			polymarketClient.fetchMarkets.mockImplementation(() =>
				Promise.reject(new Error("Polymarket API error")),
			);

			const client = new UnifiedPredictionMarketClient(baseConfig);
			const data = await client.getAllMarketData();

			// Should still return Kalshi data
			expect(data.events.length).toBeGreaterThan(0);
			expect(data.events.every((e) => e.payload.platform === "KALSHI")).toBe(true);
		});

		test("accepts market type filter", async () => {
			const client = new UnifiedPredictionMarketClient(baseConfig);
			const _data = await client.getAllMarketData(["FED_RATE"]);

			const kalshiClient = requireValue(mockKalshiClient, "mock Kalshi client");
			const polymarketClient = requireValue(mockPolymarketClient, "mock Polymarket client");
			expect(kalshiClient.fetchMarkets).toHaveBeenCalledWith(["FED_RATE"]);
			expect(polymarketClient.fetchMarkets).toHaveBeenCalledWith(["FED_RATE"]);
		});

		test("matches markets across platforms", async () => {
			const client = new UnifiedPredictionMarketClient(baseConfig);
			const data = await client.getAllMarketData();

			// FED_RATE markets should be matched
			expect(data.matchedMarkets).toBeDefined();
		});

		test("calculates combined scores from both platforms", async () => {
			const client = new UnifiedPredictionMarketClient(baseConfig);
			const data = await client.getAllMarketData();

			// Should average scores from both platforms
			expect(data.scores.fedCutProbability).toBeDefined();
			// (0.75 + 0.78) / 2 = 0.765
			expect(data.scores.fedCutProbability).toBeCloseTo(0.765, 2);
		});

		test("calculates macro risk signals", async () => {
			const client = new UnifiedPredictionMarketClient(baseConfig);
			const data = await client.getAllMarketData();

			expect(data.signals.timestamp).toBeDefined();
			expect(data.signals.marketCount).toBe(data.events.length);
			expect(data.signals.platforms).toBeDefined();
		});
	});

	// ========================================
	// getFedRateMarkets
	// ========================================

	describe("getFedRateMarkets", () => {
		test("returns Fed rate markets", async () => {
			const client = new UnifiedPredictionMarketClient(baseConfig);
			const markets = await client.getFedRateMarkets();

			expect(markets.length).toBeGreaterThan(0);
			for (const market of markets) {
				expect(market.ticker).toBeDefined();
				expect(market.platform).toBeDefined();
				expect(market.question).toBeDefined();
				expect(market.cutProbability).toBeDefined();
				expect(market.hikeProbability).toBeDefined();
				expect(market.holdProbability).toBeDefined();
				expect(market.meetingDate).toBeDefined();
				expect(market.liquidity).toBeDefined();
			}
		});

		test("correctly maps cut/hike/hold probabilities", async () => {
			const client = new UnifiedPredictionMarketClient(baseConfig);
			const markets = await client.getFedRateMarkets();

			const kalshiMarket = markets.find((m) => m.platform === "KALSHI");
			if (kalshiMarket) {
				expect(kalshiMarket.cutProbability).toBe(0.75);
				expect(kalshiMarket.hikeProbability).toBe(0.05);
				expect(kalshiMarket.holdProbability).toBe(0.2);
			}

			const polyMarket = markets.find((m) => m.platform === "POLYMARKET");
			if (polyMarket) {
				expect(polyMarket.cutProbability).toBe(0.78); // "Decrease"
				expect(polyMarket.hikeProbability).toBe(0.04); // "Increase"
				expect(polyMarket.holdProbability).toBe(0.18); // "Unchanged"
			}
		});
	});

	// ========================================
	// getEconomicDataMarkets
	// ========================================

	describe("getEconomicDataMarkets", () => {
		test("returns CPI markets", async () => {
			const client = new UnifiedPredictionMarketClient(baseConfig);
			const markets = await client.getEconomicDataMarkets("CPI");

			expect(markets.length).toBeGreaterThan(0);
			for (const market of markets) {
				expect(market.indicator).toBe("CPI");
				expect(market.outcomes.length).toBeGreaterThan(0);
			}
		});

		test("returns empty array for GDP if no matching markets", async () => {
			// Mock returns no GDP markets
			const kalshiClient = requireValue(mockKalshiClient, "mock Kalshi client");
			const polymarketClient = requireValue(mockPolymarketClient, "mock Polymarket client");
			kalshiClient.fetchMarkets.mockImplementation(
				() => Promise.resolve([requireValue(mockKalshiEvents[1], "CPI market")]), // Only CPI market
			);
			polymarketClient.fetchMarkets.mockImplementation(() => Promise.resolve([]));

			const client = new UnifiedPredictionMarketClient(baseConfig);
			const markets = await client.getEconomicDataMarkets("GDP");

			expect(markets).toEqual([]);
		});

		test("filters by NFP/jobs keywords", async () => {
			const jobsEvent: PredictionMarketEvent = {
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

			const kalshiClient = requireValue(mockKalshiClient, "mock Kalshi client");
			const polymarketClient = requireValue(mockPolymarketClient, "mock Polymarket client");
			kalshiClient.fetchMarkets.mockImplementation(() => Promise.resolve([jobsEvent]));
			polymarketClient.fetchMarkets.mockImplementation(() => Promise.resolve([]));

			const client = new UnifiedPredictionMarketClient(baseConfig);
			const markets = await client.getEconomicDataMarkets("NFP");

			expect(markets.length).toBe(1);
			const firstMarket = requireValue(markets[0], "market");
			expect(firstMarket.indicator).toBe("NFP");
		});
	});

	// ========================================
	// getMacroRiskSignals
	// ========================================

	describe("getMacroRiskSignals", () => {
		test("returns macro risk signals", async () => {
			const client = new UnifiedPredictionMarketClient(baseConfig);
			const signals = await client.getMacroRiskSignals();

			expect(signals.timestamp).toBeDefined();
			expect(signals.marketCount).toBeGreaterThan(0);
			expect(signals.platforms).toContain("KALSHI");
			expect(signals.platforms).toContain("POLYMARKET");
		});

		test("calculates policy event risk", async () => {
			const client = new UnifiedPredictionMarketClient(baseConfig);
			const signals = await client.getMacroRiskSignals();

			expect(signals.policyEventRisk).toBeDefined();
			expect(signals.policyEventRisk).toBeGreaterThanOrEqual(0);
			expect(signals.policyEventRisk).toBeLessThanOrEqual(1);
		});

		test("calculates market confidence", async () => {
			const client = new UnifiedPredictionMarketClient(baseConfig);
			const signals = await client.getMacroRiskSignals();

			if (signals.macroUncertaintyIndex !== undefined) {
				expect(signals.marketConfidence).toBeCloseTo(1 - signals.macroUncertaintyIndex, 2);
			}
		});
	});

	// ========================================
	// getArbitrageOpportunities
	// ========================================

	describe("getArbitrageOpportunities", () => {
		test("returns arbitrage opportunities", async () => {
			const client = new UnifiedPredictionMarketClient(baseConfig);
			const opportunities = await client.getArbitrageOpportunities();

			expect(Array.isArray(opportunities)).toBe(true);
			for (const opp of opportunities) {
				expect(opp.type).toBe("opportunity");
			}
		});
	});

	// ========================================
	// createUnifiedClient factory
	// ========================================

	describe("createUnifiedClient", () => {
		test("creates client from config", () => {
			const client = createUnifiedClient(baseConfig);
			expect(client).toBeInstanceOf(UnifiedPredictionMarketClient);
		});
	});

	// ========================================
	// DEFAULT_UNIFIED_CONFIG
	// ========================================

	describe("DEFAULT_UNIFIED_CONFIG", () => {
		test("has expected defaults", () => {
			expect(DEFAULT_UNIFIED_CONFIG.kalshiEnabled).toBe(true);
			expect(DEFAULT_UNIFIED_CONFIG.polymarketEnabled).toBe(true);
			expect(DEFAULT_UNIFIED_CONFIG.minLiquidityScore).toBe(0.3);
			expect(DEFAULT_UNIFIED_CONFIG.maxMarketAgeHours).toBe(168);
		});
	});
});
