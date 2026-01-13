/**
 * Get Current Weights Tool
 *
 * Returns current factor weights for Mega-Alpha computation.
 */

import type { FactorZooRepository } from "@cream/storage";
import { createTool } from "@mastra/core/tools";
import {
  createFactorZooService,
  type FactorZooDependencies,
} from "../../../services/factor-zoo.js";
import {
  GetCurrentWeightsInputSchema,
  type GetCurrentWeightsOutput,
  GetCurrentWeightsOutputSchema,
} from "./schemas.js";

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
    execute: async (): Promise<GetCurrentWeightsOutput> => {
      try {
        const weights = await service.getCurrentWeights();

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
