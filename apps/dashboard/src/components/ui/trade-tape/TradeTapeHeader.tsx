/**
 * TradeTapeHeader Component
 *
 * Header for the TradeTape display with symbol and column labels.
 */

"use client";

import { memo } from "react";

interface TradeTapeHeaderProps {
	symbol: string;
}

export const TradeTapeHeader = memo(function TradeTapeHeader({
	symbol,
}: TradeTapeHeaderProps): React.ReactElement {
	return (
		<div className="flex items-center justify-between px-3 py-2 bg-cream-50 dark:bg-night-700 border-b border-cream-200 dark:border-night-600">
			<span className="text-sm font-medium text-stone-700 dark:text-night-100">
				TRADE TAPE: {symbol}
			</span>
			<div className="flex items-center gap-3 text-xs text-stone-500 dark:text-night-300 font-mono">
				<span>Time</span>
				<span>Price</span>
				<span>Size</span>
				<span>Side</span>
				<span>Exchange</span>
			</div>
		</div>
	);
});

export default TradeTapeHeader;
