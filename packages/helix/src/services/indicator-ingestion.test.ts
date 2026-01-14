/**
 * Indicator Ingestion Service Tests
 *
 * Tests for the IndicatorIngestionService including:
 * - Indicator conversion
 * - Quality score calculation
 * - Validation threshold checks
 */

import { describe, expect, test } from "bun:test";
import type { IndicatorCategory, IndicatorStatus } from "@cream/helix-schema";
import {
	_internal,
	calculateIndicatorQualityScore,
	DEFAULT_VALIDATION_THRESHOLDS,
	type IndicatorInput,
	meetsValidationThresholds,
} from "./indicator-ingestion.js";

const { toIndicatorNode, generateEmbeddingText, DEFAULT_SIMILARITY_THRESHOLD } = _internal;

// ============================================
// Test Data Factories
// ============================================

function createMockIndicatorInput(overrides: Partial<IndicatorInput> = {}): IndicatorInput {
	return {
		indicatorId: "ind-20260111-rsi-adaptive",
		name: "RSI_Adaptive_14",
		category: "momentum" as IndicatorCategory,
		status: "staging" as IndicatorStatus,
		hypothesis:
			"Adaptive RSI with dynamic overbought/oversold thresholds captures momentum reversals more effectively than static thresholds.",
		economicRationale:
			"Traditional RSI uses fixed 30/70 thresholds which perform poorly in trending markets. By adapting thresholds based on recent volatility and trend strength, we can better identify genuine reversal opportunities.",
		generatedInRegime: "trending",
		codeHash: "sha256:abc123def456",
		astSignature: "fn(close,period)->rsi_adaptive",
		deflatedSharpe: 1.2,
		probabilityOfOverfit: 0.15,
		informationCoefficient: 0.05,
		environment: "BACKTEST",
		...overrides,
	};
}

// ============================================
// Indicator Conversion Tests
// ============================================

