/**
 * Trading Cycle Workflow v2
 *
 * Mastra-native trading cycle implementation using createWorkflow().
 * Replaces the inline implementation in trading-cycle.ts.
 *
 * Features:
 * - Sequential OODA loop: Observe → Orient → Analysts → Debate → Trader → Consensus → Act
 * - Uses Mastra workflow primitives (.then() chaining)
 * - State management via MinimalStateSchema
 * - Currently runs in STUB mode only (LLM mode TBD)
 *
 * @see docs/plans/21-mastra-workflow-refactor.md
 */

export type { WorkflowInput, WorkflowResult } from "./schemas.js";
export { WorkflowInputSchema, WorkflowResultSchema } from "./schemas.js";
export { tradingCycleWorkflowV2 } from "./workflow.js";
