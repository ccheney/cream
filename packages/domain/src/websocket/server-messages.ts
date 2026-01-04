/**
 * Server → Client WebSocket Message Schemas
 *
 * Defines messages sent from the server to the client.
 *
 * @see docs/plans/ui/06-websocket.md lines 63-138
 */

import { z } from "zod/v4";
import { Channel } from "./channel.js";
import {
  QuoteDataSchema,
  OrderDataSchema,
  AgentOutputDataSchema,
  CycleProgressDataSchema,
  AlertDataSchema,
  SystemStatusDataSchema,
  PortfolioDataSchema,
} from "./data-payloads.js";
import { DecisionSchema, DecisionPlanSchema } from "../decision.js";

// ============================================
// Quote Message
// ============================================

/**
 * Real-time quote update.
 *
 * @example
 * { type: "quote", data: { symbol: "AAPL", bid: 185.00, ask: 185.01, ... } }
 */
export const QuoteMessageSchema = z.object({
  type: z.literal("quote"),
  data: QuoteDataSchema,
});

export type QuoteMessage = z.infer<typeof QuoteMessageSchema>;

// ============================================
// Order Message
// ============================================

/**
 * Order status update.
 *
 * @example
 * { type: "order", data: { id: "uuid", symbol: "AAPL", status: "filled", ... } }
 */
export const OrderMessageSchema = z.object({
  type: z.literal("order"),
  data: OrderDataSchema,
});

export type OrderMessage = z.infer<typeof OrderMessageSchema>;

// ============================================
// Decision Message
// ============================================

/**
 * Trading decision from agents.
 *
 * @example
 * { type: "decision", data: { instrument: { ... }, action: "BUY", ... } }
 */
export const DecisionMessageSchema = z.object({
  type: z.literal("decision"),
  /** Full decision from agent network */
  data: DecisionSchema,
  /** Cycle ID */
  cycleId: z.string(),
});

export type DecisionMessage = z.infer<typeof DecisionMessageSchema>;

// ============================================
// Decision Plan Message
// ============================================

/**
 * Full decision plan from a trading cycle.
 *
 * @example
 * { type: "decision_plan", data: { cycleId: "...", decisions: [...] } }
 */
export const DecisionPlanMessageSchema = z.object({
  type: z.literal("decision_plan"),
  data: DecisionPlanSchema,
});

export type DecisionPlanMessage = z.infer<typeof DecisionPlanMessageSchema>;

// ============================================
// Agent Output Message
// ============================================

/**
 * Agent reasoning and output.
 *
 * @example
 * { type: "agent_output", data: { agentType: "trader", status: "complete", ... } }
 */
export const AgentOutputMessageSchema = z.object({
  type: z.literal("agent_output"),
  data: AgentOutputDataSchema,
});

export type AgentOutputMessage = z.infer<typeof AgentOutputMessageSchema>;

// ============================================
// Cycle Progress Message
// ============================================

/**
 * Trading cycle progress update.
 *
 * @example
 * { type: "cycle_progress", data: { phase: "decide", progress: 75, ... } }
 */
export const CycleProgressMessageSchema = z.object({
  type: z.literal("cycle_progress"),
  data: CycleProgressDataSchema,
});

export type CycleProgressMessage = z.infer<typeof CycleProgressMessageSchema>;

// ============================================
// Alert Message
// ============================================

/**
 * System alert or notification.
 *
 * @example
 * { type: "alert", data: { severity: "warning", title: "...", ... } }
 */
export const AlertMessageSchema = z.object({
  type: z.literal("alert"),
  data: AlertDataSchema,
});

export type AlertMessage = z.infer<typeof AlertMessageSchema>;

// ============================================
// System Status Message
// ============================================

/**
 * System health status update.
 *
 * @example
 * { type: "system_status", data: { health: "healthy", ... } }
 */
export const SystemStatusMessageSchema = z.object({
  type: z.literal("system_status"),
  data: SystemStatusDataSchema,
});

export type SystemStatusMessage = z.infer<typeof SystemStatusMessageSchema>;

// ============================================
// Portfolio Message
// ============================================

/**
 * Portfolio summary update.
 *
 * @example
 * { type: "portfolio", data: { totalValue: 100000, ... } }
 */
export const PortfolioMessageSchema = z.object({
  type: z.literal("portfolio"),
  data: PortfolioDataSchema,
});

export type PortfolioMessage = z.infer<typeof PortfolioMessageSchema>;

// ============================================
// Pong Message
// ============================================

/**
 * Heartbeat pong response.
 *
 * @example
 * { type: "pong", timestamp: "2026-01-04T14:00:00Z" }
 */
export const PongMessageSchema = z.object({
  type: z.literal("pong"),
  /** Server timestamp */
  timestamp: z.string().datetime(),
});

export type PongMessage = z.infer<typeof PongMessageSchema>;

// ============================================
// Subscribed Message
// ============================================

/**
 * Confirmation of channel subscription.
 *
 * @example
 * { type: "subscribed", channels: ["quotes", "orders"] }
 */
export const SubscribedMessageSchema = z.object({
  type: z.literal("subscribed"),
  /** Channels successfully subscribed to */
  channels: z.array(Channel),
});

export type SubscribedMessage = z.infer<typeof SubscribedMessageSchema>;

// ============================================
// Unsubscribed Message
// ============================================

/**
 * Confirmation of channel unsubscription.
 *
 * @example
 * { type: "unsubscribed", channels: ["quotes"] }
 */
export const UnsubscribedMessageSchema = z.object({
  type: z.literal("unsubscribed"),
  /** Channels successfully unsubscribed from */
  channels: z.array(Channel),
});

export type UnsubscribedMessage = z.infer<typeof UnsubscribedMessageSchema>;

// ============================================
// Error Message
// ============================================

/**
 * Error response from server.
 *
 * @example
 * { type: "error", code: "INVALID_MESSAGE", message: "..." }
 */
export const ErrorMessageSchema = z.object({
  type: z.literal("error"),
  /** Error code */
  code: z.string(),
  /** Human-readable error message */
  message: z.string(),
  /** Original message that caused error (optional) */
  originalMessage: z.unknown().optional(),
});

export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;

// ============================================
// Server Message Union
// ============================================

/**
 * Discriminated union of all server → client messages.
 */
export const ServerMessageSchema = z.discriminatedUnion("type", [
  QuoteMessageSchema,
  OrderMessageSchema,
  DecisionMessageSchema,
  DecisionPlanMessageSchema,
  AgentOutputMessageSchema,
  CycleProgressMessageSchema,
  AlertMessageSchema,
  SystemStatusMessageSchema,
  PortfolioMessageSchema,
  PongMessageSchema,
  SubscribedMessageSchema,
  UnsubscribedMessageSchema,
  ErrorMessageSchema,
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;
