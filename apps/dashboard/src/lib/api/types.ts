/**
 * API Response Types
 *
 * Type definitions for all dashboard-api endpoints.
 * These mirror the schemas in the API routes.
 *
 * @see docs/plans/ui/05-api-endpoints.md
 */

// ============================================
// Common Types
// ============================================

/**
 * Paginated response wrapper.
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

/**
 * API error response.
 */
export interface ApiErrorResponse {
  error: string;
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

// ============================================
// Auth Types
// ============================================

export type Role = "viewer" | "operator" | "admin";

export interface User {
  id: string;
  email: string;
  role: Role;
}

export interface AuthUser extends User {
  mfaVerified: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  user: User;
  mfaRequired: boolean;
}

export interface SessionResponse {
  authenticated: boolean;
  user?: AuthUser;
}

export interface MFASetupResponse {
  secret: string;
  qrCodeUri: string;
  backupCodes: string[];
}

export interface MFAVerifyRequest {
  code: string;
}

export interface MFAVerifyResponse {
  success: boolean;
  mfaVerified: boolean;
}

// ============================================
// System Types
// ============================================

export type Environment = "BACKTEST" | "PAPER" | "LIVE";
export type SystemStatusType = "ACTIVE" | "PAUSED" | "STOPPED";

export interface Alert {
  id: string;
  severity: "critical" | "warning" | "info";
  type: string;
  message: string;
  details?: Record<string, unknown>;
  acknowledged: boolean;
  createdAt: string;
}

export interface SystemStatus {
  environment: Environment;
  status: SystemStatusType;
  lastCycleId: string | null;
  lastCycleTime: string | null;
  nextCycleTime: string | null;
  positionCount: number;
  openOrderCount: number;
  alerts: Alert[];
}

export interface StartRequest {
  environment?: Environment;
}

export interface StopRequest {
  closeAllPositions?: boolean;
}

export interface EnvironmentRequest {
  environment: Environment;
  confirmLive?: boolean;
}

export interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  services: Record<string, { status: string; latencyMs?: number }>;
  timestamp: string;
}

// ============================================
// Decision Types
// ============================================

export type DecisionAction = "BUY" | "SELL" | "HOLD" | "CLOSE";
export type Direction = "LONG" | "SHORT" | "FLAT";
export type SizeUnit = "SHARES" | "CONTRACTS" | "DOLLARS" | "PCT_EQUITY";
export type DecisionStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXECUTED" | "FAILED";
export type TimeHorizon = "SCALP" | "DAY" | "SWING" | "POSITION";

export interface Decision {
  id: string;
  cycleId: string;
  symbol: string;
  action: DecisionAction;
  direction: Direction;
  size: number;
  sizeUnit: SizeUnit;
  entry: number | null;
  stop: number | null;
  target: number | null;
  status: DecisionStatus;
  consensusCount: number;
  pnl: number | null;
  createdAt: string;
}

export interface AgentOutput {
  agentType: string;
  vote: "APPROVE" | "REJECT";
  confidence: number;
  reasoning: string;
  processingTimeMs: number;
  createdAt: string;
}

export interface Citation {
  id: string;
  url: string;
  title: string;
  source: string;
  snippet: string;
  relevanceScore: number;
  fetchedAt: string;
}

export type OrderStatus =
  | "NEW"
  | "ACCEPTED"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELED"
  | "REJECTED";

export interface ExecutionDetail {
  orderId: string;
  brokerOrderId: string;
  broker: "ALPACA";
  status: OrderStatus;
  filledQty: number;
  avgFillPrice: number;
  slippage: number;
  commissions: number;
  timestamps: {
    submitted: string;
    accepted: string | null;
    filled: string | null;
  };
}

export interface ThesisSummary {
  id: string;
  symbol: string;
  title: string;
}

export interface DecisionDetail extends Decision {
  strategyFamily: string;
  timeHorizon: TimeHorizon;
  rationale: {
    bullishFactors: string[];
    bearishFactors: string[];
  };
  agentOutputs: AgentOutput[];
  citations: Citation[];
  execution: ExecutionDetail | null;
  thesis: ThesisSummary | null;
}

export interface DecisionFilters {
  symbol?: string;
  action?: DecisionAction;
  dateFrom?: string;
  dateTo?: string;
  status?: DecisionStatus;
  limit?: number;
  offset?: number;
}

