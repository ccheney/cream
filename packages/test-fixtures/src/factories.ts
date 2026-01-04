/**
 * Test Fixture Factory Functions
 *
 * Factory functions for creating valid test data with sensible defaults.
 * All factories accept Partial<T> overrides for customization.
 *
 * @see docs/plans/14-testing.md for test data management spec
 */

import type {
  Decision,
  DecisionPlan,
  Instrument,
  OptionContract,
  OrderPlan,
  References,
  RiskLevels,
  Size,
} from "@cream/domain";
import { deepmerge } from "deepmerge-ts";

// ============================================
// Fixture Metadata
// ============================================

/**
 * Metadata attached to all fixtures
 */
export interface FixtureMetadata {
  _version: string;
  scenario: string;
  regime?: string;
  created: string;
}

/**
 * Create fixture metadata
 */
export function createMetadata(overrides: Partial<FixtureMetadata> = {}): FixtureMetadata {
  const defaults: FixtureMetadata = {
    _version: "1.0.0",
    scenario: "default",
    created: new Date().toISOString(),
  };
  return deepmerge(defaults, overrides) as FixtureMetadata;
}

// ============================================
// Instrument Factories
// ============================================

/**
 * Create an equity instrument
 */
export function createEquityInstrument(overrides: Partial<Instrument> = {}): Instrument {
  const defaults: Instrument = {
    instrumentId: "AAPL",
    instrumentType: "EQUITY",
  };
  return deepmerge(defaults, overrides) as Instrument;
}

/**
 * Create an option contract
 */
export function createOptionContract(overrides: Partial<OptionContract> = {}): OptionContract {
  const defaults: OptionContract = {
    underlying: "AAPL",
    expiration: "2026-02-21",
    strike: 200,
    optionType: "CALL",
  };
  return deepmerge(defaults, overrides) as OptionContract;
}

/**
 * Create an option instrument
 */
export function createOptionInstrument(overrides: Partial<Instrument> = {}): Instrument {
  const defaults: Instrument = {
    instrumentId: "AAPL260221C00200000",
    instrumentType: "OPTION",
    optionContract: createOptionContract(),
  };
  return deepmerge(defaults, overrides) as Instrument;
}

// ============================================
// Size Factory
// ============================================

/**
 * Create a position size
 *
 * Defaults:
 * - 100 shares for equity
 * - Positive targetPositionQuantity (long position)
 */
export function createSize(overrides: Partial<Size> = {}): Size {
  const defaults: Size = {
    quantity: 100,
    unit: "SHARES",
    targetPositionQuantity: 100,
  };
  return deepmerge(defaults, overrides) as Size;
}

/**
 * Create an options size (contracts)
 */
export function createOptionsSize(overrides: Partial<Size> = {}): Size {
  const defaults: Size = {
    quantity: 1,
    unit: "CONTRACTS",
    targetPositionQuantity: 1,
  };
  return deepmerge(defaults, overrides) as Size;
}

// ============================================
// Order Plan Factory
// ============================================

/**
 * Create an order plan
 *
 * Defaults:
 * - LIMIT entry at $175
 * - MARKET exit
 * - DAY time in force
 */
export function createOrderPlan(overrides: Partial<OrderPlan> = {}): OrderPlan {
  const defaults: OrderPlan = {
    entryOrderType: "LIMIT",
    entryLimitPrice: 175.0,
    exitOrderType: "MARKET",
    timeInForce: "DAY",
  };
  return deepmerge(defaults, overrides) as OrderPlan;
}

/**
 * Create a market order plan
 */
export function createMarketOrderPlan(overrides: Partial<OrderPlan> = {}): OrderPlan {
  const defaults: OrderPlan = {
    entryOrderType: "MARKET",
    exitOrderType: "MARKET",
    timeInForce: "DAY",
  };
  return deepmerge(defaults, overrides) as OrderPlan;
}

// ============================================
// Risk Levels Factory
// ============================================

/**
 * Create risk levels for a LONG position
 *
 * Defaults:
 * - Stop loss at $160 (below entry)
 * - Take profit at $200 (above entry)
 * - Entry assumed around $175
 * - Risk-reward ratio: 1.67
 */
export function createRiskLevels(overrides: Partial<RiskLevels> = {}): RiskLevels {
  const defaults: RiskLevels = {
    stopLossLevel: 160.0,
    takeProfitLevel: 200.0,
    denomination: "UNDERLYING_PRICE",
  };
  return deepmerge(defaults, overrides) as RiskLevels;
}

