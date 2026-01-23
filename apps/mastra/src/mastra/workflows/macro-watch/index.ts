/**
 * Macro Watch Workflow
 *
 * Newspaper-style macro environment summary workflow.
 */

// Entry schemas for scanner/runner (compatible with @cream/storage)
export * from "./entry-schemas.js";
// Newspaper compilation utilities
export {
	compileMorningNewspaper,
	compileNewspaper,
	createNewspaperContent,
	formatNewspaperForLLM,
	type NewspaperContent,
	prepareNewspaperForStorage,
} from "./newspaper.js";
// Runner function for direct invocation
export { runMacroWatch } from "./runner.js";
// Workflow schemas for Mastra workflow
export * from "./schemas.js";
// Workflow steps
export * from "./steps/index.js";
// Workflow definition
export { macroWatchWorkflow } from "./workflow.js";
