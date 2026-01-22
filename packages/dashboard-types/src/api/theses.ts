/**
 * Theses API Types
 *
 * Types for investment theses and thesis history tracking.
 */

import { z } from "zod";

// ============================================
// Thesis Enums
// ============================================

export const ThesisDirectionSchema = z.enum(["BULLISH", "BEARISH", "NEUTRAL"]);
export type ThesisDirection = z.infer<typeof ThesisDirectionSchema>;

export const ThesisStatusSchema = z.enum(["ACTIVE", "INVALIDATED", "REALIZED"]);
export type ThesisStatus = z.infer<typeof ThesisStatusSchema>;

// ============================================
// Thesis Schema
// ============================================

export const ThesisSchema = z.object({
	id: z.string(),
	symbol: z.string(),
	thesis: z.string(),
	direction: ThesisDirectionSchema,
	status: ThesisStatusSchema,
	timeHorizon: z.string(),
	confidence: z.number().nullable(),
	targetPrice: z.number().nullable(),
	stopPrice: z.number().nullable(),
	catalysts: z.array(z.string()),
	agentSource: z.string(),
	pnlPct: z.number().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

export type Thesis = z.infer<typeof ThesisSchema>;

// ============================================
// Thesis History
// ============================================

export const ThesisHistoryEntrySchema = z.object({
	id: z.string(),
	thesisId: z.string(),
	field: z.string(),
	oldValue: z.string(),
	newValue: z.string(),
	changedBy: z.string(),
	changedAt: z.string(),
});

export type ThesisHistoryEntry = z.infer<typeof ThesisHistoryEntrySchema>;
