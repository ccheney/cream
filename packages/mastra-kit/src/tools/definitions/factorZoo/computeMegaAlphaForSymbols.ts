/**
 * Compute Mega-Alpha for Symbols Tool
 *
 * Batch computation of Mega-Alpha signals for multiple symbols.
 */

import type { FactorZooRepository } from "@cream/storage";
import { createTool } from "@mastra/core/tools";
import {
  createFactorZooService,
  type FactorZooConfig,
  type FactorZooDependencies,
} from "../../../services/factor-zoo.js";
import {
  type ComputeMegaAlphaForSymbolsInput,
  ComputeMegaAlphaForSymbolsInputSchema,
  type ComputeMegaAlphaForSymbolsOutput,
  ComputeMegaAlphaForSymbolsOutputSchema,
} from "./schemas.js";

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
    execute: async (
      inputData: ComputeMegaAlphaForSymbolsInput
    ): Promise<ComputeMegaAlphaForSymbolsOutput> => {
      const { symbolSignals } = inputData;

      try {
        const symbolSignalMap = new Map<string, Map<string, number>>();
        for (const [symbol, signals] of Object.entries(symbolSignals)) {
          symbolSignalMap.set(symbol, new Map(Object.entries(signals)));
        }

        const results = await service.computeMegaAlphaForSymbols(symbolSignalMap);

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
