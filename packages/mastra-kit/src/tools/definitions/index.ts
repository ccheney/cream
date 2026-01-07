/**
 * Mastra Tool Definitions
 *
 * Exports Mastra-compatible tool definitions for agent use.
 * These tools wrap the core implementations with proper schemas
 * for input validation and output typing.
 */

// Factor Zoo tools (require FactorZooRepository dependency injection)
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
  // Check factor decay tool
  createCheckFactorDecayTool,
  // Compute Mega-Alpha for symbols tool
  createComputeMegaAlphaForSymbolsTool,
  // Compute Mega-Alpha tool
  createComputeMegaAlphaTool,
  // Get active factors tool
  createGetActiveFactorsTool,
  // Get current weights tool
  createGetCurrentWeightsTool,
  // Get factor context tool
  createGetFactorContextTool,
  // Get Factor Zoo stats tool
  createGetFactorZooStatsTool,
  // Run decay monitor tool
  createRunDecayMonitorTool,
  // Update daily weights tool
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
} from "./factorZoo.js";
// Research trigger tools (require FactorZooRepository dependency injection)
export {
  type CheckResearchStatusInput,
  CheckResearchStatusInputSchema,
  type CheckResearchStatusOutput,
  CheckResearchStatusOutputSchema,
  type CheckTriggerConditionsInput,
  CheckTriggerConditionsInputSchema,
  type CheckTriggerConditionsOutput,
  CheckTriggerConditionsOutputSchema,
  createCheckResearchStatusTool,
  createCheckTriggerConditionsTool,
  // Tool factories
  createTriggerResearchTool,
  // Input/Output types
  type TriggerResearchInput,
  // Schemas for validation
  TriggerResearchInputSchema,
  type TriggerResearchOutput,
  TriggerResearchOutputSchema,
} from "./researchTrigger.js";
export { WebSearchInputSchema, WebSearchOutputSchema, webSearchTool } from "./webSearch.js";
