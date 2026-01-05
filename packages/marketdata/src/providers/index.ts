/**
 * Data Provider Clients
 *
 * API clients for market data providers.
 */

// FMP (Financial Modeling Prep)
export {
  createFmpClientFromEnv,
  type EarningsTranscript,
  EarningsTranscriptSchema,
  FMP_RATE_LIMITS,
  FmpClient,
  type FmpClientConfig,
  type IndexConstituent,
  IndexConstituentSchema,
  type Quote,
  QuoteSchema,
  type SecFiling,
  SecFilingSchema,
  type SentimentRating,
  SentimentRatingSchema,
  type StockNews,
  StockNewsSchema,
} from "./fmp";

// Polygon.io / Massive.com
export {
  type AggregateBar,
  AggregateBarSchema,
  type AggregatesResponse,
  AggregatesResponseSchema,
  createPolygonClientFromEnv,
  type OptionChainResponse,
  OptionChainResponseSchema,
  type OptionContract,
  OptionContractSchema,
  POLYGON_RATE_LIMITS,
  PolygonClient,
  type PolygonClientConfig,
  type Snapshot,
  SnapshotSchema,
  type TickersSnapshotResponse,
  TickersSnapshotResponseSchema,
  type Timespan,
} from "./polygon";

// Alpha Vantage
export {
  ALPHA_VANTAGE_RATE_LIMITS,
  AlphaVantageClient,
  type AlphaVantageClientConfig,
  createAlphaVantageClientFromEnv,
  type EconomicDataPoint,
  EconomicDataPointSchema,
  type EconomicIndicatorResponse,
  EconomicIndicatorResponseSchema,
  type EconomicInterval,
  type FederalFundsRateResponse,
  FederalFundsRateResponseSchema,
  type TreasuryMaturity,
  type TreasuryYieldResponse,
  TreasuryYieldResponseSchema,
} from "./alphavantage";
