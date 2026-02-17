/**
 * CBR (Case-Based Reasoning) Tests
 */

// Set required environment variables before imports
Bun.env.CREAM_ENV = "PAPER";

import { describe, expect, test } from "bun:test";
import {
	buildMemoryContext,
	type CBRMarketSnapshot,
	type CBRRetrievalResult,
	calculateCBRQuality,
	convertToRetrievedCase,
	extractSimilarityFeatures,
	generateCBRSituationBrief,
} from "./cbr";
import type { TradeDecision } from "./index";

// ============================================
// Mock Factory Helpers
// ============================================

function createMockSnapshot(overrides: Partial<CBRMarketSnapshot> = {}): CBRMarketSnapshot {
	return {
		instrumentId: "AAPL",
		regimeLabel: "BULL_TREND",
		sector: "Technology",
		indicators: {
			rsi: 65,
			atr: 3.5,
			volatility: 0.25,
			volumeRatio: 1.2,
		},
		currentPrice: 150.0,
		positionContext: "No current position",
		...overrides,
	};
}

function createMockDecision(overrides: Partial<TradeDecision> = {}): TradeDecision {
	return {
		decision_id: "dec-123",
		cycle_id: "cycle-1",
		instrument_id: "AAPL",
		underlying_symbol: "AAPL",
		regime_label: "BULL_TREND",
		action: "BUY",
		decision_json: JSON.stringify({ size: 100, direction: "long" }),
		rationale_text: "Strong momentum with RSI at 65 and positive sector sentiment",
		snapshot_reference: "snapshot-123",
		realized_outcome: JSON.stringify({
			pnl: 500,
			return_pct: 0.03,
			holding_hours: 48,
		}),
		created_at: "2025-01-01T10:00:00Z",
		closed_at: "2025-01-03T10:00:00Z",
		environment: "PAPER",
		...overrides,
	};
}

type RetrievedCase = CBRRetrievalResult["cases"][number];

function createRetrievedCase(overrides: Partial<RetrievedCase> = {}): RetrievedCase {
	return {
		caseId: "case-default",
		shortSummary: "Test",
		keyOutcomes: { result: "win", return: 0.02, durationHours: 24 },
		asOfTimestamp: new Date().toISOString(),
		ticker: "AAPL",
		regime: "BULL_TREND",
		similarityScore: 0.8,
		...overrides,
	};
}

function createQualityResult(cases: RetrievedCase[]): CBRRetrievalResult {
	return {
		cases,
		statistics: {
			totalCases: cases.length,
			winRate: 0.6,
			avgReturn: 0.02,
			avgDuration: 25.6,
		},
		executionTimeMs: 50,
	};
}

// ============================================
// Situation Brief Generation Tests
// ============================================

describe("generateCBRSituationBrief", () => {
	test("generates brief with instrument and regime", () => {
		const snapshot = createMockSnapshot();
		const brief = generateCBRSituationBrief(snapshot);

		expect(brief).toContain("Trading AAPL");
		expect(brief).toContain("BULL_TREND");
	});

	test("includes underlying symbol for options", () => {
		const snapshot = createMockSnapshot({
			instrumentId: "AAPL240119C150",
			underlyingSymbol: "AAPL",
		});
		const brief = generateCBRSituationBrief(snapshot);

		expect(brief).toContain("Trading AAPL240119C150");
		expect(brief).toContain("(underlying: AAPL)");
	});

	test("includes sector information", () => {
		const snapshot = createMockSnapshot({ sector: "Technology" });
		const brief = generateCBRSituationBrief(snapshot);

		expect(brief).toContain("Sector: Technology");
	});

	test("includes technical indicators", () => {
		const snapshot = createMockSnapshot({
			indicators: {
				rsi: 65,
				volatility: 0.25,
				atr: 3.5,
				volumeRatio: 1.5,
			},
		});
		const brief = generateCBRSituationBrief(snapshot);

		expect(brief).toContain("RSI: 65.0");
		expect(brief).toContain("Volatility: 25.0%");
		expect(brief).toContain("ATR: 3.50");
		expect(brief).toContain("Volume ratio: 1.5x");
	});

	test("includes current price", () => {
		const snapshot = createMockSnapshot({ currentPrice: 150.75 });
		const brief = generateCBRSituationBrief(snapshot);

		expect(brief).toContain("Current price: $150.75");
	});

	test("includes position context", () => {
		const snapshot = createMockSnapshot({ positionContext: "Long 100 shares" });
		const brief = generateCBRSituationBrief(snapshot);

		expect(brief).toContain("Position: Long 100 shares");
	});
});

// ============================================
// Type Conversion Tests
// ============================================

