/**
 * Get Active Factors Tool
 *
 * Returns list of all active factors in the Factor Zoo.
 */

import type { FactorZooRepository } from "@cream/storage";
import { createTool } from "@mastra/core/tools";
import {
	createFactorZooService,
	type FactorZooDependencies,
} from "../../../services/factor-zoo.js";
import {
	GetActiveFactorsInputSchema,
	type GetActiveFactorsOutput,
	GetActiveFactorsOutputSchema,
} from "./schemas.js";

export function createGetActiveFactorsTool(factorZoo: FactorZooRepository) {
	const deps: FactorZooDependencies = { factorZoo };
	const service = createFactorZooService(deps);

	return createTool({
		id: "get_active_factors",
		description: `Get list of all active factors in the Factor Zoo.

Returns factors currently contributing to Mega-Alpha with their weights.
Use this to understand which factors are driving portfolio signals.`,
		inputSchema: GetActiveFactorsInputSchema,
		outputSchema: GetActiveFactorsOutputSchema,
		execute: async (): Promise<GetActiveFactorsOutput> => {
			try {
				const factors = await service.getActiveFactors();
				const weights = await service.getCurrentWeights();

				let totalWeight = 0;
				const factorList = factors.map((f) => {
					const weight = weights.get(f.factorId) ?? 0;
					totalWeight += weight;
					return {
						factorId: f.factorId,
						name: f.name,
						weight,
						lastIC: f.lastIc,
						status: f.status,
					};
				});

				factorList.sort((a, b) => b.weight - a.weight);

				return {
					factors: factorList,
					totalActive: factors.length,
					totalWeight,
					message: `${factors.length} active factors with total weight ${totalWeight.toFixed(3)}`,
				};
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				return {
					factors: [],
					totalActive: 0,
					totalWeight: 0,
					message: `Failed to get active factors: ${errorMessage}`,
				};
			}
		},
	});
}
