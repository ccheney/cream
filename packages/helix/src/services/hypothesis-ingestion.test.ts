/**
 * Hypothesis Ingestion Service Tests
 *
 * Tests for the HypothesisIngestionService including:
 * - Hypothesis conversion
 * - Quality score calculation
 * - Deduplication logic
 */

import { describe, expect, test } from "bun:test";
import type { HypothesisStatus, MarketMechanism } from "@cream/helix-schema";
import {
  _internal,
  calculateHypothesisQualityScore,
  type HypothesisInput,
} from "./hypothesis-ingestion.js";

const { toHypothesisNode, DEFAULT_SIMILARITY_THRESHOLD } = _internal;

// ============================================
// Test Data Factories
// ============================================

function createMockHypothesisInput(overrides: Partial<HypothesisInput> = {}): HypothesisInput {
  return {
    hypothesisId: "hyp-20260111-momentum",
    title: "Momentum Reversal at Extremes",
    economicRationale:
      "Stocks that have experienced extreme momentum (both positive and negative) tend to revert over 1-3 months due to behavioral overreaction. Investors extrapolate recent trends too far, creating temporary mispricings that correct as rational actors enter.",
    marketMechanism: "BEHAVIORAL_BIAS" as MarketMechanism,
    targetRegime: "trending",
    status: "pending" as HypothesisStatus,
    expectedIc: 0.05,
    expectedSharpe: 1.5,
    falsificationCriteria: [
      "IC < 0.02 over 3-month backtest",
      "No improvement over baseline momentum",
    ],
    requiredFeatures: ["price_momentum_12m", "price_momentum_1m", "volatility_20d"],
    relatedLiterature: [
      "Jegadeesh & Titman (1993) - Returns to Buying Winners",
      "DeBondt & Thaler (1985) - Overreaction Hypothesis",
    ],
    originalityJustification:
      "Unlike standard momentum, this factor focuses on extreme deciles and includes volatility-adjusted thresholds.",
    triggerType: "ALPHA_DECAY",
    implementationHints:
      "Use rolling z-score normalization for momentum signals. Consider industry-neutral construction.",
    author: "idea-agent",
    environment: "BACKTEST",
    ...overrides,
  };
}

// ============================================
// Hypothesis Conversion Tests
// ============================================

