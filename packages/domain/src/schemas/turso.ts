/**
 * Turso Database Validation Schemas
 *
 * Zod schemas for validating data before Turso insert/update operations.
 * These schemas mirror the Turso table definitions and ensure data integrity.
 *
 * @see docs/plans/ui/04-data-requirements.md
 */

import { z } from "zod";

// ============================================
// Common Field Validators
// ============================================

/**
 * UUID validator.
 */
export const UuidSchema = z.string().uuid();

/**
 * ISO-8601 datetime validator.
 */
export const DatetimeSchema = z.string().datetime();

/**
 * Ticker symbol validator (1-10 uppercase letters, allows option symbols).
 */
export const TickerSymbolSchema = z
  .string()
  .min(1)
  .max(21) // Allow full option symbols like AAPL231215C00150000
  .regex(/^[A-Z0-9]+$/);

/**
 * Simple equity ticker (1-5 uppercase letters).
 */
export const EquityTickerSchema = z
  .string()
  .min(1)
  .max(5)
  .regex(/^[A-Z]+$/);

/**
 * Money amount (positive number with up to 2 decimal places).
 */
export const MoneySchema = z.number().nonnegative();

/**
 * Percentage (0-100).
 */
export const PercentageSchema = z.number().min(-100).max(100);

/**
 * Percentage as decimal (-1 to 1, for signed values like P&L).
 */
export const DecimalPercentSchema = z.number().min(-1).max(1);

/**
 * Confidence score (0-1, unsigned).
 */
export const ConfidenceSchema = z.number().min(0).max(1);

// ============================================
// Decision Table
// ============================================

/**
 * Decision status.
 */
export const DecisionStatus = z.enum([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "EXECUTED",
  "FAILED",
  "EXPIRED",
]);
export type DecisionStatus = z.infer<typeof DecisionStatus>;

/**
 * Trading action.
 */
export const TradingAction = z.enum(["BUY", "SELL", "HOLD", "CLOSE", "INCREASE", "REDUCE"]);
export type TradingAction = z.infer<typeof TradingAction>;

/**
 * Position direction.
 */
export const PositionDirection = z.enum(["LONG", "SHORT", "FLAT"]);
export type PositionDirection = z.infer<typeof PositionDirection>;

/**
 * Size unit.
 */
export const SizeUnitType = z.enum(["SHARES", "CONTRACTS", "DOLLARS", "PCT_EQUITY"]);
export type SizeUnitType = z.infer<typeof SizeUnitType>;

/**
 * Decision insert schema.
 */
export const DecisionInsertSchema = z.object({
  id: UuidSchema,
  cycleId: z.string().min(1),
  symbol: TickerSymbolSchema,
  action: TradingAction,
  direction: PositionDirection,
  size: z.number().positive(),
  sizeUnit: SizeUnitType,
  entryPrice: z.number().positive().nullable(),
  stopLoss: z.number().positive().nullable(),
  takeProfit: z.number().positive().nullable(),
  status: DecisionStatus,
  rationale: z.string().min(1),
  confidence: ConfidenceSchema,
  createdAt: DatetimeSchema,
  updatedAt: DatetimeSchema,
});
export type DecisionInsert = z.infer<typeof DecisionInsertSchema>;

/**
 * Decision update schema (partial).
 */
export const DecisionUpdateSchema = DecisionInsertSchema.partial().extend({
  id: UuidSchema, // ID is always required for update
  updatedAt: DatetimeSchema,
});
export type DecisionUpdate = z.infer<typeof DecisionUpdateSchema>;

// ============================================
// Order Table
// ============================================

/**
 * Order side.
 */
export const OrderSideType = z.enum(["BUY", "SELL"]);
export type OrderSideType = z.infer<typeof OrderSideType>;

/**
 * Order type.
 */
export const OrderTypeType = z.enum(["MARKET", "LIMIT", "STOP", "STOP_LIMIT"]);
export type OrderTypeType = z.infer<typeof OrderTypeType>;

/**
 * Order status.
 */
export const OrderStatusType = z.enum([
  "NEW",
  "ACCEPTED",
  "PARTIALLY_FILLED",
  "FILLED",
  "CANCELED",
  "REJECTED",
  "EXPIRED",
]);
export type OrderStatusType = z.infer<typeof OrderStatusType>;

/**
 * Order base schema (without refinements, used for partial).
 */
