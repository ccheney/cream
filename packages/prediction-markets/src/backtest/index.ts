/**
 * Backtest Module
 *
 * Historical prediction market data for backtesting and signal analysis.
 *
 * @see docs/plans/18-prediction-markets.md Future Enhancements - Phase 2
 */

export {
  createHistoricalAdapterFromEnv,
  type HistoricalAdapterConfig,
  type HistoricalMarketSnapshot,
  type HistoricalPredictionMarket,
  HistoricalPredictionMarketAdapter,
  type ProbabilityPoint,
  type SignalAccuracyReport,
  type SignalCorrelation,
} from "./historical-adapter";