/**
 * Create risk levels for a SHORT position
 *
 * Defaults:
 * - Stop loss at $190 (above entry)
 * - Take profit at $150 (below entry)
 * - Entry assumed around $175
 */
export function createShortRiskLevels(overrides: Partial<RiskLevels> = {}): RiskLevels {
  const defaults: RiskLevels = {
    stopLossLevel: 190.0,
    takeProfitLevel: 150.0,
    denomination: "UNDERLYING_PRICE",
  };
  return deepmerge(defaults, overrides) as RiskLevels;
}

// ============================================
// References Factory
// ============================================

/**
 * Create references
 */
export function createReferences(overrides: Partial<References> = {}): References {
  const defaults: References = {
    usedIndicators: ["rsi_14", "sma_20", "atr_14"],
    memoryCaseIds: [],
    eventIds: [],
  };
  return deepmerge(defaults, overrides) as References;
}

// ============================================
// Decision Factory
// ============================================

/**
 * Create a complete decision
 *
 * Defaults to a BUY decision for AAPL equity with:
 * - 100 shares
 * - LIMIT entry at $175
 * - Stop at $160, take profit at $200
 * - TREND strategy
 * - 80% confidence
 */
export function createDecision(overrides: Partial<Decision> = {}): Decision {
  const defaults: Decision = {
    instrument: createEquityInstrument(),
    action: "BUY",
    size: createSize(),
    orderPlan: createOrderPlan(),
    riskLevels: createRiskLevels(),
    strategyFamily: "TREND",
    rationale:
      "AAPL showing strong momentum with RSI above 60 and price above 20-day SMA. Bullish continuation pattern forming.",
    confidence: 0.8,
    references: createReferences(),
  };

  // Deep merge with overrides
  return deepmerge(defaults, overrides) as Decision;
}

/**
 * Create a SELL (short) decision
 */
export function createShortDecision(overrides: Partial<Decision> = {}): Decision {
  const defaults: Decision = {
    instrument: createEquityInstrument({ instrumentId: "SPY" }),
    action: "SELL",
    size: createSize({ targetPositionQuantity: -100 }),
    orderPlan: createOrderPlan(),
    riskLevels: createShortRiskLevels(),
    strategyFamily: "TREND",
    rationale:
      "SPY showing bearish momentum with RSI below 40 and price below 20-day SMA. Breakdown pattern forming.",
    confidence: 0.75,
    references: createReferences(),
  };

  return deepmerge(defaults, overrides) as Decision;
}

/**
 * Create a HOLD decision
 */
export function createHoldDecision(overrides: Partial<Decision> = {}): Decision {
  const defaults: Decision = {
    instrument: createEquityInstrument({ instrumentId: "TSLA" }),
    action: "HOLD",
    size: createSize({ quantity: 0 }),
    orderPlan: createMarketOrderPlan(),
    riskLevels: createRiskLevels({
      stopLossLevel: 220.0,
      takeProfitLevel: 280.0,
    }),
    strategyFamily: "TREND",
    rationale:
      "Maintaining existing position. Price consolidating near support with no clear signal for change.",
    confidence: 0.6,
    references: createReferences(),
  };

  return deepmerge(defaults, overrides) as Decision;
}

/**
 * Create an options decision (vertical call spread)
 */
export function createOptionsSpreadDecision(overrides: Partial<Decision> = {}): Decision {
  const defaults: Decision = {
    instrument: createOptionInstrument({
      instrumentId: "SPY260221C00590000",
      optionContract: {
        underlying: "SPY",
        expiration: "2026-02-21",
        strike: 590,
        optionType: "CALL",
      },
    }),
    action: "BUY",
    size: createOptionsSize(),
    orderPlan: createOrderPlan({ entryLimitPrice: 5.5 }),
    riskLevels: createRiskLevels({
      stopLossLevel: 2.75,
      takeProfitLevel: 8.25,
      denomination: "OPTION_PRICE",
    }),
    strategyFamily: "VOLATILITY",
    rationale:
      "Bullish SPY options play with defined risk. Buying 590 call spread for February expiration.",
    confidence: 0.7,
    references: createReferences(),
  };

  return deepmerge(defaults, overrides) as Decision;
}

// ============================================
// Decision Plan Factory
// ============================================

/**
 * Create a complete decision plan
 *
 * Defaults to BACKTEST environment with one BUY decision
 */