const OrderBaseSchema = z.object({
  id: UuidSchema,
  decisionId: UuidSchema,
  symbol: TickerSymbolSchema,
  side: OrderSideType,
  quantity: z.number().int().positive(),
  orderType: OrderTypeType,
  limitPrice: z.number().positive().nullable(),
  stopPrice: z.number().positive().nullable(),
  status: OrderStatusType,
  brokerOrderId: z.string().nullable(),
  filledQuantity: z.number().int().nonnegative().default(0),
  avgFillPrice: z.number().nonnegative().nullable(),
  commission: z.number().nonnegative().default(0),
  submittedAt: DatetimeSchema,
  acceptedAt: DatetimeSchema.nullable(),
  filledAt: DatetimeSchema.nullable(),
  createdAt: DatetimeSchema,
  updatedAt: DatetimeSchema,
});

/**
 * Order insert schema.
 */
export const OrderInsertSchema = OrderBaseSchema.superRefine((data, ctx) => {
  if (data.orderType === "LIMIT" && data.limitPrice === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "limitPrice is required when orderType is LIMIT",
      path: ["limitPrice"],
    });
  }
  if ((data.orderType === "STOP" || data.orderType === "STOP_LIMIT") && data.stopPrice === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "stopPrice is required when orderType is STOP or STOP_LIMIT",
      path: ["stopPrice"],
    });
  }
});
export type OrderInsert = z.infer<typeof OrderInsertSchema>;

/**
 * Order update schema (partial, from base without refinements).
 */
export const OrderUpdateSchema = OrderBaseSchema.partial().extend({
  id: UuidSchema,
  updatedAt: DatetimeSchema,
});
export type OrderUpdate = z.infer<typeof OrderUpdateSchema>;

// ============================================
// Alert Table
// ============================================

/**
 * Alert severity.
 */
export const AlertSeverityType = z.enum(["critical", "warning", "info"]);
export type AlertSeverityType = z.infer<typeof AlertSeverityType>;

/**
 * Alert insert schema.
 */
export const AlertInsertSchema = z.object({
  id: UuidSchema,
  severity: AlertSeverityType,
  alertType: z.string().min(1).max(50),
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(2000),
  source: z.string().min(1).max(100),
  acknowledged: z.boolean().default(false),
  acknowledgedAt: DatetimeSchema.nullable(),
  acknowledgedBy: z.string().nullable(),
  metadata: z.record(z.string(), z.any()).nullable(),
  createdAt: DatetimeSchema,
});
export type AlertInsert = z.infer<typeof AlertInsertSchema>;

/**
 * Alert update schema (partial).
 */
export const AlertUpdateSchema = AlertInsertSchema.partial().extend({
  id: UuidSchema,
});
export type AlertUpdate = z.infer<typeof AlertUpdateSchema>;

// ============================================
// Portfolio Snapshot Table
// ============================================

/**
 * Portfolio snapshot insert schema.
 */
export const PortfolioSnapshotInsertSchema = z.object({
  id: UuidSchema,
  timestamp: DatetimeSchema,
  totalValue: MoneySchema,
  cashBalance: MoneySchema,
  equityValue: MoneySchema,
  optionValue: MoneySchema,
  marginUsed: MoneySchema.default(0),
  buyingPower: MoneySchema,
  unrealizedPnl: z.number(),
  unrealizedPnlPct: PercentageSchema,
  realizedPnlToday: z.number().default(0),
  grossExposure: MoneySchema,
  netExposure: z.number(),
  longExposure: MoneySchema,
  shortExposure: MoneySchema,
});
export type PortfolioSnapshotInsert = z.infer<typeof PortfolioSnapshotInsertSchema>;

// ============================================
// Position Table
// ============================================

/**
 * Position insert schema.
 */
export const PositionInsertSchema = z.object({
  id: UuidSchema,
  symbol: TickerSymbolSchema,
  instrumentType: z.enum(["EQUITY", "OPTION"]),
  quantity: z.number().int(), // Can be negative for short
  avgEntryPrice: z.number().positive(),
  marketValue: z.number(),
  unrealizedPnl: z.number(),
  unrealizedPnlPct: PercentageSchema,
  costBasis: z.number(),
  currentPrice: z.number().nonnegative(),
  lastUpdated: DatetimeSchema,
  createdAt: DatetimeSchema,
});
export type PositionInsert = z.infer<typeof PositionInsertSchema>;

