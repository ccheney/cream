/**
 * @cream/mastra - Mastra v1 Trading Agents and Workflows
 *
 * This package exports the Mastra instance and workflows for use by consumers.
 * The server entry point is at ./server.ts
 *
 * @see docs/plans/53-mastra-v1-migration.md
 */

export { mastra } from "./mastra/index.js";

// Export workflows for direct use by consumers (e.g., dashboard-api)
export {
	macroWatchWorkflow,
	predictionMarketsWorkflow,
	tradingCycleWorkflow,
} from "./mastra/workflows/index.js";
