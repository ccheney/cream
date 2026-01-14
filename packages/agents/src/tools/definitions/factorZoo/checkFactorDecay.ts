/**
 * Check Factor Decay Tool
 *
 * Detects factors showing consistent performance degradation.
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
	type CheckFactorDecayInput,
	CheckFactorDecayInputSchema,
	type CheckFactorDecayOutput,
	CheckFactorDecayOutputSchema,
} from "./schemas.js";

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
		execute: async (inputData: CheckFactorDecayInput): Promise<CheckFactorDecayOutput> => {
			const { factorId } = inputData;

			try {
				if (factorId) {
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
