/**
 * Client → Server WebSocket Message Schemas
 *
 * Defines messages sent from the client to the server.
 *
 * @see docs/plans/ui/06-websocket.md lines 36-58
 */

import { z } from "zod/v4";
import { Channel } from "./channel.js";

// ============================================
// Subscribe Message
// ============================================

/**
 * Subscribe to one or more channels.
 *
 * @example
 * { type: "subscribe", channels: ["quotes", "orders"] }
 */
export const SubscribeMessageSchema = z.object({
  type: z.literal("subscribe"),
  /** Channels to subscribe to */
  channels: z.array(Channel).min(1),
});

export type SubscribeMessage = z.infer<typeof SubscribeMessageSchema>;

// ============================================
// Unsubscribe Message
// ============================================

/**
 * Unsubscribe from one or more channels.
 *
 * @example
 * { type: "unsubscribe", channels: ["quotes"] }
 */
export const UnsubscribeMessageSchema = z.object({
  type: z.literal("unsubscribe"),
  /** Channels to unsubscribe from */
  channels: z.array(Channel).min(1),
});

export type UnsubscribeMessage = z.infer<typeof UnsubscribeMessageSchema>;

// ============================================
// Subscribe Symbols Message
// ============================================

/**
 * Subscribe to quote updates for specific symbols.
 *
 * @example
 * { type: "subscribe_symbols", symbols: ["AAPL", "MSFT", "GOOGL"] }
 */
export const SubscribeSymbolsMessageSchema = z.object({
  type: z.literal("subscribe_symbols"),
  /** Symbols to subscribe to (max 100) */
  symbols: z.array(z.string().min(1).max(20)).min(1).max(100),
});

export type SubscribeSymbolsMessage = z.infer<typeof SubscribeSymbolsMessageSchema>;

// ============================================
// Unsubscribe Symbols Message
// ============================================

/**
 * Unsubscribe from quote updates for specific symbols.
 *
 * @example
 * { type: "unsubscribe_symbols", symbols: ["AAPL"] }
 */
export const UnsubscribeSymbolsMessageSchema = z.object({
  type: z.literal("unsubscribe_symbols"),
  /** Symbols to unsubscribe from */
  symbols: z.array(z.string().min(1).max(20)).min(1).max(100),
});

export type UnsubscribeSymbolsMessage = z.infer<typeof UnsubscribeSymbolsMessageSchema>;

// ============================================
// Ping Message
// ============================================

/**
 * Heartbeat ping to keep connection alive.
 *
 * @example
 * { type: "ping" }
 */
export const PingMessageSchema = z.object({
  type: z.literal("ping"),
});

export type PingMessage = z.infer<typeof PingMessageSchema>;

// ============================================
// Request State Message
// ============================================

/**
 * Request current state for a channel.
 *
 * @example
 * { type: "request_state", channel: "portfolio" }
 */
export const RequestStateMessageSchema = z.object({
  type: z.literal("request_state"),
  /** Channel to request state for */
  channel: Channel,
});

export type RequestStateMessage = z.infer<typeof RequestStateMessageSchema>;

// ============================================
// Acknowledge Alert Message
// ============================================

/**
 * Acknowledge an alert.
 *
 * @example
 * { type: "acknowledge_alert", alertId: "uuid-here" }
 */
export const AcknowledgeAlertMessageSchema = z.object({
  type: z.literal("acknowledge_alert"),
  /** Alert ID to acknowledge */
  alertId: z.string().uuid(),
});

export type AcknowledgeAlertMessage = z.infer<typeof AcknowledgeAlertMessageSchema>;

// ============================================
// Client Message Union
// ============================================

/**
 * Discriminated union of all client → server messages.
 */
export const ClientMessageSchema = z.discriminatedUnion("type", [
  SubscribeMessageSchema,
  UnsubscribeMessageSchema,
  SubscribeSymbolsMessageSchema,
  UnsubscribeSymbolsMessageSchema,
  PingMessageSchema,
  RequestStateMessageSchema,
  AcknowledgeAlertMessageSchema,
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
