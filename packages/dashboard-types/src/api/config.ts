/**
 * Configuration API Types
 *
 * Types for environment, system configuration, and constraints.
 */

import { z } from "zod";

// ============================================
// Environment
// ============================================

export const EnvironmentSchema = z.enum(["BACKTEST", "PAPER", "LIVE"]);
export type Environment = z.infer<typeof EnvironmentSchema>;

// ============================================
// System Configuration
// ============================================

export const ConfigSchema = z.object({
  version: z.string(),
  environment: EnvironmentSchema,
  schedule: z
    .object({
      cycleInterval: z.string(),
      marketHoursOnly: z.boolean(),
      timezone: z.string(),
    })
    .optional(),
  universe: z.object({
    sources: z.array(
      z.object({
        type: z.string(),
        index: z.string().optional(),
        symbols: z.array(z.string()).optional(),
      })
    ),
    filters: z.object({
      optionableOnly: z.boolean(),
      minAvgVolume: z.number(),
      minMarketCap: z.number(),
    }),
  }),
  indicators: z.record(z.string(), z.unknown()),
  constraints: z.record(z.string(), z.unknown()),
});

export type Config = z.infer<typeof ConfigSchema>;

// ============================================
// Configuration History
// ============================================

export const ConfigHistoryEntrySchema = z.object({
  id: z.string(),
  version: z.string(),
  createdBy: z.string(),
  createdAt: z.string(),
  changes: z.array(z.string()),
});

export type ConfigHistoryEntry = z.infer<typeof ConfigHistoryEntrySchema>;

// ============================================
// Constraints Configuration
// ============================================

export const ConstraintsConfigSchema = z.object({
  perInstrument: z.object({
    maxShares: z.number(),
    maxContracts: z.number(),
    maxNotional: z.number(),
    maxPctEquity: z.number(),
  }),
  portfolio: z.object({
    maxGrossExposure: z.number(),
    maxNetExposure: z.number(),
    maxConcentration: z.number(),
    maxDrawdown: z.number(),
  }),
  options: z.object({
    maxDelta: z.number(),
    maxGamma: z.number(),
    maxVega: z.number(),
    maxTheta: z.number(),
  }),
});

export type ConstraintsConfig = z.infer<typeof ConstraintsConfigSchema>;