/**
 * Position update schema (partial).
 */
export const PositionUpdateSchema = PositionInsertSchema.partial().extend({
  id: UuidSchema,
  lastUpdated: DatetimeSchema,
});
export type PositionUpdate = z.infer<typeof PositionUpdateSchema>;

// ============================================
// Candle Table
// ============================================

/**
 * Timeframe enum.
 */
export const Timeframe = z.enum(["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w", "1M"]);
export type Timeframe = z.infer<typeof Timeframe>;

/**
 * Candle insert schema.
 */
export const CandleInsertSchema = z
  .object({
    id: UuidSchema,
    symbol: EquityTickerSchema,
    timeframe: Timeframe,
    timestamp: DatetimeSchema,
    open: z.number().positive(),
    high: z.number().positive(),
    low: z.number().positive(),
    close: z.number().positive(),
    volume: z.number().int().nonnegative(),
    vwap: z.number().positive().nullable(),
    tradeCount: z.number().int().nonnegative().nullable(),
  })
  .refine((data) => data.high >= data.low, {
    message: "high must be >= low",
  })
  .refine((data) => data.high >= data.open && data.high >= data.close, {
    message: "high must be >= open and close",
  })
  .refine((data) => data.low <= data.open && data.low <= data.close, {
    message: "low must be <= open and close",
  });
export type CandleInsert = z.infer<typeof CandleInsertSchema>;

// ============================================
// Indicator Table
// ============================================

/**
 * Indicator insert schema.
 */
export const IndicatorInsertSchema = z.object({
  id: UuidSchema,
  symbol: EquityTickerSchema,
  timestamp: DatetimeSchema,
  indicatorName: z.string().min(1).max(50),
  value: z.number(),
  parameters: z.record(z.string(), z.any()).nullable(),
  createdAt: DatetimeSchema,
});
export type IndicatorInsert = z.infer<typeof IndicatorInsertSchema>;

// ============================================
// Cycle Log Table
// ============================================

/**
 * Cycle phase enum.
 */
export const CyclePhase = z.enum(["observe", "orient", "decide", "act", "complete", "failed"]);
export type CyclePhase = z.infer<typeof CyclePhase>;

/**
 * Environment enum.
 */
export const Environment = z.enum(["BACKTEST", "PAPER", "LIVE"]);
export type Environment = z.infer<typeof Environment>;

/**
 * Cycle log insert schema.
 */
export const CycleLogInsertSchema = z.object({
  id: UuidSchema,
  cycleId: z.string().min(1),
  environment: Environment,
  phase: CyclePhase,
  startedAt: DatetimeSchema,
  completedAt: DatetimeSchema.nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  symbolsProcessed: z.number().int().nonnegative().default(0),
  decisionsGenerated: z.number().int().nonnegative().default(0),
  ordersSubmitted: z.number().int().nonnegative().default(0),
  errorMessage: z.string().nullable(),
  metadata: z.record(z.string(), z.any()).nullable(),
});
export type CycleLogInsert = z.infer<typeof CycleLogInsertSchema>;

/**
 * Cycle log update schema.
 */
export const CycleLogUpdateSchema = CycleLogInsertSchema.partial().extend({
  id: UuidSchema,
});
export type CycleLogUpdate = z.infer<typeof CycleLogUpdateSchema>;

// ============================================
// Agent Output Table
// ============================================

/**
 * Agent type enum.
 */
export const AgentTypeEnum = z.enum([
  "technical",
  "news_sentiment",
  "fundamentals",
  "bullish",
  "bearish",
  "trader",
  "risk_manager",
  "critic",
]);
export type AgentTypeEnum = z.infer<typeof AgentTypeEnum>;

/**
 * Agent output insert schema.
 */
export const AgentOutputInsertSchema = z.object({
  id: UuidSchema,
  cycleId: z.string().min(1),
  symbol: EquityTickerSchema,
  agentType: AgentTypeEnum,
  reasoning: z.string().min(1),
  recommendation: z.string().min(1).max(500),
  confidence: ConfidenceSchema,
  vote: z.enum(["APPROVE", "REJECT", "ABSTAIN"]).nullable(),
  metadata: z.record(z.string(), z.any()).nullable(),
  createdAt: DatetimeSchema,
});
export type AgentOutputInsert = z.infer<typeof AgentOutputInsertSchema>;

