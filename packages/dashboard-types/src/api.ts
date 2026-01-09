/**
 * Dashboard API Types
 *
 * Shared Zod schemas and inferred types for dashboard and dashboard-api.
 * Both packages import from here to ensure type consistency.
 */

import { z } from "zod";

// ============================================
// System
// ============================================

export const SystemStatusSchema = z.object({
  environment: z.enum(["BACKTEST", "PAPER", "LIVE"]),
  status: z.enum(["running", "paused", "stopped", "error"]),
  uptime: z.number(),
  version: z.string(),
  lastCycleAt: z.string().nullable(),
  nextCycleAt: z.string().nullable(),
});

export type SystemStatus = z.infer<typeof SystemStatusSchema>;

export const AlertSeveritySchema = z.enum(["info", "warning", "error", "critical"]);
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;

export const AlertSchema = z.object({
  id: z.string(),
  severity: AlertSeveritySchema,
  message: z.string(),
  source: z.string(),
  createdAt: z.string(),
  acknowledged: z.boolean(),
});

export type Alert = z.infer<typeof AlertSchema>;

// ============================================
// Decisions
// ============================================

export const DecisionActionSchema = z.enum(["BUY", "SELL", "HOLD", "CLOSE"]);
export type DecisionAction = z.infer<typeof DecisionActionSchema>;

export const DecisionDirectionSchema = z.enum(["LONG", "SHORT", "FLAT"]);
export type DecisionDirection = z.infer<typeof DecisionDirectionSchema>;

export const SizeUnitSchema = z.enum(["SHARES", "CONTRACTS", "DOLLARS", "PCT_EQUITY"]);
export type SizeUnit = z.infer<typeof SizeUnitSchema>;

export const DecisionStatusSchema = z.enum([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "EXECUTED",
  "FAILED",
]);
export type DecisionStatus = z.infer<typeof DecisionStatusSchema>;

export const DecisionSchema = z.object({
  id: z.string(),
  cycleId: z.string(),
  symbol: z.string(),
  action: DecisionActionSchema,
  direction: DecisionDirectionSchema,
  size: z.number(),
  sizeUnit: SizeUnitSchema,
  entryPrice: z.number().nullable(),
  stopPrice: z.number().nullable(),
  targetPrice: z.number().nullable(),
  status: DecisionStatusSchema,
  confidenceScore: z.number().nullable(),
  createdAt: z.string(),
});

export type Decision = z.infer<typeof DecisionSchema>;

export const AgentOutputSchema = z.object({
  agentType: z.string(),
  vote: z.enum(["APPROVE", "REJECT"]),
  confidence: z.number(),
  reasoning: z.string(),
  processingTimeMs: z.number(),
  createdAt: z.string(),
});

export type AgentOutput = z.infer<typeof AgentOutputSchema>;

export const CitationSchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string(),
  source: z.string(),
  snippet: z.string(),
  relevanceScore: z.number(),
  fetchedAt: z.string(),
});

export type Citation = z.infer<typeof CitationSchema>;

export const ExecutionDetailSchema = z.object({
  orderId: z.string(),
  brokerOrderId: z.string().nullable(),
  broker: z.string(),
  status: z.string(),
  filledQty: z.number(),
  avgFillPrice: z.number().nullable(),
  slippage: z.number().nullable(),
  commissions: z.number().nullable(),
  timestamps: z.object({
    submitted: z.string(),
    accepted: z.string().nullable(),
    filled: z.string().nullable(),
  }),
});

export type ExecutionDetail = z.infer<typeof ExecutionDetailSchema>;

export const DecisionDetailSchema = DecisionSchema.extend({
  strategyFamily: z.string().nullable(),
  timeHorizon: z.string().nullable(),
  rationale: z.string().nullable(),
  bullishFactors: z.array(z.string()),
  bearishFactors: z.array(z.string()),
  agentOutputs: z.array(AgentOutputSchema),
  citations: z.array(CitationSchema),
  execution: ExecutionDetailSchema.nullable(),
});

export type DecisionDetail = z.infer<typeof DecisionDetailSchema>;

