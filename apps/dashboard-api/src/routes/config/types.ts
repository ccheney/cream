/**
 * Configuration API Types
 *
 * Shared Zod schemas and type definitions for configuration routes.
 */

import type { TradingEnvironment } from "@cream/config";
import { z } from "@hono/zod-openapi";

// ============================================
// Base Schemas
// ============================================

export const EnvironmentSchema = z.enum(["BACKTEST", "PAPER", "LIVE"]);

export const GlobalModelSchema = z.enum(["gemini-3-flash-preview", "gemini-3-pro-preview"]);

export const ConfigStatusSchema = z.enum(["draft", "testing", "active", "archived"]);

export const UniverseSourceSchema = z.enum(["static", "index", "screener"]);

export const AgentTypeSchema = z.enum([
  "technical_analyst",
  "news_analyst",
  "fundamentals_analyst",
  "bullish_researcher",
  "bearish_researcher",
  "trader",
  "risk_manager",
  "critic",
]);

// ============================================
// Configuration Schemas
// ============================================

export const TradingConfigSchema = z.object({
  id: z.string(),
  environment: EnvironmentSchema,
  version: z.number(),
  globalModel: GlobalModelSchema,
  maxConsensusIterations: z.number(),
  agentTimeoutMs: z.number(),
  totalConsensusTimeoutMs: z.number(),
  convictionDeltaHold: z.number(),
  convictionDeltaAction: z.number(),
  highConvictionPct: z.number(),
  mediumConvictionPct: z.number(),
  lowConvictionPct: z.number(),
  minRiskRewardRatio: z.number(),
  kellyFraction: z.number(),
  tradingCycleIntervalMs: z.number(),
  predictionMarketsIntervalMs: z.number(),
  status: ConfigStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  promotedFrom: z.string().nullable(),
});

export const UniverseConfigSchema = z.object({
  id: z.string(),
  environment: EnvironmentSchema,
  source: UniverseSourceSchema,
  staticSymbols: z.array(z.string()).nullable(),
  indexSource: z.string().nullable(),
  minVolume: z.number().nullable(),
  minMarketCap: z.number().nullable(),
  optionableOnly: z.boolean(),
  includeList: z.array(z.string()),
  excludeList: z.array(z.string()),
  status: ConfigStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const AgentConfigSchema = z.object({
  id: z.string(),
  environment: EnvironmentSchema,
  agentType: AgentTypeSchema,
  systemPromptOverride: z.string().nullable(),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const PerInstrumentLimitsSchema = z.object({
  maxShares: z.number(),
  maxContracts: z.number(),
  maxNotional: z.number(),
  maxPctEquity: z.number(),
});

export const PortfolioLimitsSchema = z.object({
  maxGrossExposure: z.number(),
  maxNetExposure: z.number(),
  maxConcentration: z.number(),
  maxCorrelation: z.number(),
  maxDrawdown: z.number(),
});

export const OptionsLimitsSchema = z.object({
  maxDelta: z.number(),
  maxGamma: z.number(),
  maxVega: z.number(),
  maxTheta: z.number(),
});

export const ConstraintsConfigResponseSchema = z.object({
  id: z.string(),
  environment: EnvironmentSchema,
  perInstrument: PerInstrumentLimitsSchema,
  portfolio: PortfolioLimitsSchema,
  options: OptionsLimitsSchema,
  status: ConfigStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const FullConfigSchema = z.object({
  trading: TradingConfigSchema,
  agents: z.record(AgentTypeSchema, AgentConfigSchema),
  universe: UniverseConfigSchema,
  constraints: ConstraintsConfigResponseSchema,
});

// ============================================
// Validation Schemas
// ============================================

export const ValidationErrorSchema = z.object({
  field: z.string(),
  message: z.string(),
  value: z.unknown().optional(),
});

export const ValidationResultSchema = z.object({
  valid: z.boolean(),
  errors: z.array(ValidationErrorSchema),
  warnings: z.array(z.string()),
});

// ============================================
// History Schemas
// ============================================

export const ConfigHistoryEntrySchema = z.object({
  id: z.string(),
  version: z.number(),
  config: FullConfigSchema,
  createdAt: z.string(),
  createdBy: z.string().optional(),
  isActive: z.boolean(),
  changedFields: z.array(z.string()),
  description: z.string().optional(),
});

// ============================================
// Error Schemas
// ============================================

export const ErrorResponseSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional(),
});

// ============================================
// Input Schemas
// ============================================

export const SaveDraftInputSchema = z.object({
  trading: TradingConfigSchema.partial().optional(),
  universe: UniverseConfigSchema.partial().optional(),
  agents: z.record(AgentTypeSchema, AgentConfigSchema.partial()).optional(),
});

export const PromoteToInputSchema = z.object({
  targetEnvironment: EnvironmentSchema,
});

export const RollbackInputSchema = z.object({
  versionId: z.string().openapi({
    description: "ID of the configuration version to rollback to",
  }),
});

export const UniverseConfigInputSchema = z.object({
  source: UniverseSourceSchema.optional(),
  staticSymbols: z.array(z.string()).nullable().optional(),
  indexSource: z.string().nullable().optional(),
  minVolume: z.number().nullable().optional(),
  minMarketCap: z.number().nullable().optional(),
  optionableOnly: z.boolean().optional(),
  includeList: z.array(z.string()).optional(),
  excludeList: z.array(z.string()).optional(),
});

export const ConstraintsConfigInputSchema = z.object({
  perInstrument: PerInstrumentLimitsSchema,
  portfolio: PortfolioLimitsSchema,
  options: OptionsLimitsSchema,
});

// ============================================
// Query Schemas
// ============================================

export const EnvironmentQuerySchema = z.object({
  env: EnvironmentSchema.optional().openapi({
    description: "Trading environment (default: PAPER)",
  }),
});

export const HistoryQuerySchema = z.object({
  env: EnvironmentSchema.optional().openapi({
    description: "Trading environment (default: PAPER)",
  }),
  limit: z.coerce.number().optional().default(20).openapi({
    description: "Maximum number of entries to return",
  }),
});

// ============================================
// Helper Functions
// ============================================

/**
 * Extract environment from query parameter with PAPER as default.
 */
export function getEnvironment(c: {
  req: { query: (key: string) => string | undefined };
}): TradingEnvironment {
  const env = c.req.query("env") ?? "PAPER";
  if (env !== "BACKTEST" && env !== "PAPER" && env !== "LIVE") {
    return "PAPER";
  }
  return env;
}
