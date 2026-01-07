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

// Import implemented steps
import { buildSnapshotStep } from "../steps/buildSnapshot.js";
import { executeOrdersStep } from "../steps/executeOrders.js";
import {
  ExternalContextSchema,
  gatherExternalContextStep,
} from "../steps/gatherExternalContext.js";
import { loadStateStep } from "../steps/loadState.js";
import { persistMemoryStep } from "../steps/persistMemory.js";
import { retrieveMemoryStep } from "../steps/retrieveMemory.js";

// ============================================
// Step Schemas (for agent steps that remain stubs)
// ============================================

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

// ============================================
// Agent Steps (remain stubs - implemented in trading-cycle.ts)
// ============================================

const runAnalystsStep = createStep({
  id: "run-analysts",
  description: "Run Technical, News, Fundamentals analysts in parallel",
  inputSchema: ExternalContextSchema,
  outputSchema: AnalystOutputSchema,
  retries: 2,
  execute: async ({ inputData: _inputData }) => {
    // Agent implementation in trading-cycle.ts via Mastra agents
    // This workflow uses the simpler createWorkflow API
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
  execute: async ({ inputData: _inputData }) => {
    // Agent implementation in trading-cycle.ts via Mastra agents
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
  execute: async ({ inputData: _inputData }) => {
    // Agent implementation in trading-cycle.ts via Mastra agents
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
  execute: async ({ inputData: _inputData }) => {
    // Agent implementation in trading-cycle.ts via Mastra agents
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
    // Agent implementation in trading-cycle.ts via Mastra agents
    return inputData;
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
