/**
 * Constraints Configuration Schema
 *
 * Defines risk constraints for position sizing and portfolio limits.
 * Includes per-instrument, portfolio-level, and options-specific constraints.
 *
 * @see docs/plans/11-configuration.md for full specification
 */

import { z } from "zod";

// ============================================
// Per-Instrument Constraints
// ============================================

/**
 * Per-instrument position limits
 */
export const PerInstrumentConstraintsSchema = z.object({
	/**
	 * Maximum units (shares/contracts) per instrument
	 */
	max_units: z.number().int().positive().default(1000),

	/**
	 * Maximum notional value per instrument
	 */
	max_notional: z.number().positive().default(50000),

	/**
	 * Maximum percentage of equity per instrument
	 */
	max_pct_equity: z.number().min(0).max(1).default(0.1),
});
export type PerInstrumentConstraints = z.infer<typeof PerInstrumentConstraintsSchema>;

// ============================================
// Portfolio Constraints
// ============================================

/**
 * Portfolio-level position limits
 */
export const PortfolioConstraintsSchema = z.object({
	/**
	 * Maximum gross notional (sum of absolute values)
	 */
	max_gross_notional: z.number().positive().default(500000),

	/**
	 * Maximum net notional (long - short)
	 */
	max_net_notional: z.number().positive().default(250000),

	/**
	 * Maximum gross exposure as percentage of equity
	 *
	 * > 1.0 indicates leverage
	 */
	max_gross_pct_equity: z.number().positive().default(2.0),

	/**
	 * Maximum net exposure as percentage of equity
	 */
	max_net_pct_equity: z.number().positive().default(1.0),
});
export type PortfolioConstraints = z.infer<typeof PortfolioConstraintsSchema>;

// ============================================
// Options Greeks Constraints
// ============================================

/**
 * Options Greeks risk limits
 *
 * Controls exposure to various options risk factors.
 */
export const OptionsGreeksConstraintsSchema = z.object({
	/**
	 * Maximum delta notional (directional stock-equivalent exposure)
	 */
	max_delta_notional: z.number().positive().default(100000),

	/**
	 * Maximum gamma (rate of delta change, convexity risk)
	 */
	max_gamma: z.number().positive().default(1000),

	/**
	 * Maximum vega (sensitivity to IV changes, volatility risk)
	 */
	max_vega: z.number().positive().default(5000),

	/**
	 * Maximum theta (time decay cost for long positions)
	 *
	 * Negative value represents cost cap for buyers.
	 */
	max_theta: z.number().negative().default(-500),
});
export type OptionsGreeksConstraints = z.infer<typeof OptionsGreeksConstraintsSchema>;

// ============================================
// Sizing Constraints
// ============================================

/**
 * Position sizing sanity checks
 */
export const SizingConstraintsSchema = z.object({
	/**
	 * Multiplier for flagging unusually large positions
	 *
	 * Positions > multiplier * typical_size trigger warnings
	 */
	sanity_threshold_multiplier: z.number().positive().default(3.0),
});
export type SizingConstraints = z.infer<typeof SizingConstraintsSchema>;

// ============================================
// Complete Constraints Configuration
// ============================================

/**
 * Complete constraints configuration
 */
export const ConstraintsConfigSchema = z.object({
	/**
	 * Per-instrument limits
	 */
	per_instrument: PerInstrumentConstraintsSchema.optional(),

	/**
	 * Portfolio-level limits
	 */
	portfolio: PortfolioConstraintsSchema.optional(),

	/**
	 * Options Greeks limits
	 */
	options: OptionsGreeksConstraintsSchema.optional(),

	/**
	 * Sizing sanity checks
	 */
	sizing: SizingConstraintsSchema.optional(),
});
export type ConstraintsConfig = z.infer<typeof ConstraintsConfigSchema>;
