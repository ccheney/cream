/**
 * Memory Context Types
 *
 * Types for Case-Based Reasoning (CBR) memory retrieval system.
 * Provides historical trading decisions as context for agent reasoning.
 *
 * @see docs/plans/03-market-snapshot.md - memoryContext
 */

import { z } from "zod";
import { Iso8601Schema } from "./time";

// ============================================
// Case Result Types
// ============================================

/**
 * Outcome result of a historical trade
 */
export const CaseResult = z.enum(["win", "loss", "breakeven", "stopped_out", "expired"]);
export type CaseResult = z.infer<typeof CaseResult>;

// ============================================
// Key Outcomes
// ============================================

/**
 * Outcome metrics for a historical case
 */
export const KeyOutcomesSchema = z.object({
	/** Win/loss/breakeven result */
	result: CaseResult,

	/** Return percentage (positive or negative) */
	return: z.number(),

	/** Holding duration in hours */
	durationHours: z.number().nonnegative(),

	/** Entry price */
	entryPrice: z.number().positive().optional(),

	/** Exit price */
	exitPrice: z.number().positive().optional(),

	/** Maximum adverse excursion (worst drawdown) */
	mae: z.number().optional(),

	/** Maximum favorable excursion (best unrealized gain) */
	mfe: z.number().optional(),
});
export type KeyOutcomes = z.infer<typeof KeyOutcomesSchema>;

// ============================================
// Retrieved Case
// ============================================

/**
 * A historical trading decision retrieved from case memory
 */
export const RetrievedCaseSchema = z.object({
	/** Unique reference to TradeDecision node in case library */
	caseId: z.string().min(1),

	/** Brief human-readable description of the case */
	shortSummary: z.string().min(1),

	/** Outcome metrics: win/loss status, return percentage, holding duration */
	keyOutcomes: KeyOutcomesSchema,

	/** ISO-8601 timestamp when the historical case occurred */
	asOfTimestamp: Iso8601Schema,

	/** Ticker symbol for the instrument */
	ticker: z.string().optional(),

	/** Market regime during the case */
	regime: z.string().optional(),

	/** Similarity score to current context (0-1) */
	similarityScore: z.number().min(0).max(1).optional(),
});
export type RetrievedCase = z.infer<typeof RetrievedCaseSchema>;

// ============================================
// Case Statistics
// ============================================

/**
 * Aggregated statistics across retrieved cases
 */
export const CaseStatisticsSchema = z.object({
	/** Total number of cases retrieved */
	totalCases: z.number().int().nonnegative(),

	/** Win rate across retrieved cases (0-1) */
	winRate: z.number().min(0).max(1).optional(),

	/** Average return percentage */
	avgReturn: z.number().optional(),

	/** Average holding duration in hours */
	avgDuration: z.number().nonnegative().optional(),

	/** Standard deviation of returns */
	returnStdDev: z.number().nonnegative().optional(),

	/** Best return in retrieved cases */
	bestReturn: z.number().optional(),

	/** Worst return in retrieved cases */
	worstReturn: z.number().optional(),

	/** Most common regime across cases */
	dominantRegime: z.string().optional(),

	/** Average similarity score of retrieved cases */
	avgSimilarity: z.number().min(0).max(1).optional(),
});
export type CaseStatistics = z.infer<typeof CaseStatisticsSchema>;

// ============================================
// Memory Context
// ============================================

/**
 * Complete memory context for agent reasoning
 */
export const MemoryContextSchema = z.object({
	/** Similar past decisions retrieved from case memory */
	retrievedCases: z.array(RetrievedCaseSchema).default([]),

	/** Aggregated statistics across retrieved cases */
	caseStatistics: CaseStatisticsSchema.optional(),
});
export type MemoryContext = z.infer<typeof MemoryContextSchema>;

// ============================================
// Helpers
// ============================================

/**
 * Create an empty memory context
 */
export function createEmptyMemoryContext(): MemoryContext {
	return {
		retrievedCases: [],
	};
}

/**
 * Check if memory context has any cases
 */
export function hasMemoryContext(ctx: MemoryContext): boolean {
	return ctx.retrievedCases.length > 0;
}

/**
 * Get the most similar case from memory context
 */
export function getMostSimilarCase(ctx: MemoryContext): RetrievedCase | undefined {
	if (ctx.retrievedCases.length === 0) {
		return undefined;
	}

	// If similarity scores are available, use them
	const withScores = ctx.retrievedCases.filter((c) => c.similarityScore !== undefined);
	if (withScores.length > 0) {
		return withScores.reduce((best, curr) =>
			(curr.similarityScore ?? 0) > (best.similarityScore ?? 0) ? curr : best
		);
	}

	// Otherwise return the first case (assumed to be most relevant)
	return ctx.retrievedCases[0];
}

/**
 * Calculate case statistics from retrieved cases
 */
export function calculateCaseStatistics(cases: RetrievedCase[]): CaseStatistics {
	if (cases.length === 0) {
		return { totalCases: 0 };
	}

	const returns = cases.map((c) => c.keyOutcomes.return);
	const durations = cases.map((c) => c.keyOutcomes.durationHours);
	const wins = cases.filter((c) => c.keyOutcomes.result === "win").length;
	const similarities = cases
		.filter(
			(c): c is RetrievedCase & { similarityScore: number } => c.similarityScore !== undefined
		)
		.map((c) => c.similarityScore);

	// Calculate mean
	const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
	const mean = (arr: number[]) => (arr.length > 0 ? sum(arr) / arr.length : 0);

	// Calculate std dev
	const stdDev = (arr: number[]) => {
		if (arr.length < 2) {
			return 0;
		}
		const avg = mean(arr);
		const squaredDiffs = arr.map((v) => (v - avg) ** 2);
		return Math.sqrt(sum(squaredDiffs) / (arr.length - 1));
	};

	// Find dominant regime
	const regimeCounts = new Map<string, number>();
	for (const c of cases) {
		if (c.regime) {
			regimeCounts.set(c.regime, (regimeCounts.get(c.regime) ?? 0) + 1);
		}
	}
	let dominantRegime: string | undefined;
	let maxCount = 0;
	for (const [regime, count] of regimeCounts) {
		if (count > maxCount) {
			maxCount = count;
			dominantRegime = regime;
		}
	}

	return {
		totalCases: cases.length,
		winRate: wins / cases.length,
		avgReturn: mean(returns),
		avgDuration: mean(durations),
		returnStdDev: stdDev(returns),
		bestReturn: Math.max(...returns),
		worstReturn: Math.min(...returns),
		dominantRegime,
		avgSimilarity: similarities.length > 0 ? mean(similarities) : undefined,
	};
}

/**
 * Filter cases by minimum similarity score
 */
export function filterBySimilarity(cases: RetrievedCase[], minScore: number): RetrievedCase[] {
	return cases.filter((c) => c.similarityScore !== undefined && c.similarityScore >= minScore);
}

/**
 * Filter cases by result type
 */
export function filterByResult(cases: RetrievedCase[], result: CaseResult): RetrievedCase[] {
	return cases.filter((c) => c.keyOutcomes.result === result);
}
