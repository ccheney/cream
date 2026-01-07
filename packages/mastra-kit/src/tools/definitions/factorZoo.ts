/**
 * Mastra Factor Zoo Tool Definitions
 *
 * Tools for managing the Factor Zoo and computing Mega-Alpha signals
 * following AlphaForge Algorithm 2 methodology.
 *
 * @see docs/plans/20-research-to-production-pipeline.md - Phase 7: Factor Zoo
 * @see https://arxiv.org/html/2406.18394v1 - AlphaForge paper
 */

import type { FactorZooRepository } from "@cream/storage";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  createFactorZooService,
  type FactorZooConfig,
  type FactorZooDependencies,
  type FactorZooEventEmitter,
} from "../../services/factor-zoo.js";

// ============================================
// Update Daily Weights Tool
// ============================================

/**
 * Input schema for updating daily weights
 */
export const UpdateDailyWeightsInputSchema = z.object({
  dryRun: z
    .boolean()
    .optional()
    .default(false)
    .describe("If true, calculate weights but don't persist them"),
});

export type UpdateDailyWeightsInput = z.infer<typeof UpdateDailyWeightsInputSchema>;

/**
 * Output schema for weight update result
 */
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

/**
 * Factory function to create the update daily weights tool
 */
export function createUpdateDailyWeightsTool(
  factorZoo: FactorZooRepository,
  config?: Partial<FactorZooConfig>,
  eventEmitter?: FactorZooEventEmitter
) {
  const deps: FactorZooDependencies = { factorZoo, eventEmitter };
  const service = createFactorZooService(deps, config);

  return createTool({
    id: "update_daily_weights",
    description: `Update factor weights daily based on recent performance.

Implements AlphaForge Algorithm 2:
1. Filter to active factors meeting IC and ICIR thresholds
2. Rank by recent IC and select top N factors
3. Compute weights via IC-weighted average
4. Zero out non-qualifying factors

Run this tool daily during the Orient phase to ensure optimal factor combination.

Configuration defaults:
- IC threshold: 0.02
- ICIR threshold: 0.3
- Max factors: 10
- Lookback days: 20`,
    inputSchema: UpdateDailyWeightsInputSchema,
    outputSchema: UpdateDailyWeightsOutputSchema,
    execute: async () => {
      try {
        const result = await service.updateDailyWeights();

        // Convert Map to Record for JSON serialization
        const weightsRecord: Record<string, number> = {};
        for (const [factorId, weight] of result.weights) {
          weightsRecord[factorId] = weight;
        }

        const message =
          result.selectedCount > 0
            ? `Updated weights for ${result.selectedCount} factors (${result.qualifyingCount} qualified)`
            : "No factors currently qualify for Mega-Alpha";

        return {
          success: true,
          qualifyingCount: result.qualifyingCount,
          selectedCount: result.selectedCount,
          weights: weightsRecord,
          zeroedFactors: result.zeroedFactors,
          updatedAt: result.updatedAt,
          message,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          qualifyingCount: 0,
          selectedCount: 0,
          weights: {},
          zeroedFactors: [],
          updatedAt: new Date().toISOString(),
          message: `Failed to update weights: ${errorMessage}`,
        };
      }
    },
  });
}

// ============================================
// Compute Mega-Alpha Tool
// ============================================

/**
 * Input schema for computing Mega-Alpha
 */
export const ComputeMegaAlphaInputSchema = z.object({
  signals: z
    .record(z.string(), z.number())
    .describe("Factor ID to signal value mapping for a single symbol"),
});

export type ComputeMegaAlphaInput = z.infer<typeof ComputeMegaAlphaInputSchema>;

/**
 * Output schema for Mega-Alpha result
 */
export const ComputeMegaAlphaOutputSchema = z.object({
  value: z.number().describe("Combined Mega-Alpha signal value"),
  weights: z.record(z.string(), z.number()).describe("Factor weights used"),
  contributingFactors: z.array(z.string()).describe("Factors that contributed to signal"),
  signals: z.record(z.string(), z.number()).describe("Individual factor signals included"),
  message: z.string().describe("Human-readable description"),
});

export type ComputeMegaAlphaOutput = z.infer<typeof ComputeMegaAlphaOutputSchema>;

/**
 * Factory function to create the compute Mega-Alpha tool
 */
