/**
 * Mastra Tool Definitions
 *
 * Exports Mastra-compatible tool definitions for agent use.
 * These tools wrap the core implementations with proper schemas
 * for input validation and output typing.
 */

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