describe("convertToRetrievedCase", () => {
	test("converts decision to retrieved case", () => {
		const decision = createMockDecision();
		const retrievedCase = convertToRetrievedCase(decision, 0.85);

		expect(retrievedCase.caseId).toBe("dec-123");
		expect(retrievedCase.ticker).toBe("AAPL");
		expect(retrievedCase.regime).toBe("BULL_TREND");
		expect(retrievedCase.similarityScore).toBe(0.85);
	});

	test("parses realized outcome for wins", () => {
		const decision = createMockDecision({
			realized_outcome: JSON.stringify({
				pnl: 500,
				return_pct: 0.03,
				holding_hours: 48,
			}),
		});
		const retrievedCase = convertToRetrievedCase(decision);

		expect(retrievedCase.keyOutcomes.result).toBe("win");
		expect(retrievedCase.keyOutcomes.return).toBe(0.03);
		expect(retrievedCase.keyOutcomes.durationHours).toBe(48);
	});

	test("parses realized outcome for losses", () => {
		const decision = createMockDecision({
			realized_outcome: JSON.stringify({
				pnl: -200,
				return_pct: -0.02,
				holding_hours: 24,
			}),
		});
		const retrievedCase = convertToRetrievedCase(decision);

		expect(retrievedCase.keyOutcomes.result).toBe("loss");
		expect(retrievedCase.keyOutcomes.return).toBe(-0.02);
	});

	test("handles missing outcome gracefully", () => {
		const decision = createMockDecision({
			realized_outcome: undefined,
		});
		const retrievedCase = convertToRetrievedCase(decision);

		expect(retrievedCase.keyOutcomes.result).toBe("breakeven");
		expect(retrievedCase.keyOutcomes.return).toBe(0);
	});

	test("generates short summary from decision", () => {
		const decision = createMockDecision({
			action: "BUY",
			instrument_id: "AAPL",
			regime_label: "BULL_TREND",
			rationale_text: "Strong momentum with positive sentiment. Additional context here.",
		});
		const retrievedCase = convertToRetrievedCase(decision);

		expect(retrievedCase.shortSummary).toContain("BUY AAPL");
		expect(retrievedCase.shortSummary).toContain("BULL_TREND");
	});
});

// ============================================
// Similarity Feature Extraction Tests
// ============================================

describe("extractSimilarityFeatures", () => {
	test("extracts regime", () => {
		const snapshot = createMockSnapshot({ regimeLabel: "BEAR_TREND" });
		const features = extractSimilarityFeatures(snapshot);

		expect(features.regime).toBe("BEAR_TREND");
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

	test("classifies volatility as high", () => {
		const snapshot = createMockSnapshot({
			indicators: { volatility: 0.4 },
		});
		const features = extractSimilarityFeatures(snapshot);

		expect(features.volatilityBucket).toBe("high");
	});

	test("uses underlying symbol when available", () => {
		const snapshot = createMockSnapshot({
			instrumentId: "AAPL240119C150",
			underlyingSymbol: "AAPL",
		});
		const features = extractSimilarityFeatures(snapshot);

		expect(features.symbol).toBe("AAPL");
	});
});

// ============================================
// CBR Quality Metrics Tests
// ============================================

describe("calculateCBRQuality sufficient cases", () => {
	test("calculates quality for sufficient cases", () => {
		const result = createQualityResult([
			createRetrievedCase({
				caseId: "1",
				keyOutcomes: { result: "win", return: 0.05, durationHours: 24 },
				similarityScore: 0.9,
			}),
			createRetrievedCase({
				caseId: "2",
				keyOutcomes: { result: "win", return: 0.03, durationHours: 48 },
				similarityScore: 0.85,
			}),
			createRetrievedCase({
				caseId: "3",
				keyOutcomes: { result: "loss", return: -0.02, durationHours: 12 },
				regime: "BEAR_TREND",
			}),
			createRetrievedCase({
				caseId: "4",
				keyOutcomes: { result: "win", return: 0.04, durationHours: 36 },
				regime: "RANGE",
				similarityScore: 0.75,
			}),
			createRetrievedCase({
				caseId: "5",
				keyOutcomes: { result: "breakeven", return: 0, durationHours: 8 },
				similarityScore: 0.7,
			}),
		]);
		const quality = calculateCBRQuality(result);
		expect(quality.sufficientCases).toBe(true);
		expect(quality.caseCount).toBe(5);
		expect(quality.avgSimilarity).toBeCloseTo(0.8, 2);
		expect(quality.historicalWinRate).toBe(0.6);
		expect(quality.qualityScore).toBeGreaterThan(0);
	});
});

describe("calculateCBRQuality insufficient cases", () => {
	test("indicates insufficient cases", () => {
		const result = createQualityResult([
			createRetrievedCase({
				caseId: "1",
				keyOutcomes: { result: "win", return: 0.05, durationHours: 24 },
				similarityScore: 0.9,
			}),
		]);
		const quality = calculateCBRQuality(result, 5);
		expect(quality.sufficientCases).toBe(false);
		expect(quality.caseCount).toBe(1);
	});
});

// ============================================
// Memory Context Builder Tests
// ============================================

describe("buildMemoryContext", () => {
	test("builds memory context from retrieval result", () => {
		const result: CBRRetrievalResult = {
			cases: [
				{
					caseId: "1",
					shortSummary: "Test",
					keyOutcomes: { result: "win", return: 0.05, durationHours: 24 },
					asOfTimestamp: new Date().toISOString(),
					ticker: "AAPL",
					regime: "BULL_TREND",
				},
			],
			statistics: {
				totalCases: 1,
				winRate: 1.0,
				avgReturn: 0.05,
				avgDuration: 24,
			},
			executionTimeMs: 20,
		};

		const context = buildMemoryContext(result);

		expect(context.retrievedCases).toHaveLength(1);
		if (!context.caseStatistics) {
			throw new Error("Expected case statistics to be defined");
		}
		expect(context.caseStatistics.winRate).toBe(1.0);
	});
});
