/**
 * StatisticsFooter Component
 *
 * Footer displaying trade statistics (volume, VWAP, trades/min).
 */

"use client";

import { memo } from "react";

import type { StatisticsFooterProps } from "./types";
import { formatVolume } from "./utils";

export const StatisticsFooter = memo(function StatisticsFooter({
	stats,
}: StatisticsFooterProps): React.ReactElement {
	return (
		<div className="flex items-center gap-4 px-3 py-2 bg-cream-50 dark:bg-night-700 border-t border-cream-200 dark:border-night-600 text-xs font-mono">
			<div className="flex items-center gap-1">
				<span className="text-stone-500 dark:text-night-300">Volume:</span>
				<span className="text-stone-900 dark:text-night-50 font-medium">
					{formatVolume(stats.volume)}
				</span>
			</div>
			<div className="h-3 w-px bg-cream-300 dark:bg-night-600" />
			<div className="flex items-center gap-1">
				<span className="text-stone-500 dark:text-night-300">VWAP:</span>
				<span className="text-stone-900 dark:text-night-50 font-medium">
					${stats.vwap.toFixed(2)}
				</span>
			</div>
			<div className="h-3 w-px bg-cream-300 dark:bg-night-600" />
			<div className="flex items-center gap-1">
				<span className="text-stone-500 dark:text-night-300">Trades/min:</span>
				<span className="text-stone-900 dark:text-night-50 font-medium">
					{stats.tradesPerMinute}
				</span>
			</div>
		</div>
	);
});

export default StatisticsFooter;
