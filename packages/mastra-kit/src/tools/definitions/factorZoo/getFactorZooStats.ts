/**
 * Get Factor Zoo Stats Tool
 *
 * Returns overall statistics about the Factor Zoo.
 */

import type { FactorZooRepository } from "@cream/storage";
import { createTool } from "@mastra/core/tools";
import {
  createFactorZooService,
  type FactorZooDependencies,
} from "../../../services/factor-zoo.js";
import {
  GetFactorZooStatsInputSchema,
  type GetFactorZooStatsOutput,
  GetFactorZooStatsOutputSchema,
} from "./schemas.js";

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
    execute: async (): Promise<GetFactorZooStatsOutput> => {
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
