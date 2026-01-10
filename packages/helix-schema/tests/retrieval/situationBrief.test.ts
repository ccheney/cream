/**
 * Situation Brief Tests
 *
 * @see docs/plans/04-memory-helixdb.md:274-287
 */

import { describe, expect, it } from "bun:test";
import {
  calculateRetrievalStatistics,
  DEFAULT_SITUATION_BRIEF_CONFIG,
  formatRetrievalStatistics,
  generateSituationBrief,
  type SituationBriefConfig,
  type SituationBriefInput,
} from "../../src/retrieval/situationBrief.js";

// ============================================
// generateSituationBrief Tests
// ============================================

describe("generateSituationBrief", () => {
  it("generates brief for equity with minimal input", () => {
    const input: SituationBriefInput = {
      symbol: "AAPL",
      regimeLabel: "BULLISH_TREND",
    };

    const brief = generateSituationBrief(input);

    expect(brief.instrument.symbol).toBe("AAPL");
    expect(brief.instrument.assetType).toBe("EQUITY");
    expect(brief.regime.label).toBe("BULLISH_TREND");
    expect(brief.regime.confidence).toBe(1.0);
    expect(brief.textSummary).toContain("Trading AAPL");
    expect(brief.textSummary).toContain("BULLISH_TREND");
  });

  it("generates brief for option with underlying", () => {
    const input: SituationBriefInput = {
      symbol: "AAPL240119C150",
      underlying: "AAPL",
      assetType: "OPTION",
      regimeLabel: "VOLATILE_SIDEWAYS",
      regimeConfidence: 0.85,
    };

    const brief = generateSituationBrief(input);

    expect(brief.instrument.symbol).toBe("AAPL240119C150");
    expect(brief.instrument.underlying).toBe("AAPL");
    expect(brief.instrument.assetType).toBe("OPTION");
    expect(brief.regime.confidence).toBe(0.85);
    expect(brief.textSummary).toContain("underlying: AAPL");
  });

  it("infers OPTION type when underlying is present", () => {
    const input: SituationBriefInput = {
      symbol: "AAPL240119C150",
      underlying: "AAPL",
      regimeLabel: "BULLISH",
    };

    const brief = generateSituationBrief(input);

    expect(brief.instrument.assetType).toBe("OPTION");
  });

  it("filters indicators by config", () => {
    const input: SituationBriefInput = {
      symbol: "AAPL",
      regimeLabel: "BULLISH",
      indicators: {
        RSI_14: 65,
        ATR_14: 3.2,
        SMA_50: 180.5,
        SMA_200: 165.0,
        MACD: 2.5, // Not in default config
      },
    };

    const brief = generateSituationBrief(input);

    expect(brief.indicators.length).toBe(4);
    expect(brief.indicators.find((i) => i.name === "RSI_14")).toBeDefined();
    expect(brief.indicators.find((i) => i.name === "ATR_14")).toBeDefined();
    expect(brief.indicators.find((i) => i.name === "SMA_50")).toBeDefined();
    expect(brief.indicators.find((i) => i.name === "SMA_200")).toBeDefined();
    expect(brief.indicators.find((i) => i.name === "MACD")).toBeUndefined();
  });

  it("respects custom indicator config", () => {
    const input: SituationBriefInput = {
      symbol: "AAPL",
      regimeLabel: "BULLISH",
      indicators: {
        RSI_14: 65,
        MACD: 2.5,
        CUSTOM_IND: 100,
      },
    };

    const config: SituationBriefConfig = {
      indicators: ["RSI_14", "MACD"],
    };

    const brief = generateSituationBrief(input, config);

    expect(brief.indicators.length).toBe(2);
    expect(brief.indicators.find((i) => i.name === "RSI_14")).toBeDefined();
    expect(brief.indicators.find((i) => i.name === "MACD")).toBeDefined();
    expect(brief.indicators.find((i) => i.name === "CUSTOM_IND")).toBeUndefined();
  });

  it("interprets RSI correctly", () => {
    const inputOverbought: SituationBriefInput = {
      symbol: "AAPL",
      regimeLabel: "BULLISH",
      indicators: { RSI_14: 75 },
    };
    const inputOversold: SituationBriefInput = {
      symbol: "AAPL",
      regimeLabel: "BEARISH",
      indicators: { RSI_14: 25 },
    };
    const inputNeutral: SituationBriefInput = {
      symbol: "AAPL",
      regimeLabel: "NEUTRAL",
      indicators: { RSI_14: 50 },
    };

    const briefOverbought = generateSituationBrief(inputOverbought);
    const briefOversold = generateSituationBrief(inputOversold);
    const briefNeutral = generateSituationBrief(inputNeutral);

    expect(briefOverbought.indicators[0]?.interpretation).toBe("overbought");
    expect(briefOversold.indicators[0]?.interpretation).toBe("oversold");
    expect(briefNeutral.indicators[0]?.interpretation).toBe("neutral");
  });

  it("includes position context in text summary", () => {
    const input: SituationBriefInput = {
      symbol: "AAPL",
      regimeLabel: "BULLISH",
      position: {
        direction: "LONG",
        size: 100,
        unrealizedPnL: 500,
        holdingDays: 5,
      },
    };

    const brief = generateSituationBrief(input);

    expect(brief.position).toBeDefined();
    expect(brief.position?.direction).toBe("LONG");
    expect(brief.position?.size).toBe(100);
    expect(brief.textSummary).toContain("Position: LONG 100 shares");
    expect(brief.textSummary).toContain("+$500.00 P&L");
    expect(brief.textSummary).toContain("held 5 days");
  });

  it("excludes FLAT position from text summary", () => {
    const input: SituationBriefInput = {
      symbol: "AAPL",
      regimeLabel: "BULLISH",
      position: {
        direction: "FLAT",
        size: 0,
        unrealizedPnL: 0,
        holdingDays: 0,
      },
    };

    const brief = generateSituationBrief(input);

    expect(brief.position).toBeDefined();
    expect(brief.textSummary).not.toContain("Position:");
  });

  it("includes recent events in brief", () => {
    const now = Date.now();
    const input: SituationBriefInput = {
      symbol: "AAPL",
      regimeLabel: "VOLATILE",
      events: [
        { type: "EARNINGS", summary: "Beat estimates by 5%", timestamp: now - 3600000 },
        { type: "NEWS", summary: "New product announcement", timestamp: now - 7200000 },
      ],
    };

    const brief = generateSituationBrief(input);

    expect(brief.recentEvents.length).toBe(2);
    expect(brief.textSummary).toContain("Recent events:");
    expect(brief.textSummary).toContain("EARNINGS: Beat estimates by 5%");
  });

  it("filters out old events beyond lookback", () => {
    const now = Date.now();
    const oldTimestamp = now - 48 * 60 * 60 * 1000; // 48 hours ago

    const input: SituationBriefInput = {
      symbol: "AAPL",
      regimeLabel: "NEUTRAL",
      events: [
        { type: "EARNINGS", summary: "Recent event", timestamp: now - 3600000 },
        { type: "OLD_NEWS", summary: "Old event", timestamp: oldTimestamp },
      ],
    };

    const brief = generateSituationBrief(input);

    expect(brief.recentEvents.length).toBe(1);
    expect(brief.recentEvents[0]?.type).toBe("EARNINGS");
  });

  it("limits events to maxEvents config", () => {
    const now = Date.now();
    const input: SituationBriefInput = {
      symbol: "AAPL",
      regimeLabel: "VOLATILE",
      events: Array.from({ length: 10 }, (_, i) => ({
        type: `EVENT_${i}`,
        summary: `Event ${i}`,
        timestamp: now - i * 1000,
      })),
    };

    const config: SituationBriefConfig = {
      indicators: [],
      maxEvents: 3,
    };

    const brief = generateSituationBrief(input, config);

    expect(brief.recentEvents.length).toBe(3);
  });
});

