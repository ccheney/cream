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

/**
 * Hook to track feed event rates.
 */
export function useFeedStats() {
	const windowRef = useRef<RollingWindow>({
		timestamps: [],
		quotes: [],
		trades: [],
		options: [],
	});

	const [stats, setStats] = useState<FeedStats>({
		totalPerMin: 0,
		quotesPerMin: 0,
		tradesPerMin: 0,
		optionsPerMin: 0,
		otherPerMin: 0,
	});

	// Record an event
	const recordEvent = useCallback((type: EventType) => {
		const now = Date.now();
		const window = windowRef.current;

		window.timestamps.push(now);

		if (type === "quote") {
			window.quotes.push(now);
		} else if (type === "trade") {
			window.trades.push(now);
		} else if (type === "options_quote" || type === "options_trade") {
			window.options.push(now);
		}
	}, []);

	// Update stats periodically
	useEffect(() => {
		const updateStats = () => {
			const now = Date.now();
			const cutoff = now - WINDOW_SIZE_MS;
			const window = windowRef.current;

			// Prune old timestamps
			window.timestamps = window.timestamps.filter((t) => t > cutoff);
			window.quotes = window.quotes.filter((t) => t > cutoff);
			window.trades = window.trades.filter((t) => t > cutoff);
			window.options = window.options.filter((t) => t > cutoff);

			// Calculate rates
			const total = window.timestamps.length;
			const quotes = window.quotes.length;
			const trades = window.trades.length;
			const options = window.options.length;
			const other = total - quotes - trades - options;

			setStats({
				totalPerMin: total,
				quotesPerMin: quotes,
				tradesPerMin: trades,
				optionsPerMin: options,
				otherPerMin: Math.max(0, other),
			});
		};

		const interval = setInterval(updateStats, UPDATE_INTERVAL_MS);
		return () => clearInterval(interval);
	}, []);

	return { stats, recordEvent };
}
