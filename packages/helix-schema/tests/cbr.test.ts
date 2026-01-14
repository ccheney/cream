/**
 * Tests for Case-Based Reasoning (CBR) retrieval
 */

import { describe, expect, test } from "bun:test";
import { calculateCaseStatistics } from "@cream/domain";
import {
	buildMemoryContext,
	type CBRMarketSnapshot,
	type CBRRetrievalResult,
	calculateCBRQuality,
	convertToRetrievedCase,
	extractSimilarityFeatures,
	generateCBRSituationBrief,
	SIMILARITY_WEIGHTS,
} from "../src/cbr";
import type { TradeDecision } from "../src/index";

// ============================================
// Test Fixtures
// ============================================

function createMockDecision(overrides: Partial<TradeDecision> = {}): TradeDecision {
	return {
		decision_id: "decision-123",
		cycle_id: "cycle-456",
		instrument_id: "AAPL",
		regime_label: "BULL_TREND",
		action: "BUY",
		decision_json: "{}",
		rationale_text: "Strong momentum with RSI crossing above 50. Volume confirming breakout.",
		snapshot_reference: "snapshot-789",
		created_at: "2025-12-15T14:00:00Z",
		environment: "PAPER",
		...overrides,
	};
}

function createMockSnapshot(overrides: Partial<CBRMarketSnapshot> = {}): CBRMarketSnapshot {
	return {
		instrumentId: "AAPL",
		regimeLabel: "BULL_TREND",
		sector: "Technology",
		indicators: {
			rsi: 65,
			volatility: 0.25,
			atr: 3.5,
			volumeRatio: 1.2,
		},
		currentPrice: 185.5,
		...overrides,
	};
}

// ============================================
// Situation Brief Generation Tests
// ============================================

describe("generateCBRSituationBrief", () => {
	test("generates basic brief with instrument and regime", () => {
		const snapshot = createMockSnapshot({
			indicators: undefined,
			sector: undefined,
			currentPrice: undefined,
		});

		const brief = generateCBRSituationBrief(snapshot);

		expect(brief).toContain("Trading AAPL");
		expect(brief).toContain("BULL_TREND");
		expect(brief).toContain("market regime");
	});

	test("includes underlying symbol for options", () => {
		const snapshot = createMockSnapshot({
			instrumentId: "AAPL240119C185",
			underlyingSymbol: "AAPL",
		});

		const brief = generateCBRSituationBrief(snapshot);

		expect(brief).toContain("AAPL240119C185");
		expect(brief).toContain("(underlying: AAPL)");
	});

	test("includes sector context", () => {
		const snapshot = createMockSnapshot({ sector: "Technology" });

		const brief = generateCBRSituationBrief(snapshot);

		expect(brief).toContain("Sector: Technology");
	});

	test("includes technical indicators", () => {
		const snapshot = createMockSnapshot({
			indicators: {
				rsi: 65.5,
				volatility: 0.25,
				atr: 3.5,
				volumeRatio: 1.2,
			},
		});

		const brief = generateCBRSituationBrief(snapshot);

		expect(brief).toContain("RSI: 65.5");
		expect(brief).toContain("Volatility: 25.0%");
		expect(brief).toContain("ATR: 3.50");
		expect(brief).toContain("Volume ratio: 1.2x");
	});

	test("includes current price", () => {
		const snapshot = createMockSnapshot({ currentPrice: 185.5 });

		const brief = generateCBRSituationBrief(snapshot);

		expect(brief).toContain("Current price: $185.50");
	});

	test("includes position context", () => {
		const snapshot = createMockSnapshot({
			positionContext: "Long 100 shares at $180.00",
		});

		const brief = generateCBRSituationBrief(snapshot);

		expect(brief).toContain("Position: Long 100 shares at $180.00");
	});
});

// ============================================
// Type Conversion Tests
// ============================================

