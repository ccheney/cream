/**
 * Macro Watch Configuration Schema
 *
 * Configuration for the overnight macro watch scanning and morning newspaper compilation.
 *
 * @see docs/plans/42-overnight-macro-watch.md
 */

import { z } from "zod";

/**
 * News symbol filter mode.
 * - "universe": Only scan news for universe symbols
 * - "all": Scan all news (broader coverage)
 */
export const NewsSymbolFilter = z.enum(["universe", "all"]);
export type NewsSymbolFilter = z.infer<typeof NewsSymbolFilter>;

/**
 * Macro Watch configuration schema.
 *
 * Controls the overnight macro watch scanning behavior.
 */
export const MacroWatchConfigSchema = z.object({
	/** Whether macro watch is enabled. Default: true */
	enabled: z.boolean().default(true),

	/** Maximum entries to accumulate per hourly scan. Default: 5 */
	maxEntriesPerHour: z.number().int().positive().default(5),

	/** Filter mode for news scanning. Default: "universe" */
	newsSymbolFilter: NewsSymbolFilter.default("universe"),

	/** Minimum prediction market delta to trigger an entry (0.02 = 2%). Default: 0.02 */
	predictionDeltaThreshold: z.number().min(0).max(1).default(0.02),
});

export type MacroWatchConfig = z.infer<typeof MacroWatchConfigSchema>;

/**
 * Morning Newspaper configuration schema.
 *
 * Controls the morning newspaper compilation behavior.
 */
export const NewspaperConfigSchema = z.object({
	/** Whether newspaper compilation is enabled. Default: true */
	enabled: z.boolean().default(true),

	/** Whether to use LLM summarization for newspaper. Default: false */
	summarizationEnabled: z.boolean().default(false),

	/** Maximum bullets per section. Default: 5 */
	maxBulletsPerSection: z.number().int().positive().default(5),

	/** Model to use for summarization (if enabled). Default: "gemini-3-flash" */
	summarizationModel: z.string().default("gemini-3-flash"),
});

export type NewspaperConfig = z.infer<typeof NewspaperConfigSchema>;

/**
 * Create default macro watch configuration.
 */
export function createDefaultMacroWatchConfig(): MacroWatchConfig {
	return MacroWatchConfigSchema.parse({});
}

/**
 * Create default newspaper configuration.
 */
export function createDefaultNewspaperConfig(): NewspaperConfig {
	return NewspaperConfigSchema.parse({});
}