export function createComputeMegaAlphaTool(
  factorZoo: FactorZooRepository,
  config?: Partial<FactorZooConfig>
) {
  const deps: FactorZooDependencies = { factorZoo };
  const service = createFactorZooService(deps, config);

  return createTool({
    id: "compute_mega_alpha",
    description: `Compute the Mega-Alpha combined signal from individual factor signals.

Uses weighted combination based on dynamic factor weights.
Only factors with non-zero weights contribute to the signal.

Use this tool during the Decide phase to get a single aggregated alpha signal
for position sizing and trade decisions.`,
    inputSchema: ComputeMegaAlphaInputSchema,
    outputSchema: ComputeMegaAlphaOutputSchema,
    execute: async ({ context }) => {
      const { signals } = context;

      try {
        // Convert Record to Map
        const signalMap = new Map<string, number>(Object.entries(signals));
        const result = await service.computeMegaAlpha(signalMap);

        // Convert Maps to Records for JSON serialization
        const weightsRecord: Record<string, number> = {};
        for (const [factorId, weight] of result.weights) {
          weightsRecord[factorId] = weight;
        }

        const signalsRecord: Record<string, number> = {};
        for (const [factorId, signal] of result.signals) {
          signalsRecord[factorId] = signal;
        }

        const message =
          result.contributingFactors.length > 0
            ? `Mega-Alpha: ${result.value.toFixed(4)} from ${result.contributingFactors.length} factors`
            : "No factors with non-zero weights";

        return {
          value: result.value,
          weights: weightsRecord,
          contributingFactors: result.contributingFactors,
          signals: signalsRecord,
          message,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          value: 0,
          weights: {},
          contributingFactors: [],
          signals: {},
          message: `Failed to compute Mega-Alpha: ${errorMessage}`,
        };
      }
    },
  });
}

// ============================================
// Compute Mega-Alpha for Symbols Tool
// ============================================

/**
 * Input schema for computing Mega-Alpha for multiple symbols
 */
export const ComputeMegaAlphaForSymbolsInputSchema = z.object({
  symbolSignals: z
    .record(z.string(), z.record(z.string(), z.number()))
    .describe("Symbol to (factor ID to signal) mapping"),
});

export type ComputeMegaAlphaForSymbolsInput = z.infer<typeof ComputeMegaAlphaForSymbolsInputSchema>;

/**
 * Output schema for Mega-Alpha results for multiple symbols
 */
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

/**
 * Factory function to create the compute Mega-Alpha for symbols tool
 */
export function createComputeMegaAlphaForSymbolsTool(
  factorZoo: FactorZooRepository,
  config?: Partial<FactorZooConfig>
) {
  const deps: FactorZooDependencies = { factorZoo };
  const service = createFactorZooService(deps, config);

  return createTool({
    id: "compute_mega_alpha_for_symbols",
    description: `Compute Mega-Alpha signals for multiple symbols at once.

Efficient batch computation for portfolio-level alpha aggregation.
Use this during the Decide phase when evaluating multiple instruments.`,
    inputSchema: ComputeMegaAlphaForSymbolsInputSchema,
    outputSchema: ComputeMegaAlphaForSymbolsOutputSchema,
    execute: async ({ context }) => {
      const { symbolSignals } = context;

      try {
        // Convert nested Records to nested Maps
        const symbolSignalMap = new Map<string, Map<string, number>>();
        for (const [symbol, signals] of Object.entries(symbolSignals)) {
          symbolSignalMap.set(symbol, new Map(Object.entries(signals)));
        }

        const results = await service.computeMegaAlphaForSymbols(symbolSignalMap);

        // Convert results to serializable format
        const resultsRecord: Record<string, { value: number; contributingFactors: string[] }> = {};
        for (const [symbol, result] of results) {
          resultsRecord[symbol] = {
            value: result.value,
            contributingFactors: result.contributingFactors,
          };
        }

        return {
          results: resultsRecord,
          totalSymbols: results.size,
          message: `Computed Mega-Alpha for ${results.size} symbols`,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          results: {},
          totalSymbols: 0,
          message: `Failed to compute Mega-Alpha for symbols: ${errorMessage}`,
        };
      }
    },
  });
}

// ============================================
// Check Factor Decay Tool
// ============================================

/**
 * Input schema for checking factor decay
 */
export const CheckFactorDecayInputSchema = z.object({
  factorId: z
    .string()
    .optional()
    .describe("Specific factor ID to check (optional - checks all active factors if omitted)"),
});

export type CheckFactorDecayInput = z.infer<typeof CheckFactorDecayInputSchema>;

/**
 * Output schema for decay check result
 */
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

/**
 * Factory function to create the check factor decay tool
 */
