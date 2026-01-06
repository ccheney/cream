/**
 * Dashboard WebSocket Types
 *
 * Shared types for real-time WebSocket communication between
 * dashboard-api and dashboard frontend.
 */

import { z } from "zod";

// ============================================
// Message Types
// ============================================

export const WSMessageTypeSchema = z.enum([
  "quote",
  "order",
  "decision",
  "agent",
  "cycle",
  "alert",
  "system",
  "heartbeat",
]);

export type WSMessageType = z.infer<typeof WSMessageTypeSchema>;

// ============================================
// Payload Schemas
// ============================================

export const QuoteDataSchema = z.object({
  symbol: z.string(),
  bid: z.number(),
  ask: z.number(),
  last: z.number(),
  volume: z.number(),
  change: z.number(),
  changePct: z.number(),
});

export type QuoteData = z.infer<typeof QuoteDataSchema>;

export const OrderDataSchema = z.object({
  orderId: z.string(),
  symbol: z.string(),
  side: z.enum(["BUY", "SELL"]),
  status: z.enum(["pending", "submitted", "filled", "cancelled", "rejected"]),
  qty: z.number(),
  filledQty: z.number(),
  price: z.number().nullable(),
  avgFillPrice: z.number().nullable(),
});

export type OrderData = z.infer<typeof OrderDataSchema>;

export const DecisionDataSchema = z.object({
  decisionId: z.string(),
  symbol: z.string(),
  action: z.enum(["BUY", "SELL", "HOLD", "CLOSE"]),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "EXECUTED", "FAILED"]),
  confidence: z.number().nullable(),
});

export type DecisionData = z.infer<typeof DecisionDataSchema>;

export const AgentOutputDataSchema = z.object({
  agentType: z.string(),
  decisionId: z.string(),
  vote: z.enum(["APPROVE", "REJECT"]),
  confidence: z.number(),
  processingTimeMs: z.number(),
});

export type AgentOutputData = z.infer<typeof AgentOutputDataSchema>;

export const CycleProgressDataSchema = z.object({
  cycleId: z.string(),
  phase: z.enum(["observe", "orient", "decide", "act", "complete"]),
  progress: z.number(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
});

export type CycleProgressData = z.infer<typeof CycleProgressDataSchema>;

export const AlertDataSchema = z.object({
  alertId: z.string(),
  severity: z.enum(["info", "warning", "error", "critical"]),
  message: z.string(),
  source: z.string(),
});

export type AlertData = z.infer<typeof AlertDataSchema>;

export const SystemDataSchema = z.object({
  status: z.enum(["running", "paused", "stopped", "error"]),
  message: z.string().optional(),
});

export type SystemData = z.infer<typeof SystemDataSchema>;

// ============================================
// Main Message Schema
// ============================================

export const WSMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("quote"),
    data: QuoteDataSchema,
    timestamp: z.string(),
  }),
  z.object({
    type: z.literal("order"),
    data: OrderDataSchema,
    timestamp: z.string(),
  }),
  z.object({
    type: z.literal("decision"),
    data: DecisionDataSchema,
    timestamp: z.string(),
  }),
  z.object({
    type: z.literal("agent"),
    data: AgentOutputDataSchema,
    timestamp: z.string(),
  }),
  z.object({
    type: z.literal("cycle"),
    data: CycleProgressDataSchema,
    timestamp: z.string(),
  }),
  z.object({
    type: z.literal("alert"),
    data: AlertDataSchema,
    timestamp: z.string(),
  }),
  z.object({
    type: z.literal("system"),
    data: SystemDataSchema,
    timestamp: z.string(),
  }),
  z.object({
    type: z.literal("heartbeat"),
    data: z.object({}),
    timestamp: z.string(),
  }),
]);

export type WSMessage = z.infer<typeof WSMessageSchema>;

// ============================================
// Helper Types
// ============================================

/** Extract data type for a specific message type */
export type WSMessageData<T extends WSMessageType> = Extract<WSMessage, { type: T }>["data"];

/** Union of all possible data payloads */
export type AnyWSData =
  | QuoteData
  | OrderData
  | DecisionData
  | AgentOutputData
  | CycleProgressData
  | AlertData
  | SystemData;
