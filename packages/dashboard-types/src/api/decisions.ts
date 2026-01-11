/**
 * Decision API Types
 *
 * Types for trading decisions, agent outputs, citations, and execution details.
 */

import { z } from "zod";

// ============================================
// Decision Enums
// ============================================

export const DecisionActionSchema = z.enum(["BUY", "SELL", "HOLD", "CLOSE"]);
export type DecisionAction = z.infer<typeof DecisionActionSchema>;

export const DecisionDirectionSchema = z.enum(["LONG", "SHORT", "FLAT"]);
export type DecisionDirection = z.infer<typeof DecisionDirectionSchema>;

export const SizeUnitSchema = z.enum(["SHARES", "CONTRACTS", "DOLLARS", "PCT_EQUITY"]);
export type SizeUnit = z.infer<typeof SizeUnitSchema>;

export const DecisionStatusSchema = z.enum([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "EXECUTED",
  "FAILED",
]);
export type DecisionStatus = z.infer<typeof DecisionStatusSchema>;

// ============================================
// Decision Schema
// ============================================

export const DecisionSchema = z.object({
  id: z.string(),
  cycleId: z.string(),
  symbol: z.string(),
  action: DecisionActionSchema,
  direction: DecisionDirectionSchema,
  size: z.number(),
  sizeUnit: SizeUnitSchema,
  entryPrice: z.number().nullable(),
  stopPrice: z.number().nullable(),
  targetPrice: z.number().nullable(),
  status: DecisionStatusSchema,
  confidenceScore: z.number().nullable(),
  createdAt: z.string(),
});

export type Decision = z.infer<typeof DecisionSchema>;

// ============================================
// Agent Outputs
// ============================================

export const AgentOutputSchema = z.object({
  agentType: z.string(),
  vote: z.enum(["APPROVE", "REJECT"]),
  confidence: z.number(),
  reasoning: z.string(),
  processingTimeMs: z.number(),
  createdAt: z.string(),
});

export type AgentOutput = z.infer<typeof AgentOutputSchema>;

// ============================================
// Citations
// ============================================

export const CitationSchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string(),
  source: z.string(),
  snippet: z.string(),
  relevanceScore: z.number(),
  fetchedAt: z.string(),
});

export type Citation = z.infer<typeof CitationSchema>;

// ============================================
// Execution Details
// ============================================

export const ExecutionDetailSchema = z.object({
  orderId: z.string(),
  brokerOrderId: z.string().nullable(),
  broker: z.string(),
  status: z.string(),
  filledQty: z.number(),
  avgFillPrice: z.number().nullable(),
  slippage: z.number().nullable(),
  commissions: z.number().nullable(),
  timestamps: z.object({
    submitted: z.string(),
    accepted: z.string().nullable(),
    filled: z.string().nullable(),
  }),
});

export type ExecutionDetail = z.infer<typeof ExecutionDetailSchema>;

// ============================================
// Decision Detail (Extended)
// ============================================

export const DecisionDetailSchema = DecisionSchema.extend({
  strategyFamily: z.string().nullable(),
  timeHorizon: z.string().nullable(),
  rationale: z.string().nullable(),
  bullishFactors: z.array(z.string()),
  bearishFactors: z.array(z.string()),
  agentOutputs: z.array(AgentOutputSchema),
  citations: z.array(CitationSchema),
  execution: ExecutionDetailSchema.nullable(),
});

export type DecisionDetail = z.infer<typeof DecisionDetailSchema>;

// ============================================
// Pagination
// ============================================

export const PaginatedDecisionsSchema = z.object({
  decisions: z.array(DecisionSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

export type PaginatedDecisions = z.infer<typeof PaginatedDecisionsSchema>;
