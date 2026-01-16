/**
 * MacroWatch Workflow Schemas
 *
 * Zod schemas for the MacroWatch workflow inputs and outputs.
 *
 * @see docs/plans/42-overnight-macro-watch.md
 */

import { z } from "zod";

// ============================================
// Entry Schemas
// ============================================

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

// ============================================
// Workflow Input/Output Schemas
// ============================================

export const MacroWatchInputSchema = z.object({
	symbols: z.array(z.string()),
	since: z.string(),
});
export type MacroWatchInput = z.infer<typeof MacroWatchInputSchema>;

export const MacroWatchOutputSchema = z.object({
	entries: z.array(MacroWatchEntrySchema),
	totalCount: z.number(),
	timestamp: z.string(),
});
export type MacroWatchOutput = z.infer<typeof MacroWatchOutputSchema>;

// ============================================
// Scanner Output Schemas
// ============================================

export const NewsScanOutputSchema = z.object({
	entries: z.array(MacroWatchEntrySchema),
	newsCount: z.number(),
});
export type NewsScanOutput = z.infer<typeof NewsScanOutputSchema>;

export const PredictionScanOutputSchema = z.object({
	entries: z.array(MacroWatchEntrySchema),
	predictionCount: z.number(),
});
export type PredictionScanOutput = z.infer<typeof PredictionScanOutputSchema>;

export const EconomicScanOutputSchema = z.object({
	entries: z.array(MacroWatchEntrySchema),
	economicCount: z.number(),
});
export type EconomicScanOutput = z.infer<typeof EconomicScanOutputSchema>;

export const MoverScanOutputSchema = z.object({
	entries: z.array(MacroWatchEntrySchema),
	moverCount: z.number(),
});
export type MoverScanOutput = z.infer<typeof MoverScanOutputSchema>;

// ============================================
// Persist Step Schema
// ============================================

export const PersistOutputSchema = z.object({
	persisted: z.number(),
	success: z.boolean(),
});
export type PersistOutput = z.infer<typeof PersistOutputSchema>;