// ============================================
// Portfolio Types
// ============================================

export interface PortfolioSummary {
  nav: number;
  cash: number;
  equity: number;
  buyingPower: number;
  grossExposure: number;
  netExposure: number;
  positionCount: number;
  todayPnl: number;
  todayPnlPct: number;
  totalPnl: number;
  totalPnlPct: number;
  lastUpdated: string;
}

export interface Position {
  id: string;
  symbol: string;
  side: "LONG" | "SHORT";
  qty: number;
  avgEntry: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  stop: number | null;
  target: number | null;
  thesisId: string | null;
  daysHeld: number;
  openedAt: string;
}

export interface Trade {
  id: string;
  timestamp: string;
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  pnl: number | null;
}

export interface DecisionSummary {
  id: string;
  action: DecisionAction;
  status: DecisionStatus;
  createdAt: string;
}

export interface PositionDetail extends Position {
  trades: Trade[];
  relatedDecisions: DecisionSummary[];
  thesis: ThesisDetail | null;
}

export interface EquityPoint {
  timestamp: string;
  nav: number;
  drawdown: number;
  drawdownPct: number;
}

export interface PeriodMetrics {
  return: number;
  returnPct: number;
  trades: number;
  winRate: number;
}

export interface PerformanceMetrics {
  periods: {
    today: PeriodMetrics;
    week: PeriodMetrics;
    month: PeriodMetrics;
    ytd: PeriodMetrics;
    total: PeriodMetrics;
  };
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  totalTrades: number;
}

// ============================================
// Risk Types
// ============================================

export interface ExposureMetrics {
  gross: { current: number; limit: number; pct: number };
  net: { current: number; limit: number; pct: number };
  long: number;
  short: number;
  concentrationMax: { symbol: string; pct: number };
  sectorExposure: Record<string, number>;
}

export interface PositionGreeks {
  symbol: string;
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
}

export interface GreeksSummary {
  delta: { current: number; limit: number };
  gamma: { current: number; limit: number };
  vega: { current: number; limit: number };
  theta: { current: number; limit: number };
  byPosition: PositionGreeks[];
}

export interface CorrelationMatrix {
  symbols: string[];
  matrix: number[][];
  highCorrelationPairs: Array<{ a: string; b: string; correlation: number }>;
}

export interface VaRMetrics {
  oneDay95: number;
  oneDay99: number;
  tenDay95: number;
  method: "historical" | "parametric";
}

export type LimitStatusType = "ok" | "warning" | "critical";

export interface LimitStatus {
  name: string;
  category: "per_instrument" | "portfolio" | "options";
  current: number;
  limit: number;
  utilization: number;
  status: LimitStatusType;
}

// ============================================
// Agent Types
// ============================================

export type AgentStatusType = "idle" | "processing" | "error";

export interface AgentStatus {
  type: string;
  displayName: string;
  status: AgentStatusType;
  lastOutputAt: string | null;
  outputsToday: number;
  avgConfidence: number;
  approvalRate: number;
}

export interface AgentConfig {
  type: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  enabled: boolean;
}

// ============================================
// Config Types
// ============================================

export interface UniverseSource {
  type: "static" | "index" | "etf_holdings" | "screener";
  symbols?: string[];
  index?: string;
  etf?: string;
  screenerParams?: Record<string, unknown>;
}

export interface UniverseConfig {
  sources: UniverseSource[];
  filters: {
    optionableOnly: boolean;
    minAvgVolume: number;
    minMarketCap: number;
    excludeSectors: string[];
  };
  include: string[];
  exclude: string[];
}

export interface ConstraintsConfig {
  perInstrument: {
    maxShares: number;
    maxContracts: number;
    maxNotional: number;
    maxPctEquity: number;
  };
  portfolio: {
    maxGrossExposure: number;
    maxNetExposure: number;
    maxConcentration: number;
    maxCorrelation: number;
    maxDrawdown: number;
  };
  options: {
    maxDelta: number;
    maxGamma: number;
    maxVega: number;
    maxTheta: number;
  };
}

export interface Configuration {
  version: string;
  environment: Environment;
  universe: UniverseConfig;
  indicators: Record<string, unknown>;
  regime: Record<string, unknown>;
  constraints: ConstraintsConfig;
  options: Record<string, unknown>;
  memory: Record<string, unknown>;
  schedule: Record<string, unknown>;
}