describe("convertToRetrievedCase", () => {
	test("converts basic decision to retrieved case", () => {
		const decision = createMockDecision();

		const result = convertToRetrievedCase(decision, 0.85);

		expect(result.caseId).toBe("decision-123");
		expect(result.ticker).toBe("AAPL");
		expect(result.regime).toBe("BULL_TREND");
		expect(result.similarityScore).toBe(0.85);
		expect(result.asOfTimestamp).toBe("2025-12-15T14:00:00Z");
	});

	test("generates short summary from decision", () => {
		const decision = createMockDecision({
			action: "BUY",
			instrument_id: "TSLA",
			rationale_text:
				"Bullish momentum confirmed by RSI crossover. Volume spike indicates institutional buying.",
		});

		const result = convertToRetrievedCase(decision);

		expect(result.shortSummary).toContain("BUY");
		expect(result.shortSummary).toContain("TSLA");
		expect(result.shortSummary).toContain("BULL_TREND");
		expect(result.shortSummary).toContain("Bullish momentum");
	});

	test("truncates long rationale in summary", () => {
		const longRationale = `${"A".repeat(200)}. Second sentence.`;
		const decision = createMockDecision({ rationale_text: longRationale });

		const result = convertToRetrievedCase(decision);

		expect(result.shortSummary.length).toBeLessThan(200);
		expect(result.shortSummary).toContain("...");
	});

	test("parses realized outcome for win", () => {
		const decision = createMockDecision({
			realized_outcome: JSON.stringify({
				pnl: 500,
				return_pct: 5.5,
				holding_hours: 24,
				entry_price: 180,
				exit_price: 189,
			}),
		});

		const result = convertToRetrievedCase(decision);

		expect(result.keyOutcomes.result).toBe("win");
		expect(result.keyOutcomes.return).toBe(5.5);
		expect(result.keyOutcomes.durationHours).toBe(24);
		expect(result.keyOutcomes.entryPrice).toBe(180);
		expect(result.keyOutcomes.exitPrice).toBe(189);
	});

	test("parses realized outcome for loss", () => {
		const decision = createMockDecision({
			realized_outcome: JSON.stringify({
				pnl: -300,
				return_pct: -3.2,
				holding_hours: 8,
			}),
		});

		const result = convertToRetrievedCase(decision);

		expect(result.keyOutcomes.result).toBe("loss");
		expect(result.keyOutcomes.return).toBe(-3.2);
		expect(result.keyOutcomes.durationHours).toBe(8);
	});

	test("handles missing realized outcome", () => {
		const decision = createMockDecision({ realized_outcome: undefined });

		const result = convertToRetrievedCase(decision);

		expect(result.keyOutcomes.result).toBe("breakeven");
		expect(result.keyOutcomes.return).toBe(0);
		expect(result.keyOutcomes.durationHours).toBe(0);
	});

	test("handles invalid JSON in realized outcome", () => {
		const decision = createMockDecision({
			realized_outcome: "not valid json",
		});

		const result = convertToRetrievedCase(decision);

		expect(result.keyOutcomes.result).toBe("breakeven");
		expect(result.keyOutcomes.return).toBe(0);
	});
});

// ============================================
// Memory Context Builder Tests
// ============================================

describe("buildMemoryContext", () => {
	test("builds memory context from retrieval result", () => {
		const cases = [
			convertToRetrievedCase(createMockDecision({ decision_id: "d1" }), 0.9),
			convertToRetrievedCase(createMockDecision({ decision_id: "d2" }), 0.8),
		];

		const result: CBRRetrievalResult = {
			cases,
			statistics: calculateCaseStatistics(cases),
			executionTimeMs: 5,
		};

		const context = buildMemoryContext(result);

		expect(context.retrievedCases).toHaveLength(2);
		expect(context.caseStatistics).toBeDefined();
		expect(context.caseStatistics?.totalCases).toBe(2);
	});

	test("handles empty retrieval result", () => {
		const result: CBRRetrievalResult = {
			cases: [],
			statistics: calculateCaseStatistics([]),
			executionTimeMs: 1,
		};

		const context = buildMemoryContext(result);

		expect(context.retrievedCases).toHaveLength(0);
		expect(context.caseStatistics?.totalCases).toBe(0);
	});
});

// ============================================
// Similarity Feature Extraction Tests
// ============================================

