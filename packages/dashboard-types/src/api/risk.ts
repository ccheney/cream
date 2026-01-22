/**
 * Risk API Types
 *
 * Types for risk metrics, exposure, Greeks, correlations, VaR, and limits.
 */

import { z } from "zod";

// ============================================
// Exposure Metrics
// ============================================

export const ExposureMetricsSchema = z.object({
	gross: z.object({
		current: z.number(),
		limit: z.number(),
		pct: z.number(),
	}),
	net: z.object({
		current: z.number(),
		limit: z.number(),
		pct: z.number(),
	}),
	long: z.number(),
	short: z.number(),
	concentrationMax: z.object({
		symbol: z.string(),
		pct: z.number(),
	}),
	sectorExposure: z.record(z.string(), z.number()),
});

export type ExposureMetrics = z.infer<typeof ExposureMetricsSchema>;

// ============================================
// Options Greeks
// ============================================

export const PositionGreeksSchema = z.object({
	symbol: z.string(),
	delta: z.number(),
	gamma: z.number(),
	vega: z.number(),
	theta: z.number(),
});

export type PositionGreeks = z.infer<typeof PositionGreeksSchema>;

export const GreeksSummarySchema = z.object({
	delta: z.object({ current: z.number(), limit: z.number() }),
	gamma: z.object({ current: z.number(), limit: z.number() }),
	vega: z.object({ current: z.number(), limit: z.number() }),
	theta: z.object({ current: z.number(), limit: z.number() }),
	byPosition: z.array(PositionGreeksSchema),
});

export type GreeksSummary = z.infer<typeof GreeksSummarySchema>;

// ============================================
// Correlation Matrix
// ============================================

export const CorrelationMatrixSchema = z.object({
	symbols: z.array(z.string()),
	matrix: z.array(z.array(z.number())),
	highCorrelationPairs: z.array(
		z.object({
			a: z.string(),
			b: z.string(),
			correlation: z.number(),
		}),
	),
});

export type CorrelationMatrix = z.infer<typeof CorrelationMatrixSchema>;

// ============================================
// Value at Risk (VaR)
// ============================================

export const VaRMethodSchema = z.enum(["historical", "parametric"]);
export type VaRMethod = z.infer<typeof VaRMethodSchema>;

export const VaRMetricsSchema = z.object({
	oneDay95: z.number(),
	oneDay99: z.number(),
	tenDay95: z.number(),
	method: VaRMethodSchema,
});

export type VaRMetrics = z.infer<typeof VaRMetricsSchema>;

// ============================================
// Risk Limits
// ============================================

export const LimitCategorySchema = z.enum(["per_instrument", "portfolio", "options"]);
export type LimitCategory = z.infer<typeof LimitCategorySchema>;

export const LimitStatusValueSchema = z.enum(["ok", "warning", "critical"]);
export type LimitStatusValue = z.infer<typeof LimitStatusValueSchema>;

export const LimitStatusSchema = z.object({
	name: z.string(),
	category: LimitCategorySchema,
	current: z.number(),
	limit: z.number(),
	utilization: z.number(),
	status: LimitStatusValueSchema,
});

export type LimitStatus = z.infer<typeof LimitStatusSchema>;
