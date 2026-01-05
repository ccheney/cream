import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DecisionPlanSchema,
  DecisionSchema,
  InstrumentSchema,
  OrderPlanSchema,
  RiskLevelsSchema,
  SizeSchema,
} from "@cream/domain";
import {
  createBearTrendSnapshot,
  createBullTrendSnapshot,
  // Market Snapshots
  createCandle,
  // Decisions
  createDecision,
  // Decision Plans
  createDecisionPlan,
  createEmptyDecisionPlan,
  createEmptyPortfolioState,
  // Instruments
  createEquityInstrument,
  createHighVolSnapshot,
  createHoldDecision,
  createIndicators,
  createInvalidDecisionBadRiskLevels,
  // Invalid decisions
  createInvalidDecisionMissingSize,
  createInvalidDecisionMissingStop,
  createMarketOrderPlan,
  createMarketSnapshot,
  createMemoryContext,
  // Metadata
  createMetadata,
  createMultiDecisionPlan,
  createOptionInstrument,
  createOptionsSize,
  createOptionsSpreadDecision,
  // Order Plan
  createOrderPlan,
  // Memory
  createPastTradeCase,
  createPortfolioState,
  // Portfolio
  createPosition,
  createRangeBoundSnapshot,
  // Risk Levels
  createRiskLevels,
  createShortDecision,
  createShortRiskLevels,
  // Size
  createSize,
  createSymbolSnapshot,
} from "./factories";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "..");

// ============================================
// Metadata Factory Tests
// ============================================

describe("createMetadata", () => {
  it("creates metadata with defaults", () => {
    const metadata = createMetadata();
    expect(metadata._version).toBe("1.0.0");
    expect(metadata.scenario).toBe("default");
    expect(metadata.created).toBeDefined();
  });

  it("merges overrides", () => {
    const metadata = createMetadata({
      scenario: "custom",
      regime: "BULL_TREND",
    });
    expect(metadata.scenario).toBe("custom");
    expect(metadata.regime).toBe("BULL_TREND");
  });
});

// ============================================
// Instrument Factory Tests
// ============================================

describe("createEquityInstrument", () => {
  it("creates valid equity instrument", () => {
    const instrument = createEquityInstrument();
    const result = InstrumentSchema.safeParse(instrument);
    expect(result.success).toBe(true);
    expect(instrument.instrumentType).toBe("EQUITY");
  });

  it("accepts symbol override", () => {
    const instrument = createEquityInstrument({ instrumentId: "GOOGL" });
    expect(instrument.instrumentId).toBe("GOOGL");
  });
});

describe("createOptionInstrument", () => {
  it("creates valid option instrument", () => {
    const instrument = createOptionInstrument();
    const result = InstrumentSchema.safeParse(instrument);
    expect(result.success).toBe(true);
    expect(instrument.instrumentType).toBe("OPTION");
    expect(instrument.optionContract).toBeDefined();
  });

  it("merges option contract overrides", () => {
    const instrument = createOptionInstrument({
      optionContract: {
        underlying: "TSLA",
        expiration: "2026-03-15",
        strike: 300,
        optionType: "PUT",
      },
    });
    expect(instrument.optionContract?.underlying).toBe("TSLA");
    expect(instrument.optionContract?.optionType).toBe("PUT");
  });
});

// ============================================
// Size Factory Tests
// ============================================

describe("createSize", () => {
  it("creates valid size", () => {
    const size = createSize();
    const result = SizeSchema.safeParse(size);
    expect(result.success).toBe(true);
    expect(size.quantity).toBe(100);
    expect(size.unit).toBe("SHARES");
  });

  it("accepts quantity override", () => {
    const size = createSize({ quantity: 50 });
    expect(size.quantity).toBe(50);
  });
});

describe("createOptionsSize", () => {
  it("creates valid options size", () => {
    const size = createOptionsSize();
    const result = SizeSchema.safeParse(size);
    expect(result.success).toBe(true);
    expect(size.unit).toBe("CONTRACTS");
  });
});

// ============================================
// Order Plan Factory Tests
// ============================================

describe("createOrderPlan", () => {
  it("creates valid order plan", () => {
    const plan = createOrderPlan();
    const result = OrderPlanSchema.safeParse(plan);
    expect(result.success).toBe(true);
    expect(plan.entryOrderType).toBe("LIMIT");
    expect(plan.entryLimitPrice).toBeDefined();
  });

  it("merges limit price override", () => {
    const plan = createOrderPlan({ entryLimitPrice: 180.0 });
    expect(plan.entryLimitPrice).toBe(180.0);
  });
});

