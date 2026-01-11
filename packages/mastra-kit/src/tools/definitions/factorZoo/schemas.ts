/**
 * Factor Zoo Zod Schemas and Types
 *
 * Centralized schema definitions for all Factor Zoo tools.
 * Each tool has an input schema and output schema with derived TypeScript types.
 */

import { z } from "zod";
import { DecayAlertSchema } from "../../../services/decay-monitor.js";

// ============================================
// Update Daily Weights
// ============================================

export const UpdateDailyWeightsInputSchema = z.object({
  dryRun: z
    .boolean()
    .optional()
    .default(false)
    .describe("If true, calculate weights but don't persist them"),
});

export type UpdateDailyWeightsInput = z.infer<typeof UpdateDailyWeightsInputSchema>;

export const UpdateDailyWeightsOutputSchema = z.object({
  success: z.boolean(),
  qualifyingCount: z.number().describe("Number of factors meeting IC/ICIR thresholds"),
  selectedCount: z.number().describe("Number of factors selected for Mega-Alpha"),
  weights: z.record(z.string(), z.number()).describe("Factor ID to weight mapping"),
  zeroedFactors: z.array(z.string()).describe("Factors that were zeroed out"),
  updatedAt: z.string().describe("Timestamp of update"),
  message: z.string().describe("Human-readable status message"),
});

export type UpdateDailyWeightsOutput = z.infer<typeof UpdateDailyWeightsOutputSchema>;

// ============================================
// Compute Mega-Alpha
// ============================================

export const ComputeMegaAlphaInputSchema = z.object({
  signals: z
    .record(z.string(), z.number())
    .describe("Factor ID to signal value mapping for a single symbol"),
});

export type ComputeMegaAlphaInput = z.infer<typeof ComputeMegaAlphaInputSchema>;

export const ComputeMegaAlphaOutputSchema = z.object({
  value: z.number().describe("Combined Mega-Alpha signal value"),
  weights: z.record(z.string(), z.number()).describe("Factor weights used"),
  contributingFactors: z.array(z.string()).describe("Factors that contributed to signal"),
  signals: z.record(z.string(), z.number()).describe("Individual factor signals included"),
  message: z.string().describe("Human-readable description"),
});

export type ComputeMegaAlphaOutput = z.infer<typeof ComputeMegaAlphaOutputSchema>;

// ============================================
// Compute Mega-Alpha for Symbols
// ============================================

export const ComputeMegaAlphaForSymbolsInputSchema = z.object({
  symbolSignals: z
    .record(z.string(), z.record(z.string(), z.number()))
    .describe("Symbol to (factor ID to signal) mapping"),
});

export type ComputeMegaAlphaForSymbolsInput = z.infer<typeof ComputeMegaAlphaForSymbolsInputSchema>;

export const ComputeMegaAlphaForSymbolsOutputSchema = z.object({
  results: z
    .record(
      z.string(),
      z.object({
        value: z.number(),
        contributingFactors: z.array(z.string()),
      })
    )
    .describe("Symbol to Mega-Alpha result mapping"),
  totalSymbols: z.number(),
  message: z.string(),
});

export type ComputeMegaAlphaForSymbolsOutput = z.infer<
  typeof ComputeMegaAlphaForSymbolsOutputSchema
>;

// ============================================
// Check Factor Decay
// ============================================

export const CheckFactorDecayInputSchema = z.object({
  factorId: z
    .string()
    .optional()
    .describe("Specific factor ID to check (optional - checks all active factors if omitted)"),
});

export type CheckFactorDecayInput = z.infer<typeof CheckFactorDecayInputSchema>;

export const CheckFactorDecayOutputSchema = z.object({
  decayingFactors: z
    .array(
      z.object({
        factorId: z.string(),
        isDecaying: z.boolean(),
        peakIC: z.number(),
        recentIC: z.number(),
        decayRate: z.number(),
        daysInDecay: z.number(),
      })
    )
    .describe("Factors showing decay"),
  totalChecked: z.number(),
  totalDecaying: z.number(),
  message: z.string().describe("Human-readable summary"),
});

export type CheckFactorDecayOutput = z.infer<typeof CheckFactorDecayOutputSchema>;

