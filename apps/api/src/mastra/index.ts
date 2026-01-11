/**
 * Mastra Configuration
 *
 * Provides workflow and agent exports for the trading system.
 *
 * The step-based Mastra workflow is under development in tradingCycle.ts.
 * Currently using the inline implementation (trading-cycle.ts) for production.
 *
 * @see docs/plans/21-mastra-workflow-refactor.md
 */

import { agents } from "../agents/stub-agents.js";
import { predictionMarketsWorkflow } from "../workflows/prediction-markets.js";
import { tradingCycleWorkflow } from "../workflows/trading-cycle.js";

/**
 * Simplified Mastra-like interface for Phase 4.
 * Full Mastra integration with LLM agents comes in Phase 8.
 */
export const mastra = {
  agents,
  workflows: {
    tradingCycleWorkflow,
    predictionMarketsWorkflow,
  },

  /**
   * Get a workflow by ID.
   */
  getWorkflow(id: string) {
    if (id === "trading-cycle-workflow") {
      return tradingCycleWorkflow;
    }
    if (id === "prediction-markets") {
      return predictionMarketsWorkflow;
    }
    throw new Error(`Unknown workflow: ${id}`);
  },

  /**
   * Get an agent by ID.
   */
  getAgent(id: string) {
    const agent = Object.values(agents).find((a) => a.id === id);
    if (!agent) {
      throw new Error(`Unknown agent: ${id}`);
    }
    return agent;
  },
};

export { agents, predictionMarketsWorkflow, tradingCycleWorkflow };
