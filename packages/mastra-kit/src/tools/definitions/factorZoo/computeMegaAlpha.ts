/**
 * Compute Mega-Alpha Tool
 *
 * Computes the combined Mega-Alpha signal from individual factor signals.
 */

import type { FactorZooRepository } from "@cream/storage";
import { createTool } from "@mastra/core/tools";
import {
  createFactorZooService,
  type FactorZooConfig,
  type FactorZooDependencies,
} from "../../../services/factor-zoo.js";
import {
  type ComputeMegaAlphaInput,
  ComputeMegaAlphaInputSchema,
  type ComputeMegaAlphaOutput,
  ComputeMegaAlphaOutputSchema,
} from "./schemas.js";

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
    execute: async (inputData: ComputeMegaAlphaInput): Promise<ComputeMegaAlphaOutput> => {
      const { signals } = inputData;

      try {
        const signalMap = new Map<string, number>(Object.entries(signals));
        const result = await service.computeMegaAlpha(signalMap);

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