describe("toHypothesisNode", () => {
  test("converts hypothesisId to hypothesis_id", () => {
    const input = createMockHypothesisInput();
    const node = toHypothesisNode(input);
    expect(node.hypothesis_id).toBe("hyp-20260111-momentum");
  });

  test("preserves title", () => {
    const input = createMockHypothesisInput();
    const node = toHypothesisNode(input);
    expect(node.title).toBe("Momentum Reversal at Extremes");
  });

  test("converts economicRationale to economic_rationale", () => {
    const input = createMockHypothesisInput();
    const node = toHypothesisNode(input);
    expect(node.economic_rationale).toContain("behavioral overreaction");
  });

  test("converts marketMechanism to market_mechanism", () => {
    const input = createMockHypothesisInput();
    const node = toHypothesisNode(input);
    expect(node.market_mechanism).toBe("BEHAVIORAL_BIAS");
  });

  test("converts targetRegime to target_regime", () => {
    const input = createMockHypothesisInput();
    const node = toHypothesisNode(input);
    expect(node.target_regime).toBe("trending");
  });

  test("preserves status", () => {
    const input = createMockHypothesisInput({ status: "validated" });
    const node = toHypothesisNode(input);
    expect(node.status).toBe("validated");
  });

  test("converts expectedIc to expected_ic", () => {
    const input = createMockHypothesisInput({ expectedIc: 0.07 });
    const node = toHypothesisNode(input);
    expect(node.expected_ic).toBe(0.07);
  });

  test("converts expectedSharpe to expected_sharpe", () => {
    const input = createMockHypothesisInput({ expectedSharpe: 2.0 });
    const node = toHypothesisNode(input);
    expect(node.expected_sharpe).toBe(2.0);
  });

  test("JSON stringifies falsificationCriteria", () => {
    const input = createMockHypothesisInput();
    const node = toHypothesisNode(input);
    expect(node.falsification_criteria).toBe(JSON.stringify(input.falsificationCriteria));
    expect(JSON.parse(node.falsification_criteria)).toHaveLength(2);
  });

  test("JSON stringifies requiredFeatures", () => {
    const input = createMockHypothesisInput();
    const node = toHypothesisNode(input);
    expect(node.required_features).toBe(JSON.stringify(input.requiredFeatures));
    expect(JSON.parse(node.required_features)).toHaveLength(3);
  });

  test("JSON stringifies relatedLiterature", () => {
    const input = createMockHypothesisInput();
    const node = toHypothesisNode(input);
    expect(node.related_literature).toBe(JSON.stringify(input.relatedLiterature));
    expect(JSON.parse(node.related_literature)).toHaveLength(2);
  });

  test("converts originalityJustification", () => {
    const input = createMockHypothesisInput();
    const node = toHypothesisNode(input);
    expect(node.originality_justification).toContain("extreme deciles");
  });

  test("converts triggerType to trigger_type", () => {
    const input = createMockHypothesisInput();
    const node = toHypothesisNode(input);
    expect(node.trigger_type).toBe("ALPHA_DECAY");
  });

  test("preserves implementationHints", () => {
    const input = createMockHypothesisInput();
    const node = toHypothesisNode(input);
    expect(node.implementation_hints).toContain("z-score normalization");
  });

  test("preserves author", () => {
    const input = createMockHypothesisInput();
    const node = toHypothesisNode(input);
    expect(node.author).toBe("idea-agent");
  });

  test("sets created_at to ISO timestamp", () => {
    const input = createMockHypothesisInput();
    const node = toHypothesisNode(input);
    expect(node.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  test("preserves environment", () => {
    const input = createMockHypothesisInput({ environment: "PAPER" });
    const node = toHypothesisNode(input);
    expect(node.environment).toBe("PAPER");
  });

  test("handles undefined implementationHints", () => {
    const input = createMockHypothesisInput({ implementationHints: undefined });
    const node = toHypothesisNode(input);
    expect(node.implementation_hints).toBeUndefined();
  });
});

// ============================================
// Quality Score Calculation Tests
// ============================================

describe("calculateHypothesisQualityScore", () => {
  test("returns positive score for valid hypothesis", () => {
    const input = createMockHypothesisInput();
    const score = calculateHypothesisQualityScore(input);
    expect(score).toBeGreaterThan(0);
  });

  test("higher IC gives higher score", () => {
    const lowIc = createMockHypothesisInput({ expectedIc: 0.03 });
    const highIc = createMockHypothesisInput({ expectedIc: 0.08 });

    const lowScore = calculateHypothesisQualityScore(lowIc);
    const highScore = calculateHypothesisQualityScore(highIc);

    expect(highScore).toBeGreaterThan(lowScore);
  });

  test("higher Sharpe gives higher score", () => {
    const lowSharpe = createMockHypothesisInput({ expectedSharpe: 1.0 });
    const highSharpe = createMockHypothesisInput({ expectedSharpe: 2.5 });

    const lowScore = calculateHypothesisQualityScore(lowSharpe);
    const highScore = calculateHypothesisQualityScore(highSharpe);

    expect(highScore).toBeGreaterThan(lowScore);
  });

  test("more falsification criteria gives higher score", () => {
    const fewCriteria = createMockHypothesisInput({
      falsificationCriteria: ["IC < 0.02"],
    });
    const manyCriteria = createMockHypothesisInput({
      falsificationCriteria: [
        "IC < 0.02",
        "Sharpe < 0.5",
        "Turnover > 500%",
        "No alpha in out-of-sample",
        "Fails regime filter",
      ],
    });

    const fewScore = calculateHypothesisQualityScore(fewCriteria);
    const manyScore = calculateHypothesisQualityScore(manyCriteria);

    expect(manyScore).toBeGreaterThan(fewScore);
  });

  test("more literature references gives higher score", () => {
    const fewRefs = createMockHypothesisInput({
      relatedLiterature: ["One paper"],
    });
    const manyRefs = createMockHypothesisInput({
      relatedLiterature: ["Paper 1", "Paper 2", "Paper 3", "Paper 4", "Paper 5"],
    });

    const fewScore = calculateHypothesisQualityScore(fewRefs);
    const manyScore = calculateHypothesisQualityScore(manyRefs);

    expect(manyScore).toBeGreaterThan(fewScore);
  });

  test("longer originality justification gives higher score", () => {
    const shortJustification = createMockHypothesisInput({
      originalityJustification: "New idea",
    });
    const longJustification = createMockHypothesisInput({
      originalityJustification:
        "This hypothesis differs from existing momentum factors by incorporating regime-dependent thresholds and volatility-adjusted entry points, which addresses the documented decay in traditional momentum strategies.",
    });

    const shortScore = calculateHypothesisQualityScore(shortJustification);
    const longScore = calculateHypothesisQualityScore(longJustification);

    expect(longScore).toBeGreaterThan(shortScore);
  });

  test("presence of implementation hints gives higher score", () => {
    const noHints = createMockHypothesisInput({ implementationHints: undefined });
    const withHints = createMockHypothesisInput({
      implementationHints:
        "Use rolling z-score normalization for momentum signals. Consider industry-neutral construction. Implement with 5-day rebalance frequency.",
    });

    const noHintsScore = calculateHypothesisQualityScore(noHints);
    const withHintsScore = calculateHypothesisQualityScore(withHints);

    expect(withHintsScore).toBeGreaterThan(noHintsScore);
  });

  test("handles minimum values", () => {
    const minimal = createMockHypothesisInput({
      expectedIc: 0,
      expectedSharpe: 0,
      falsificationCriteria: [],
      relatedLiterature: [],
      originalityJustification: "",
      implementationHints: undefined,
    });

    const score = calculateHypothesisQualityScore(minimal);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

// ============================================
// Constants Tests
// ============================================

describe("DEFAULT_SIMILARITY_THRESHOLD", () => {
  test("is set to 0.85", () => {
    expect(DEFAULT_SIMILARITY_THRESHOLD).toBe(0.85);
  });

  test("is a reasonable threshold for deduplication", () => {
    expect(DEFAULT_SIMILARITY_THRESHOLD).toBeGreaterThan(0.5);
    expect(DEFAULT_SIMILARITY_THRESHOLD).toBeLessThan(1.0);
  });
});

// ============================================
// MarketMechanism Coverage Tests
// ============================================

describe("market mechanisms", () => {
  test("handles BEHAVIORAL_BIAS", () => {
    const input = createMockHypothesisInput({
      marketMechanism: "BEHAVIORAL_BIAS",
    });
    const node = toHypothesisNode(input);
    expect(node.market_mechanism).toBe("BEHAVIORAL_BIAS");
  });

  test("handles STRUCTURAL_CONSTRAINT", () => {
    const input = createMockHypothesisInput({
      marketMechanism: "STRUCTURAL_CONSTRAINT",
    });
    const node = toHypothesisNode(input);
    expect(node.market_mechanism).toBe("STRUCTURAL_CONSTRAINT");
  });

  test("handles INFORMATION_ASYMMETRY", () => {
    const input = createMockHypothesisInput({
      marketMechanism: "INFORMATION_ASYMMETRY",
    });
    const node = toHypothesisNode(input);
    expect(node.market_mechanism).toBe("INFORMATION_ASYMMETRY");
  });

  test("handles LIQUIDITY_PREMIUM", () => {
    const input = createMockHypothesisInput({
      marketMechanism: "LIQUIDITY_PREMIUM",
    });
    const node = toHypothesisNode(input);
    expect(node.market_mechanism).toBe("LIQUIDITY_PREMIUM");
  });

  test("handles RISK_PREMIUM", () => {
    const input = createMockHypothesisInput({
      marketMechanism: "RISK_PREMIUM",
    });
    const node = toHypothesisNode(input);
    expect(node.market_mechanism).toBe("RISK_PREMIUM");
  });
});

// ============================================
// Status Lifecycle Tests
// ============================================

describe("hypothesis status lifecycle", () => {
  test("handles pending status", () => {
    const input = createMockHypothesisInput({ status: "pending" });
    const node = toHypothesisNode(input);
    expect(node.status).toBe("pending");
  });

  test("handles validated status", () => {
    const input = createMockHypothesisInput({ status: "validated" });
    const node = toHypothesisNode(input);
    expect(node.status).toBe("validated");
  });

  test("handles rejected status", () => {
    const input = createMockHypothesisInput({ status: "rejected" });
    const node = toHypothesisNode(input);
    expect(node.status).toBe("rejected");
  });

  test("handles implemented status", () => {
    const input = createMockHypothesisInput({ status: "implemented" });
    const node = toHypothesisNode(input);
    expect(node.status).toBe("implemented");
  });
});

// ============================================
// Environment Tests
// ============================================

describe("environment handling", () => {
  test("handles BACKTEST environment", () => {
    const input = createMockHypothesisInput({ environment: "BACKTEST" });
    const node = toHypothesisNode(input);
    expect(node.environment).toBe("BACKTEST");
  });

  test("handles PAPER environment", () => {
    const input = createMockHypothesisInput({ environment: "PAPER" });
    const node = toHypothesisNode(input);
    expect(node.environment).toBe("PAPER");
  });

  test("handles LIVE environment", () => {
    const input = createMockHypothesisInput({ environment: "LIVE" });
    const node = toHypothesisNode(input);
    expect(node.environment).toBe("LIVE");
  });
});
