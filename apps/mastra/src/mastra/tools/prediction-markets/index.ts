/**
 * Prediction Markets Tools
 *
 * Tools for querying prediction market data including
 * market snapshots and derived signals.
 */

export {
	getMarketSnapshots,
	getPredictionMarketsRepo,
	type PredictionMarketsToolRepo,
	type PredictionSignal,
	setPredictionMarketsRepositoryProvider,
} from "./get-market-snapshots.js";
export { getPredictionSignals } from "./get-prediction-signals.js";
