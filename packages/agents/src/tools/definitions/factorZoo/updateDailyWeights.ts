/**
 * Update Daily Weights Tool
 *
 * Updates factor weights daily based on recent performance using AlphaForge Algorithm 2.
 */

import type { FactorZooRepository } from "@cream/storage";
import { createTool } from "@mastra/core/tools";
import {
	createFactorZooService,
	type FactorZooConfig,
	type FactorZooDependencies,
	type FactorZooEventEmitter,
} from "../../../services/factor-zoo.js";
import {
	UpdateDailyWeightsInputSchema,
	type UpdateDailyWeightsOutput,
	UpdateDailyWeightsOutputSchema,
} from "./schemas.js";

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
		execute: async (): Promise<UpdateDailyWeightsOutput> => {
			try {
				const result = await service.updateDailyWeights();

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
