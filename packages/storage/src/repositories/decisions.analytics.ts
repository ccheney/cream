import type { DecisionAnalytics } from "./decisions.types";

type DistributionRow<TKey extends string> = Record<TKey, string> & { count: number };

type DecisionScoreRow = {
	total: number;
	avgConfidence: string | null;
	avgRisk: string | null;
};

function toDistribution<TKey extends string>(
	rows: DistributionRow<TKey>[],
	key: TKey,
): Record<string, number> {
	const distribution: Record<string, number> = {};

	for (const row of rows) {
		distribution[row[key]] = row.count;
	}

	return distribution;
}

function toNumberOrNull(value: string | null): number | null {
	return value ? Number(value) : null;
}

export function buildDecisionAnalytics(
	statusCounts: DistributionRow<"status">[],
	actionCounts: DistributionRow<"action">[],
	directionCounts: DistributionRow<"direction">[],
	scores: DecisionScoreRow | undefined,
): DecisionAnalytics {
	const statusDistribution = toDistribution(statusCounts, "status");
	const total = scores?.total ?? 0;
	const executed = statusDistribution.executed ?? 0;
	const approved = statusDistribution.approved ?? 0;
	const executionRate = total > 0 ? ((executed + approved) / total) * 100 : 0;

	return {
		totalDecisions: total,
		executionRate,
		statusDistribution,
		actionDistribution: toDistribution(actionCounts, "action"),
		directionDistribution: toDistribution(directionCounts, "direction"),
		avgConfidence: toNumberOrNull(scores?.avgConfidence ?? null),
		avgRisk: toNumberOrNull(scores?.avgRisk ?? null),
	};
}