export function createDecisionPlan(overrides: Partial<DecisionPlan> = {}): DecisionPlan {
  const now = new Date().toISOString();

  const defaults: DecisionPlan = {
    cycleId: `cycle-${Date.now()}`,
    asOfTimestamp: now,
    environment: "BACKTEST",
    decisions: [createDecision()],
    portfolioNotes: "Standard test decision plan",
  };

  return deepmerge(defaults, overrides) as DecisionPlan;
}

/**
 * Create an empty decision plan (no trades)
 */
export function createEmptyDecisionPlan(overrides: Partial<DecisionPlan> = {}): DecisionPlan {
  const now = new Date().toISOString();
  const defaults: DecisionPlan = {
    cycleId: `cycle-${Date.now()}`,
    asOfTimestamp: now,
    environment: "BACKTEST",
    decisions: [], // Empty array
    portfolioNotes: "No actionable signals identified",
  };
  return deepmerge(defaults, overrides) as DecisionPlan;
}

/**
 * Create a multi-decision plan
 */
export function createMultiDecisionPlan(overrides: Partial<DecisionPlan> = {}): DecisionPlan {
  return createDecisionPlan({
    decisions: [createDecision(), createShortDecision(), createHoldDecision()],
    portfolioNotes: "Multi-position portfolio rebalancing",
    ...overrides,
  });
}

// ============================================
// Invalid Decision Factories (for testing validation)
// ============================================

/**
 * Create a decision missing required size (for validation testing)
 * Note: Returns unknown type since it's intentionally invalid
 */
export function createInvalidDecisionMissingSize(): unknown {
  return {
    instrument: createEquityInstrument(),
    action: "BUY",
    // size is missing!
    orderPlan: createOrderPlan(),
    riskLevels: createRiskLevels(),
    strategyFamily: "TREND",
    rationale: "Test decision missing size field",
    confidence: 0.8,
  };
}

/**
 * Create a decision with missing stop loss (invalid)
 * Note: Returns unknown type since it's intentionally invalid
 */
export function createInvalidDecisionMissingStop(): unknown {
  return {
    instrument: createEquityInstrument(),
    action: "BUY",
    size: createSize(),
    orderPlan: createOrderPlan(),
    riskLevels: {
      // stopLossLevel is missing!
      takeProfitLevel: 200.0,
      denomination: "UNDERLYING_PRICE",
    },
    strategyFamily: "TREND",
    rationale: "Test decision missing stop loss",
    confidence: 0.8,
  };
}

/**
 * Create a decision with invalid risk levels (stop equals take profit)
 * Note: Returns unknown type since it's intentionally invalid
 */
export function createInvalidDecisionBadRiskLevels(): unknown {
  return {
    instrument: createEquityInstrument(),
    action: "BUY",
    size: createSize(),
    orderPlan: createOrderPlan(),
    riskLevels: {
      stopLossLevel: 175.0,
      takeProfitLevel: 175.0, // Same as stop!
      denomination: "UNDERLYING_PRICE",
    },
    strategyFamily: "TREND",
    rationale: "Test decision with invalid risk levels",
    confidence: 0.8,
  };
}

// ============================================
// Market Snapshot Factory
// ============================================

/**
 * OHLCV candle data
 */
export interface Candle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Technical indicators for a symbol
 */
export interface Indicators {
  rsi_14?: number;
  sma_20?: number;
  sma_50?: number;
  sma_200?: number;
  ema_9?: number;
  ema_21?: number;
  atr_14?: number;
  bb_upper?: number;
  bb_middle?: number;
  bb_lower?: number;
  volume_sma_20?: number;
}

/**
 * Market snapshot for a single symbol
 */
export interface SymbolSnapshot {
  symbol: string;
  candles: Candle[];
  indicators: Indicators;
  lastPrice: number;
  bid?: number;
  ask?: number;
  bidSize?: number;
  askSize?: number;
}

/**
 * Complete market snapshot
 */
export interface MarketSnapshot {
  metadata: FixtureMetadata;
  asOf: string;
  symbols: SymbolSnapshot[];
  regime?: string;
}

/**
 * Create a candle
 */
export function createCandle(overrides: Partial<Candle> = {}): Candle {
  const defaults: Candle = {
    timestamp: new Date().toISOString(),
    open: 175.0,
    high: 177.5,
    low: 174.0,
    close: 176.5,
    volume: 1_000_000,
  };
  return deepmerge(defaults, overrides) as Candle;
}

/**
 * Create indicators
 */
