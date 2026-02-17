import { z } from "zod";

export const ParityPerformanceMetricsSchema = z.object({
	sharpeRatio: z.number(),
	sortinoRatio: z.number(),
	calmarRatio: z.number(),
	maxDrawdownPct: z.number(),
	totalReturnPct: z.number(),
	winRatePct: z.number(),
	winLossRatio: z.number(),
	tradeCount: z.number().int().nonnegative(),
	periodDays: z.number().positive(),
});

export type ParityPerformanceMetrics = z.infer<typeof ParityPerformanceMetricsSchema>;

export interface StatisticalParityResult {
	withinTolerance: boolean;
	parityScore: number;
	metricComparisons: Array<{
		metric: keyof ParityPerformanceMetrics;
		researchValue: number;
		liveValue: number;
		differencePercent: number;
		withinTolerance: boolean;
	}>;
	recommendation: "APPROVE" | "INVESTIGATE" | "REJECT";
	reason: string;
}

export const DEFAULT_METRIC_TOLERANCES: Record<keyof ParityPerformanceMetrics, number> = {
	sharpeRatio: 20,
	sortinoRatio: 25,
	calmarRatio: 30,
	maxDrawdownPct: 15,
	totalReturnPct: 20,
	winRatePct: 10,
	winLossRatio: 20,
	tradeCount: 10,
	periodDays: 0,
};

const METRIC_KEYS: (keyof ParityPerformanceMetrics)[] = [
	"sharpeRatio",
	"sortinoRatio",
	"calmarRatio",
	"maxDrawdownPct",
	"totalReturnPct",
	"winRatePct",
	"winLossRatio",
	"tradeCount",
	"periodDays",
];

function calculateDifferencePercent(researchValue: number, liveValue: number): number {
	if (researchValue === 0 && liveValue === 0) {
		return 0;
	}

	if (researchValue === 0) {
		return 100;
	}

	return Math.abs((liveValue - researchValue) / researchValue) * 100;
}

function getRecommendation(
	parityScore: number,
): Pick<StatisticalParityResult, "recommendation" | "reason"> {
	if (parityScore >= 0.9) {
		return {
			recommendation: "APPROVE",
			reason: `${Math.round(parityScore * 100)}% of metrics within tolerance. Strategy performs consistently.`,
		};
	}

	if (parityScore >= 0.7) {
		return {
			recommendation: "INVESTIGATE",
			reason: `${Math.round(parityScore * 100)}% of metrics within tolerance. Some divergence detected - investigate before going LIVE.`,
		};
	}

	return {
		recommendation: "REJECT",
		reason: `Only ${Math.round(parityScore * 100)}% of metrics within tolerance. Significant parity issues detected.`,
	};
}

export function comparePerformanceMetrics(
	research: ParityPerformanceMetrics,
	live: ParityPerformanceMetrics,
	tolerances: Partial<Record<keyof ParityPerformanceMetrics, number>> = {},
): StatisticalParityResult {
	const mergedTolerances = { ...DEFAULT_METRIC_TOLERANCES, ...tolerances };
	const metricComparisons: StatisticalParityResult["metricComparisons"] = [];
	let withinToleranceCount = 0;

	for (const metric of METRIC_KEYS) {
		const researchValue = research[metric];
		const liveValue = live[metric];
		const differencePercent = calculateDifferencePercent(researchValue, liveValue);
		const tolerance = mergedTolerances[metric];
		const withinTolerance = differencePercent <= tolerance;

		if (withinTolerance) {
			withinToleranceCount++;
		}

		metricComparisons.push({
			metric,
			researchValue,
			liveValue,
			differencePercent,
			withinTolerance,
		});
	}

	const parityScore = withinToleranceCount / METRIC_KEYS.length;
	const recommendation = getRecommendation(parityScore);

	return {
		withinTolerance: parityScore >= 0.8,
		parityScore,
		metricComparisons,
		recommendation: recommendation.recommendation,
		reason: recommendation.reason,
	};
}
