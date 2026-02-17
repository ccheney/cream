/**
 * Tests for Prediction Market Aggregator
 */

import { describe, expect, it } from "bun:test";
import type { PredictionMarketEvent } from "@cream/domain";
import { ArbitrageDetector, DEFAULT_ARBITRAGE_CONFIG } from "./arbitrage-detector";
import { DEFAULT_MATCHER_CONFIG, MarketMatcher } from "./market-matcher";

interface BinaryMarketFixture {
	id: string;
	platform: "KALSHI" | "POLYMARKET";
	marketType: PredictionMarketEvent["payload"]["marketType"];
	ticker: string;
	question: string;
	eventTime?: string;
	yesProbability: number;
	liquidityScore?: number;
	relatedInstrumentIds?: string[];
}

function createBinaryMarketEvent(fixture: BinaryMarketFixture): PredictionMarketEvent {
	const {
		id,
		platform,
		marketType,
		ticker,
		question,
		eventTime = "2026-01-29T19:00:00Z",
		yesProbability,
		liquidityScore,
		relatedInstrumentIds = [],
	} = fixture;
	const noProbability = 1 - yesProbability;
	return {
		eventId: id,
		eventType: "PREDICTION_MARKET",
		eventTime,
		payload: {
			platform,
			marketType,
			marketTicker: ticker,
			marketQuestion: question,
			outcomes: [
				{ outcome: "Yes", probability: yesProbability, price: yesProbability },
				{ outcome: "No", probability: noProbability, price: noProbability },
			],
			lastUpdated: "2026-01-04T15:00:00Z",
			liquidityScore,
		},
		relatedInstrumentIds,
	};
}

describe("MarketMatcher defaults", () => {
	it("has valid default values", () => {
		expect(DEFAULT_MATCHER_CONFIG.minSimilarity).toBeGreaterThan(0);
		expect(DEFAULT_MATCHER_CONFIG.minSimilarity).toBeLessThanOrEqual(1);
		expect(
			DEFAULT_MATCHER_CONFIG.questionWeight +
				DEFAULT_MATCHER_CONFIG.outcomeWeight +
				DEFAULT_MATCHER_CONFIG.temporalWeight,
		).toBeCloseTo(1);
	});
});

describe("MarketMatcher findMatches: similar markets", () => {
	it("matches similar binary markets across platforms", () => {
		const matcher = new MarketMatcher();
		const kalshiMarket = createBinaryMarketEvent({
			id: "pm_kalshi_fed",
			platform: "KALSHI",
			marketType: "FED_RATE",
			ticker: "KXFED-26JAN29",
			question: "Will the Fed cut interest rates in January 2026?",
			yesProbability: 0.6,
			relatedInstrumentIds: ["XLF"],
		});
		const polymarketMarket = createBinaryMarketEvent({
			id: "pm_polymarket_fed",
			platform: "POLYMARKET",
			marketType: "FED_RATE",
			ticker: "0x1234",
			question: "Federal Reserve to cut rates in January 2026?",
			eventTime: "2026-01-29T20:00:00Z",
			yesProbability: 0.55,
			relatedInstrumentIds: ["XLF"],
		});

		const matches = matcher.findMatches([kalshiMarket], [polymarketMarket]);

		expect(matches).toHaveLength(1);
		expect(matches[0]?.similarity).toBeGreaterThan(0.5);
		expect(matches[0]?.priceDivergence).toBeCloseTo(0.05, 2);
	});
});

describe("MarketMatcher findMatches: unrelated markets", () => {
	it("does not match unrelated markets", () => {
		const matcher = new MarketMatcher();
		const fedMarket = createBinaryMarketEvent({
			id: "pm_kalshi_fed",
			platform: "KALSHI",
			marketType: "FED_RATE",
			ticker: "KXFED",
			question: "Will the Fed cut interest rates?",
			yesProbability: 0.6,
		});
		const recessionMarket = createBinaryMarketEvent({
			id: "pm_polymarket_recession",
			platform: "POLYMARKET",
			marketType: "RECESSION",
			ticker: "0xrec",
			question: "Will there be a recession in 2026?",
			eventTime: "2026-12-31T23:59:59Z",
			yesProbability: 0.3,
		});

		expect(matcher.findMatches([fedMarket], [recessionMarket])).toHaveLength(0);
	});
});

describe("MarketMatcher findMatches: same platform", () => {
	it("does not match markets from the same platform", () => {
		const matcher = new MarketMatcher();
		const marketA = createBinaryMarketEvent({
			id: "pm_kalshi_1",
			platform: "KALSHI",
			marketType: "FED_RATE",
			ticker: "KXFED-1",
			question: "Will the Fed cut rates?",
			yesProbability: 0.6,
		});
		const marketB = createBinaryMarketEvent({
			id: "pm_kalshi_2",
			platform: "KALSHI",
			marketType: "FED_RATE",
			ticker: "KXFED-2",
			question: "Will the Fed cut rates?",
			yesProbability: 0.6,
		});

		expect(matcher.findMatches([marketA], [marketB])).toHaveLength(0);
	});
});

