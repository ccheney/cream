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
  // Get current weights tool
  createGetCurrentWeightsTool,
  // Get Factor Zoo stats tool
  createGetFactorZooStatsTool,
  // Update daily weights tool
  createUpdateDailyWeightsTool,
  type GetCurrentWeightsInput,
  GetCurrentWeightsInputSchema,
  type GetCurrentWeightsOutput,
  GetCurrentWeightsOutputSchema,
  type GetFactorZooStatsInput,
  GetFactorZooStatsInputSchema,
  type GetFactorZooStatsOutput,
  GetFactorZooStatsOutputSchema,
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
