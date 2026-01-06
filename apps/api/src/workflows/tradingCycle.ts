/**
 * Trading Cycle Workflow
 *
 * Implements the OODA loop (Observe → Orient → Decide → Act) for trading decisions.
 * Runs hourly, aligned to 1-hour candle closes.
 *
 * Steps:
 * 1. loadState - Load portfolio positions, open orders, thesis states from Turso
 * 2. buildSnapshot - Build feature snapshots for universe symbols
 * 3. retrieveMemory - Fetch relevant memories from HelixDB (similar trades, patterns)
 * 4. gatherExternalContext - Get news, sentiment, macro context
 * 5. runAnalysts - Run Technical, News, Fundamentals analysts in parallel
 * 6. runDebate - Run Bull vs Bear debate agents
 * 7. synthesizePlan - Trader agent creates DecisionPlan
 * 8. validateRisk - Risk Manager validates constraints
 * 9. criticReview - Critic agent reviews for biases
 * 10. executeOrders - Send approved orders to execution engine
 * 11. persistMemory - Store decision + outcome in HelixDB
 */

import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

import { LoadStateOutputSchema, loadStateStep } from "../steps/loadState";

// ============================================
// Step Schemas
// ============================================

const SnapshotOutputSchema = z.object({
  snapshots: z.record(z.string(), z.any()),
  timestamp: z.string(),
  symbolCount: z.number(),
});

const MemoryOutputSchema = z.object({
  similarTrades: z.array(z.any()),
  relevantPatterns: z.array(z.any()),
  recentDecisions: z.array(z.any()),
});

const ExternalContextSchema = z.object({
  news: z.array(z.any()),
  sentiment: z.record(z.string(), z.number()),
  macroIndicators: z.record(z.string(), z.number()),
});

const AnalystOutputSchema = z.object({
  technical: z.any(),
  news: z.any(),
  fundamentals: z.any(),
});

const DebateOutputSchema = z.object({
  bullishCase: z.any(),
  bearishCase: z.any(),
  keyDisagreements: z.array(z.string()),
});

const DecisionPlanSchema = z.object({
  cycleId: z.string(),
  timestamp: z.string(),
  decisions: z.array(
    z.object({
      symbol: z.string(),
      action: z.enum(["BUY", "SELL", "HOLD", "CLOSE"]),
      direction: z.enum(["LONG", "SHORT", "FLAT"]),
      size: z.object({
        value: z.number(),
        unit: z.enum(["SHARES", "CONTRACTS", "DOLLARS", "PCT_EQUITY"]),
      }),
      stopLoss: z.number().optional(),
      takeProfit: z.number().optional(),
      rationale: z.string(),
      confidence: z.number(),
    })
  ),
});

const ValidationResultSchema = z.object({
  approved: z.boolean(),
  violations: z.array(z.string()),
  adjustedPlan: DecisionPlanSchema.optional(),
});

const ExecutionResultSchema = z.object({
  ordersSubmitted: z.number(),
  ordersRejected: z.number(),
  orderIds: z.array(z.string()),
});

// ============================================
// Step Definitions
// ============================================

const buildSnapshotStep = createStep({
  id: "build-snapshot",
  description: "Build feature snapshots for universe symbols",
  inputSchema: LoadStateOutputSchema,
  outputSchema: SnapshotOutputSchema,
  retries: 3,
  execute: async ({ inputData }) => {
    // TODO: Implement actual snapshot building using @cream/marketdata
    return {
      snapshots: {},
      timestamp: new Date().toISOString(),
      symbolCount: 0,
    };
  },
});

const retrieveMemoryStep = createStep({
  id: "retrieve-memory",
  description: "Fetch relevant memories from HelixDB",
  inputSchema: SnapshotOutputSchema,
  outputSchema: MemoryOutputSchema,
  retries: 2,
  execute: async ({ inputData }) => {
    // TODO: Implement HelixDB retrieval using @cream/helix
    return {
      similarTrades: [],
      relevantPatterns: [],
      recentDecisions: [],
    };
  },
});

const gatherExternalContextStep = createStep({
  id: "gather-external-context",
  description: "Get news, sentiment, macro context",
  inputSchema: MemoryOutputSchema,
  outputSchema: ExternalContextSchema,
  retries: 2,
  execute: async ({ inputData }) => {
    // TODO: Implement FMP/Alpha Vantage integration
    return {
      news: [],
      sentiment: {},
      macroIndicators: {},
    };
  },
});

