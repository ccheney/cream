/**
 * WebSocket Channel Definitions
 *
 * Defines the available WebSocket channels for real-time data streaming.
 *
 * @see docs/plans/ui/06-websocket.md lines 143-155
 */

import { z } from "zod/v4";

// ============================================
// Channel Enum
// ============================================

/**
 * Available WebSocket channels.
 *
 * - quotes: Real-time price quotes (bid, ask, last, volume)
 * - trades: Real-time trade executions (time & sales)
 * - options: Options contract quotes and trades
 * - orders: Order status updates (submitted, filled, cancelled)
 * - decisions: Trading decisions from agents
 * - agents: Agent output and reasoning
 * - cycles: Trading cycle progress
 * - alerts: System alerts and notifications
 * - system: System status updates
 * - portfolio: Portfolio value and position updates
 */
export const Channel = z.enum([
  "quotes",
  "trades",
  "options",
  "orders",
  "decisions",
  "agents",
  "cycles",
  "alerts",
  "system",
  "portfolio",
]);

export type Channel = z.infer<typeof Channel>;

/**
 * All available channel values.
 */
export const CHANNELS = Channel.options;

// ============================================
// Channel Descriptions
// ============================================

/**
 * Human-readable descriptions for each channel.
 */
export const CHANNEL_DESCRIPTIONS: Record<Channel, string> = {
  quotes: "Real-time price quotes (bid, ask, last, volume)",
  trades: "Real-time trade executions (time & sales)",
  options: "Options contract quotes and trades",
  orders: "Order status updates (submitted, filled, cancelled)",
  decisions: "Trading decisions from agents",
  agents: "Agent output and reasoning",
  cycles: "Trading cycle progress",
  alerts: "System alerts and notifications",
  system: "System status updates",
  portfolio: "Portfolio value and position updates",
};

// ============================================
// Agent Types
// ============================================

/**
 * Agent types in the trading system.
 */
export const AgentType = z.enum([
  "technical_analyst",
  "news_analyst",
  "fundamentals_analyst",
  "bullish_researcher",
  "bearish_researcher",
  "trader",
  "risk_manager",
  "critic",
]);

export type AgentType = z.infer<typeof AgentType>;

// ============================================
// Cycle Phases
// ============================================

/**
 * Trading cycle phases (OODA loop).
 */
export const CyclePhase = z.enum(["observe", "orient", "decide", "act", "complete", "error"]);

export type CyclePhase = z.infer<typeof CyclePhase>;

// ============================================
// Order Status
// ============================================

/**
 * Order execution status.
 */
export const OrderStatus = z.enum([
  "pending",
  "submitted",
  "partial_fill",
  "filled",
  "cancelled",
  "rejected",
  "expired",
]);

export type OrderStatus = z.infer<typeof OrderStatus>;

// ============================================
// Alert Severity
// ============================================

/**
 * Alert severity levels.
 */
export const AlertSeverity = z.enum(["info", "warning", "error", "critical"]);

export type AlertSeverity = z.infer<typeof AlertSeverity>;

// ============================================
// System Status
// ============================================

/**
 * System health status.
 */
export const SystemHealthStatus = z.enum(["healthy", "degraded", "unhealthy"]);

export type SystemHealthStatus = z.infer<typeof SystemHealthStatus>;

// ============================================
// Agent Vote
// ============================================

/**
 * Agent voting decision.
 */
export const AgentVote = z.enum(["APPROVE", "REJECT", "ABSTAIN"]);

export type AgentVote = z.infer<typeof AgentVote>;