export function createIndicators(overrides: Partial<Indicators> = {}): Indicators {
  const defaults: Indicators = {
    rsi_14: 55,
    sma_20: 172.0,
    sma_50: 168.0,
    sma_200: 160.0,
    ema_9: 174.0,
    ema_21: 171.0,
    atr_14: 3.5,
    bb_upper: 182.0,
    bb_middle: 172.0,
    bb_lower: 162.0,
    volume_sma_20: 950_000,
  };
  return deepmerge(defaults, overrides) as Indicators;
}

/**
 * Create a symbol snapshot
 */
export function createSymbolSnapshot(overrides: Partial<SymbolSnapshot> = {}): SymbolSnapshot {
  const defaults: SymbolSnapshot = {
    symbol: "AAPL",
    candles: [createCandle()],
    indicators: createIndicators(),
    lastPrice: 176.5,
    bid: 176.45,
    ask: 176.55,
    bidSize: 500,
    askSize: 300,
  };
  return deepmerge(defaults, overrides) as SymbolSnapshot;
}

/**
 * Create a complete market snapshot
 */
export function createMarketSnapshot(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  const defaults: MarketSnapshot = {
    metadata: createMetadata({ scenario: "default_market" }),
    asOf: new Date().toISOString(),
    symbols: [createSymbolSnapshot()],
    regime: "BULL_TREND",
  };
  return deepmerge(defaults, overrides) as MarketSnapshot;
}

// ============================================
// Scenario Snapshots
// ============================================

/**
 * Create a bull trend snapshot for AAPL
 */
export function createBullTrendSnapshot(): MarketSnapshot {
  return {
    metadata: createMetadata({
      scenario: "bull_trend_aapl",
      regime: "BULL_TREND",
    }),
    asOf: new Date().toISOString(),
    regime: "BULL_TREND",
    symbols: [
      {
        symbol: "AAPL",
        candles: [createCandle()],
        lastPrice: 185.0,
        bid: 184.95,
        ask: 185.05,
        bidSize: 500,
        askSize: 300,
        indicators: {
          rsi_14: 72,
          sma_20: 178.0,
          sma_50: 172.0,
          sma_200: 160.0,
          ema_9: 182.5,
          ema_21: 178.0,
          atr_14: 4.25,
          bb_upper: 192.0,
          bb_middle: 178.0,
          bb_lower: 164.0,
          volume_sma_20: 1_200_000,
        },
      },
    ],
  };
}

/**
 * Create a bear trend snapshot for SPY
 */
export function createBearTrendSnapshot(): MarketSnapshot {
  return {
    metadata: createMetadata({
      scenario: "bear_trend_spy",
      regime: "BEAR_TREND",
    }),
    asOf: new Date().toISOString(),
    regime: "BEAR_TREND",
    symbols: [
      {
        symbol: "SPY",
        candles: [createCandle()],
        lastPrice: 420.0,
        bid: 419.95,
        ask: 420.05,
        bidSize: 1200,
        askSize: 1500,
        indicators: {
          rsi_14: 28,
          sma_20: 435.0,
          sma_50: 445.0,
          sma_200: 460.0,
          ema_9: 425.0,
          ema_21: 432.0,
          atr_14: 8.5,
          bb_upper: 455.0,
          bb_middle: 435.0,
          bb_lower: 415.0,
          volume_sma_20: 5_500_000,
        },
      },
    ],
  };
}

/**
 * Create a high volatility snapshot for NVDA
 */
export function createHighVolSnapshot(): MarketSnapshot {
  return {
    metadata: createMetadata({
      scenario: "high_vol_nvda",
      regime: "HIGH_VOL",
    }),
    asOf: new Date().toISOString(),
    regime: "HIGH_VOL",
    symbols: [
      {
        symbol: "NVDA",
        candles: [createCandle()],
        lastPrice: 480.0,
        bid: 479.5,
        ask: 480.5,
        bidSize: 400,
        askSize: 350,
        indicators: {
          rsi_14: 45,
          sma_20: 475.0,
          sma_50: 465.0,
          sma_200: 420.0,
          ema_9: 478.0,
          ema_21: 472.0,
          atr_14: 25.0, // High ATR
          bb_upper: 520.0,
          bb_middle: 475.0,
          bb_lower: 430.0, // Wide bands
          volume_sma_20: 8_000_000,
        },
      },
    ],
  };
}

/**
 * Create a range-bound snapshot for TSLA
 */
