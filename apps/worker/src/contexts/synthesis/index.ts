/**
 * Synthesis Bounded Context
 *
 * Indicator synthesis scheduling and trigger detection.
 * Runs daily to check if new indicators should be synthesized
 * based on regime gaps, alpha decay, or performance degradation.
 */

export { mapRegimeToTriggerFormat } from "./regime-mapper.js";
export {
	createIndicatorSynthesisScheduler,
	IndicatorSynthesisScheduler,
	type SynthesisSchedulerDependencies,
	type SynthesisSchedulerState,
	startIndicatorSynthesisScheduler,
} from "./synthesis-scheduler.js";