// ============================================
// calculateRetrievalStatistics Tests
// ============================================

describe("calculateRetrievalStatistics", () => {
  it("returns zero stats for empty arrays", () => {
    const stats = calculateRetrievalStatistics([], []);

    expect(stats.totalCases).toBe(0);
    expect(stats.winRate).toBe(0);
    expect(stats.avgReturn).toBe(0);
    expect(stats.avgHoldingDays).toBe(0);
    expect(stats.returnDistribution.p50).toBe(0);
  });

  it("calculates correct win rate", () => {
    const returns = [0.05, -0.02, 0.03, 0.08, -0.01]; // 3 wins, 2 losses
    const holdingDays = [3, 5, 2, 7, 1];

    const stats = calculateRetrievalStatistics(returns, holdingDays);

    expect(stats.totalCases).toBe(5);
    expect(stats.winRate).toBeCloseTo(0.6);
  });

  it("calculates correct average return", () => {
    const returns = [0.1, 0.05, -0.05];
    const holdingDays = [1, 2, 3];

    const stats = calculateRetrievalStatistics(returns, holdingDays);

    // (0.10 + 0.05 - 0.05) / 3 = 0.0333...
    expect(stats.avgReturn).toBeCloseTo(0.0333, 3);
  });

  it("calculates correct average holding days", () => {
    const returns = [0.05, 0.03];
    const holdingDays = [5, 10];

    const stats = calculateRetrievalStatistics(returns, holdingDays);

    expect(stats.avgHoldingDays).toBe(7.5);
  });

  it("calculates return distribution percentiles", () => {
    // 10 values from 1% to 10%
    const returns = [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1];
    const holdingDays = Array(10).fill(1);

    const stats = calculateRetrievalStatistics(returns, holdingDays);

    // P50 should be close to median
    expect(stats.returnDistribution.p50).toBeCloseTo(0.055);
    expect(stats.returnDistribution.p10).toBeCloseTo(0.019);
    expect(stats.returnDistribution.p90).toBeCloseTo(0.091);
  });

  it("handles single case", () => {
    const returns = [0.05];
    const holdingDays = [3];

    const stats = calculateRetrievalStatistics(returns, holdingDays);

    expect(stats.totalCases).toBe(1);
    expect(stats.winRate).toBe(1);
    expect(stats.avgReturn).toBe(0.05);
    expect(stats.avgHoldingDays).toBe(3);
    expect(stats.returnDistribution.p50).toBe(0.05);
  });

  it("handles all losses", () => {
    const returns = [-0.05, -0.03, -0.02];
    const holdingDays = [1, 2, 3];

    const stats = calculateRetrievalStatistics(returns, holdingDays);

    expect(stats.winRate).toBe(0);
    expect(stats.avgReturn).toBeCloseTo(-0.0333, 3);
  });
});

