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
		<div>
			{isLoading ? (
				<div className="p-4 space-y-2">
					{[1, 2, 3].map((i) => (
						<div key={i} className="h-12 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
					))}
				</div>
			) : positions.length > 0 ? (
				<div className="overflow-x-auto">
					<table className="w-full">
						<thead className="bg-cream-50 dark:bg-night-700">
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
