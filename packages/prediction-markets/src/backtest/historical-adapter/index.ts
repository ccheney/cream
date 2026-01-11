/**
 * Historical Prediction Market Adapter
 * @module
 */

export { HistoricalPredictionMarketAdapter } from "./adapter.js";
export { createHistoricalAdapter, createHistoricalAdapterFromEnv } from "./factory.js";
export {
  calculateBrierScore,
  calculateCalibration,
  calculateCorrelation,
  calculatePValue,
  type PredictionDataPoint,
} from "./statistics.js";
export type {
  HistoricalAdapterConfig,
  HistoricalMarketSnapshot,
  HistoricalPredictionMarket,
  MarketResolution,
  ProbabilityPoint,
  SignalAccuracyReport,
  SignalCorrelation,
} from "./types.js";
