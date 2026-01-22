/**
 * TradeTape Component
 *
 * Real-time Time & Sales display with virtualized scrolling.
 * Inspired by Bloomberg Terminal trade tape.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 1.2
 */

"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useEffect, useMemo, useRef } from "react";

import { useAutoScroll } from "../use-auto-scroll";
import { EmptyState } from "./EmptyState";
import { NewTradesButton } from "./NewTradesButton";
import { StatisticsFooter } from "./StatisticsFooter";
import { TradeRow } from "./TradeRow";
import { TradeTapeHeader } from "./TradeTapeHeader";
import type { TradeStatistics, TradeTapeProps } from "./types";
import { DEFAULT_HIGHLIGHT_THRESHOLD, DEFAULT_MAX_TRADES, TRADE_ITEM_HEIGHT } from "./types";
import { calculateTradesPerMinute, calculateVWAP } from "./utils";

/**
 * TradeTape displays real-time Time & Sales data.
 *
 * Features:
 * - Virtualized scrolling for 1000+ trades/minute
 * - Auto-scroll when at bottom, pause when user scrolls up
 * - Large trade highlighting
 * - VWAP and trades-per-minute statistics
 * - Buy/Sell side classification from trade conditions
 *
 * @example
 * ```tsx
 * <TradeTape
 *   symbol="AAPL"
 *   trades={trades}
 *   highlightThreshold={1000}
 *   showStatistics
 *   height={400}
 *   onTradeClick={(trade) => console.log('Clicked:', trade)}
 * />
 * ```
 */
export const TradeTape = memo(function TradeTape({
	symbol,
	trades,
	maxTrades = DEFAULT_MAX_TRADES,
	highlightThreshold = DEFAULT_HIGHLIGHT_THRESHOLD,
	showStatistics = true,
	height = 400,
	onTradeClick,
	className = "",
	"data-testid": testId,
}: TradeTapeProps): React.ReactElement {
	const displayTrades = useMemo(
		() => (trades.length > maxTrades ? trades.slice(-maxTrades) : trades),
		[trades, maxTrades],
	);

	const { containerRef, isAutoScrolling, newItemCount, scrollToBottom, onNewItems, onScroll } =
		useAutoScroll({ threshold: 50 });

	const prevCountRef = useRef(displayTrades.length);

	useEffect(() => {
		const newCount = displayTrades.length - prevCountRef.current;
		if (newCount > 0) {
			onNewItems(newCount);
		}
		prevCountRef.current = displayTrades.length;
	}, [displayTrades.length, onNewItems]);

	const statistics = useMemo((): TradeStatistics => {
		const volume = displayTrades.reduce((sum, t) => sum + t.size, 0);
		const vwap = calculateVWAP(displayTrades);
		const tradesPerMinute = calculateTradesPerMinute(displayTrades);

		return {
			volume,
			vwap,
			tradesPerMinute,
			tradeCount: displayTrades.length,
		};
	}, [displayTrades]);

	const virtualizer = useVirtualizer({
		count: displayTrades.length,
		getScrollElement: () => containerRef.current,
		estimateSize: () => TRADE_ITEM_HEIGHT,
		overscan: 10,
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: containerRef is a stable ref
	useEffect(() => {
		if (isAutoScrolling && containerRef.current) {
			virtualizer.scrollToIndex(displayTrades.length - 1, {
				align: "end",
				behavior: "auto",
			});
		}
	}, [isAutoScrolling, displayTrades.length, virtualizer]);

	const containerHeight = typeof height === "number" ? `${height}px` : height;

	if (displayTrades.length === 0) {
		return (
			<div
				className={`relative bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 overflow-hidden ${className}`}
				style={{ height: containerHeight }}
				data-testid={testId}
			>
				<TradeTapeHeader symbol={symbol} />
				<EmptyState symbol={symbol} />
			</div>
		);
	}

	return (
		<div
			className={`relative bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 overflow-hidden ${className}`}
			data-testid={testId}
		>
			<TradeTapeHeader symbol={symbol} />

			<NewTradesButton count={newItemCount} onClick={scrollToBottom} />

			<div
				ref={containerRef}
				className="overflow-auto"
				style={{ height: `calc(${containerHeight} - ${showStatistics ? "80px" : "44px"})` }}
				onScroll={onScroll}
				role="log"
				aria-live="polite"
				aria-label={`Trade tape for ${symbol}`}
			>
				<div
					style={{
						height: `${virtualizer.getTotalSize()}px`,
						width: "100%",
						position: "relative",
					}}
				>
					{virtualizer.getVirtualItems().map((virtualItem) => {
						const trade = displayTrades[virtualItem.index];
						if (!trade) {
							return null;
						}
						return (
							<div
								key={trade.id}
								style={{
									position: "absolute",
									top: 0,
									left: 0,
									width: "100%",
									height: `${virtualItem.size}px`,
									transform: `translateY(${virtualItem.start}px)`,
								}}
							>
								<TradeRow
									trade={trade}
									isHighlighted={trade.size >= highlightThreshold}
									onClick={onTradeClick}
								/>
							</div>
						);
					})}
				</div>
			</div>

			{showStatistics && <StatisticsFooter stats={statistics} />}

			{isAutoScrolling && (
				<div
					className="absolute bottom-12 right-2 px-2 py-1 bg-night-800/80 text-white text-xs rounded"
					aria-hidden="true"
				>
					Live
				</div>
			)}
		</div>
	);
});

// Re-export types and utilities for public API
export type { Trade, TradeSide, TradeStatistics, TradeTapeProps } from "./types";
export {
	calculateTradesPerMinute,
	calculateVWAP,
	classifyTradeSide,
	formatVolume,
} from "./utils";

export default TradeTape;