export function createRangeBoundSnapshot(): MarketSnapshot {
  return {
    metadata: createMetadata({
      scenario: "range_bound_tsla",
      regime: "RANGE",
    }),
    asOf: new Date().toISOString(),
    regime: "RANGE",
    symbols: [
      {
        symbol: "TSLA",
        candles: [createCandle()],
        lastPrice: 250.0,
        bid: 249.95,
        ask: 250.05,
        bidSize: 600,
        askSize: 550,
        indicators: {
          rsi_14: 50,
          sma_20: 248.0,
          sma_50: 252.0,
          sma_200: 245.0,
          ema_9: 249.5,
          ema_21: 249.0,
          atr_14: 8.0, // Low ATR
          bb_upper: 262.0,
          bb_middle: 250.0,
          bb_lower: 238.0, // Narrow bands
          volume_sma_20: 3_000_000,
        },
      },
    ],
  };
}

// ============================================
// Memory Context Factory
// ============================================

/**
 * Past trade case for memory retrieval
 */
export interface PastTradeCase {
  caseId: string;
  symbol: string;
  action: string;
  entryPrice: number;
  exitPrice: number;
  pnlPercent: number;
  regime: string;
  rationale: string;
  timestamp: string;
}

/**
 * Memory context with retrieved cases
 */
export interface MemoryContext {
  metadata: FixtureMetadata;
  retrievedCases: PastTradeCase[];
  similarityScores: number[];
}

/**
 * Create a past trade case
 */
export function createPastTradeCase(overrides: Partial<PastTradeCase> = {}): PastTradeCase {
  const defaults: PastTradeCase = {
    caseId: `case-${Date.now()}`,
    symbol: "AAPL",
    action: "BUY",
    entryPrice: 170.0,
    exitPrice: 185.0,
    pnlPercent: 8.8,
    regime: "BULL_TREND",
    rationale: "Strong momentum play with RSI confirmation",
    timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
  return deepmerge(defaults, overrides) as PastTradeCase;
}

/**
 * Create a memory context
 */
export function createMemoryContext(overrides: Partial<MemoryContext> = {}): MemoryContext {
  const defaults: MemoryContext = {
    metadata: createMetadata({ scenario: "memory_retrieval" }),
    retrievedCases: [
      createPastTradeCase(),
      createPastTradeCase({
        caseId: "case-2",
        symbol: "AAPL",
        action: "BUY",
        entryPrice: 165.0,
        exitPrice: 172.0,
        pnlPercent: 4.2,
        regime: "BULL_TREND",
      }),
      createPastTradeCase({
        caseId: "case-3",
        symbol: "AAPL",
        action: "SELL",
        entryPrice: 190.0,
        exitPrice: 175.0,
        pnlPercent: -7.9,
        regime: "BEAR_TREND",
      }),
    ],
    similarityScores: [0.92, 0.85, 0.78],
  };
  return deepmerge(defaults, overrides) as MemoryContext;
}

// ============================================
// Portfolio State Factory
// ============================================

/**
 * Current position in portfolio
 */
export interface Position {
  symbol: string;
  quantity: number;
  averageEntryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
}

/**
 * Portfolio state
 */
export interface PortfolioState {
  metadata: FixtureMetadata;
  cash: number;
  equity: number;
  buyingPower: number;
  positions: Position[];
  dayTradeCount: number;
  patternDayTrader: boolean;
}

/**
 * Create a position
 */
export function createPosition(overrides: Partial<Position> = {}): Position {
  const defaults: Position = {
    symbol: "AAPL",
    quantity: 100,
    averageEntryPrice: 170.0,
    currentPrice: 175.0,
    unrealizedPnl: 500.0,
    unrealizedPnlPercent: 2.94,
  };
  return deepmerge(defaults, overrides) as Position;
}

/**
 * Create a portfolio state
 */
export function createPortfolioState(overrides: Partial<PortfolioState> = {}): PortfolioState {
  const defaults: PortfolioState = {
    metadata: createMetadata({ scenario: "portfolio_state" }),
    cash: 50000.0,
    equity: 100000.0,
    buyingPower: 200000.0,
    positions: [createPosition()],
    dayTradeCount: 0,
    patternDayTrader: false,
  };
  return deepmerge(defaults, overrides) as PortfolioState;
}

/**
 * Create an empty portfolio state
 */
export function createEmptyPortfolioState(overrides: Partial<PortfolioState> = {}): PortfolioState {
  const defaults: PortfolioState = {
    metadata: createMetadata({ scenario: "empty_portfolio" }),
    cash: 100000.0,
    equity: 100000.0,
    buyingPower: 200000.0,
    positions: [], // Empty positions array
    dayTradeCount: 0,
    patternDayTrader: false,
  };
  return deepmerge(defaults, overrides) as PortfolioState;
}