// ============================================
// Get Factor Zoo Stats
// ============================================

export const GetFactorZooStatsInputSchema = z.object({});

export type GetFactorZooStatsInput = z.infer<typeof GetFactorZooStatsInputSchema>;

export const GetFactorZooStatsOutputSchema = z.object({
  totalFactors: z.number(),
  activeFactors: z.number(),
  decayingFactors: z.number(),
  researchFactors: z.number(),
  retiredFactors: z.number(),
  averageIc: z.number(),
  totalWeight: z.number(),
  hypothesesValidated: z.number(),
  hypothesesRejected: z.number(),
  message: z.string(),
});

export type GetFactorZooStatsOutput = z.infer<typeof GetFactorZooStatsOutputSchema>;

// ============================================
// Get Current Weights
// ============================================

export const GetCurrentWeightsInputSchema = z.object({});

export type GetCurrentWeightsInput = z.infer<typeof GetCurrentWeightsInputSchema>;

export const GetCurrentWeightsOutputSchema = z.object({
  weights: z.record(z.string(), z.number()),
  totalFactors: z.number(),
  nonZeroFactors: z.number(),
  message: z.string(),
});

export type GetCurrentWeightsOutput = z.infer<typeof GetCurrentWeightsOutputSchema>;

// ============================================
// Get Factor Context
// ============================================

export const GetFactorContextInputSchema = z.object({
  factorId: z.string().describe("The factor ID to get context for"),
});

export type GetFactorContextInput = z.infer<typeof GetFactorContextInputSchema>;

export const GetFactorContextOutputSchema = z.object({
  factorId: z.string(),
  name: z.string(),
  hypothesisId: z.string().nullable(),
  status: z.string(),
  currentWeight: z.number(),
  performance: z.object({
    recentIC: z.number().describe("Average IC over last 5 days"),
    rolling30IC: z.number().describe("Average IC over 30 days"),
    icTrend: z.enum(["improving", "stable", "declining"]),
    isDecaying: z.boolean(),
    decayRate: z.number().nullable(),
  }),
  validation: z.object({
    stage1Sharpe: z.number().nullable(),
    stage2PBO: z.number().nullable().describe("Probability of Backtest Overfitting"),
    stage2WFE: z.number().nullable().describe("Walk-Forward Efficiency"),
    paperValidationPassed: z.boolean(),
  }),
  found: z.boolean(),
  message: z.string(),
});

export type GetFactorContextOutput = z.infer<typeof GetFactorContextOutputSchema>;

// ============================================
// Get Active Factors
// ============================================

export const GetActiveFactorsInputSchema = z.object({
  includeDetails: z
    .boolean()
    .optional()
    .default(false)
    .describe("Include performance details for each factor"),
});

export type GetActiveFactorsInput = z.infer<typeof GetActiveFactorsInputSchema>;

export const GetActiveFactorsOutputSchema = z.object({
  factors: z.array(
    z.object({
      factorId: z.string(),
      name: z.string(),
      weight: z.number(),
      lastIC: z.number().nullable(),
      status: z.string(),
    })
  ),
  totalActive: z.number(),
  totalWeight: z.number(),
  message: z.string(),
});

export type GetActiveFactorsOutput = z.infer<typeof GetActiveFactorsOutputSchema>;

// ============================================
// Run Decay Monitor
// ============================================

export const RunDecayMonitorInputSchema = z.object({
  sendAlerts: z
    .boolean()
    .optional()
    .default(true)
    .describe("Whether to send alerts via alert service"),
});

export type RunDecayMonitorInput = z.infer<typeof RunDecayMonitorInputSchema>;

export const RunDecayMonitorOutputSchema = z.object({
  alerts: z.array(DecayAlertSchema),
  factorsChecked: z.number(),
  decayingFactors: z.array(z.string()),
  crowdedFactors: z.array(z.string()),
  correlatedPairs: z.array(
    z.object({
      factor1: z.string(),
      factor2: z.string(),
      correlation: z.number(),
    })
  ),
  hasAlerts: z.boolean(),
  message: z.string(),
});

export type RunDecayMonitorOutput = z.infer<typeof RunDecayMonitorOutputSchema>;
