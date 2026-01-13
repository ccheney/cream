/**
 * Mastra Configuration
 *
 * Central Mastra instance with registered agents and workflows.
 *
 * Agents: All 9 trading agents (analysts, researchers, trader, approvers, idea/indicator)
 * Workflows: indicatorSynthesis, predictionMarkets (trading cycle TBD)
 *
 * @see docs/plans/21-mastra-workflow-refactor.md
 */

import { Mastra } from "@mastra/core";

import { mastraAgents } from "../agents/mastra-agents.js";
import { agents } from "../agents/stub-agents.js";
import { indicatorSynthesisWorkflow } from "../workflows/indicator-synthesis/index.js";
import { predictionMarketsWorkflow } from "../workflows/prediction-markets.js";
import { tradingCycleWorkflow } from "../workflows/trading-cycle.js";
import { tradingCycleWorkflowV2 } from "../workflows/trading-cycle-v2/index.js";

/**
 * Mastra instance for the trading system.
 *
 * Registered agents (accessible via mastra.getAgent("agent_id")):
 * - news_analyst: News & Sentiment analysis
 * - fundamentals_analyst: Fundamentals & Macro analysis
 * - bullish_researcher: Bull case construction
 * - bearish_researcher: Bear case construction
 * - trader: Decision plan synthesis
 * - risk_manager: Risk validation
 * - critic: Logical consistency check
 * - idea_agent: Alpha factor hypothesis generation
 * - indicator_researcher: Technical indicator formulation
 *
 * Registered workflows:
 * - indicatorSynthesisWorkflow: Autonomous indicator generation
 * - predictionMarketsWorkflow: Prediction market data fetching
 */
export const mastra = new Mastra({
  agents: mastraAgents,
  workflows: {
    indicatorSynthesisWorkflow,
    predictionMarketsWorkflow,
    tradingCycleWorkflowV2,
  },
  bundler: {
    // Externalize packages that shouldn't be bundled by mastra dev
    externals: [
      // Google AI SDK used by @cream/helix
      "@google/genai",
      // Native/binary dependencies
      "@libsql/client",
      "libsql",
      "better-sqlite3",
      // Turso packages
      "@tursodatabase/database",
      "@tursodatabase/sync",
      // Protobuf generated stubs
      "@cream/schema-gen",
    ],
  },
});

// Legacy exports for backwards compatibility
export { agents, indicatorSynthesisWorkflow, predictionMarketsWorkflow, tradingCycleWorkflow };

// New Mastra-native workflow
export { tradingCycleWorkflowV2 };
