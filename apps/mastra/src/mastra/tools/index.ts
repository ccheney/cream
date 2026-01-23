/**
 * Tool Registry
 *
 * Exports all tools for agent configuration.
 * Tools are migrated from packages/agents to this location.
 */

// Indicator tools
export { recalcIndicator } from "./indicators/index.js";
// Market data tools
export {
	getGreeks,
	getMarketSnapshots as getMarketSnapshotsMarketData,
	getQuotes,
	optionChain,
} from "./market-data/index.js";
// Portfolio tools
export {
	getEnrichedPortfolioState,
	getPortfolioState,
} from "./portfolio/index.js";
// Prediction markets tools
export {
	getMarketSnapshots,
	type PredictionMarketsToolRepo,
	setPredictionMarketsRepositoryProvider,
} from "./prediction-markets/index.js";