export interface ConfigVersion {
  id: string;
  version: string;
  createdAt: string;
  createdBy: string;
  changes: string[];
}

// ============================================
// Market Types
// ============================================

export interface Quote {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  timestamp: string;
}

export interface Candle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Indicators {
  symbol: string;
  timeframe: string;
  rsi14: number;
  stochK: number;
  stochD: number;
  sma20: number;
  sma50: number;
  sma200: number;
  ema12: number;
  ema26: number;
  atr14: number;
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  macdLine: number;
  macdSignal: number;
  macdHist: number;
}

export type RegimeLabel = "BULL_TREND" | "BEAR_TREND" | "RANGE" | "HIGH_VOL" | "LOW_VOL";

export interface RegimeStatus {
  label: RegimeLabel;
  confidence: number;
  vix: number;
  sectorRotation: Record<string, number>;
  updatedAt: string;
}

export interface NewsItem {
  id: string;
  symbol: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  sentiment: number;
  summary: string | null;
}

export interface OptionQuote {
  symbol: string;
  strike: number;
  expiration: string;
  type: "call" | "put";
  bid: number;
  ask: number;
  last: number;
  volume: number;
  openInterest: number;
  impliedVol: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}

export interface OptionChain {
  underlying: string;
  underlyingPrice: number;
  expirations: string[];
  chains: Record<
    string,
    {
      calls: OptionQuote[];
      puts: OptionQuote[];
    }
  >;
}

export interface IndexQuote {
  symbol: string;
  name: string;
  last: number;
  change: number;
  changePct: number;
  timestamp: string;
}

// ============================================
// Backtest Types
// ============================================

export type BacktestStatus = "pending" | "running" | "completed" | "failed";

export interface BacktestMetrics {
  finalNav: number;
  totalReturn: number;
  totalReturnPct: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  winRate: number;
  profitFactor: number;
  totalTrades: number;
  avgTradeDuration: number;
  bestTrade: { symbol: string; pnl: number };
  worstTrade: { symbol: string; pnl: number };
}

export interface BacktestSummary {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  status: BacktestStatus;
  metrics: BacktestMetrics | null;
  createdAt: string;
}

export interface BacktestDetail extends BacktestSummary {
  config: Configuration;
  errorMessage: string | null;
}

export interface BacktestTrade {
  id: string;
  timestamp: string;
  symbol: string;
  action: "BUY" | "SELL";
  side: "LONG" | "SHORT";
  qty: number;
  price: number;
  pnl: number | null;
  cumulativePnl: number;
}

export interface CreateBacktestRequest {
  name: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  config?: Partial<Configuration>;
}

// ============================================
// Thesis Types
// ============================================

export type ThesisState = "WATCHING" | "ENTERED" | "ADDING" | "MANAGING" | "EXITING" | "CLOSED";
export type ThesisStatus = "ACTIVE" | "INVALIDATED" | "REALIZED" | "EXPIRED";
export type ThesisResult = "WIN" | "LOSS";

export interface ThesisListItem {
  id: string;
  symbol: string;
  title: string;
  state: ThesisState;
  result: ThesisResult | null;
  returnPct: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface StateTransition {
  fromState: string;
  toState: string;
  reason: string;
  timestamp: string;
}

export interface ThesisDetail extends ThesisListItem {
  narrative: string;
  entryTrigger: string;
  invalidation: string;
  bullishFactors: string[];
  bearishFactors: string[];
  positions: Position[];
  decisions: DecisionSummary[];
  stateHistory: StateTransition[];
}

export interface CreateThesisRequest {
  symbol: string;
  title: string;
  narrative: string;
  entryTrigger: string;
  invalidation: string;
  bullishFactors: string[];
  bearishFactors: string[];
}

export interface UpdateThesisRequest {
  title?: string;
  narrative?: string;
  entryTrigger?: string;
  invalidation?: string;
  bullishFactors?: string[];
  bearishFactors?: string[];
}

export interface ThesisTransitionRequest {
  toState: ThesisState;
  reason: string;
}

export interface ThesisFilters {
  symbol?: string;
  state?: ThesisStatus;
  limit?: number;
  offset?: number;
}

// ============================================
// Alert Types
// ============================================

export interface AlertSettings {
  enablePush: boolean;
  enableEmail: boolean;
  emailAddress: string | null;
  criticalOnly: boolean;
  quietHours: { start: string; end: string } | null;
}