// ============================================
// Market Snapshot Table
// ============================================

/**
 * Market snapshot insert schema.
 */
export const MarketSnapshotInsertSchema = z.object({
  id: UuidSchema,
  timestamp: DatetimeSchema,
  symbol: EquityTickerSchema,
  bid: z.number().nonnegative(),
  ask: z.number().nonnegative(),
  bidSize: z.number().int().nonnegative(),
  askSize: z.number().int().nonnegative(),
  last: z.number().nonnegative(),
  lastSize: z.number().int().nonnegative().nullable(),
  volume: z.number().int().nonnegative(),
  prevClose: z.number().positive().nullable(),
  changePercent: PercentageSchema.nullable(),
});
export type MarketSnapshotInsert = z.infer<typeof MarketSnapshotInsertSchema>;

// ============================================
// Option Chain Table
// ============================================

/**
 * Option type enum.
 */
export const OptionTypeEnum = z.enum(["CALL", "PUT"]);
export type OptionTypeEnum = z.infer<typeof OptionTypeEnum>;

/**
 * Option chain insert schema.
 */
export const OptionChainInsertSchema = z.object({
  id: UuidSchema,
  underlying: EquityTickerSchema,
  expiration: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  strike: z.number().positive(),
  optionType: OptionTypeEnum,
  contractSymbol: TickerSymbolSchema,
  bid: z.number().nonnegative(),
  ask: z.number().nonnegative(),
  last: z.number().nonnegative().nullable(),
  volume: z.number().int().nonnegative(),
  openInterest: z.number().int().nonnegative(),
  impliedVolatility: z.number().nonnegative().nullable(),
  delta: z.number().min(-1).max(1).nullable(),
  gamma: z.number().nonnegative().nullable(),
  theta: z.number().nullable(),
  vega: z.number().nonnegative().nullable(),
  rho: z.number().nullable(),
  updatedAt: DatetimeSchema,
});
export type OptionChainInsert = z.infer<typeof OptionChainInsertSchema>;

// ============================================
// Regime Table
// ============================================

/**
 * Market regime enum.
 */
export const MarketRegime = z.enum([
  "BULL_TREND",
  "BEAR_TREND",
  "RANGE_BOUND",
  "HIGH_VOLATILITY",
  "LOW_VOLATILITY",
  "CRISIS",
]);
export type MarketRegime = z.infer<typeof MarketRegime>;

/**
 * Regime insert schema.
 */
export const RegimeInsertSchema = z.object({
  id: UuidSchema,
  timestamp: DatetimeSchema,
  regime: MarketRegime,
  confidence: ConfidenceSchema,
  vix: z.number().nonnegative().nullable(),
  spy200sma: z.number().positive().nullable(),
  spyPrice: z.number().positive().nullable(),
  metadata: z.record(z.string(), z.any()).nullable(),
  createdAt: DatetimeSchema,
});
export type RegimeInsert = z.infer<typeof RegimeInsertSchema>;

// ============================================
// Exports
// ============================================

export default {
  // Common
  UuidSchema,
  DatetimeSchema,
  TickerSymbolSchema,
  EquityTickerSchema,
  MoneySchema,
  PercentageSchema,
  DecimalPercentSchema,
  ConfidenceSchema,

  // Decision
  DecisionStatus,
  TradingAction,
  PositionDirection,
  SizeUnitType,
  DecisionInsertSchema,
  DecisionUpdateSchema,

  // Order
  OrderSideType,
  OrderTypeType,
  OrderStatusType,
  OrderInsertSchema,
  OrderUpdateSchema,

  // Alert
  AlertSeverityType,
  AlertInsertSchema,
  AlertUpdateSchema,

  // Portfolio
  PortfolioSnapshotInsertSchema,

  // Position
  PositionInsertSchema,
  PositionUpdateSchema,

  // Candle
  Timeframe,
  CandleInsertSchema,

  // Indicator
  IndicatorInsertSchema,

  // Cycle
  CyclePhase,
  Environment,
  CycleLogInsertSchema,
  CycleLogUpdateSchema,

  // Agent
  AgentTypeEnum,
  AgentOutputInsertSchema,

  // Market
  MarketSnapshotInsertSchema,

  // Option
  OptionTypeEnum,
  OptionChainInsertSchema,

  // Regime
  MarketRegime,
  RegimeInsertSchema,
};
