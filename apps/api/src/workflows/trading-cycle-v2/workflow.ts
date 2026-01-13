/**
 * Trading Cycle Workflow (Mastra v2)
 *
 * Implements the hourly OODA loop using native Mastra workflow patterns:
 * - OBSERVE: Fetch market snapshot
 * - ORIENT: Load memory context, compute regimes
 * - DECIDE: Run agents (analysts → debate → trader → consensus)
 * - ACT: Submit orders via Rust execution engine
 *
 * Note: This is a simplified initial version. Schema types can be
 * tightened incrementally once the workflow structure is validated.
 *
 * @see docs/plans/21-mastra-workflow-refactor.md
 */

import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

import { WorkflowResultSchema } from "./schemas.js";

// ============================================
// Simplified Step Schemas
// ============================================

const AnyInputSchema = z.any();
const AnyOutputSchema = z.any();
const MinimalStateSchema = z.object({
  cycleId: z.string().optional(),
  mode: z.enum(["STUB", "LLM"]).optional(),
  approved: z.boolean().optional(),
  iterations: z.number().optional(),
});

// ============================================
// Step Definitions (Inline for simplicity)
// ============================================

const observeStep = createStep({
  id: "observe",
  description: "Fetch market snapshot",
  inputSchema: z.object({
    cycleId: z.string(),
    instruments: z.array(z.string()),
  }),
  outputSchema: AnyOutputSchema,
  stateSchema: MinimalStateSchema,
  execute: async ({ inputData, setState }) => {
    // Import dynamically to avoid circular deps
    const { fetchMarketSnapshot } = await import("../steps/trading-cycle/observe.js");
    const snapshot = await fetchMarketSnapshot(inputData.instruments);
    await setState({ cycleId: inputData.cycleId });
    return { snapshot, cycleId: inputData.cycleId, instruments: inputData.instruments };
  },
});

const orientStep = createStep({
  id: "orient",
  description: "Load memory and compute regimes",
  inputSchema: AnyInputSchema,
  outputSchema: AnyOutputSchema,
  stateSchema: MinimalStateSchema,
  execute: async ({ inputData, state, setState }) => {
    // Determine execution mode based on environment
    // BACKTEST always uses STUB (no LLM calls for speed)
    // PAPER/LIVE use LLM (real agent reasoning)
    const env = process.env.CREAM_ENV ?? "BACKTEST";
    const forceStub = inputData.forceStub ?? false;
    const mode = env === "BACKTEST" || forceStub ? "STUB" : "LLM";
    await setState({ ...state, mode });
    return { ...inputData, mode };
  },
});

const analystsStep = createStep({
  id: "analysts",
  description: "Run news and fundamentals analysts",
  inputSchema: AnyInputSchema,
  outputSchema: AnyOutputSchema,
  stateSchema: MinimalStateSchema,
  execute: async ({ inputData, state }) => {
    const mode = state.mode ?? "STUB";
    const symbols = inputData.instruments ?? [];

    if (mode === "STUB") {
      const { runNewsAnalystStub, runFundamentalsAnalystStub } = await import(
        "../steps/trading-cycle/decide.js"
      );
      const [newsAnalysis, fundamentalsAnalysis] = await Promise.all([
        runNewsAnalystStub(symbols),
        runFundamentalsAnalystStub(symbols),
      ]);
      return { ...inputData, newsAnalysis, fundamentalsAnalysis };
    }

    // LLM mode - use real agents
    const { runAnalystsParallel } = await import("../../agents/analysts.js");
    const context = {
      cycleId: inputData.cycleId,
      symbols,
      snapshots: inputData.snapshot ?? {},
      indicators: inputData.snapshot?.indicators ?? {},
      externalContext: inputData.externalContext,
      recentEvents: [],
    };
    const { news, fundamentals } = await runAnalystsParallel(context);
    return { ...inputData, newsAnalysis: news, fundamentalsAnalysis: fundamentals };
  },
});

const debateStep = createStep({
  id: "debate",
  description: "Run bullish and bearish researchers",
  inputSchema: AnyInputSchema,
  outputSchema: AnyOutputSchema,
  stateSchema: MinimalStateSchema,
  execute: async ({ inputData, state }) => {
    const mode = state.mode ?? "STUB";
    const symbols = inputData.instruments ?? [];

    if (mode === "STUB") {
      const { runBullishResearcherStub, runBearishResearcherStub } = await import(
        "../steps/trading-cycle/decide.js"
      );
      const [bullishResearch, bearishResearch] = await Promise.all([
        runBullishResearcherStub(symbols),
        runBearishResearcherStub(symbols),
      ]);
      return { ...inputData, bullishResearch, bearishResearch };
    }

    // LLM mode - use real agents
    const { runDebateParallel } = await import("../../agents/researchers.js");
    const context = {
      cycleId: inputData.cycleId,
      symbols,
      snapshots: inputData.snapshot ?? {},
      indicators: inputData.snapshot?.indicators ?? {},
      externalContext: inputData.externalContext,
      recentEvents: [],
    };
    const analystOutputs = {
      news: inputData.newsAnalysis ?? [],
      fundamentals: inputData.fundamentalsAnalysis ?? [],
    };
    const { bullish, bearish } = await runDebateParallel(context, analystOutputs);
    return { ...inputData, bullishResearch: bullish, bearishResearch: bearish };
  },
});

