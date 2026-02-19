"use client";

import { Plus } from "lucide-react";
import { memo } from "react";
import { type Quote, TickerItem } from "./ticker-item";
import {
	type TickerListItem,
	type TickerStripProps,
	useTickerStripState,
} from "./ticker-strip/hooks";

function TickerStripContent({
	scrollContainerRef,
	symbolItems,
	canScrollLeft,
	canScrollRight,
	onSymbolAdd,
	allowAdd,
	allowRemove,
	showSparkline,
	showTickHistory,
	onSymbolClick,
	onSymbolRemove,
	scrollLeft,
	scrollRight,
}: {
	scrollContainerRef: React.RefObject<HTMLDivElement | null>;
	symbolItems: TickerListItem[];
	canScrollLeft: boolean;
	canScrollRight: boolean;
	onSymbolAdd?: () => void;
	allowAdd: boolean;
	onSymbolRemove?: (symbol: string) => void;
	allowRemove: boolean;
	showSparkline: boolean;
	showTickHistory: boolean;
	onSymbolClick?: (symbol: string) => void;
	scrollLeft: () => void;
	scrollRight: () => void;
}) {
	return (
		<div className="relative flex items-stretch bg-white dark:bg-night-800 border-b border-cream-200 dark:border-night-700">
			{canScrollLeft && (
				<button
					type="button"
					onClick={scrollLeft}
					className="absolute left-0 top-0 bottom-0 w-8 z-10 bg-gradient-to-r from-white dark:from-night-800 to-transparent flex items-center justify-start pl-1 hover:from-cream-100 dark:hover:from-night-700"
					aria-label="Scroll left"
				>
					<span className="text-stone-400 dark:text-night-400">‹</span>
				</button>
			)}

			<div
				ref={scrollContainerRef}
				className="flex overflow-x-auto scrollbar-hide"
				style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
			>
				{symbolItems.map(({ symbol, quote, previousPrice, tickHistory, priceHistory }) => (
					<TickerItem
						key={symbol}
						symbol={symbol}
						quote={quote}
						previousPrice={previousPrice}
						tickHistory={tickHistory}
						priceHistory={priceHistory}
						showSparkline={showSparkline}
						showTickHistory={showTickHistory}
						onClick={onSymbolClick}
						onRemove={allowRemove ? onSymbolRemove : undefined}
						showRemove={allowRemove}
						data-testid={`ticker-item-${symbol}`}
					/>
				))}

				{allowAdd && (
					<button
						type="button"
						onClick={onSymbolAdd}
						className="flex items-center justify-center px-4 py-2 min-w-[60px] text-stone-400 dark:text-night-400 hover:text-stone-600 dark:text-night-200 dark:hover:text-cream-300 hover:bg-cream-50 dark:hover:bg-night-700 transition-colors duration-150"
						aria-label="Add symbol to watchlist"
					>
						<Plus className="w-4 h-4" />
					</button>
				)}
			</div>

			{canScrollRight && (
				<button
					type="button"
					onClick={scrollRight}
					className="absolute right-0 top-0 bottom-0 w-8 z-10 bg-gradient-to-l from-white dark:from-night-800 to-transparent flex items-center justify-end pr-1 hover:from-cream-100 dark:hover:from-night-700"
					aria-label="Scroll right"
				>
					<span className="text-stone-400 dark:text-night-400">›</span>
				</button>
			)}
		</div>
	);
}

/**
 * TickerStrip displays a horizontal strip of watchlist symbols with live quotes.
 *
 * Features:
 * - Real-time price updates via WebSocket
 * - Flash animation on price changes
 * - Tick direction history dots
 * - Optional sparkline for each item
 * - Horizontal scroll on overflow
 * - Add/remove symbols
 * - Click to navigate to charts
 *
 * @example
 * ```tsx
 * <TickerStrip
 *   symbols={['AAPL', 'NVDA', 'SPY', 'MSFT']}
 *   onSymbolClick={(sym) => router.push(`/charts/${sym}`)}
 *   onSymbolRemove={(sym) => removeFromWatchlist(sym)}
 *   onSymbolAdd={() => setShowAddModal(true)}
 *   showSparkline
 *   showTickHistory
 * />
 * ```
 */
export const TickerStrip = memo(function TickerStrip({
	symbols,
	onSymbolClick,
	onSymbolRemove,
	onSymbolAdd,
	showSparkline = false,
	showTickHistory = true,
	allowRemove = true,
	allowAdd = true,
	className = "",
	"data-testid": testId,
}: TickerStripProps) {
	const {
		scrollContainerRef,
		symbolItems,
		canScrollLeft,
		canScrollRight,
		scrollLeft,
		scrollRight,
		hasSymbols,
	} = useTickerStripState({
		symbols,
		onSymbolAdd,
		onSymbolRemove,
		onSymbolClick,
		showSparkline,
		showTickHistory,
		allowAdd,
		allowRemove,
		className,
		"data-testid": testId,
	});

	if (!hasSymbols && !allowAdd) {
		return null;
	}

	return (
		<div className={`relative flex items-stretch ${className}`}>
			<TickerStripContent
				scrollContainerRef={scrollContainerRef}
				symbolItems={symbolItems}
				canScrollLeft={canScrollLeft}
				canScrollRight={canScrollRight}
				onSymbolAdd={onSymbolAdd}
				allowAdd={allowAdd}
				onSymbolRemove={onSymbolRemove}
				allowRemove={allowRemove}
				showSparkline={showSparkline}
				showTickHistory={showTickHistory}
				onSymbolClick={onSymbolClick}
				scrollLeft={scrollLeft}
				scrollRight={scrollRight}
			/>
		</div>
	);
});

// ============================================
// Exports
// ============================================

export default TickerStrip;
export type { Quote };