export function createCheckFactorDecayTool(
  factorZoo: FactorZooRepository,
  config?: Partial<FactorZooConfig>,
  eventEmitter?: FactorZooEventEmitter
) {
  const deps: FactorZooDependencies = { factorZoo, eventEmitter };
  const service = createFactorZooService(deps, config);

  return createTool({
    id: "check_factor_decay",
    description: `Check active factors for alpha decay.

Detects factors showing consistent performance degradation:
- Recent IC falls below 50% of peak IC
- Measured over configured decay window (default: 20 days)

Factors showing decay are marked for review and can trigger
replacement research automatically.

Run this tool periodically (e.g., weekly) to identify factors
that may need refinement or replacement.`,
    inputSchema: CheckFactorDecayInputSchema,
    outputSchema: CheckFactorDecayOutputSchema,
    execute: async ({ context }) => {
      const { factorId } = context;

      try {
        if (factorId) {
          // Check specific factor
          const result = await service.checkFactorDecay(factorId);
          if (!result) {
            return {
              decayingFactors: [],
              totalChecked: 0,
              totalDecaying: 0,
              message: `Factor ${factorId} not found or not active`,
            };
          }

          return {
            decayingFactors: result.isDecaying ? [result] : [],
            totalChecked: 1,
            totalDecaying: result.isDecaying ? 1 : 0,
            message: result.isDecaying
              ? `Factor ${factorId} is decaying (IC: ${result.recentIC.toFixed(4)} vs peak ${result.peakIC.toFixed(4)})`
              : `Factor ${factorId} is healthy (IC: ${result.recentIC.toFixed(4)})`,
          };
        }

        // Check all active factors
        const results = await service.checkDecay();
        const decayingFactors = results.filter((r) => r.isDecaying);

        const message =
          decayingFactors.length > 0
            ? `${decayingFactors.length} of ${results.length} factors showing decay: ${decayingFactors.map((f) => f.factorId).join(", ")}`
            : `All ${results.length} factors are healthy`;

        return {
          decayingFactors,
          totalChecked: results.length,
          totalDecaying: decayingFactors.length,
          message,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          decayingFactors: [],
          totalChecked: 0,
          totalDecaying: 0,
          message: `Failed to check decay: ${errorMessage}`,
        };
      }
    },
  });
}

// ============================================
// Get Factor Zoo Stats Tool
// ============================================

/**
 * Input schema for getting Factor Zoo stats
 */
export const GetFactorZooStatsInputSchema = z.object({});

export type GetFactorZooStatsInput = z.infer<typeof GetFactorZooStatsInputSchema>;

/**
 * Output schema for Factor Zoo stats
 */
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

/**
 * Factory function to create the get Factor Zoo stats tool
 */
export function createGetFactorZooStatsTool(factorZoo: FactorZooRepository) {
  const deps: FactorZooDependencies = { factorZoo };
  const service = createFactorZooService(deps);

  return createTool({
    id: "get_factor_zoo_stats",
    description: `Get overall statistics about the Factor Zoo.

Returns counts of factors by status, research runs,
and average performance metrics.

Use this for monitoring Factor Zoo health and capacity.`,
    inputSchema: GetFactorZooStatsInputSchema,
    outputSchema: GetFactorZooStatsOutputSchema,
    execute: async () => {
      try {
        const stats = await service.getStats();

        const message = `Factor Zoo: ${stats.activeFactors} active, ${stats.decayingFactors} decaying, ${stats.researchFactors} in research`;

        return {
          totalFactors: stats.totalFactors,
          activeFactors: stats.activeFactors,
          decayingFactors: stats.decayingFactors,
          researchFactors: stats.researchFactors,
          retiredFactors: stats.retiredFactors,
          averageIc: stats.averageIc,
          totalWeight: stats.totalWeight,
          hypothesesValidated: stats.hypothesesValidated,
          hypothesesRejected: stats.hypothesesRejected,
          message,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          totalFactors: 0,
          activeFactors: 0,
          decayingFactors: 0,
          researchFactors: 0,
          retiredFactors: 0,
          averageIc: 0,
          totalWeight: 0,
          hypothesesValidated: 0,
          hypothesesRejected: 0,
          message: `Failed to get stats: ${errorMessage}`,
        };
      }
    },
  });
}

// ============================================
// Get Current Weights Tool
// ============================================

/**
 * Input schema for getting current weights
 */
export const GetCurrentWeightsInputSchema = z.object({});

export type GetCurrentWeightsInput = z.infer<typeof GetCurrentWeightsInputSchema>;

/**
 * Output schema for current weights
 */
export const GetCurrentWeightsOutputSchema = z.object({
  weights: z.record(z.string(), z.number()),
  totalFactors: z.number(),
  nonZeroFactors: z.number(),
  message: z.string(),
});

export type GetCurrentWeightsOutput = z.infer<typeof GetCurrentWeightsOutputSchema>;

/**
 * Factory function to create the get current weights tool
 */
export function createGetCurrentWeightsTool(factorZoo: FactorZooRepository) {
  const deps: FactorZooDependencies = { factorZoo };
  const service = createFactorZooService(deps);

  return createTool({
    id: "get_current_weights",
    description: `Get current factor weights for Mega-Alpha computation.

Returns the weight assigned to each active factor.
Weights sum to 1.0 for non-zero factors.`,
    inputSchema: GetCurrentWeightsInputSchema,
    outputSchema: GetCurrentWeightsOutputSchema,
    execute: async () => {
      try {
        const weights = await service.getCurrentWeights();

        // Convert Map to Record
        const weightsRecord: Record<string, number> = {};
        let nonZeroCount = 0;
        for (const [factorId, weight] of weights) {
          weightsRecord[factorId] = weight;
          if (weight > 0) {
            nonZeroCount++;
          }
        }

        return {
          weights: weightsRecord,
          totalFactors: weights.size,
          nonZeroFactors: nonZeroCount,
          message: `${nonZeroCount} factors with non-zero weights`,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          weights: {},
          totalFactors: 0,
          nonZeroFactors: 0,
          message: `Failed to get weights: ${errorMessage}`,
        };
      }
    },
  });
}
