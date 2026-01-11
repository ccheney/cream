/**
 * Constants and Schema Tests
 *
 * Tests for forgetting policy constants and Zod schema validation.
 */

import { describe, expect, it } from "bun:test";
import {
  COMPLIANCE_PERIOD_DAYS,
  DECAY_CONSTANT_DAYS,
  DEFAULT_PRUNING_CONFIG,
  DELETION_THRESHOLD,
  ForgettingEnvironment,
  ForgettingNodeType,
  INFINITE_RETENTION,
  SUMMARIZATION_THRESHOLD,
} from "../../src/retention/forgetting.js";

describe("Constants", () => {
  it("DECAY_CONSTANT_DAYS is 365 (1 year)", () => {
    expect(DECAY_CONSTANT_DAYS).toBe(365);
  });

  it("COMPLIANCE_PERIOD_DAYS is 6 years", () => {
    expect(COMPLIANCE_PERIOD_DAYS).toBe(6 * 365);
  });

  it("SUMMARIZATION_THRESHOLD is 0.1", () => {
    expect(SUMMARIZATION_THRESHOLD).toBe(0.1);
  });

  it("DELETION_THRESHOLD is 0.05", () => {
    expect(DELETION_THRESHOLD).toBe(0.05);
  });

  it("INFINITE_RETENTION is positive infinity", () => {
    expect(INFINITE_RETENTION).toBe(Number.POSITIVE_INFINITY);
  });

  it("DEFAULT_PRUNING_CONFIG has correct values", () => {
    expect(DEFAULT_PRUNING_CONFIG.minEdgeWeight).toBe(0.3);
    expect(DEFAULT_PRUNING_CONFIG.maxIsolatedSubgraphSize).toBe(5);
    expect(DEFAULT_PRUNING_CONFIG.maxHubEdges).toBe(100);
    expect(DEFAULT_PRUNING_CONFIG.hubEdgeThreshold).toBe(1000);
  });
});

describe("ForgettingEnvironment", () => {
  it("accepts LIVE, PAPER, BACKTEST", () => {
    expect(ForgettingEnvironment.parse("LIVE")).toBe("LIVE");
    expect(ForgettingEnvironment.parse("PAPER")).toBe("PAPER");
    expect(ForgettingEnvironment.parse("BACKTEST")).toBe("BACKTEST");
  });

  it("rejects invalid environments", () => {
    const result = ForgettingEnvironment.safeParse("INVALID");
    expect(result.success).toBe(false);
  });
});

describe("ForgettingNodeType", () => {
  it("accepts valid node types", () => {
    expect(ForgettingNodeType.parse("TradeDecision")).toBe("TradeDecision");
    expect(ForgettingNodeType.parse("TradeLifecycleEvent")).toBe("TradeLifecycleEvent");
    expect(ForgettingNodeType.parse("ExternalEvent")).toBe("ExternalEvent");
    expect(ForgettingNodeType.parse("FilingChunk")).toBe("FilingChunk");
    expect(ForgettingNodeType.parse("TranscriptChunk")).toBe("TranscriptChunk");
    expect(ForgettingNodeType.parse("NewsItem")).toBe("NewsItem");
    expect(ForgettingNodeType.parse("Company")).toBe("Company");
    expect(ForgettingNodeType.parse("MacroEntity")).toBe("MacroEntity");
  });
});
