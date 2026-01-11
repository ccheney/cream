/**
 * Factor Zoo Module
 *
 * Tools for managing the Factor Zoo and computing Mega-Alpha signals
 * following AlphaForge Algorithm 2 methodology.
 *
 * @see docs/plans/20-research-to-production-pipeline.md - Phase 7: Factor Zoo
 * @see https://arxiv.org/html/2406.18394v1 - AlphaForge paper
 */

// Tool factories
export { createCheckFactorDecayTool } from "./checkFactorDecay.js";
export { createComputeMegaAlphaTool } from "./computeMegaAlpha.js";
export { createComputeMegaAlphaForSymbolsTool } from "./computeMegaAlphaForSymbols.js";
export { createGetActiveFactorsTool } from "./getActiveFactors.js";
export { createGetCurrentWeightsTool } from "./getCurrentWeights.js";
export { createGetFactorContextTool } from "./getFactorContext.js";
export { createGetFactorZooStatsTool } from "./getFactorZooStats.js";
export { createRunDecayMonitorTool } from "./runDecayMonitor.js";
// Schemas and types
export {
  type CheckFactorDecayInput,
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
} from "./schemas.js";
export { createUpdateDailyWeightsTool } from "./updateDailyWeights.js";