const runAnalystsStep = createStep({
  id: "run-analysts",
  description: "Run Technical, News, Fundamentals analysts in parallel",
  inputSchema: ExternalContextSchema,
  outputSchema: AnalystOutputSchema,
  retries: 2,
  execute: async ({ inputData }) => {
    // TODO: Implement Mastra agent calls
    return {
      technical: { signals: [] },
      news: { summary: "" },
      fundamentals: { metrics: {} },
    };
  },
});

const runDebateStep = createStep({
  id: "run-debate",
  description: "Run Bull vs Bear debate agents",
  inputSchema: AnalystOutputSchema,
  outputSchema: DebateOutputSchema,
  retries: 2,
  execute: async ({ inputData }) => {
    // TODO: Implement debate agent calls
    return {
      bullishCase: {},
      bearishCase: {},
      keyDisagreements: [],
    };
  },
});

const synthesizePlanStep = createStep({
  id: "synthesize-plan",
  description: "Trader agent creates DecisionPlan",
  inputSchema: DebateOutputSchema,
  outputSchema: DecisionPlanSchema,
  retries: 2,
  execute: async ({ inputData }) => {
    // TODO: Implement trader agent synthesis
    return {
      cycleId: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      decisions: [],
    };
  },
});

const validateRiskStep = createStep({
  id: "validate-risk",
  description: "Risk Manager validates constraints",
  inputSchema: DecisionPlanSchema,
  outputSchema: ValidationResultSchema,
  retries: 1,
  execute: async ({ inputData }) => {
    // TODO: Implement risk validation via Rust execution engine
    return {
      approved: true,
      violations: [],
    };
  },
});

const criticReviewStep = createStep({
  id: "critic-review",
  description: "Critic agent reviews for biases",
  inputSchema: ValidationResultSchema,
  outputSchema: ValidationResultSchema,
  retries: 1,
  execute: async ({ inputData }) => {
    // TODO: Implement critic agent review
    return inputData;
  },
});

const executeOrdersStep = createStep({
  id: "execute-orders",
  description: "Send approved orders to execution engine",
  inputSchema: ValidationResultSchema,
  outputSchema: ExecutionResultSchema,
  retries: 1,
  execute: async ({ inputData }) => {
    if (!inputData.approved) {
      return {
        ordersSubmitted: 0,
        ordersRejected: 0,
        orderIds: [],
      };
    }

    // TODO: Implement gRPC call to Rust execution engine
    return {
      ordersSubmitted: 0,
      ordersRejected: 0,
      orderIds: [],
    };
  },
});

const persistMemoryStep = createStep({
  id: "persist-memory",
  description: "Store decision + outcome in HelixDB",
  inputSchema: ExecutionResultSchema,
  outputSchema: z.object({
    persisted: z.boolean(),
    memoryId: z.string().optional(),
  }),
  retries: 3,
  execute: async ({ inputData }) => {
    // TODO: Implement HelixDB persistence
    return {
      persisted: true,
      memoryId: crypto.randomUUID(),
    };
  },
});

// ============================================
// Workflow Definition
// ============================================

export const tradingCycleWorkflow = createWorkflow({
  id: "trading-cycle",
  description: "OODA loop for hourly trading decisions",
  inputSchema: z.object({
    cycleId: z.string(),
    environment: z.enum(["BACKTEST", "PAPER", "LIVE"]),
    triggerTime: z.string(),
  }),
  outputSchema: z.object({
    cycleId: z.string(),
    success: z.boolean(),
    ordersExecuted: z.number(),
    memoryId: z.string().optional(),
  }),
});

// Wire up the steps
tradingCycleWorkflow
  .then(loadStateStep)
  .then(buildSnapshotStep)
  .then(retrieveMemoryStep)
  .then(gatherExternalContextStep)
  .then(runAnalystsStep)
  .then(runDebateStep)
  .then(synthesizePlanStep)
  .then(validateRiskStep)
  .then(criticReviewStep)
  .then(executeOrdersStep)
  .then(persistMemoryStep)
  .commit();

export type TradingCycleInput = z.infer<typeof tradingCycleWorkflow.inputSchema>;
export type TradingCycleOutput = z.infer<typeof tradingCycleWorkflow.outputSchema>;
