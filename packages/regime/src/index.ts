/**
 * Market Regime Classification Package
 *
 * Provides regime classification for the Cream trading system.
 * Supports rule-based, GMM, and hybrid approaches.
 *
 * @example
 * ```ts
 * import { classifyRegime, createRuleBasedClassifier, trainGMM, classifyWithGMM } from "@cream/regime";
 *
 * // Rule-based classification (simple, interpretable)
 * const result = classifyRegime({ candles }, config);
 * console.log(result.regime, result.confidence);
 *
 * // GMM-based classification (data-driven)
 * const model = trainGMM(trainingCandles);
 * const classification = classifyWithGMM(model, testCandles);
 *
 * // Track regime transitions
 * const detector = new RegimeTransitionDetector();
 * const transition = detector.update("AAPL", "BULL_TREND", timestamp, 0.8);
 * ```
 *
 * @see docs/plans/02-data-layer.md
 */

// Feature extraction
export {
	calculateMean,
	calculateStd,
	calculateZScore,
	DEFAULT_FEATURE_CONFIG,
	extractFeatures,
	extractSingleFeature,
	type FeatureExtractionConfig,
	getMinimumCandleCount,
	normalizeFeatures,
	normalizeFeatureVector,
	type RegimeFeatures,
} from "./features";
// GMM classifier
export {
	classifySeriesWithGMM,
	classifyWithGMM,
	DEFAULT_GMM_CONFIG,
	deserializeGMMModel,
	type GMMClassification,
	type GMMCluster,
	type GMMConfig,
	type GMMModel,
	serializeGMMModel,
	trainGMM,
} from "./gmmClassifier";
// Rule-based classifier
export {
	classifyRegime,
	createRuleBasedClassifier,
	DEFAULT_RULE_BASED_CONFIG,
	getRequiredCandleCount,
	hasEnoughData,
	type RegimeClassification,
	type RegimeInput,
} from "./ruleBasedClassifier";

// Transition detection
export {
	analyzeTransitions,
	calculateTransitionMatrix,
	DEFAULT_TRANSITION_CONFIG,
	type RegimeState,
	type RegimeTransition,
	RegimeTransitionDetector,
	type TransitionDetectorConfig,
	type TransitionUpdateResult,
} from "./transitions";

/**
 * Package version.
 */
export const REGIME_VERSION = "0.1.0";
