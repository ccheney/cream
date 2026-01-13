/**
 * System Route Types
 *
 * Shared schemas, interfaces, and constants used across system routes.
 */

import type { AgentType } from "@cream/domain/websocket";
import { z } from "@hono/zod-openapi";

// ============================================
// Zod Schemas
// ============================================

export const EnvironmentSchema = z.enum(["BACKTEST", "PAPER", "LIVE"]);

export const SystemStatusValue = z.enum(["ACTIVE", "PAUSED", "STOPPED"]);

export const AlertSchema = z.object({
  id: z.string(),
  severity: z.enum(["critical", "warning", "info"]),
  type: z.string(),
  message: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  acknowledged: z.boolean(),
  createdAt: z.string(),
});

export const CycleStatusValue = z.enum(["queued", "running", "completed", "failed"]);

export const RunningCycleSchema = z.object({
  cycleId: z.string(),
  status: CycleStatusValue,
  startedAt: z.string(),
  phase: z.string().nullable(),
});

export const SystemStatusSchema = z.object({
  environment: EnvironmentSchema,
  status: SystemStatusValue,
  lastCycleId: z.string().nullable(),
  lastCycleTime: z.string().nullable(),
  nextCycleTime: z.string().nullable(),
  positionCount: z.number(),
  openOrderCount: z.number(),
  alerts: z.array(AlertSchema),
  runningCycle: RunningCycleSchema.nullable(),
});

export const ServiceStatusSchema = z.enum(["ok", "error", "degraded"]);

export const ServiceHealthSchema = z.object({
  status: ServiceStatusSchema,
  latencyMs: z.number().optional(),
  message: z.string().optional(),
});

export const HealthResponseSchema = z.object({
  status: z.enum(["ok", "degraded", "down"]),
  timestamp: z.string(),
  version: z.string(),
  services: z.object({
    database: ServiceHealthSchema,
    helix: ServiceHealthSchema,
    broker: ServiceHealthSchema,
    marketdata: ServiceHealthSchema,
    execution: ServiceHealthSchema,
    websocket: z.object({
      status: ServiceStatusSchema,
      connections: z.number(),
    }),
  }),
});

// ============================================
// Request/Response Schemas
// ============================================

export const StartRequestSchema = z.object({
  environment: EnvironmentSchema.optional(),
});

export const StopRequestSchema = z.object({
  closeAllPositions: z.boolean().optional().default(false),
});

export const EnvironmentRequestSchema = z.object({
  environment: EnvironmentSchema,
  confirmLive: z.boolean().optional(),
});

export const TriggerCycleRequestSchema = z.object({
  environment: EnvironmentSchema,
  useDraftConfig: z.boolean().default(false),
  symbols: z.array(z.string()).optional(),
  confirmLive: z.boolean().optional(),
});

export const TriggerCycleResponseSchema = z.object({
  cycleId: z.string(),
  status: CycleStatusValue,
  environment: z.string(),
  configVersion: z.string().nullable(),
  startedAt: z.string(),
});

export const CycleStatusResponseSchema = z.object({
  cycleId: z.string(),
  status: CycleStatusValue,
  environment: z.string(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  error: z.string().nullable(),
});

// ============================================
// TypeScript Interfaces
// ============================================

export interface CycleState {
  cycleId: string;
  status: "queued" | "running" | "completed" | "failed";
  environment: "BACKTEST" | "PAPER" | "LIVE";
  startedAt: string;
  completedAt: string | null;
  error: string | null;
  /** Current phase of the OODA cycle */
  phase: "observe" | "orient" | "decide" | "act" | "complete" | null;
}

/** Alias for CycleState used in running cycle tracking */
export type RunningCycleState = CycleState;

export interface SystemState {
  status: "ACTIVE" | "PAUSED" | "STOPPED";
  environment: "BACKTEST" | "PAPER" | "LIVE";
  lastCycleId: string | null;
  lastCycleTime: string | null;
  startedAt: Date | null;
  /** Track running cycles per environment */
  runningCycles: Map<string, CycleState>;
  /** Rate limit: last trigger time per environment */
  lastTriggerTime: Map<string, number>;
}

export type ServiceHealth = {
  status: "ok" | "error" | "degraded";
  latencyMs?: number;
  message?: string;
};

// ============================================
// Constants
// ============================================

/** Rate limit in milliseconds (5 minutes) */
export const TRIGGER_RATE_LIMIT_MS = 5 * 60 * 1000;

/** Max length for tool result summaries */
export const MAX_RESULT_SUMMARY_LENGTH = 500;

/**
 * Map full agent type names to abbreviated names for WebSocket streaming.
 * The backend uses full names (news_analyst) but the dashboard expects abbreviated names (news).
 */
export const AGENT_TYPE_MAP: Record<string, AgentType> = {
  news_analyst: "news",
  fundamentals_analyst: "fundamentals",
  bullish_researcher: "bullish",
  bearish_researcher: "bearish",
  trader: "trader",
  risk_manager: "risk",
  critic: "critic",
};

// ============================================
// Helper Functions
// ============================================

export function mapAgentType(fullName: string): AgentType {
  return AGENT_TYPE_MAP[fullName] ?? (fullName as AgentType);
}

/** Truncate tool result to a reasonable summary for WebSocket broadcast */
export function truncateResult(result: unknown): string {
  if (result === undefined || result === null) {
    return "";
  }
  const str = typeof result === "string" ? result : JSON.stringify(result);
  if (str.length <= MAX_RESULT_SUMMARY_LENGTH) {
    return str;
  }
  return `${str.slice(0, MAX_RESULT_SUMMARY_LENGTH)}...`;
}
