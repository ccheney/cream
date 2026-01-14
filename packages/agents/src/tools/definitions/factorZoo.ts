/**
 * Mastra Factor Zoo Tool Definitions
 *
 * Tools for managing the Factor Zoo and computing Mega-Alpha signals
 * following AlphaForge Algorithm 2 methodology.
 *
 * @see docs/plans/20-research-to-production-pipeline.md - Phase 7: Factor Zoo
 * @see https://arxiv.org/html/2406.18394v1 - AlphaForge paper
 */

export {
	// Types
	type CheckFactorDecayInput,
	// Schemas
	CheckFactorDecayInputSchema,
	type CheckFactorDecayOutput,
	CheckFactorDecayOutputSchema,
	type ComputeMegaAlphaForSymbolsInput,
	ComputeMegaAlphaForSymbolsInputSchema,
	type ComputeMegaAlphaForSymbolsOutput,
	ComputeMegaAlphaForSymbolsOutputSchema,
	type ComputeMegaAlphaInput,
	ComputeMegaAlphaInputSchema,
	type ComputeMegaAlphaOutput,
	ComputeMegaAlphaOutputSchema,
	// Tool factories
	createCheckFactorDecayTool,
	createComputeMegaAlphaForSymbolsTool,
	createComputeMegaAlphaTool,
	createGetActiveFactorsTool,
	createGetCurrentWeightsTool,
	createGetFactorContextTool,
	createGetFactorZooStatsTool,
	createRunDecayMonitorTool,
	createUpdateDailyWeightsTool,
	type GetActiveFactorsInput,
	GetActiveFactorsInputSchema,
	type GetActiveFactorsOutput,
	GetActiveFactorsOutputSchema,
	type GetCurrentWeightsInput,
	GetCurrentWeightsInputSchema,
	type GetCurrentWeightsOutput,
	GetCurrentWeightsOutputSchema,
	type GetFactorContextInput,
	GetFactorContextInputSchema,
	type GetFactorContextOutput,
	GetFactorContextOutputSchema,
	type GetFactorZooStatsInput,
	GetFactorZooStatsInputSchema,
	type GetFactorZooStatsOutput,
	GetFactorZooStatsOutputSchema,
	type RunDecayMonitorInput,
	RunDecayMonitorInputSchema,
	type RunDecayMonitorOutput,
	RunDecayMonitorOutputSchema,
	type UpdateDailyWeightsInput,
	UpdateDailyWeightsInputSchema,
	type UpdateDailyWeightsOutput,
	UpdateDailyWeightsOutputSchema,
} from "./factorZoo/index.js";
