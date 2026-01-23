/**
 * Workflow Registry
 *
 * Exports all workflows for Mastra configuration.
 *
 * NOTE: Workflows are currently defined in apps/api and will be migrated
 * incrementally. This registry serves as the target location.
 *
 * Pending Migrations:
 * - tradingCycleWorkflow: 8-step OODA loop (observe → orient → grounding →
 *   analysts → debate → trader → consensus → act)
 * - predictionMarketsWorkflow: Kalshi/Polymarket data fetching
 * - macroWatchWorkflow: Overnight macro scanning (news → predictions →
 *   economic → movers → compile newspaper)
 *
 * @see docs/plans/53-mastra-v1-migration.md
 */

// Trading Cycle Workflow
export { tradingCycleWorkflow } from "./trading-cycle/index.js";

// Prediction Markets Workflow
// TODO: Migrate from apps/api/src/mastra/workflows/prediction-markets.ts
// export { predictionMarketsWorkflow } from "./prediction-markets/workflow.js";

// MacroWatch Workflow
export { macroWatchWorkflow } from "./macro-watch/index.js";

// Temporary placeholder export to make this module valid
export const WORKFLOWS_PENDING_MIGRATION = ["predictionMarketsWorkflow"] as const;