describe("extractSimilarityFeatures", () => {
	test("extracts basic features", () => {
		const snapshot = createMockSnapshot();

		const features = extractSimilarityFeatures(snapshot);

		expect(features.regime).toBe("BULL_TREND");
		expect(features.sector).toBe("Technology");
		expect(features.symbol).toBe("AAPL");
	});

	test("uses underlying symbol for options", () => {
		const snapshot = createMockSnapshot({
			instrumentId: "AAPL240119C185",
			underlyingSymbol: "AAPL",
		});

		const features = extractSimilarityFeatures(snapshot);

		expect(features.symbol).toBe("AAPL");
	});

	test("classifies RSI as oversold", () => {
		const snapshot = createMockSnapshot({
			indicators: { rsi: 25 },
		});

		const features = extractSimilarityFeatures(snapshot);

		expect(features.rsiBucket).toBe("oversold");
	});

	test("classifies RSI as neutral", () => {
		const snapshot = createMockSnapshot({
			indicators: { rsi: 50 },
		});

		const features = extractSimilarityFeatures(snapshot);

		expect(features.rsiBucket).toBe("neutral");
	});

	test("classifies RSI as overbought", () => {
		const snapshot = createMockSnapshot({
			indicators: { rsi: 75 },
		});

		const features = extractSimilarityFeatures(snapshot);

		expect(features.rsiBucket).toBe("overbought");
	});

	test("classifies volatility as low", () => {
		const snapshot = createMockSnapshot({
			indicators: { volatility: 0.1 },
		});

		const features = extractSimilarityFeatures(snapshot);

		expect(features.volatilityBucket).toBe("low");
	});

	test("classifies volatility as medium", () => {
		const snapshot = createMockSnapshot({
			indicators: { volatility: 0.25 },
		});

		const features = extractSimilarityFeatures(snapshot);

		expect(features.volatilityBucket).toBe("medium");
	});

	test("classifies volatility as high", () => {
		const snapshot = createMockSnapshot({
			indicators: { volatility: 0.4 },
		});

		const features = extractSimilarityFeatures(snapshot);

		expect(features.volatilityBucket).toBe("high");
	});
});

// ============================================
// CBR Quality Metrics Tests
// ============================================

describe("calculateCBRQuality", () => {
	test("calculates quality for good retrieval result", () => {
		const winDecision = createMockDecision({
			decision_id: "d1",
			realized_outcome: JSON.stringify({ pnl: 100, return_pct: 5, holding_hours: 10 }),
		});
		const lossDecision = createMockDecision({
			decision_id: "d2",
			regime_label: "BEAR_TREND",
			realized_outcome: JSON.stringify({ pnl: -50, return_pct: -2, holding_hours: 5 }),
		});

		const cases = [
			convertToRetrievedCase(winDecision, 0.9),
			convertToRetrievedCase(lossDecision, 0.85),
		];

		const result: CBRRetrievalResult = {
			cases,
			statistics: calculateCaseStatistics(cases),
			executionTimeMs: 3,
		};

		const quality = calculateCBRQuality(result, 2);

		expect(quality.avgSimilarity).toBeCloseTo(0.875, 3);
		expect(quality.caseCount).toBe(2);
		expect(quality.sufficientCases).toBe(true);
		expect(quality.regimeDiversity).toBeGreaterThan(0);
		expect(quality.qualityScore).toBeGreaterThan(0.5);
	});

	test("handles insufficient cases", () => {
		const cases = [convertToRetrievedCase(createMockDecision(), 0.7)];

		const result: CBRRetrievalResult = {
			cases,
			statistics: calculateCaseStatistics(cases),
			executionTimeMs: 2,
		};

		const quality = calculateCBRQuality(result, 5);

		expect(quality.sufficientCases).toBe(false);
		expect(quality.caseCount).toBe(1);
		expect(quality.qualityScore).toBeLessThan(0.5);
	});

	test("handles empty retrieval result", () => {
		const result: CBRRetrievalResult = {
			cases: [],
			statistics: calculateCaseStatistics([]),
			executionTimeMs: 1,
		};

		const quality = calculateCBRQuality(result);

		expect(quality.avgSimilarity).toBe(0);
		expect(quality.caseCount).toBe(0);
		expect(quality.sufficientCases).toBe(false);
		expect(quality.regimeDiversity).toBe(0);
		expect(quality.qualityScore).toBe(0);
	});
});

// ============================================
// Similarity Weights Tests
// ============================================

describe("SIMILARITY_WEIGHTS", () => {
	test("weights sum to approximately 1", () => {
		const total = Object.values(SIMILARITY_WEIGHTS).reduce((a, b) => a + b, 0);
		expect(total).toBeCloseTo(1.0, 3);
	});

	test("regime has highest weight", () => {
		expect(SIMILARITY_WEIGHTS.regime).toBeGreaterThanOrEqual(SIMILARITY_WEIGHTS.indicators);
		expect(SIMILARITY_WEIGHTS.regime).toBeGreaterThanOrEqual(SIMILARITY_WEIGHTS.sector);
		expect(SIMILARITY_WEIGHTS.regime).toBeGreaterThanOrEqual(SIMILARITY_WEIGHTS.recency);
	});
});
