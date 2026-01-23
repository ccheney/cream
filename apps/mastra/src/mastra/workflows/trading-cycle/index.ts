/**
 * Trading Cycle Workflow
 *
 * OODA loop for hourly trading decisions.
 *
 * Steps:
 * 1. observe - Fetch market snapshot
 * 2. orient - Load memory, compute regimes, fetch prediction signals
 * 3. grounding - Run web grounding agent for real-time context
 * 4. analysts - Run news analyst and fundamentals analyst in parallel
 * 5. debate - Run bullish and bearish researchers in parallel
 * 6. trader - Synthesize into decision plan
 * 7. consensus - Run risk_manager and critic agents
 * 8. act - Execute approved decisions
 *
 * @see docs/plans/53-mastra-v1-migration.md
 */

// Export schemas
export * from "./schemas.js";

// Export steps
export * from "./steps/index.js";

// TODO: Export workflow definition once all steps are migrated
// export { tradingCycleWorkflow } from "./workflow.js";
