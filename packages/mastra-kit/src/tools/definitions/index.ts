/**
 * Mastra Tool Definitions
 *
 * Exports Mastra-compatible tool definitions for agent use.
 * These tools wrap the core implementations with proper schemas
 * for input validation and output typing.
 */

export { WebSearchInputSchema, WebSearchOutputSchema, webSearchTool } from "./webSearch.js";