describe("createMarketOrderPlan", () => {
  it("creates valid market order plan", () => {
    const plan = createMarketOrderPlan();
    const result = OrderPlanSchema.safeParse(plan);
    expect(result.success).toBe(true);
    expect(plan.entryOrderType).toBe("MARKET");
    expect(plan.entryLimitPrice).toBeUndefined();
  });
});

// ============================================
// Risk Levels Factory Tests
// ============================================

describe("createRiskLevels", () => {
  it("creates valid risk levels", () => {
    const levels = createRiskLevels();
    const result = RiskLevelsSchema.safeParse(levels);
    expect(result.success).toBe(true);
    expect(levels.stopLossLevel).toBeLessThan(levels.takeProfitLevel);
  });

  it("merges level overrides", () => {
    const levels = createRiskLevels({
      stopLossLevel: 150.0,
      takeProfitLevel: 220.0,
    });
    expect(levels.stopLossLevel).toBe(150.0);
    expect(levels.takeProfitLevel).toBe(220.0);
  });
});

describe("createShortRiskLevels", () => {
  it("creates valid short risk levels", () => {
    const levels = createShortRiskLevels();
    const result = RiskLevelsSchema.safeParse(levels);
    expect(result.success).toBe(true);
    // For short, stop is above take profit
    expect(levels.stopLossLevel).toBeGreaterThan(levels.takeProfitLevel);
  });
});

// ============================================
// Decision Factory Tests
// ============================================

describe("createDecision", () => {
  it("creates valid decision", () => {
    const decision = createDecision();
    const result = DecisionSchema.safeParse(decision);
    expect(result.success).toBe(true);
  });

  it("defaults to BUY action", () => {
    const decision = createDecision();
    expect(decision.action).toBe("BUY");
  });

  it("merges nested overrides", () => {
    const decision = createDecision({
      instrument: { instrumentId: "MSFT", instrumentType: "EQUITY" },
      confidence: 0.9,
    });
    expect(decision.instrument.instrumentId).toBe("MSFT");
    expect(decision.confidence).toBe(0.9);
    // Should still have instrumentType from default
    expect(decision.instrument.instrumentType).toBe("EQUITY");
  });

  it("merges deeply nested overrides", () => {
    const decision = createDecision({
      riskLevels: {
        stopLossLevel: 155.0,
        takeProfitLevel: 200.0,
        denomination: "UNDERLYING_PRICE",
      },
    });
    expect(decision.riskLevels.stopLossLevel).toBe(155.0);
    // Other risk level fields should still have defaults
    expect(decision.riskLevels.takeProfitLevel).toBe(200.0);
    expect(decision.riskLevels.denomination).toBe("UNDERLYING_PRICE");
  });
});

describe("createShortDecision", () => {
  it("creates valid short decision", () => {
    const decision = createShortDecision();
    const result = DecisionSchema.safeParse(decision);
    expect(result.success).toBe(true);
    expect(decision.action).toBe("SELL");
    expect(decision.size.targetPositionQuantity).toBeLessThan(0);
  });
});

describe("createHoldDecision", () => {
  it("creates valid hold decision", () => {
    const decision = createHoldDecision();
    const result = DecisionSchema.safeParse(decision);
    expect(result.success).toBe(true);
    expect(decision.action).toBe("HOLD");
  });
});

describe("createOptionsSpreadDecision", () => {
  it("creates valid options spread decision", () => {
    const decision = createOptionsSpreadDecision();
    const result = DecisionSchema.safeParse(decision);
    expect(result.success).toBe(true);
    expect(decision.instrument.instrumentType).toBe("OPTION");
    expect(decision.riskLevels.denomination).toBe("OPTION_PRICE");
  });
});

// ============================================
// Decision Plan Factory Tests
// ============================================

describe("createDecisionPlan", () => {
  it("creates valid decision plan", () => {
    const plan = createDecisionPlan();
    const result = DecisionPlanSchema.safeParse(plan);
    expect(result.success).toBe(true);
    expect(plan.decisions.length).toBeGreaterThan(0);
  });

  it("defaults to BACKTEST environment", () => {
    const plan = createDecisionPlan();
    expect(plan.environment).toBe("BACKTEST");
  });
});