export const PaginatedDecisionsSchema = z.object({
  decisions: z.array(DecisionSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

export type PaginatedDecisions = z.infer<typeof PaginatedDecisionsSchema>;

// ============================================
// Portfolio
// ============================================

export const PortfolioSummarySchema = z.object({
  nav: z.number(),
  cash: z.number(),
  equity: z.number(),
  buyingPower: z.number(),
  grossExposure: z.number(),
  netExposure: z.number(),
  positionCount: z.number(),
  todayPnl: z.number(),
  todayPnlPct: z.number(),
  totalPnl: z.number(),
  totalPnlPct: z.number(),
  lastUpdated: z.string(),
});

export type PortfolioSummary = z.infer<typeof PortfolioSummarySchema>;

export const PositionSideSchema = z.enum(["LONG", "SHORT"]);
export type PositionSide = z.infer<typeof PositionSideSchema>;

export const PositionSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  side: PositionSideSchema,
  qty: z.number(),
  avgEntry: z.number(),
  currentPrice: z.number().nullable(),
  marketValue: z.number().nullable(),
  unrealizedPnl: z.number().nullable(),
  unrealizedPnlPct: z.number().nullable(),
  thesisId: z.string().nullable(),
  daysHeld: z.number(),
  openedAt: z.string(),
});

export type Position = z.infer<typeof PositionSchema>;

export const EquityPointSchema = z.object({
  timestamp: z.string(),
  nav: z.number(),
  drawdown: z.number(),
  drawdownPct: z.number(),
});

export type EquityPoint = z.infer<typeof EquityPointSchema>;

export const PeriodMetricsSchema = z.object({
  return: z.number(),
  returnPct: z.number(),
  trades: z.number(),
  winRate: z.number(),
});

export type PeriodMetrics = z.infer<typeof PeriodMetricsSchema>;

export const PerformanceMetricsSchema = z.object({
  periods: z.object({
    today: PeriodMetricsSchema,
    week: PeriodMetricsSchema,
    month: PeriodMetricsSchema,
    ytd: PeriodMetricsSchema,
    total: PeriodMetricsSchema,
  }),
  sharpeRatio: z.number(),
  sortinoRatio: z.number(),
  maxDrawdown: z.number(),
  maxDrawdownPct: z.number(),
  winRate: z.number(),
  profitFactor: z.number(),
  avgWin: z.number(),
  avgLoss: z.number(),
  totalTrades: z.number(),
});

export type PerformanceMetrics = z.infer<typeof PerformanceMetricsSchema>;

// ============================================
// Agents
// ============================================

export const AgentTypeSchema = z.enum([
  "technical",
  "news",
  "fundamentals",
  "bullish",
  "bearish",
  "trader",
  "risk",
  "critic",
]);

export type AgentType = z.infer<typeof AgentTypeSchema>;

export const AgentStatusSchema = z.object({
  type: z.string(),
  displayName: z.string(),
  status: z.enum(["idle", "processing", "error"]),
  lastOutputAt: z.string().nullable(),
  outputsToday: z.number(),
  avgConfidence: z.number(),
  approvalRate: z.number(),
});

export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export const AgentConfigSchema = z.object({
  type: z.string(),
  model: z.string(),
  systemPrompt: z.string(),
  enabled: z.boolean(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// ============================================
// Risk
// ============================================

export const ExposureMetricsSchema = z.object({
  gross: z.object({
    current: z.number(),
    limit: z.number(),
    pct: z.number(),
  }),
  net: z.object({
    current: z.number(),
    limit: z.number(),
    pct: z.number(),
  }),
  long: z.number(),
  short: z.number(),
  concentrationMax: z.object({
    symbol: z.string(),
    pct: z.number(),
  }),
  sectorExposure: z.record(z.string(), z.number()),
});

export type ExposureMetrics = z.infer<typeof ExposureMetricsSchema>;

export const PositionGreeksSchema = z.object({
  symbol: z.string(),
  delta: z.number(),
  gamma: z.number(),
  vega: z.number(),
  theta: z.number(),
});

export type PositionGreeks = z.infer<typeof PositionGreeksSchema>;

export const GreeksSummarySchema = z.object({
  delta: z.object({ current: z.number(), limit: z.number() }),
  gamma: z.object({ current: z.number(), limit: z.number() }),
  vega: z.object({ current: z.number(), limit: z.number() }),
  theta: z.object({ current: z.number(), limit: z.number() }),
  byPosition: z.array(PositionGreeksSchema),
});

export type GreeksSummary = z.infer<typeof GreeksSummarySchema>;

export const CorrelationMatrixSchema = z.object({
  symbols: z.array(z.string()),
  matrix: z.array(z.array(z.number())),
  highCorrelationPairs: z.array(
    z.object({
      a: z.string(),
      b: z.string(),
      correlation: z.number(),
    })
  ),
});

export type CorrelationMatrix = z.infer<typeof CorrelationMatrixSchema>;

export const VaRMethodSchema = z.enum(["historical", "parametric"]);
export type VaRMethod = z.infer<typeof VaRMethodSchema>;

export const VaRMetricsSchema = z.object({
  oneDay95: z.number(),
  oneDay99: z.number(),
  tenDay95: z.number(),
  method: VaRMethodSchema,
});

export type VaRMetrics = z.infer<typeof VaRMetricsSchema>;

export const LimitCategorySchema = z.enum(["per_instrument", "portfolio", "options"]);
export type LimitCategory = z.infer<typeof LimitCategorySchema>;

export const LimitStatusValueSchema = z.enum(["ok", "warning", "critical"]);
export type LimitStatusValue = z.infer<typeof LimitStatusValueSchema>;

export const LimitStatusSchema = z.object({
  name: z.string(),
  category: LimitCategorySchema,
  current: z.number(),
  limit: z.number(),
  utilization: z.number(),
  status: LimitStatusValueSchema,
});

export type LimitStatus = z.infer<typeof LimitStatusSchema>;

// ============================================
// Market Data
// ============================================

export const QuoteSchema = z.object({
  symbol: z.string(),
  bid: z.number(),
  ask: z.number(),
  last: z.number(),
  volume: z.number(),
  timestamp: z.string(),
});

export type Quote = z.infer<typeof QuoteSchema>;

export const CandleSchema = z.object({
  timestamp: z.string(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
});

export type Candle = z.infer<typeof CandleSchema>;

export const IndicatorsSchema = z.object({
  symbol: z.string(),
  timeframe: z.string(),
  rsi14: z.number(),
  atr14: z.number(),
  sma20: z.number(),
  sma50: z.number(),
  sma200: z.number(),
  ema12: z.number(),
  ema26: z.number(),
  macd: z.number(),
  macdSignal: z.number(),
  macdHist: z.number(),
  bbUpper: z.number(),
  bbMiddle: z.number(),
  bbLower: z.number(),
  timestamp: z.string(),
});

export type Indicators = z.infer<typeof IndicatorsSchema>;

export const RegimeSchema = z.object({
  label: z.string(),
  confidence: z.number(),
  indicators: z.object({
    vix: z.number(),
    breadth: z.number(),
    momentum: z.number(),
  }),
  timestamp: z.string(),
});

export type Regime = z.infer<typeof RegimeSchema>;

export const NewsItemSchema = z.object({
  id: z.string(),
  headline: z.string(),
  summary: z.string(),
  source: z.string(),
  url: z.string(),
  symbols: z.array(z.string()),
  sentiment: z.number(),
  publishedAt: z.string(),
});

export type NewsItem = z.infer<typeof NewsItemSchema>;

// ============================================
// Config
// ============================================

export const EnvironmentSchema = z.enum(["BACKTEST", "PAPER", "LIVE"]);
export type Environment = z.infer<typeof EnvironmentSchema>;

export const ConfigSchema = z.object({
  version: z.string(),
  environment: EnvironmentSchema,
  schedule: z
    .object({
      cycleInterval: z.string(),
      marketHoursOnly: z.boolean(),
      timezone: z.string(),
    })
    .optional(),
  universe: z.object({
    sources: z.array(
      z.object({
        type: z.string(),
        index: z.string().optional(),
        symbols: z.array(z.string()).optional(),
      })
    ),
    filters: z.object({
      optionableOnly: z.boolean(),
      minAvgVolume: z.number(),
      minMarketCap: z.number(),
    }),
  }),
  indicators: z.record(z.string(), z.unknown()),
  constraints: z.record(z.string(), z.unknown()),
});

export type Config = z.infer<typeof ConfigSchema>;

export const ConfigHistoryEntrySchema = z.object({
  id: z.string(),
  version: z.string(),
  createdBy: z.string(),
  createdAt: z.string(),
  changes: z.array(z.string()),
});

export type ConfigHistoryEntry = z.infer<typeof ConfigHistoryEntrySchema>;

export const ConstraintsConfigSchema = z.object({
  perInstrument: z.object({
    maxShares: z.number(),
    maxContracts: z.number(),
    maxNotional: z.number(),
    maxPctEquity: z.number(),
  }),
  portfolio: z.object({
    maxGrossExposure: z.number(),
    maxNetExposure: z.number(),
    maxConcentration: z.number(),
    maxDrawdown: z.number(),
  }),
  options: z.object({
    maxDelta: z.number(),
    maxGamma: z.number(),
    maxVega: z.number(),
    maxTheta: z.number(),
  }),
});

export type ConstraintsConfig = z.infer<typeof ConstraintsConfigSchema>;

// ============================================
// Backtest
// ============================================

export const BacktestStatusSchema = z.enum(["pending", "running", "completed", "failed"]);
export type BacktestStatus = z.infer<typeof BacktestStatusSchema>;

export const BacktestSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  status: BacktestStatusSchema,
  startDate: z.string(),
  endDate: z.string(),
  initialCapital: z.number(),
  createdAt: z.string(),
});

export type BacktestSummary = z.infer<typeof BacktestSummarySchema>;

export const BacktestMetricsSchema = z.object({
  totalReturnPct: z.number(),
  sharpeRatio: z.number(),
  maxDrawdownPct: z.number(),
  winRate: z.number(),
  profitFactor: z.number(),
  totalTrades: z.number(),
});

export type BacktestMetrics = z.infer<typeof BacktestMetricsSchema>;

export const BacktestDetailSchema = BacktestSummarySchema.extend({
  metrics: BacktestMetricsSchema.nullable(),
  completedAt: z.string().nullable(),
  error: z.string().nullable(),
});

export type BacktestDetail = z.infer<typeof BacktestDetailSchema>;

export const BacktestTradeActionSchema = z.enum(["BUY", "SELL"]);
export type BacktestTradeAction = z.infer<typeof BacktestTradeActionSchema>;

export const BacktestTradeSchema = z.object({
  id: z.string(),
  backtestId: z.string(),
  timestamp: z.string(),
  symbol: z.string(),
  action: BacktestTradeActionSchema,
  qty: z.number(),
  price: z.number(),
  pnl: z.number().nullable(),
});

export type BacktestTrade = z.infer<typeof BacktestTradeSchema>;

export const BacktestEquityPointSchema = z.object({
  timestamp: z.string(),
  nav: z.number(),
});

export type BacktestEquityPoint = z.infer<typeof BacktestEquityPointSchema>;

// ============================================
// Theses
// ============================================

export const ThesisDirectionSchema = z.enum(["BULLISH", "BEARISH", "NEUTRAL"]);
export type ThesisDirection = z.infer<typeof ThesisDirectionSchema>;

export const ThesisStatusSchema = z.enum(["ACTIVE", "INVALIDATED", "REALIZED"]);
export type ThesisStatus = z.infer<typeof ThesisStatusSchema>;

export const ThesisSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  thesis: z.string(),
  direction: ThesisDirectionSchema,
  status: ThesisStatusSchema,
  timeHorizon: z.string(),
  confidence: z.number(),
  targetPrice: z.number().nullable(),
  stopPrice: z.number().nullable(),
  catalysts: z.array(z.string()),
  agentSource: z.string(),
  pnlPct: z.number().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Thesis = z.infer<typeof ThesisSchema>;

export const ThesisHistoryEntrySchema = z.object({
  id: z.string(),
  thesisId: z.string(),
  field: z.string(),
  oldValue: z.string(),
  newValue: z.string(),
  changedBy: z.string(),
  changedAt: z.string(),
});

export type ThesisHistoryEntry = z.infer<typeof ThesisHistoryEntrySchema>;
