/**
 * Backtest Module
 *
 * Historical prediction market data for backtesting and signal analysis.
 *
 * @see docs/plans/18-prediction-markets.md Future Enhancements - Phase 2
 */

export {
  createHistoricalAdapter,
  createHistoricalAdapterFromEnv,
  type HistoricalAdapterConfig,
  type HistoricalMarketSnapshot,
  type HistoricalPredictionMarket,
  HistoricalPredictionMarketAdapter,
  type MarketResolution,
  type ProbabilityPoint,
  type SignalAccuracyReport,
  type SignalCorrelation,
} from "./historical-adapter.js";
