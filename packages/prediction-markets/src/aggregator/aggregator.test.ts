/**
 * Tests for Prediction Market Aggregator
 */

import { describe, expect, it } from "bun:test";
import type { PredictionMarketEvent } from "@cream/domain";
import { ArbitrageDetector, DEFAULT_ARBITRAGE_CONFIG } from "./arbitrage-detector";
import { DEFAULT_MATCHER_CONFIG, MarketMatcher } from "./market-matcher";

describe("MarketMatcher", () => {
	describe("DEFAULT_MATCHER_CONFIG", () => {
		it("should have valid default values", () => {
			expect(DEFAULT_MATCHER_CONFIG.minSimilarity).toBeGreaterThan(0);
			expect(DEFAULT_MATCHER_CONFIG.minSimilarity).toBeLessThanOrEqual(1);
			expect(
				DEFAULT_MATCHER_CONFIG.questionWeight +
					DEFAULT_MATCHER_CONFIG.outcomeWeight +
					DEFAULT_MATCHER_CONFIG.temporalWeight,
			).toBeCloseTo(1);
		});
	});

	describe("findMatches", () => {
		it("should match similar binary markets across platforms", () => {
			const matcher = new MarketMatcher();

			const kalshiMarket: PredictionMarketEvent = {
				eventId: "pm_kalshi_fed",
				eventType: "PREDICTION_MARKET",
				eventTime: "2026-01-29T19:00:00Z",
				payload: {
					platform: "KALSHI",
					marketType: "FED_RATE",
					marketTicker: "KXFED-26JAN29",
					marketQuestion: "Will the Fed cut interest rates in January 2026?",
					outcomes: [
						{ outcome: "Yes", probability: 0.6, price: 0.6 },
						{ outcome: "No", probability: 0.4, price: 0.4 },
					],
					lastUpdated: "2026-01-04T15:00:00Z",
				},
				relatedInstrumentIds: ["XLF"],
			};

			const polymarketMarket: PredictionMarketEvent = {
				eventId: "pm_polymarket_fed",
				eventType: "PREDICTION_MARKET",
				eventTime: "2026-01-29T20:00:00Z",
				payload: {
					platform: "POLYMARKET",
					marketType: "FED_RATE",
					marketTicker: "0x1234",
					marketQuestion: "Federal Reserve to cut rates in January 2026?",
					outcomes: [
						{ outcome: "Yes", probability: 0.55, price: 0.55 },
						{ outcome: "No", probability: 0.45, price: 0.45 },
					],
					lastUpdated: "2026-01-04T15:00:00Z",
				},
				relatedInstrumentIds: ["XLF"],
			};

			const matches = matcher.findMatches([kalshiMarket], [polymarketMarket]);

			expect(matches).toHaveLength(1);
			expect(matches[0]?.similarity).toBeGreaterThan(0.5);
			expect(matches[0]?.priceDivergence).toBeCloseTo(0.05, 2);
		});

		it("should not match unrelated markets", () => {
			const matcher = new MarketMatcher();

			const fedMarket: PredictionMarketEvent = {
				eventId: "pm_kalshi_fed",
				eventType: "PREDICTION_MARKET",
				eventTime: "2026-01-29T19:00:00Z",
				payload: {
					platform: "KALSHI",
					marketType: "FED_RATE",
					marketTicker: "KXFED",
					marketQuestion: "Will the Fed cut interest rates?",
					outcomes: [
						{ outcome: "Yes", probability: 0.6, price: 0.6 },
						{ outcome: "No", probability: 0.4, price: 0.4 },
					],
					lastUpdated: "2026-01-04T15:00:00Z",
				},
				relatedInstrumentIds: [],
			};

			const recessionMarket: PredictionMarketEvent = {
				eventId: "pm_polymarket_recession",
				eventType: "PREDICTION_MARKET",
				eventTime: "2026-12-31T23:59:59Z",
				payload: {
					platform: "POLYMARKET",
					marketType: "RECESSION",
					marketTicker: "0xrec",
					marketQuestion: "Will there be a recession in 2026?",
					outcomes: [
						{ outcome: "Yes", probability: 0.3, price: 0.3 },
						{ outcome: "No", probability: 0.7, price: 0.7 },
					],
					lastUpdated: "2026-01-04T15:00:00Z",
				},
				relatedInstrumentIds: [],
			};

			const matches = matcher.findMatches([fedMarket], [recessionMarket]);

			expect(matches).toHaveLength(0);
		});

		it("should not match markets from the same platform", () => {
			const matcher = new MarketMatcher();

			const market1: PredictionMarketEvent = {
				eventId: "pm_kalshi_1",
				eventType: "PREDICTION_MARKET",
				eventTime: "2026-01-29T19:00:00Z",
				payload: {
					platform: "KALSHI",
					marketType: "FED_RATE",
					marketTicker: "KXFED-1",
					marketQuestion: "Will the Fed cut rates?",
					outcomes: [{ outcome: "Yes", probability: 0.6, price: 0.6 }],
					lastUpdated: "2026-01-04T15:00:00Z",
				},
				relatedInstrumentIds: [],
			};

			const market2: PredictionMarketEvent = {
				eventId: "pm_kalshi_2",
				eventType: "PREDICTION_MARKET",
				eventTime: "2026-01-29T19:00:00Z",
				payload: {
					platform: "KALSHI",
					marketType: "FED_RATE",
					marketTicker: "KXFED-2",
					marketQuestion: "Will the Fed cut rates?",
					outcomes: [{ outcome: "Yes", probability: 0.6, price: 0.6 }],
					lastUpdated: "2026-01-04T15:00:00Z",
				},
				relatedInstrumentIds: [],
			};

			const matches = matcher.findMatches([market1], [market2]);

			expect(matches).toHaveLength(0);
		});
	});
});

