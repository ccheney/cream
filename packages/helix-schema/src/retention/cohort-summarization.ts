/**
 * Trade Cohort Summarization Module
 *
 * Provides functions for aggregating trade decisions into cohort summaries
 * to reduce storage while preserving essential trading insights.
 */

import type { TradeCohortSummary, TradeDecisionInfo } from "./types.js";

/**
 * Create a trade cohort summary from multiple decisions.
 *
 * @param period - Time period (e.g., "2024-Q3")
 * @param instrumentId - Instrument identifier
 * @param regimeLabel - Market regime label
 * @param decisions - Trade decisions to summarize
 * @param maxNotableDecisions - Maximum notable decisions to retain (default: 5)
 * @returns Trade cohort summary
 */
export function createTradeCohortSummary(
	period: string,
	instrumentId: string,
	regimeLabel: string,
	decisions: TradeDecisionInfo[],
	maxNotableDecisions = 5
): TradeCohortSummary {
	if (decisions.length === 0) {
		throw new Error("Cannot create summary from empty decisions array");
	}

	const wins = decisions.filter((d) => d.isWin);
	const winRate = wins.length / decisions.length;

	const avgReturn = decisions.reduce((sum, d) => sum + d.returnPct, 0) / decisions.length;

	const holdingDays = decisions
		.filter((d): d is typeof d & { closedAt: Date } => d.closedAt !== undefined)
		.map((d) => {
			const diff = d.closedAt.getTime() - d.createdAt.getTime();
			return diff / (1000 * 60 * 60 * 24);
		});
	const avgHoldingDays =
		holdingDays.length > 0 ? holdingDays.reduce((sum, d) => sum + d, 0) / holdingDays.length : 0;

	const totalPnl = decisions.reduce((sum, d) => sum + d.realizedPnl, 0);

	const sortedByAbsPnl = decisions.toSorted(
		(a, b) => Math.abs(b.realizedPnl) - Math.abs(a.realizedPnl)
	);
	const notableDecisionIds = sortedByAbsPnl.slice(0, maxNotableDecisions).map((d) => d.decisionId);

	return {
		summaryType: "trade_cohort",
		period,
		instrumentId,
		regimeLabel,
		stats: {
			totalDecisions: decisions.length,
			winRate,
			avgReturn,
			avgHoldingDays,
			totalPnl,
		},
		notableDecisionIds,
	};
}

/**
 * Group trade decisions by period and instrument for cohort summarization.
 *
 * @param decisions - Trade decisions to group
 * @param periodFormatter - Function to format period from date (default: quarterly)
 * @returns Map of cohort key to decisions
 */
export function groupDecisionsForSummarization(
	decisions: TradeDecisionInfo[],
	periodFormatter: (date: Date) => string = formatQuarterlyPeriod
): Map<string, TradeDecisionInfo[]> {
	return Map.groupBy(decisions, (decision) => {
		const period = periodFormatter(decision.createdAt);
		return `${period}:${decision.instrumentId}:${decision.regimeLabel}`;
	});
}

/**
 * Format a date as a quarterly period string (e.g., "2024-Q3")
 */
export function formatQuarterlyPeriod(date: Date): string {
	const year = date.getFullYear();
	const quarter = Math.floor(date.getMonth() / 3) + 1;
	return `${year}-Q${quarter}`;
}

/**
 * Format a date as a monthly period string (e.g., "2024-03")
 */
export function formatMonthlyPeriod(date: Date): string {
	const year = date.getFullYear();
	const month = (date.getMonth() + 1).toString().padStart(2, "0");
	return `${year}-${month}`;
}
