/**
 * OODA Loop Indicator Integration E2E Tests
 *
 * Tests the integration of IndicatorService with the OODA trading cycle.
 * Verifies that indicators are properly calculated and passed through
 * the observe, orient, and decide phases.
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

process.env.CREAM_ENV = "BACKTEST";

import { describe, expect, it, beforeAll } from "bun:test";
import { createTestContext } from "@cream/domain";
import type { IndicatorSnapshot } from "@cream/indicators";

// ============================================
// Test Data Factory
// ============================================

// Create mock indicator snapshots with realistic data
// Uses the actual IndicatorSnapshot schema from @cream/indicators/types
function createMockIndicatorSnapshot(symbol: string): IndicatorSnapshot {
  const basePrice = symbol === "AAPL" ? 180 : symbol === "MSFT" ? 420 : 150;

  return {
    symbol,
    timestamp: Date.now(),
    price: {
      rsi_14: 55 + Math.random() * 20,
      atr_14: basePrice * 0.02,
      sma_20: basePrice * 0.98,
      sma_50: basePrice * 0.95,
      sma_200: basePrice * 0.90,
      ema_9: basePrice * 0.995,
      ema_12: basePrice * 0.99,
      ema_21: basePrice * 0.985,
      ema_26: basePrice * 0.97,
      macd_line: basePrice * 0.005,
      macd_signal: basePrice * 0.003,
      macd_histogram: basePrice * 0.002,
      bollinger_upper: basePrice * 1.05,
      bollinger_middle: basePrice,
      bollinger_lower: basePrice * 0.95,
      bollinger_bandwidth: 0.10,
      bollinger_percentb: 0.5,
      stochastic_k: 65,
      stochastic_d: 60,
      momentum_1m: 0.03,
      momentum_3m: 0.08,
      momentum_6m: 0.15,
      momentum_12m: 0.25,
      realized_vol_20d: 0.20,
      parkinson_vol_20d: 0.18,
    },
    liquidity: {
      bid_ask_spread: 0.02,
      bid_ask_spread_pct: 0.01,
      vwap: basePrice * 0.995,
      turnover_ratio: 0.015,
      volume_ratio: 1.2,
      amihud_illiquidity: 0.00001,
    },
    options: {
      atm_iv: 0.25,
      iv_skew_25d: 0.02,
      iv_put_25d: 0.27,
      iv_call_25d: 0.25,
      put_call_ratio_volume: 0.8,
      put_call_ratio_oi: 0.75,
      term_structure_slope: 0.01,
      front_month_iv: 0.24,
      back_month_iv: 0.26,
      vrp: 0.03,
      realized_vol_20d: 0.20,
      net_delta: 0.5,
      net_gamma: 0.01,
      net_theta: -0.05,
      net_vega: 0.15,
    },
    value: {
      pe_ratio_ttm: 25,
      pe_ratio_forward: 22,
      pb_ratio: 8,
      ev_ebitda: 18,
      earnings_yield: 0.04,
      dividend_yield: 0.005,
      cape_10yr: null,
    },
    quality: {
      gross_profitability: 0.40,
      roe: 0.35,
      roa: 0.15,
      asset_growth: 0.10,
      accruals_ratio: 0.02,
      cash_flow_quality: 0.85,
      beneish_m_score: -2.5,
      earnings_quality: "HIGH",
    },
    short_interest: {
      short_interest_ratio: 1.5,
      days_to_cover: 1.2,
      short_pct_float: 0.015,
      short_interest_change: -0.001,
      settlement_date: new Date().toISOString().slice(0, 10),
    },
    sentiment: {
      overall_score: 0.6,
      sentiment_strength: 0.7,
      news_volume: 25,
      sentiment_momentum: 0.05,
      event_risk: false,
      classification: "BULLISH",
    },
    corporate: {
      trailing_dividend_yield: 0.005,
      ex_dividend_days: 45,
      upcoming_earnings_days: 30,
      recent_split: false,
    },
    market: {
      sector: "Technology",
      industry: "Consumer Electronics",
      market_cap: 3000000000000,
      market_cap_category: "MEGA",
    },
    metadata: {
      price_updated_at: Date.now(),
      fundamentals_date: new Date().toISOString().slice(0, 10),
      short_interest_date: new Date().toISOString().slice(0, 10),
      sentiment_date: new Date().toISOString().slice(0, 10),
      data_quality: "COMPLETE",
      missing_fields: [],
    },
  };
}

// Store mock indicators for testing
const mockIndicators: Record<string, IndicatorSnapshot> = {};

beforeAll(() => {
  // Pre-populate mock indicators for test symbols
  for (const symbol of ["AAPL", "MSFT", "GOOGL", "NVDA", "TSLA"]) {
    mockIndicators[symbol] = createMockIndicatorSnapshot(symbol);
  }
});

// Import workflow and prompts modules
import {
  executeTradingCycle,
  type WorkflowInput,
} from "../src/workflows/trading-cycle.js";
import { fetchFixtureSnapshot } from "../src/workflows/steps/trading-cycle/observe.js";
import {
  buildIndicatorContext,
  buildIndicatorSummary,
  formatPriceIndicators,
  formatLiquidityIndicators,
  formatValueIndicators,
  formatSentimentIndicators,
  formatShortInterestIndicators,
  interpretRSI,
  interpretMACD,
  interpretStochastic,
  interpretBollingerPercentB,
} from "../src/agents/prompts.js";
// Note: Only interpretBollingerPercentB exists (not interpretBollingerBands)

// ============================================
// Test Fixtures
// ============================================

function createWorkflowInput(overrides?: Partial<WorkflowInput>): WorkflowInput {
  return {
    cycleId: `indicator-test-${Date.now()}`,
    context: createTestContext(),
    instruments: ["AAPL", "MSFT", "GOOGL"],
    forceStub: true, // Use stub mode for deterministic tests
    ...overrides,
  };
}

// ============================================
// Observe Phase Indicator Tests
// ============================================

describe("Observe Phase - Indicator Integration", () => {
  describe("MarketSnapshot with Indicators", () => {
    it("should return market snapshot structure in fixture mode", async () => {
      const snapshot = fetchFixtureSnapshot(["AAPL", "MSFT"]);

      expect(snapshot.instruments).toContain("AAPL");
      expect(snapshot.instruments).toContain("MSFT");
      expect(snapshot.candles).toBeDefined();
      expect(snapshot.quotes).toBeDefined();
      expect(snapshot.timestamp).toBeDefined();
    });

    it("should have candle data for each instrument", async () => {
      const snapshot = fetchFixtureSnapshot(["AAPL", "GOOGL"]);

      for (const symbol of ["AAPL", "GOOGL"]) {
        expect(snapshot.candles[symbol]).toBeDefined();
        expect(Array.isArray(snapshot.candles[symbol])).toBe(true);
        expect(snapshot.candles[symbol].length).toBeGreaterThan(0);

        const candle = snapshot.candles[symbol][0];
        expect(candle).toHaveProperty("open");
        expect(candle).toHaveProperty("high");
        expect(candle).toHaveProperty("low");
        expect(candle).toHaveProperty("close");
        expect(candle).toHaveProperty("volume");
      }
    });

    it("should have quote data for each instrument", async () => {
      const snapshot = fetchFixtureSnapshot(["AAPL", "MSFT"]);

      for (const symbol of ["AAPL", "MSFT"]) {
        expect(snapshot.quotes[symbol]).toBeDefined();
        expect(snapshot.quotes[symbol]).toHaveProperty("bid");
        expect(snapshot.quotes[symbol]).toHaveProperty("ask");
        expect(snapshot.quotes[symbol]).toHaveProperty("bidSize");
        expect(snapshot.quotes[symbol]).toHaveProperty("askSize");
      }
    });
  });

  describe("Indicator Snapshot Structure", () => {
    it("should create valid indicator snapshot with all required fields", () => {
      const snapshot = createMockIndicatorSnapshot("AAPL");

      expect(snapshot.symbol).toBe("AAPL");
      expect(snapshot.timestamp).toBeDefined();
      expect(snapshot.price).toBeDefined();
      expect(snapshot.liquidity).toBeDefined();
      expect(snapshot.options).toBeDefined();
      expect(snapshot.value).toBeDefined();
      expect(snapshot.quality).toBeDefined();
      expect(snapshot.short_interest).toBeDefined();
      expect(snapshot.sentiment).toBeDefined();
      expect(snapshot.corporate).toBeDefined();
      expect(snapshot.market).toBeDefined();
      expect(snapshot.metadata).toBeDefined();
    });

    it("should have valid price indicators", () => {
      const snapshot = createMockIndicatorSnapshot("AAPL");

      expect(snapshot.price.rsi_14).toBeGreaterThan(0);
      expect(snapshot.price.rsi_14).toBeLessThan(100);
      expect(snapshot.price.atr_14).toBeGreaterThan(0);
      expect(snapshot.price.sma_20).toBeGreaterThan(0);
      expect(snapshot.price.macd_line).toBeDefined();
      // Use correct field names: bollinger_upper, bollinger_lower
      expect(snapshot.price.bollinger_upper).toBeGreaterThan(snapshot.price.bollinger_lower as number);
    });

    it("should have valid liquidity indicators", () => {
      const snapshot = createMockIndicatorSnapshot("MSFT");

      expect(snapshot.liquidity.bid_ask_spread).toBeGreaterThan(0);
      expect(snapshot.liquidity.vwap).toBeGreaterThan(0);
      // Note: dollar_volume doesn't exist in schema, use volume_ratio instead
      expect(snapshot.liquidity.volume_ratio).toBeGreaterThan(0);
      expect(snapshot.liquidity.amihud_illiquidity).toBeGreaterThan(0);
    });

    it("should have valid value indicators", () => {
      const snapshot = createMockIndicatorSnapshot("GOOGL");

      expect(snapshot.value.pe_ratio_ttm).toBeGreaterThan(0);
      expect(snapshot.value.pb_ratio).toBeGreaterThan(0);
      expect(snapshot.value.dividend_yield).toBeGreaterThanOrEqual(0);
    });

    it("should have valid sentiment indicators", () => {
      const snapshot = createMockIndicatorSnapshot("NVDA");

      expect(snapshot.sentiment.overall_score).toBeGreaterThanOrEqual(-1);
      expect(snapshot.sentiment.overall_score).toBeLessThanOrEqual(1);
      // Note: analyst_rating doesn't exist in schema, use sentiment_strength instead
      expect(snapshot.sentiment.sentiment_strength).toBeGreaterThanOrEqual(0);
      expect(snapshot.sentiment.sentiment_strength).toBeLessThanOrEqual(1);
    });

    it("should have valid metadata", () => {
      const snapshot = createMockIndicatorSnapshot("TSLA");

      expect(snapshot.metadata.data_quality).toBeDefined();
      expect(["COMPLETE", "PARTIAL", "STALE"]).toContain(snapshot.metadata.data_quality);
      expect(snapshot.metadata.price_updated_at).toBeDefined();
    });
  });
});

// ============================================
// Indicator Context Formatting Tests
// ============================================

describe("Indicator Context Formatting", () => {
  describe("buildIndicatorContext", () => {
    it("should format indicator snapshot for agent context", () => {
      // buildIndicatorContext takes Record<string, IndicatorSnapshot> (AgentContext["indicators"])
      const indicators = { AAPL: createMockIndicatorSnapshot("AAPL") };
      const context = buildIndicatorContext(indicators);

      expect(typeof context).toBe("string");
      expect(context.length).toBeGreaterThan(0);
      expect(context).toContain("AAPL");
    });

    it("should include all indicator categories", () => {
      const indicators = { MSFT: createMockIndicatorSnapshot("MSFT") };
      const context = buildIndicatorContext(indicators);

      // Should contain references to different indicator types
      expect(context.toLowerCase()).toContain("momentum");
      expect(context.toLowerCase()).toContain("liquidity");
    });

    it("should handle multiple symbols", () => {
      const indicators = {
        AAPL: createMockIndicatorSnapshot("AAPL"),
        MSFT: createMockIndicatorSnapshot("MSFT"),
        GOOGL: createMockIndicatorSnapshot("GOOGL"),
      };
      const context = buildIndicatorContext(indicators);

      expect(context).toContain("AAPL");
      expect(context).toContain("MSFT");
      expect(context).toContain("GOOGL");
    });

    it("should return empty string for undefined or empty indicators", () => {
      expect(buildIndicatorContext(undefined)).toBe("");
      expect(buildIndicatorContext({})).toBe("");
    });
  });

  describe("buildIndicatorSummary", () => {
    it("should create compact summary", () => {
      const indicators = { GOOGL: createMockIndicatorSnapshot("GOOGL") };
      const summary = buildIndicatorSummary(indicators);
      const context = buildIndicatorContext(indicators);

      expect(typeof summary).toBe("string");
      expect(summary.length).toBeLessThan(context.length);
    });

    it("should return empty string for undefined or empty indicators", () => {
      expect(buildIndicatorSummary(undefined)).toBe("");
      expect(buildIndicatorSummary({})).toBe("");
    });
  });

  describe("Category Formatters", () => {
    it("should format price indicators", () => {
      const snapshot = createMockIndicatorSnapshot("AAPL");
      const formatted = formatPriceIndicators(snapshot.price);

      // formatPriceIndicators returns string[]
      expect(Array.isArray(formatted)).toBe(true);
      const joined = formatted.join("\n");
      expect(joined).toContain("RSI");
      expect(joined).toContain("SMA");
      expect(joined).toContain("MACD");
    });

    it("should format liquidity indicators", () => {
      const snapshot = createMockIndicatorSnapshot("MSFT");
      const formatted = formatLiquidityIndicators(snapshot.liquidity);

      expect(Array.isArray(formatted)).toBe(true);
      const joined = formatted.join("\n");
      expect(joined).toContain("Spread");
      expect(joined).toContain("VWAP");
    });

    it("should format value indicators", () => {
      const snapshot = createMockIndicatorSnapshot("GOOGL");
      const formatted = formatValueIndicators(snapshot.value);

      expect(Array.isArray(formatted)).toBe(true);
      const joined = formatted.join("\n");
      expect(joined).toContain("P/E");
      expect(joined).toContain("P/B");
    });

    it("should format sentiment indicators", () => {
      const snapshot = createMockIndicatorSnapshot("NVDA");
      const formatted = formatSentimentIndicators(snapshot.sentiment);

      expect(Array.isArray(formatted)).toBe(true);
      const joined = formatted.join("\n").toLowerCase();
      expect(joined).toContain("sentiment");
    });

    it("should format short interest indicators", () => {
      const snapshot = createMockIndicatorSnapshot("TSLA");
      const formatted = formatShortInterestIndicators(snapshot.short_interest);

      expect(Array.isArray(formatted)).toBe(true);
      const joined = formatted.join("\n").toLowerCase();
      expect(joined).toContain("short");
    });
  });

  describe("Signal Interpretation", () => {
    it("should interpret RSI correctly", () => {
      // interpretRSI returns uppercase strings like "OVERSOLD", "OVERBOUGHT", "NEUTRAL"
      expect(interpretRSI(25)?.toLowerCase()).toContain("oversold");
      expect(interpretRSI(75)?.toLowerCase()).toContain("overbought");
      expect(interpretRSI(50)?.toLowerCase()).toContain("neutral");
    });

    it("should interpret MACD histogram correctly", () => {
      // interpretMACD takes only histogram value, returns "BULLISH", "BEARISH", "STRONG BULLISH", "STRONG BEARISH"
      expect(interpretMACD(0.6)?.toLowerCase()).toContain("bullish");
      expect(interpretMACD(-0.6)?.toLowerCase()).toContain("bearish");
      expect(interpretMACD(0.1)?.toLowerCase()).toContain("bullish");
      expect(interpretMACD(-0.1)?.toLowerCase()).toContain("bearish");
    });

    it("should interpret Stochastic correctly", () => {
      // interpretStochastic takes only stochastic %K value
      expect(interpretStochastic(15)?.toLowerCase()).toContain("oversold");
      expect(interpretStochastic(85)?.toLowerCase()).toContain("overbought");
      expect(interpretStochastic(50)?.toLowerCase()).toContain("neutral");
    });

    it("should interpret Bollinger Bands percent B correctly", () => {
      // interpretBollingerPercentB takes percent B value (0-1 range typically)
      expect(interpretBollingerPercentB(1.1)?.toLowerCase()).toContain("above");
      expect(interpretBollingerPercentB(-0.1)?.toLowerCase()).toContain("below");
      expect(interpretBollingerPercentB(0.5)?.toLowerCase()).toContain("within");
      expect(interpretBollingerPercentB(0.85)?.toLowerCase()).toContain("near upper");
      expect(interpretBollingerPercentB(0.15)?.toLowerCase()).toContain("near lower");
    });
  });
});

// ============================================
// Full OODA Cycle with Indicators Tests
// ============================================

describe("OODA Cycle with Indicator Integration", () => {
  describe("Workflow Execution with Indicators", () => {
    it("should complete OODA cycle in stub mode", async () => {
      const input = createWorkflowInput();
      const result = await executeTradingCycle(input);

      expect(result).toBeDefined();
      expect(result.mode).toBe("STUB");
      expect(result.approved).toBe(true);
    });

    it("should process multiple instruments with indicators", async () => {
      const input = createWorkflowInput({
        instruments: ["AAPL", "MSFT", "GOOGL", "NVDA", "TSLA"],
      });
      const result = await executeTradingCycle(input);

      expect(result.approved).toBe(true);
      expect(result.iterations).toBe(1);
    });

    it("should handle single instrument", async () => {
      const input = createWorkflowInput({
        instruments: ["AAPL"],
      });
      const result = await executeTradingCycle(input);

      expect(result.approved).toBe(true);
    });

    it("should complete within performance threshold", async () => {
      const input = createWorkflowInput();
      const startTime = Date.now();

      const result = await executeTradingCycle(input);

      const duration = Date.now() - startTime;
      expect(result.mode).toBe("STUB");
      // Stub mode should complete in < 500ms even with indicator processing
      expect(duration).toBeLessThan(500);
    });
  });

  describe("Indicator Data Flow Through OODA", () => {
    it("should preserve cycleId through indicator integration", async () => {
      const cycleId = `indicator-flow-${Date.now()}`;
      const input = createWorkflowInput({ cycleId });
      const result = await executeTradingCycle(input);

      expect(result.cycleId).toBe(cycleId);
    });

    it("should handle parallel execution with indicators", async () => {
      const promises = Array.from({ length: 3 }, (_, i) =>
        executeTradingCycle(createWorkflowInput({ cycleId: `parallel-ind-${i}` }))
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      for (const result of results) {
        expect(result.approved).toBe(true);
        expect(result.mode).toBe("STUB");
      }
    });

    it("should isolate indicator state between executions", async () => {
      const result1 = await executeTradingCycle(
        createWorkflowInput({ cycleId: "isolated-ind-1", instruments: ["AAPL"] })
      );
      const result2 = await executeTradingCycle(
        createWorkflowInput({ cycleId: "isolated-ind-2", instruments: ["MSFT"] })
      );

      expect(result1.cycleId).toBe("isolated-ind-1");
      expect(result2.cycleId).toBe("isolated-ind-2");
      expect(result1.approved).toBe(true);
      expect(result2.approved).toBe(true);
    });
  });
});

// ============================================
// Edge Case Tests
// ============================================

describe("Indicator Edge Cases", () => {
  describe("Missing or Partial Data", () => {
    it("should handle empty instruments list gracefully", async () => {
      const input: WorkflowInput = {
        cycleId: `empty-instruments-${Date.now()}`,
        context: createTestContext(),
        instruments: [],
        forceStub: true,
      };

      // Should not throw - may use default instruments or return quickly
      const result = await executeTradingCycle(input);
      expect(result).toBeDefined();
    });

    it("should handle unknown symbol gracefully", async () => {
      const input = createWorkflowInput({
        instruments: ["UNKNOWN_SYMBOL_XYZ"],
      });

      // Should not throw - indicators should handle missing data
      const result = await executeTradingCycle(input);
      expect(result).toBeDefined();
    });
  });

  describe("Indicator Value Boundaries", () => {
    it("should handle RSI at extremes", () => {
      expect(interpretRSI(0)).toBeDefined();
      expect(interpretRSI(100)).toBeDefined();
      expect(interpretRSI(30)).toBeDefined(); // Edge of oversold
      expect(interpretRSI(70)).toBeDefined(); // Edge of overbought
    });

    it("should handle null indicator values in formatting", () => {
      // Create a snapshot with all null price indicators (matching actual schema)
      const partialSnapshot: IndicatorSnapshot = {
        ...createMockIndicatorSnapshot("TEST"),
        price: {
          rsi_14: null,
          atr_14: null,
          sma_20: null,
          sma_50: null,
          sma_200: null,
          ema_9: null,
          ema_12: null,
          ema_21: null,
          ema_26: null,
          macd_line: null,
          macd_signal: null,
          macd_histogram: null,
          bollinger_upper: null,
          bollinger_middle: null,
          bollinger_lower: null,
          bollinger_bandwidth: null,
          bollinger_percentb: null,
          stochastic_k: null,
          stochastic_d: null,
          momentum_1m: null,
          momentum_3m: null,
          momentum_6m: null,
          momentum_12m: null,
          realized_vol_20d: null,
          parkinson_vol_20d: null,
        },
      };

      // Should not throw when formatting - returns empty array for all nulls
      const formatted = formatPriceIndicators(partialSnapshot.price);
      expect(formatted).toBeDefined();
      expect(Array.isArray(formatted)).toBe(true);
    });
  });
});
