/**
 * Data Provider Clients
 *
 * API clients for market data providers.
 */

// Databento (execution-grade)
export {
  ConnectionState,
  createDatabentoClientFromEnv,
  DatabentoClient,
  type DatabentoClientConfig,
  type DatabentoDataset,
  type DatabentoEvent,
  type DatabentoMessage,
  type DatabentoSchema,
  type EventHandler,
  MBP10MessageSchema,
  type MBP10Message,
  OHLCVMessageSchema,
  type OHLCVMessage,
  QuoteMessageSchema,
  type QuoteMessage,
  type SubscriptionConfig,
  SymbolMappingMessageSchema,
  type SymbolMappingMessage,
  type SymbolType,
  SystemMessageSchema,
  type SystemMessage,
  TradeMessageSchema,
  type TradeMessage,
} from "./databento";

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