describe("createEmptyDecisionPlan", () => {
  it("creates valid empty decision plan", () => {
    const plan = createEmptyDecisionPlan();
    const result = DecisionPlanSchema.safeParse(plan);
    expect(result.success).toBe(true);
    expect(plan.decisions).toHaveLength(0);
  });
});

describe("createMultiDecisionPlan", () => {
  it("creates valid multi-decision plan", () => {
    const plan = createMultiDecisionPlan();
    const result = DecisionPlanSchema.safeParse(plan);
    expect(result.success).toBe(true);
    expect(plan.decisions.length).toBeGreaterThan(1);
  });
});

// ============================================
// Invalid Decision Factory Tests
// ============================================

describe("createInvalidDecisionMissingSize", () => {
  it("fails schema validation (missing size)", () => {
    const invalid = createInvalidDecisionMissingSize();
    const result = DecisionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("createInvalidDecisionMissingStop", () => {
  it("fails schema validation (missing stopLossLevel)", () => {
    const invalid = createInvalidDecisionMissingStop();
    const result = DecisionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("createInvalidDecisionBadRiskLevels", () => {
  it("fails schema validation (stop equals take profit)", () => {
    const invalid = createInvalidDecisionBadRiskLevels();
    const result = DecisionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

// ============================================
// Market Snapshot Factory Tests
// ============================================

describe("createCandle", () => {
  it("creates candle with all OHLCV fields", () => {
    const candle = createCandle();
    expect(candle.open).toBeDefined();
    expect(candle.high).toBeDefined();
    expect(candle.low).toBeDefined();
    expect(candle.close).toBeDefined();
    expect(candle.volume).toBeDefined();
    expect(candle.high).toBeGreaterThanOrEqual(candle.low);
  });
});

describe("createIndicators", () => {
  it("creates indicators with all fields", () => {
    const indicators = createIndicators();
    expect(indicators.rsi_14).toBeDefined();
    expect(indicators.sma_20).toBeDefined();
    expect(indicators.atr_14).toBeDefined();
  });
});

describe("createSymbolSnapshot", () => {
  it("creates symbol snapshot with candles and indicators", () => {
    const snapshot = createSymbolSnapshot();
    expect(snapshot.symbol).toBeDefined();
    expect(snapshot.candles.length).toBeGreaterThan(0);
    expect(snapshot.indicators).toBeDefined();
    expect(snapshot.lastPrice).toBeDefined();
  });
});

describe("createMarketSnapshot", () => {
  it("creates market snapshot with metadata", () => {
    const snapshot = createMarketSnapshot();
    expect(snapshot.metadata).toBeDefined();
    expect(snapshot.metadata._version).toBe("1.0.0");
    expect(snapshot.symbols.length).toBeGreaterThan(0);
  });
});

describe("scenario snapshots", () => {
  it("creates bull trend snapshot", () => {
    const snapshot = createBullTrendSnapshot();
    expect(snapshot.regime).toBe("BULL_TREND");
    expect(snapshot.symbols[0]?.indicators.rsi_14).toBeGreaterThan(70);
  });

  it("creates bear trend snapshot", () => {
    const snapshot = createBearTrendSnapshot();
    expect(snapshot.regime).toBe("BEAR_TREND");
    expect(snapshot.symbols[0]?.indicators.rsi_14).toBeLessThan(30);
  });

  it("creates high vol snapshot", () => {
    const snapshot = createHighVolSnapshot();
    expect(snapshot.regime).toBe("HIGH_VOL");
    expect(snapshot.symbols[0]?.indicators.atr_14).toBeGreaterThan(20);
  });

  it("creates range bound snapshot", () => {
    const snapshot = createRangeBoundSnapshot();
    expect(snapshot.regime).toBe("RANGE");
    expect(snapshot.symbols[0]?.indicators.rsi_14).toBe(50);
  });
});

// ============================================
// Memory Context Factory Tests
// ============================================

describe("createPastTradeCase", () => {
  it("creates past trade case with all fields", () => {
    const tradeCase = createPastTradeCase();
    expect(tradeCase.caseId).toBeDefined();
    expect(tradeCase.symbol).toBeDefined();
    expect(tradeCase.action).toBeDefined();
    expect(tradeCase.pnlPercent).toBeDefined();
  });
});

describe("createMemoryContext", () => {
  it("creates memory context with retrieved cases", () => {
    const context = createMemoryContext();
    expect(context.retrievedCases.length).toBeGreaterThan(0);
    expect(context.similarityScores.length).toBe(context.retrievedCases.length);
  });
});

// ============================================
// Portfolio State Factory Tests
// ============================================

describe("createPosition", () => {
  it("creates position with all fields", () => {
    const position = createPosition();
    expect(position.symbol).toBeDefined();
    expect(position.quantity).toBeGreaterThan(0);
    expect(position.unrealizedPnl).toBeDefined();
  });
});

describe("createPortfolioState", () => {
  it("creates portfolio state with positions", () => {
    const state = createPortfolioState();
    expect(state.cash).toBeGreaterThan(0);
    expect(state.equity).toBeGreaterThan(0);
    expect(state.positions.length).toBeGreaterThan(0);
  });
});

describe("createEmptyPortfolioState", () => {
  it("creates empty portfolio state", () => {
    const state = createEmptyPortfolioState();
    expect(state.positions).toHaveLength(0);
    expect(state.cash).toEqual(state.equity);
  });
});

// ============================================
// JSON Fixture Tests
// ============================================

describe("JSON fixtures", () => {
  describe("snapshot fixtures", () => {
    it("bull_trend_aapl.json is valid", async () => {
      const content = await readFile(join(fixturesDir, "snapshots/bull_trend_aapl.json"), "utf-8");
      const data = JSON.parse(content);
      expect(data._version).toBe("1.0.0");
      expect(data.regime).toBe("BULL_TREND");
      expect(data.symbols[0].symbol).toBe("AAPL");
    });

    it("bear_trend_spy.json is valid", async () => {
      const content = await readFile(join(fixturesDir, "snapshots/bear_trend_spy.json"), "utf-8");
      const data = JSON.parse(content);
      expect(data.regime).toBe("BEAR_TREND");
      expect(data.symbols[0].symbol).toBe("SPY");
    });

    it("high_vol_nvda.json is valid", async () => {
      const content = await readFile(join(fixturesDir, "snapshots/high_vol_nvda.json"), "utf-8");
      const data = JSON.parse(content);
      expect(data.regime).toBe("HIGH_VOL");
      expect(data.symbols[0].symbol).toBe("NVDA");
    });

    it("range_bound_tsla.json is valid", async () => {
      const content = await readFile(join(fixturesDir, "snapshots/range_bound_tsla.json"), "utf-8");
      const data = JSON.parse(content);
      expect(data.regime).toBe("RANGE");
      expect(data.symbols[0].symbol).toBe("TSLA");
    });
  });

  describe("decision fixtures", () => {
    it("valid_increase.json passes schema validation", async () => {
      const content = await readFile(join(fixturesDir, "decisions/valid_increase.json"), "utf-8");
      const data = JSON.parse(content);
      const result = DecisionSchema.safeParse(data.decision);
      expect(result.success).toBe(true);
    });

    it("valid_multi_leg.json passes schema validation", async () => {
      const content = await readFile(join(fixturesDir, "decisions/valid_multi_leg.json"), "utf-8");
      const data = JSON.parse(content);
      const result = DecisionSchema.safeParse(data.decision);
      expect(result.success).toBe(true);
    });

    it("invalid_missing_size.json fails schema validation", async () => {
      const content = await readFile(
        join(fixturesDir, "decisions/invalid_missing_size.json"),
        "utf-8"
      );
      const data = JSON.parse(content);
      const result = DecisionSchema.safeParse(data.decision);
      expect(result.success).toBe(false);
    });

    it("invalid_missing_stop.json fails schema validation", async () => {
      const content = await readFile(
        join(fixturesDir, "decisions/invalid_missing_stop.json"),
        "utf-8"
      );
      const data = JSON.parse(content);
      const result = DecisionSchema.safeParse(data.decision);
      expect(result.success).toBe(false);
    });
  });

  describe("memory fixtures", () => {
    it("retrieved_cases_sample.json is valid", async () => {
      const content = await readFile(
        join(fixturesDir, "memory/retrieved_cases_sample.json"),
        "utf-8"
      );
      const data = JSON.parse(content);
      expect(data._version).toBe("1.0.0");
      expect(data.retrievedCases.length).toBeGreaterThan(0);
      expect(data.similarityScores.length).toBe(data.retrievedCases.length);
    });
  });
});
