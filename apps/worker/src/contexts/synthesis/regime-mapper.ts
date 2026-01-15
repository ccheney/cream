/**
 * Regime Mapper
 *
 * Maps between different regime representations used in the system.
 */

import type { RegimeType } from "@cream/storage";

/**
 * Map regime_labels regime types to trigger detection regime types.
 * The regime_labels table uses lowercase with underscores, but the
 * TriggerDetectionState expects the string format used by activeRegimes.
 */
export function mapRegimeToTriggerFormat(regime: RegimeType): string {
	const mapping: Record<RegimeType, string> = {
		bull_trend: "bull",
		bear_trend: "bear",
		range_bound: "sideways",
		high_volatility: "volatile",
		low_volatility: "low_vol",
		crisis: "crisis",
	};
	return mapping[regime] ?? regime;
}
