/**
 * Indicator Synthesis Workflow Module
 *
 * Exports the indicator synthesis workflow and its types.
 */

export {
	gatherTriggerContextStep,
	generateHypothesisStep,
	implementIndicatorStep,
	initiatePaperTradingStep,
	type PaperTradingInput,
	type PaperTradingOutput,
	type TriggerContextInput,
	type TriggerContextOutput,
	type ValidationOutput,
	validateIndicatorStep,
} from "./steps.js";
export {
	type IndicatorSynthesisInput,
	type IndicatorSynthesisOutput,
	indicatorSynthesisWorkflow,
} from "./workflow.js";
