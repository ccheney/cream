/**
 * Core Configuration Schema
 *
 * Defines the foundational configuration for the Cream trading system.
 * Includes environment, LLM settings, and decision timeframe.
 *
 * @see docs/plans/11-configuration.md for full specification
 */

import { z } from "zod";

// ============================================
// Enums
// ============================================

/**
 * Trading environment
 */
export const CreamEnvironment = z.enum(["BACKTEST", "PAPER", "LIVE"]);
export type CreamEnvironment = z.infer<typeof CreamEnvironment>;

// ============================================
// LLM Configuration
// ============================================

/**
 * LLM provider configuration
 *
 * Validates Gemini model IDs (exclusive provider for Cream).
 * Supports gemini-3-pro-preview and gemini-3-flash-preview.
 */
export const LLMConfigSchema = z.object({
	/**
	 * Model ID - must be a valid Gemini 3.x model
	 *
	 * Supported models:
	 * - gemini-3-pro-preview: Best quality, higher latency
	 * - gemini-3-flash-preview: Faster, good for iteration
	 */
	model_id: z
		.string()
		.refine((id) => id.startsWith("gemini-3-pro") || id.startsWith("gemini-3-flash"), {
			message: "Must use Gemini 3.x model (gemini-3-pro-preview or gemini-3-flash-preview)",
		}),
});
export type LLMConfig = z.infer<typeof LLMConfigSchema>;

// ============================================
// Timeframe Configuration
// ============================================

/**
 * Timeframe configuration for market data analysis
 */
export const TimeframesConfigSchema = z.object({
	/**
	 * Primary decision timeframe
	 *
	 * The main candle resolution for trading decisions.
	 * Default: 1h (hourly OODA loop)
	 */
	primary: z.string().default("1h"),

	/**
	 * Additional timeframes for multi-timeframe analysis
	 *
	 * Used for trend confirmation and context.
	 */
	additional: z.array(z.string()).default(["4h", "1d"]),
});
export type TimeframesConfig = z.infer<typeof TimeframesConfigSchema>;

// ============================================
// Core Configuration
// ============================================

/**
 * Core configuration schema
 *
 * Defines environment, LLM settings, and decision parameters.
 */
export const CoreConfigSchema = z.object({
	/**
	 * Trading environment
	 *
	 * - BACKTEST: Historical simulation
	 * - PAPER: Live data, simulated orders
	 * - LIVE: Real trading with real money
	 */
	environment: CreamEnvironment,

	/**
	 * Decision timeframe
	 *
	 * The primary candle resolution for trading decisions.
	 * Agents evaluate and decide at this frequency.
	 */
	decision_timeframe: z.string().default("1h"),

	/**
	 * Maximum consensus iterations
	 *
	 * Number of times agents can iterate to reach consensus.
	 * Prevents infinite loops in disagreement scenarios.
	 */
	iteration_cap: z.number().int().min(1).max(10).default(3),

	/**
	 * LLM configuration
	 */
	llm: LLMConfigSchema,

	/**
	 * Timeframes configuration
	 */
	timeframes: TimeframesConfigSchema.optional(),
});
export type CoreConfig = z.infer<typeof CoreConfigSchema>;