// ============================================
// formatRetrievalStatistics Tests
// ============================================

describe("formatRetrievalStatistics", () => {
  it("formats empty stats", () => {
    const stats = calculateRetrievalStatistics([], []);
    const formatted = formatRetrievalStatistics(stats);

    expect(formatted).toBe("No similar cases found.");
  });

  it("formats stats with all fields", () => {
    const returns = [0.05, 0.03, -0.02, 0.08, 0.04];
    const holdingDays = [3, 5, 2, 7, 4];
    const stats = calculateRetrievalStatistics(returns, holdingDays);
    const formatted = formatRetrievalStatistics(stats);

    expect(formatted).toContain("Found 5 similar cases");
    expect(formatted).toContain("80% win rate");
    expect(formatted).toContain("avg return");
    expect(formatted).toContain("days avg hold");
    expect(formatted).toContain("P10");
    expect(formatted).toContain("P90");
  });
});

// ============================================
// DEFAULT_SITUATION_BRIEF_CONFIG Tests
// ============================================

describe("DEFAULT_SITUATION_BRIEF_CONFIG", () => {
  it("has expected default indicators", () => {
    expect(DEFAULT_SITUATION_BRIEF_CONFIG.indicators).toContain("RSI_14");
    expect(DEFAULT_SITUATION_BRIEF_CONFIG.indicators).toContain("ATR_14");
    expect(DEFAULT_SITUATION_BRIEF_CONFIG.indicators).toContain("SMA_50");
    expect(DEFAULT_SITUATION_BRIEF_CONFIG.indicators).toContain("SMA_200");
  });

  it("has sensible defaults for events", () => {
    expect(DEFAULT_SITUATION_BRIEF_CONFIG.maxEvents).toBe(5);
    expect(DEFAULT_SITUATION_BRIEF_CONFIG.eventLookbackHours).toBe(24);
  });
});
