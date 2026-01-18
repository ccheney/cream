"use client";

/**
 * StrategyBreakdownTable Component
 *
 * Table showing decision metrics grouped by strategy family.
 */

import { memo } from "react";
import type { StrategyBreakdownItem } from "@/lib/api/types";

// ============================================
// Types
// ============================================

export interface StrategyBreakdownTableProps {
	data?: StrategyBreakdownItem[];
	isLoading?: boolean;
}

// ============================================
// Skeleton Component
// ============================================

function StrategyBreakdownTableSkeleton() {
	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-5">
			<div className="h-4 w-40 bg-cream-100 dark:bg-night-700 rounded animate-pulse mb-4" />
			<div className="space-y-2">
				{[1, 2, 3, 4].map((i) => (
					<div key={i} className="h-10 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
				))}
			</div>
		</div>
	);
}

// ============================================
// Main Component
// ============================================

export const StrategyBreakdownTable = memo(function StrategyBreakdownTable({
	data,
	isLoading = false,
}: StrategyBreakdownTableProps) {
	if (isLoading) {
		return <StrategyBreakdownTableSkeleton />;
	}

	const hasData = data && data.length > 0;

	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-5">
			<h3 className="text-sm font-medium text-stone-500 dark:text-night-400 uppercase tracking-wide mb-4">
				Strategy Breakdown
			</h3>

			{hasData ? (
				<div className="overflow-x-auto">
					<table className="w-full">
						<thead>
							<tr className="text-left text-xs text-stone-500 dark:text-night-400 uppercase tracking-wider">
								<th className="pb-3 pr-4">Strategy</th>
								<th className="pb-3 px-4 text-right">Decisions</th>
								<th className="pb-3 px-4 text-right">Executed</th>
								<th className="pb-3 px-4 text-right">Approval %</th>
								<th className="pb-3 px-4 text-right">Avg Conf</th>
								<th className="pb-3 pl-4 text-right">Avg Risk</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-cream-100 dark:divide-night-700">
							{data.map((row) => (
								<tr key={row.strategyFamily} className="text-sm">
									<td className="py-3 pr-4">
										<span className="font-medium text-stone-900 dark:text-night-50">
											{row.strategyFamily}
										</span>
									</td>
									<td className="py-3 px-4 text-right font-mono text-stone-700 dark:text-night-200">
										{row.count}
									</td>
									<td className="py-3 px-4 text-right font-mono text-stone-700 dark:text-night-200">
										{row.executedCount}
									</td>
									<td className="py-3 px-4 text-right">
										<span
											className={`font-mono ${
												row.approvalRate >= 70
													? "text-green-600 dark:text-green-400"
													: row.approvalRate >= 40
														? "text-amber-600 dark:text-amber-400"
														: "text-stone-600 dark:text-night-300"
											}`}
										>
											{row.approvalRate.toFixed(1)}%
										</span>
									</td>
									<td className="py-3 px-4 text-right font-mono text-stone-600 dark:text-night-300">
										{row.avgConfidence != null ? `${(row.avgConfidence * 100).toFixed(0)}%` : "—"}
									</td>
									<td className="py-3 pl-4 text-right font-mono text-stone-600 dark:text-night-300">
										{row.avgRisk != null ? `${(row.avgRisk * 100).toFixed(0)}%` : "—"}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<div className="py-8 text-center text-sm text-stone-400 dark:text-night-500">
					No strategy data available
				</div>
			)}
		</div>
	);
});

export default StrategyBreakdownTable;
