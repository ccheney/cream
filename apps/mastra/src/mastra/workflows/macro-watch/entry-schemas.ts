/**
 * MacroWatch Entry Schemas
 *
 * Zod schemas for MacroWatch entries used by scanners and runners.
 * These schemas are compatible with @cream/storage MacroWatchEntry type.
 *
 * @see docs/plans/42-overnight-macro-watch.md
 */

import { z } from "zod";

export const MacroWatchSessionSchema = z.enum(["OVERNIGHT", "PRE_MARKET", "AFTER_HOURS"]);
export type MacroWatchSession = z.infer<typeof MacroWatchSessionSchema>;

export const MacroWatchCategorySchema = z.enum([
	"NEWS",
	"PREDICTION",
	"ECONOMIC",
	"MOVER",
	"EARNINGS",
]);
export type MacroWatchCategory = z.infer<typeof MacroWatchCategorySchema>;

export const MacroWatchEntrySchema = z.object({
	id: z.string().optional(), // Auto-generated as uuidv7 by database
	timestamp: z.string(),
	session: MacroWatchSessionSchema,
	category: MacroWatchCategorySchema,
	headline: z.string(),
	symbols: z.array(z.string()),
	source: z.string(),
	metadata: z.record(z.string(), z.unknown()).optional(),
});
export type MacroWatchEntry = z.infer<typeof MacroWatchEntrySchema>;

export const MacroWatchRunInputSchema = z.object({
	symbols: z.array(z.string()),
	since: z.string(),
});
export type MacroWatchRunInput = z.infer<typeof MacroWatchRunInputSchema>;

export const MacroWatchRunOutputSchema = z.object({
	entries: z.array(MacroWatchEntrySchema),
	totalCount: z.number(),
	timestamp: z.string(),
});
export type MacroWatchRunOutput = z.infer<typeof MacroWatchRunOutputSchema>;