describe("ArbitrageDetector", () => {
	describe("DEFAULT_ARBITRAGE_CONFIG", () => {
		it("should have valid default values", () => {
			expect(DEFAULT_ARBITRAGE_CONFIG.minDivergence).toBeGreaterThan(0);
			expect(DEFAULT_ARBITRAGE_CONFIG.maxDivergence).toBeGreaterThan(
				DEFAULT_ARBITRAGE_CONFIG.minDivergence,
			);
			expect(DEFAULT_ARBITRAGE_CONFIG.minLiquidity).toBeGreaterThanOrEqual(0);
		});
	});

	describe("analyze", () => {
		it("should detect arbitrage opportunities", () => {
			const detector = new ArbitrageDetector();

			const marketA: PredictionMarketEvent = {
				eventId: "pm_kalshi_fed",
				eventType: "PREDICTION_MARKET",
				eventTime: "2026-01-29T19:00:00Z",
				payload: {
					platform: "KALSHI",
					marketType: "FED_RATE",
					marketTicker: "KXFED",
					marketQuestion: "Will the Fed cut rates?",
					outcomes: [
						{ outcome: "Yes", probability: 0.7, price: 0.7 },
						{ outcome: "No", probability: 0.3, price: 0.3 },
					],
					lastUpdated: "2026-01-04T15:00:00Z",
					liquidityScore: 0.8,
				},
				relatedInstrumentIds: [],
			};

			const marketB: PredictionMarketEvent = {
				eventId: "pm_polymarket_fed",
				eventType: "PREDICTION_MARKET",
				eventTime: "2026-01-29T19:00:00Z",
				payload: {
					platform: "POLYMARKET",
					marketType: "FED_RATE",
					marketTicker: "0x1234",
					marketQuestion: "Federal Reserve rate cut?",
					outcomes: [
						{ outcome: "Yes", probability: 0.55, price: 0.55 },
						{ outcome: "No", probability: 0.45, price: 0.45 },
					],
					lastUpdated: "2026-01-04T15:00:00Z",
					liquidityScore: 0.7,
				},
				relatedInstrumentIds: [],
			};

			const matchedMarkets = [
				{
					marketA,
					marketB,
					similarity: 0.85,
					priceDivergence: 0.15, // 15% divergence
				},
			];

			const alerts = detector.analyze(matchedMarkets);

			expect(alerts).toHaveLength(1);
			expect(alerts[0]?.type).toBe("opportunity");
			expect(alerts[0]?.divergence).toBe(0.15);
			expect(alerts[0]?.highPlatform).toBe("KALSHI");
			expect(alerts[0]?.lowPlatform).toBe("POLYMARKET");
		});

		it("should flag large divergences as data quality issues", () => {
			const detector = new ArbitrageDetector();

			const marketA: PredictionMarketEvent = {
				eventId: "pm_kalshi_fed",
				eventType: "PREDICTION_MARKET",
				eventTime: "2026-01-29T19:00:00Z",
				payload: {
					platform: "KALSHI",
					marketType: "FED_RATE",
					marketTicker: "KXFED",
					marketQuestion: "Fed rate cut?",
					outcomes: [
						{ outcome: "Yes", probability: 0.9, price: 0.9 },
						{ outcome: "No", probability: 0.1, price: 0.1 },
					],
					lastUpdated: "2026-01-04T15:00:00Z",
					liquidityScore: 0.8,
				},
				relatedInstrumentIds: [],
			};

			const marketB: PredictionMarketEvent = {
				eventId: "pm_polymarket_fed",
				eventType: "PREDICTION_MARKET",
				eventTime: "2026-01-29T19:00:00Z",
				payload: {
					platform: "POLYMARKET",
					marketType: "FED_RATE",
					marketTicker: "0x1234",
					marketQuestion: "Fed rate cut?",
					outcomes: [
						{ outcome: "Yes", probability: 0.6, price: 0.6 },
						{ outcome: "No", probability: 0.4, price: 0.4 },
					],
					lastUpdated: "2026-01-04T15:00:00Z",
					liquidityScore: 0.7,
				},
				relatedInstrumentIds: [],
			};

			const matchedMarkets = [
				{
					marketA,
					marketB,
					similarity: 0.9,
					priceDivergence: 0.3, // 30% divergence
				},
			];

			const alerts = detector.analyze(matchedMarkets);

			expect(alerts).toHaveLength(1);
			expect(alerts[0]?.type).toBe("data_quality_issue");
		});

		it("should skip low liquidity markets", () => {
			const detector = new ArbitrageDetector();

			const marketA: PredictionMarketEvent = {
				eventId: "pm_kalshi_fed",
				eventType: "PREDICTION_MARKET",
				eventTime: "2026-01-29T19:00:00Z",
				payload: {
					platform: "KALSHI",
					marketType: "FED_RATE",
					marketTicker: "KXFED",
					marketQuestion: "Fed rate cut?",
					outcomes: [
						{ outcome: "Yes", probability: 0.7, price: 0.7 },
						{ outcome: "No", probability: 0.3, price: 0.3 },
					],
					lastUpdated: "2026-01-04T15:00:00Z",
					liquidityScore: 0.1, // Low liquidity
				},
				relatedInstrumentIds: [],
			};

			const marketB: PredictionMarketEvent = {
				eventId: "pm_polymarket_fed",
				eventType: "PREDICTION_MARKET",
				eventTime: "2026-01-29T19:00:00Z",
				payload: {
					platform: "POLYMARKET",
					marketType: "FED_RATE",
					marketTicker: "0x1234",
					marketQuestion: "Fed rate cut?",
					outcomes: [
						{ outcome: "Yes", probability: 0.55, price: 0.55 },
						{ outcome: "No", probability: 0.45, price: 0.45 },
					],
					lastUpdated: "2026-01-04T15:00:00Z",
					liquidityScore: 0.5,
				},
				relatedInstrumentIds: [],
			};

			const matchedMarkets = [
				{
					marketA,
					marketB,
					similarity: 0.9,
					priceDivergence: 0.15,
				},
			];

			const alerts = detector.analyze(matchedMarkets);

			expect(alerts).toHaveLength(0);
		});
	});

	describe("getSummary", () => {
		it("should calculate summary statistics", () => {
			const detector = new ArbitrageDetector();

			const alerts = [
				{
					type: "opportunity" as const,
					matchedMarket: {} as never,
					divergence: 0.1,
					highPlatform: "KALSHI",
					lowPlatform: "POLYMARKET",
					description: "Test",
				},
				{
					type: "data_quality_issue" as const,
					matchedMarket: {} as never,
					divergence: 0.25,
					highPlatform: "KALSHI",
					lowPlatform: "POLYMARKET",
					description: "Test",
				},
			];

			const summary = detector.getSummary(alerts);

			expect(summary.totalAlerts).toBe(2);
			expect(summary.opportunities).toBe(1);
			expect(summary.dataQualityIssues).toBe(1);
			expect(summary.averageDivergence).toBeCloseTo(0.175);
			expect(summary.maxDivergence).toBe(0.25);
		});
	});
});