describe("toIndicatorNode", () => {
	test("converts indicatorId to indicator_id", () => {
		const input = createMockIndicatorInput();
		const node = toIndicatorNode(input);
		expect(node.indicator_id).toBe("ind-20260111-rsi-adaptive");
	});

	test("preserves name", () => {
		const input = createMockIndicatorInput();
		const node = toIndicatorNode(input);
		expect(node.name).toBe("RSI_Adaptive_14");
	});

	test("preserves category", () => {
		const input = createMockIndicatorInput();
		const node = toIndicatorNode(input);
		expect(node.category).toBe("momentum");
	});

	test("preserves status", () => {
		const input = createMockIndicatorInput({ status: "paper" });
		const node = toIndicatorNode(input);
		expect(node.status).toBe("paper");
	});

	test("preserves hypothesis", () => {
		const input = createMockIndicatorInput();
		const node = toIndicatorNode(input);
		expect(node.hypothesis).toContain("Adaptive RSI");
	});

	test("converts economicRationale to economic_rationale", () => {
		const input = createMockIndicatorInput();
		const node = toIndicatorNode(input);
		expect(node.economic_rationale).toContain("Traditional RSI");
	});

	test("generates embedding_text from hypothesis and rationale", () => {
		const input = createMockIndicatorInput();
		const node = toIndicatorNode(input);
		expect(node.embedding_text).toContain("Adaptive RSI");
		expect(node.embedding_text).toContain("Traditional RSI");
	});

	test("converts generatedInRegime to generated_in_regime", () => {
		const input = createMockIndicatorInput();
		const node = toIndicatorNode(input);
		expect(node.generated_in_regime).toBe("trending");
	});

	test("converts codeHash to code_hash", () => {
		const input = createMockIndicatorInput();
		const node = toIndicatorNode(input);
		expect(node.code_hash).toBe("sha256:abc123def456");
	});

	test("converts astSignature to ast_signature", () => {
		const input = createMockIndicatorInput();
		const node = toIndicatorNode(input);
		expect(node.ast_signature).toBe("fn(close,period)->rsi_adaptive");
	});

	test("converts deflatedSharpe to deflated_sharpe", () => {
		const input = createMockIndicatorInput({ deflatedSharpe: 1.5 });
		const node = toIndicatorNode(input);
		expect(node.deflated_sharpe).toBe(1.5);
	});

	test("converts probabilityOfOverfit to probability_of_overfit", () => {
		const input = createMockIndicatorInput({ probabilityOfOverfit: 0.2 });
		const node = toIndicatorNode(input);
		expect(node.probability_of_overfit).toBe(0.2);
	});

	test("converts informationCoefficient to information_coefficient", () => {
		const input = createMockIndicatorInput({ informationCoefficient: 0.08 });
		const node = toIndicatorNode(input);
		expect(node.information_coefficient).toBe(0.08);
	});

	test("sets generated_at to ISO timestamp", () => {
		const input = createMockIndicatorInput();
		const node = toIndicatorNode(input);
		expect(node.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
	});

	test("preserves environment", () => {
		const input = createMockIndicatorInput({ environment: "PAPER" });
		const node = toIndicatorNode(input);
		expect(node.environment).toBe("PAPER");
	});

	test("handles undefined optional fields", () => {
		const input = createMockIndicatorInput({
			generatedInRegime: undefined,
			codeHash: undefined,
			astSignature: undefined,
			deflatedSharpe: undefined,
			probabilityOfOverfit: undefined,
			informationCoefficient: undefined,
		});
		const node = toIndicatorNode(input);
		expect(node.generated_in_regime).toBeUndefined();
		expect(node.code_hash).toBeUndefined();
		expect(node.ast_signature).toBeUndefined();
		expect(node.deflated_sharpe).toBeUndefined();
		expect(node.probability_of_overfit).toBeUndefined();
		expect(node.information_coefficient).toBeUndefined();
	});
});

// ============================================
// Embedding Text Generation Tests
// ============================================

describe("generateEmbeddingText", () => {
	test("combines hypothesis and rationale", () => {
		const text = generateEmbeddingText("Hypothesis text", "Rationale text");
		expect(text).toBe("Hypothesis text\n\nRationale text");
	});

	test("handles empty strings", () => {
		const text = generateEmbeddingText("", "");
		expect(text).toBe("\n\n");
	});

	test("preserves multiline content", () => {
		const hypothesis = "Line 1\nLine 2";
		const rationale = "Line A\nLine B";
		const text = generateEmbeddingText(hypothesis, rationale);
		expect(text).toContain("Line 1\nLine 2");
		expect(text).toContain("Line A\nLine B");
	});
});

// ============================================
// Validation Thresholds Tests
// ============================================

describe("meetsValidationThresholds", () => {
	test("returns true when all metrics pass", () => {
		const input = createMockIndicatorInput({
			deflatedSharpe: 0.8,
			probabilityOfOverfit: 0.2,
			informationCoefficient: 0.05,
		});
		expect(meetsValidationThresholds(input)).toBe(true);
	});

	test("returns false when deflatedSharpe is too low", () => {
		const input = createMockIndicatorInput({
			deflatedSharpe: 0.3, // Below 0.5 threshold
			probabilityOfOverfit: 0.2,
			informationCoefficient: 0.05,
		});
		expect(meetsValidationThresholds(input)).toBe(false);
	});

	test("returns false when probabilityOfOverfit is too high", () => {
		const input = createMockIndicatorInput({
			deflatedSharpe: 0.8,
			probabilityOfOverfit: 0.5, // Above 0.3 threshold
			informationCoefficient: 0.05,
		});
		expect(meetsValidationThresholds(input)).toBe(false);
	});

	test("returns false when informationCoefficient is too low", () => {
		const input = createMockIndicatorInput({
			deflatedSharpe: 0.8,
			probabilityOfOverfit: 0.2,
			informationCoefficient: 0.01, // Below 0.02 threshold
		});
		expect(meetsValidationThresholds(input)).toBe(false);
	});

	test("returns false when deflatedSharpe is undefined", () => {
		const input = createMockIndicatorInput({
			deflatedSharpe: undefined,
			probabilityOfOverfit: 0.2,
			informationCoefficient: 0.05,
		});
		expect(meetsValidationThresholds(input)).toBe(false);
	});

	test("returns false when probabilityOfOverfit is undefined", () => {
		const input = createMockIndicatorInput({
			deflatedSharpe: 0.8,
			probabilityOfOverfit: undefined,
			informationCoefficient: 0.05,
		});
		expect(meetsValidationThresholds(input)).toBe(false);
	});

	test("returns false when informationCoefficient is undefined", () => {
		const input = createMockIndicatorInput({
			deflatedSharpe: 0.8,
			probabilityOfOverfit: 0.2,
			informationCoefficient: undefined,
		});
		expect(meetsValidationThresholds(input)).toBe(false);
	});

	test("uses custom thresholds when provided", () => {
		const input = createMockIndicatorInput({
			deflatedSharpe: 0.3, // Would fail default but pass custom
			probabilityOfOverfit: 0.4, // Would fail default but pass custom
			informationCoefficient: 0.01, // Would fail default but pass custom
		});

		const customThresholds = {
			minDeflatedSharpe: 0.2,
			maxProbabilityOfOverfit: 0.5,
			minInformationCoefficient: 0.01,
		};

		expect(meetsValidationThresholds(input, customThresholds)).toBe(true);
	});

	test("returns true at exactly the threshold values", () => {
		const input = createMockIndicatorInput({
			deflatedSharpe: 0.5, // Exactly at threshold
			probabilityOfOverfit: 0.3, // Exactly at threshold
			informationCoefficient: 0.02, // Exactly at threshold
		});
		expect(meetsValidationThresholds(input)).toBe(true);
	});
});

// ============================================
// Quality Score Calculation Tests
// ============================================

describe("calculateIndicatorQualityScore", () => {
	test("returns positive score for valid indicator", () => {
		const input = createMockIndicatorInput();
		const score = calculateIndicatorQualityScore(input);
		expect(score).toBeGreaterThan(0);
	});

	test("higher deflatedSharpe gives higher score", () => {
		const lowSharpe = createMockIndicatorInput({ deflatedSharpe: 0.5 });
		const highSharpe = createMockIndicatorInput({ deflatedSharpe: 1.5 });

		const lowScore = calculateIndicatorQualityScore(lowSharpe);
		const highScore = calculateIndicatorQualityScore(highSharpe);

		expect(highScore).toBeGreaterThan(lowScore);
	});

	test("higher informationCoefficient gives higher score", () => {
		const lowIc = createMockIndicatorInput({ informationCoefficient: 0.02 });
		const highIc = createMockIndicatorInput({ informationCoefficient: 0.08 });

		const lowScore = calculateIndicatorQualityScore(lowIc);
		const highScore = calculateIndicatorQualityScore(highIc);

		expect(highScore).toBeGreaterThan(lowScore);
	});

	test("lower probabilityOfOverfit gives higher score", () => {
		const highOverfit = createMockIndicatorInput({ probabilityOfOverfit: 0.5 });
		const lowOverfit = createMockIndicatorInput({ probabilityOfOverfit: 0.1 });

		const highOverfitScore = calculateIndicatorQualityScore(highOverfit);
		const lowOverfitScore = calculateIndicatorQualityScore(lowOverfit);

		expect(lowOverfitScore).toBeGreaterThan(highOverfitScore);
	});

	test("longer hypothesis gives higher score", () => {
		const shortHypothesis = createMockIndicatorInput({
			hypothesis: "Short hypothesis",
		});
		const longHypothesis = createMockIndicatorInput({
			hypothesis:
				"This is a much longer hypothesis that explains the economic reasoning behind the indicator in great detail with multiple supporting arguments.",
		});

		const shortScore = calculateIndicatorQualityScore(shortHypothesis);
		const longScore = calculateIndicatorQualityScore(longHypothesis);

		expect(longScore).toBeGreaterThan(shortScore);
	});

	test("handles undefined metrics gracefully", () => {
		const input = createMockIndicatorInput({
			deflatedSharpe: undefined,
			probabilityOfOverfit: undefined,
			informationCoefficient: undefined,
		});

		const score = calculateIndicatorQualityScore(input);
		expect(score).toBeGreaterThanOrEqual(0);
	});

	test("handles zero metrics", () => {
		const input = createMockIndicatorInput({
			deflatedSharpe: 0,
			probabilityOfOverfit: 0,
			informationCoefficient: 0,
		});

		const score = calculateIndicatorQualityScore(input);
		expect(score).toBeGreaterThanOrEqual(0);
	});

	test("caps deflatedSharpe contribution", () => {
		const extremeSharpe = createMockIndicatorInput({ deflatedSharpe: 10 });
		const moderateSharpe = createMockIndicatorInput({ deflatedSharpe: 1.5 });

		const extremeScore = calculateIndicatorQualityScore(extremeSharpe);
		const moderateScore = calculateIndicatorQualityScore(moderateSharpe);

		// Score difference should be limited due to cap
		expect(extremeScore - moderateScore).toBeLessThan(50);
	});
});

// ============================================
// Constants Tests
// ============================================

describe("DEFAULT_SIMILARITY_THRESHOLD", () => {
	test("is set to 0.90", () => {
		expect(DEFAULT_SIMILARITY_THRESHOLD).toBe(0.9);
	});

	test("is higher than hypothesis threshold for stricter deduplication", () => {
		expect(DEFAULT_SIMILARITY_THRESHOLD).toBeGreaterThan(0.85);
	});

	test("is a reasonable threshold for deduplication", () => {
		expect(DEFAULT_SIMILARITY_THRESHOLD).toBeGreaterThan(0.5);
		expect(DEFAULT_SIMILARITY_THRESHOLD).toBeLessThanOrEqual(1.0);
	});
});

describe("DEFAULT_VALIDATION_THRESHOLDS", () => {
	test("minDeflatedSharpe is 0.5", () => {
		expect(DEFAULT_VALIDATION_THRESHOLDS.minDeflatedSharpe).toBe(0.5);
	});

	test("maxProbabilityOfOverfit is 0.3", () => {
		expect(DEFAULT_VALIDATION_THRESHOLDS.maxProbabilityOfOverfit).toBe(0.3);
	});

	test("minInformationCoefficient is 0.02", () => {
		expect(DEFAULT_VALIDATION_THRESHOLDS.minInformationCoefficient).toBe(0.02);
	});
});

// ============================================
// Category Coverage Tests
// ============================================

describe("indicator categories", () => {
	test("handles momentum category", () => {
		const input = createMockIndicatorInput({ category: "momentum" });
		const node = toIndicatorNode(input);
		expect(node.category).toBe("momentum");
	});

	test("handles trend category", () => {
		const input = createMockIndicatorInput({ category: "trend" });
		const node = toIndicatorNode(input);
		expect(node.category).toBe("trend");
	});

	test("handles volatility category", () => {
		const input = createMockIndicatorInput({ category: "volatility" });
		const node = toIndicatorNode(input);
		expect(node.category).toBe("volatility");
	});

	test("handles volume category", () => {
		const input = createMockIndicatorInput({ category: "volume" });
		const node = toIndicatorNode(input);
		expect(node.category).toBe("volume");
	});

	test("handles custom category", () => {
		const input = createMockIndicatorInput({ category: "custom" });
		const node = toIndicatorNode(input);
		expect(node.category).toBe("custom");
	});
});

// ============================================
// Status Lifecycle Tests
// ============================================

describe("indicator status lifecycle", () => {
	test("handles staging status", () => {
		const input = createMockIndicatorInput({ status: "staging" });
		const node = toIndicatorNode(input);
		expect(node.status).toBe("staging");
	});

	test("handles paper status", () => {
		const input = createMockIndicatorInput({ status: "paper" });
		const node = toIndicatorNode(input);
		expect(node.status).toBe("paper");
	});

	test("handles production status", () => {
		const input = createMockIndicatorInput({ status: "production" });
		const node = toIndicatorNode(input);
		expect(node.status).toBe("production");
	});

	test("handles retired status", () => {
		const input = createMockIndicatorInput({ status: "retired" });
		const node = toIndicatorNode(input);
		expect(node.status).toBe("retired");
	});
});

// ============================================
// Environment Tests
// ============================================

describe("environment handling", () => {
	test("handles BACKTEST environment", () => {
		const input = createMockIndicatorInput({ environment: "BACKTEST" });
		const node = toIndicatorNode(input);
		expect(node.environment).toBe("BACKTEST");
	});

	test("handles PAPER environment", () => {
		const input = createMockIndicatorInput({ environment: "PAPER" });
		const node = toIndicatorNode(input);
		expect(node.environment).toBe("PAPER");
	});

	test("handles LIVE environment", () => {
		const input = createMockIndicatorInput({ environment: "LIVE" });
		const node = toIndicatorNode(input);
		expect(node.environment).toBe("LIVE");
	});
});

// ============================================
// Edge Cases Tests
// ============================================

describe("edge cases", () => {
	test("handles empty hypothesis", () => {
		const input = createMockIndicatorInput({ hypothesis: "" });
		const node = toIndicatorNode(input);
		expect(node.hypothesis).toBe("");
		expect(node.embedding_text).toBe(
			"\n\nTraditional RSI uses fixed 30/70 thresholds which perform poorly in trending markets. By adapting thresholds based on recent volatility and trend strength, we can better identify genuine reversal opportunities."
		);
	});

	test("handles empty economic rationale", () => {
		const input = createMockIndicatorInput({ economicRationale: "" });
		const node = toIndicatorNode(input);
		expect(node.economic_rationale).toBe("");
	});

	test("handles special characters in name", () => {
		const input = createMockIndicatorInput({ name: "RSI_Adaptive_v2.0-beta" });
		const node = toIndicatorNode(input);
		expect(node.name).toBe("RSI_Adaptive_v2.0-beta");
	});

	test("handles unicode in hypothesis", () => {
		const input = createMockIndicatorInput({
			hypothesis: "α-momentum with β-adjusted θ thresholds",
		});
		const node = toIndicatorNode(input);
		expect(node.hypothesis).toContain("α-momentum");
		expect(node.hypothesis).toContain("β-adjusted");
		expect(node.hypothesis).toContain("θ");
	});

	test("handles very long hypothesis", () => {
		const longHypothesis = "A".repeat(10000);
		const input = createMockIndicatorInput({ hypothesis: longHypothesis });
		const node = toIndicatorNode(input);
		expect(node.hypothesis.length).toBe(10000);
	});

	test("handles negative metric values", () => {
		const input = createMockIndicatorInput({
			deflatedSharpe: -0.5,
			informationCoefficient: -0.02,
		});
		const node = toIndicatorNode(input);
		expect(node.deflated_sharpe).toBe(-0.5);
		expect(node.information_coefficient).toBe(-0.02);
	});

	test("handles very small metric values", () => {
		const input = createMockIndicatorInput({
			deflatedSharpe: 0.001,
			probabilityOfOverfit: 0.001,
			informationCoefficient: 0.001,
		});
		const node = toIndicatorNode(input);
		expect(node.deflated_sharpe).toBe(0.001);
		expect(node.probability_of_overfit).toBe(0.001);
		expect(node.information_coefficient).toBe(0.001);
	});
});