describe("ArbitrageDetector defaults", () => {
	it("has valid default values", () => {
		expect(DEFAULT_ARBITRAGE_CONFIG.minDivergence).toBeGreaterThan(0);
		expect(DEFAULT_ARBITRAGE_CONFIG.maxDivergence).toBeGreaterThan(
			DEFAULT_ARBITRAGE_CONFIG.minDivergence,
		);
		expect(DEFAULT_ARBITRAGE_CONFIG.minLiquidity).toBeGreaterThanOrEqual(0);
	});
});

describe("ArbitrageDetector analyze: opportunities", () => {
	it("detects arbitrage opportunities", () => {
		const detector = new ArbitrageDetector();
		const marketA = createBinaryMarketEvent({
			id: "pm_kalshi_fed",
			platform: "KALSHI",
			marketType: "FED_RATE",
			ticker: "KXFED",
			question: "Will the Fed cut rates?",
			yesProbability: 0.7,
			liquidityScore: 0.8,
		});
		const marketB = createBinaryMarketEvent({
			id: "pm_polymarket_fed",
			platform: "POLYMARKET",
			marketType: "FED_RATE",
			ticker: "0x1234",
			question: "Federal Reserve rate cut?",
			yesProbability: 0.55,
			liquidityScore: 0.7,
		});

		const alerts = detector.analyze([
			{ marketA, marketB, similarity: 0.85, priceDivergence: 0.15 },
		]);

		expect(alerts).toHaveLength(1);
		expect(alerts[0]?.type).toBe("opportunity");
		expect(alerts[0]?.divergence).toBe(0.15);
		expect(alerts[0]?.highPlatform).toBe("KALSHI");
		expect(alerts[0]?.lowPlatform).toBe("POLYMARKET");
	});
});

describe("ArbitrageDetector analyze: data issues", () => {
	it("flags large divergences as data quality issues", () => {
		const detector = new ArbitrageDetector();
		const marketA = createBinaryMarketEvent({
			id: "pm_kalshi_fed",
			platform: "KALSHI",
			marketType: "FED_RATE",
			ticker: "KXFED",
			question: "Fed rate cut?",
			yesProbability: 0.9,
			liquidityScore: 0.8,
		});
		const marketB = createBinaryMarketEvent({
			id: "pm_polymarket_fed",
			platform: "POLYMARKET",
			marketType: "FED_RATE",
			ticker: "0x1234",
			question: "Fed rate cut?",
			yesProbability: 0.6,
			liquidityScore: 0.7,
		});

		const alerts = detector.analyze([{ marketA, marketB, similarity: 0.9, priceDivergence: 0.3 }]);
		expect(alerts[0]?.type).toBe("data_quality_issue");
	});
});

describe("ArbitrageDetector analyze: liquidity filtering", () => {
	it("skips low-liquidity markets", () => {
		const detector = new ArbitrageDetector();
		const marketA = createBinaryMarketEvent({
			id: "pm_kalshi_fed",
			platform: "KALSHI",
			marketType: "FED_RATE",
			ticker: "KXFED",
			question: "Fed rate cut?",
			yesProbability: 0.7,
			liquidityScore: 0.1,
		});
		const marketB = createBinaryMarketEvent({
			id: "pm_polymarket_fed",
			platform: "POLYMARKET",
			marketType: "FED_RATE",
			ticker: "0x1234",
			question: "Fed rate cut?",
			yesProbability: 0.55,
			liquidityScore: 0.5,
		});

		const alerts = detector.analyze([{ marketA, marketB, similarity: 0.9, priceDivergence: 0.15 }]);
		expect(alerts).toHaveLength(0);
	});
});

describe("ArbitrageDetector getSummary", () => {
	it("calculates summary statistics", () => {
		const detector = new ArbitrageDetector();
		const summary = detector.getSummary([
			{
				type: "opportunity",
				matchedMarket: {} as never,
				divergence: 0.1,
				highPlatform: "KALSHI",
				lowPlatform: "POLYMARKET",
				description: "Test",
			},
			{
				type: "data_quality_issue",
				matchedMarket: {} as never,
				divergence: 0.25,
				highPlatform: "KALSHI",
				lowPlatform: "POLYMARKET",
				description: "Test",
			},
		]);

		expect(summary.totalAlerts).toBe(2);
		expect(summary.opportunities).toBe(1);
		expect(summary.dataQualityIssues).toBe(1);
		expect(summary.averageDivergence).toBeCloseTo(0.175);
		expect(summary.maxDivergence).toBe(0.25);
	});
});
