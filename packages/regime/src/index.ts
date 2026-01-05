/**
 * Market Regime Classification Package
 *
 * Provides regime classification for the Cream trading system.
 * Supports rule-based, HMM, and hybrid approaches.
 *
 * @example
 * ```ts
 * import { classifyRegime, createRuleBasedClassifier } from "@cream/regime";
 *
 * // Simple classification
 * const result = classifyRegime({ candles }, config);
 * console.log(result.regime, result.confidence);
 *
 * // Create reusable classifier
 * const classifier = createRuleBasedClassifier(config);
 * const result = classifier({ candles });
 * ```
 *
 * @see docs/plans/11-configuration.md
 */

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

/**
 * Package version.
 */
export const REGIME_VERSION = "0.1.0";
