/**
 * Tool Registry
 *
 * Exports all tools for agent configuration.
 * Tools are migrated from packages/agents to this location.
 */

// Academic paper tools
export { searchAcademicPapers, searchExternalPapers } from "./academic/index.js";

// External context tools
export { analyzeContent, extractNewsContext } from "./external-context/index.js";

// FRED tools
export { fredEconomicCalendar } from "./fred/index.js";

// GraphRAG tools
export { graphragQuery } from "./graphrag/index.js";

// Helix tools
export { helixQuery } from "./helix/index.js";

// Indicator tools
export { recalcIndicator } from "./indicators/index.js";

// Market data tools
export { getGreeks, getQuotes, optionChain } from "./market-data/index.js";

// Portfolio tools
export { getEnrichedPortfolioState, getPortfolioState } from "./portfolio/index.js";

// Prediction markets tools
export {
	getMarketSnapshots,
	getPredictionMarketsRepo,
	getPredictionSignals,
	type PredictionMarketsToolRepo,
	type PredictionSignal,
	setPredictionMarketsRepositoryProvider,
} from "./prediction-markets/index.js";
