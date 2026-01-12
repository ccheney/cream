/**
 * Market data types (quotes, candles, indicators, options).
 */

// Re-export IndicatorSnapshot types from @cream/dashboard-types
export type {
  CorporateIndicators,
  DataQuality,
  EarningsQuality,
  IndicatorSnapshot,
  LiquidityIndicators,
  MarketContext,
  OptionsIndicators,
  PriceIndicators,
  QualityIndicators,
  SentimentClassification,
  SentimentIndicators,
  ShortInterestIndicators,
  SnapshotMetadata,
  ValueIndicators,
} from "@cream/dashboard-types";

export interface Quote {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  timestamp: string;
  bidSize?: number;
  askSize?: number;
  prevClose?: number;
  changePercent?: number;
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

export interface OptionsContract {
  symbol: string;
  bid: number | null;
  ask: number | null;
  last: number | null;
  volume: number | null;
  openInterest: number | null;
  impliedVolatility: number | null;
}

export interface OptionsChainRow {
  strike: number;
  call: OptionsContract | null;
  put: OptionsContract | null;
}

export interface OptionsChainResponse {
  underlying: string;
  underlyingPrice: number | null;
  expirations: string[];
  atmStrike: number | null;
  chain: OptionsChainRow[];
}

export interface ExpirationInfo {
  date: string;
  dte: number;
  type: "weekly" | "monthly" | "quarterly";
}

export interface ExpirationsResponse {
  underlying: string;
  expirations: ExpirationInfo[];
}

export interface OptionsGreeks {
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
}

export interface OptionsQuoteDetail {
  symbol: string;
  underlying: string;
  expiration: string;
  strike: number;
  right: "CALL" | "PUT";
  bid: number | null;
  ask: number | null;
  last: number | null;
  volume: number | null;
  openInterest: number | null;
  impliedVolatility: number | null;
  greeks: OptionsGreeks;
}

export interface IndexQuote {
  symbol: string;
  name: string;
  last: number;
  change: number;
  changePct: number;
  timestamp: string;
}

export type ImpactLevel = "high" | "medium" | "low";

export interface EconomicEvent {
  id: string;
  name: string;
  date: string;
  time: string;
  country: string;
  impact: ImpactLevel;
  actual: string | null;
  previous: string | null;
  forecast: string | null;
  unit: string | null;
}

export interface EconomicCalendarResponse {
  events: EconomicEvent[];
  meta: {
    start: string;
    end: string;
    count: number;
    lastUpdated: string;
  };
}

export interface HistoricalObservation {
  date: string;
  value: number;
}

export interface EventHistoryResponse {
  seriesId: string;
  seriesName: string;
  unit: string;
  observations: HistoricalObservation[];
}
