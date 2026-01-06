/**
 * Mastra Configuration
 *
 * For Phase 4, we use a simplified configuration with stub agents.
 * The full Mastra instance with real LLM agents will be added in Phase 8.
 */

import { agents } from "../agents/stub-agents.js";
import { tradingCycleWorkflow } from "../workflows/trading-cycle.js";

/**
 * Simplified Mastra-like interface for Phase 4.
 * Full Mastra integration with LLM agents comes in Phase 8.
 */
export const mastra = {
  agents,
  workflows: {
    tradingCycleWorkflow,
  },

  /**
   * Get a workflow by ID.
   */
  getWorkflow(id: string) {
    if (id === "trading-cycle-workflow") {
      return tradingCycleWorkflow;
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

export { agents, tradingCycleWorkflow };