const traderStep = createStep({
  id: "trader",
  description: "Generate decision plan",
  inputSchema: AnyInputSchema,
  outputSchema: AnyOutputSchema,
  stateSchema: MinimalStateSchema,
  execute: async ({ inputData, state, setState }) => {
    const mode = state.mode ?? "STUB";
    const bullishResearch = inputData.bullishResearch ?? [];
    const bearishResearch = inputData.bearishResearch ?? [];

    if (mode === "STUB") {
      const { runTraderAgentStub } = await import("../steps/trading-cycle/decide.js");
      const decisionPlan = await runTraderAgentStub(
        inputData.cycleId,
        bullishResearch,
        bearishResearch
      );
      await setState({ ...state, iterations: 0 });
      return { ...inputData, decisionPlan };
    }

    // LLM mode - use real trader agent
    const { runTrader } = await import("../../agents/trader.js");
    const context = {
      cycleId: inputData.cycleId,
      symbols: inputData.instruments ?? [],
      snapshots: inputData.snapshot ?? {},
      indicators: inputData.snapshot?.indicators ?? {},
      externalContext: inputData.externalContext,
      recentEvents: [],
    };
    const decisionPlan = await runTrader(context, bullishResearch, bearishResearch);
    await setState({ ...state, iterations: 0 });
    return { ...inputData, decisionPlan };
  },
});

const consensusStep = createStep({
  id: "consensus",
  description: "Run approval agents",
  inputSchema: AnyInputSchema,
  outputSchema: z
    .object({
      approved: z.boolean(),
      iterations: z.number(),
    })
    .passthrough(),
  stateSchema: MinimalStateSchema,
  execute: async ({ inputData, state, setState }) => {
    const mode = state.mode ?? "STUB";
    const decisions = inputData.decisionPlan?.decisions ?? [];
    const iterations = (state.iterations ?? 0) + 1;

    if (mode === "STUB") {
      const { runRiskManagerStub, runCriticStub } = await import(
        "../steps/trading-cycle/decide.js"
      );
      const [riskApproval, criticApproval] = await Promise.all([
        runRiskManagerStub(decisions),
        runCriticStub(decisions),
      ]);
      const approved = riskApproval.verdict === "APPROVE" && criticApproval.verdict === "APPROVE";
      await setState({ ...state, approved, iterations });
      return { ...inputData, approved, iterations, riskApproval, criticApproval };
    }

    // LLM mode - use real approval agents
    const { runApprovalParallel } = await import("../../agents/approvers.js");
    const analystOutputs = {
      news: inputData.newsAnalysis ?? [],
      fundamentals: inputData.fundamentalsAnalysis ?? [],
    };
    const debateOutputs = {
      bullish: inputData.bullishResearch ?? [],
      bearish: inputData.bearishResearch ?? [],
    };
    const { riskManager, critic } = await runApprovalParallel(
      inputData.decisionPlan,
      analystOutputs,
      debateOutputs
    );
    const approved = riskManager.verdict === "APPROVE" && critic.verdict === "APPROVE";
    await setState({ ...state, approved, iterations });
    return {
      ...inputData,
      approved,
      iterations,
      riskApproval: riskManager,
      criticApproval: critic,
    };
  },
});

const actStep = createStep({
  id: "act",
  description: "Submit orders",
  inputSchema: AnyInputSchema,
  outputSchema: WorkflowResultSchema,
  stateSchema: MinimalStateSchema,
  execute: async ({ inputData, state }) => {
    const { checkConstraints, submitOrders } = await import("../steps/trading-cycle/act.js");
    const approved = inputData.approved ?? false;
    const decisionPlan = inputData.decisionPlan;

    let orderSubmission = { submitted: false, orderIds: [] as string[], errors: [] as string[] };

    if (approved && decisionPlan) {
      const constraintCheck = await checkConstraints(approved, decisionPlan);
      if (constraintCheck.passed) {
        orderSubmission = await submitOrders(true, decisionPlan, inputData.cycleId);
      } else {
        orderSubmission.errors = constraintCheck.violations;
      }
    }

    return {
      cycleId: inputData.cycleId,
      approved,
      iterations: state.iterations ?? 1,
      orderSubmission,
      mode: state.mode ?? "STUB",
      configVersion: null,
    };
  },
});

// ============================================
// Workflow Definition
// ============================================

export const tradingCycleWorkflowV2 = createWorkflow({
  id: "trading-cycle-v2",
  description: "Hourly OODA trading cycle with 8-agent consensus",
  inputSchema: z.object({
    cycleId: z.string(),
    instruments: z.array(z.string()).default(["AAPL", "MSFT", "GOOGL"]),
    forceStub: z.boolean().optional(),
  }),
  outputSchema: WorkflowResultSchema,
  stateSchema: MinimalStateSchema,
});

// Wire steps sequentially (simplified from original plan)
tradingCycleWorkflowV2
  .then(observeStep)
  .then(orientStep)
  .then(analystsStep)
  .then(debateStep)
  .then(traderStep)
  .then(consensusStep)
  .then(actStep)
  .commit();

// ============================================
// Exports
// ============================================

export type { WorkflowInput, WorkflowResult } from "./schemas.js";
