/**
 * Mastra Configuration
 *
 * Central Mastra instance with registered agents and workflows.
 *
 * Agents: All 9 trading agents (analysts, researchers, trader, approvers, idea/indicator)
 * Workflows: tradingCycle, indicatorSynthesis, predictionMarkets
 *
 * @see docs/plans/21-mastra-workflow-refactor.md
 */

import { Mastra } from "@mastra/core";

import { mastraAgents } from "../agents/mastra-agents.js";
import { agents } from "../agents/stub-agents.js";
import { indicatorSynthesisWorkflow } from "../workflows/indicator-synthesis/index.js";
import { predictionMarketsWorkflow } from "../workflows/prediction-markets.js";
import { tradingCycleWorkflow } from "../workflows/trading-cycle-v2/index.js";

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
    tradingCycleWorkflow,
    indicatorSynthesisWorkflow,
    predictionMarketsWorkflow,
  },
  bundler: {
    // Workspace packages to transpile (must match package.json names exactly)
    transpilePackages: [
      "@cream/broker",
      "@cream/config",
      "@cream/domain",
      "@cream/logger",
      "@cream/external-context",
      "@cream/helix",
      "@cream/helix-schema",
      "@cream/indicators",
      "@cream/marketdata",
      "@cream/mastra-kit",
      "@cream/prediction-markets",
      "@cream/regime",
      "@cream/storage",
      "@cream/universe",
    ],
    // Externalize packages resolved at runtime (exact names, no globs)
    externals: [
      // Protobuf packages - proto has no JS, schema-gen is pre-compiled
      "@cream/proto",
      "@cream/schema-gen",
      "@bufbuild/protobuf",
      "@connectrpc/connect",
      "@connectrpc/connect-node",
      // Google AI SDK
      "@google/genai",
      // Native/binary dependencies
      "@libsql/client",
      "libsql",
      "better-sqlite3",
      // Turso packages
      "@tursodatabase/database",
      "@tursodatabase/sync",
    ],
    sourcemap: true,
  },
});

// Exports
export { agents, indicatorSynthesisWorkflow, predictionMarketsWorkflow, tradingCycleWorkflow };
