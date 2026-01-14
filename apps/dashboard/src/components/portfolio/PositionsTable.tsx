/**
 * @see docs/plans/ui/40-streaming-data-integration.md Part 4.2
 */

"use client";

import { memo } from "react";
import type { StreamingPosition } from "@/hooks/usePortfolioStreaming";
import { PositionRow } from "./PositionRow";

export interface PositionsTableProps {
	positions: StreamingPosition[];
	isLoading?: boolean;
}

export const PositionsTable = memo(function PositionsTable({
	positions,
	isLoading = false,
}: PositionsTableProps) {
	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
			<div className="p-4 border-b border-cream-200 dark:border-night-700 flex items-center justify-between">
				<h2 className="text-lg font-medium text-stone-900 dark:text-night-50">Open Positions</h2>
				<div className="flex items-center gap-3">
					{positions.some((p) => p.isStreaming) && (
						<div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
							<span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
							Live
						</div>
					)}
					<span className="text-sm text-stone-500 dark:text-night-300">
						{positions.length} positions
					</span>
				</div>
			</div>

			{isLoading ? (
				<div className="p-4 space-y-2">
					{[1, 2, 3].map((i) => (
						<div key={i} className="h-12 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
					))}
				</div>
			) : positions.length > 0 ? (
				<div className="overflow-x-auto">
					<table className="w-full">
						<thead className="bg-cream-50 dark:bg-night-750">
							<tr className="text-left text-sm text-stone-500 dark:text-night-300">
								<th className="px-4 py-3 font-medium">Symbol</th>
								<th className="px-4 py-3 font-medium">Side</th>
								<th className="px-4 py-3 font-medium text-right">Qty</th>
								<th className="px-4 py-3 font-medium text-right">Avg Entry</th>
								<th className="px-4 py-3 font-medium text-right">Current</th>
								<th className="px-4 py-3 font-medium text-right">Market Value</th>
								<th className="px-4 py-3 font-medium text-right">P&L</th>
								<th className="px-4 py-3 font-medium text-right">P&L %</th>
								<th className="px-4 py-3 font-medium text-right">Days Held</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-cream-100 dark:divide-night-700">
							{positions.map((position) => (
								<PositionRow key={position.id} position={position} />
							))}
						</tbody>
					</table>
				</div>
			) : (
				<div className="p-8 text-center text-stone-400 dark:text-night-400">No positions</div>
			)}
		</div>
	);
});

export default PositionsTable;
