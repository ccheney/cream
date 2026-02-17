/**
 * Feed Statistics Hook
 *
 * Tracks event rates (events per minute) for the unified feed.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { EventType } from "@/lib/feed/event-normalizer";

interface FeedStats {
	/** Total events per minute */
	totalPerMin: number;
	/** Quotes per minute */
	quotesPerMin: number;
	/** Trades per minute */
	tradesPerMin: number;
	/** Options events per minute */
	optionsPerMin: number;
	/** Other events per minute */
	otherPerMin: number;
}

interface RollingWindow {
	timestamps: number[];
	quotes: number[];
	trades: number[];
	options: number[];
}

const WINDOW_SIZE_MS = 60_000; // 1 minute window
const UPDATE_INTERVAL_MS = 1_000; // Update stats every second
const EMPTY_STATS: FeedStats = {
	totalPerMin: 0,
	quotesPerMin: 0,
	tradesPerMin: 0,
	optionsPerMin: 0,
	otherPerMin: 0,
};

function createRollingWindow(): RollingWindow {
	return {
		timestamps: [],
		quotes: [],
		trades: [],
		options: [],
	};
}

function prune(values: number[], cutoff: number): number[] {
	return values.filter((timestamp) => timestamp > cutoff);
}

function pruneWindow(window: RollingWindow, cutoff: number): void {
	window.timestamps = prune(window.timestamps, cutoff);
	window.quotes = prune(window.quotes, cutoff);
	window.trades = prune(window.trades, cutoff);
	window.options = prune(window.options, cutoff);
}

function toFeedStats(window: RollingWindow): FeedStats {
	const total = window.timestamps.length;
	const quotes = window.quotes.length;
	const trades = window.trades.length;
	const options = window.options.length;
	const other = Math.max(0, total - quotes - trades - options);

	return {
		totalPerMin: total,
		quotesPerMin: quotes,
		tradesPerMin: trades,
		optionsPerMin: options,
		otherPerMin: other,
	};
}

function pushEvent(window: RollingWindow, type: EventType, now: number): void {
	window.timestamps.push(now);
	if (type === "quote") {
		window.quotes.push(now);
		return;
	}
	if (type === "trade") {
		window.trades.push(now);
		return;
	}
	if (type === "options_quote" || type === "options_trade") {
		window.options.push(now);
	}
}

/**
 * Hook to track feed event rates.
 */
export function useFeedStats() {
	const windowRef = useRef<RollingWindow>(createRollingWindow());
	const [stats, setStats] = useState<FeedStats>(EMPTY_STATS);

	const recordEvent = useCallback((type: EventType) => {
		pushEvent(windowRef.current, type, Date.now());
	}, []);

	const refreshStats = useCallback(() => {
		const cutoff = Date.now() - WINDOW_SIZE_MS;
		const window = windowRef.current;
		pruneWindow(window, cutoff);
		setStats(toFeedStats(window));
	}, []);

	useEffect(() => {
		const interval = setInterval(refreshStats, UPDATE_INTERVAL_MS);
		return () => clearInterval(interval);
	}, [refreshStats]);

	return { stats, recordEvent };
}
