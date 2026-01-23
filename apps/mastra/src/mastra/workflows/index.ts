/**
 * Workflow Registry
 *
 * Exports all workflows for Mastra configuration.
 *
 * Workflows:
 * - tradingCycleWorkflow: 8-step OODA loop (observe → orient → grounding →
 *   analysts → debate → trader → consensus → act)
 * - predictionMarketsWorkflow: Kalshi/Polymarket data fetching
 * - macroWatchWorkflow: Overnight macro scanning (news → predictions →
 *   economic → movers → compile newspaper)
 *
 * @see docs/plans/53-mastra-v1-migration.md
 */

// MacroWatch Workflow
export { macroWatchWorkflow } from "./macro-watch/index.js";

// Prediction Markets Workflow
export { predictionMarketsWorkflow } from "./prediction-markets/index.js";
// Trading Cycle Workflow
export { tradingCycleWorkflow } from "./trading-cycle/index.js";
