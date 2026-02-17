/**
 * Chart Page Hooks
 *
 * Custom React hooks for chart data fetching and computations.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCandles, useIndicators, useQuote, useRegime } from "@/hooks/queries/index";
import { calculateMAOverlays } from "@/lib/chart-indicators";
import type { ChartTimeframe } from "@/stores/ui-store";
import { CANDLE_LIMITS } from "./types";

// Module-level cache for chart data - persists across component unmounts
// Cache is keyed by symbol to prevent showing stale data for different symbols
interface CachedChartData {
	symbol: string;
	candles: ReturnType<typeof useCandles>["data"];
	indicators: ReturnType<typeof useIndicators>["data"];
	quote: ReturnType<typeof useQuote>["data"];
}
let chartDataCache: CachedChartData | null = null;

/**
 * Convert UTC timestamp to local time for chart display.
 * Lightweight-charts displays timestamps as UTC, so we need to
 * re-encode local time components as if they were UTC.
 */
export function timeToLocal(utcTimestamp: number): number {
	const d = new Date(utcTimestamp * 1000);
	return (
		Date.UTC(
			d.getFullYear(),
			d.getMonth(),
			d.getDate(),
			d.getHours(),
			d.getMinutes(),
			d.getSeconds(),
		) / 1000
	);
}

interface SessionBoundaries {
	openTimes: number[];
	closeTimes: number[];
}

interface CandleWithEtTime {
	timestamp: string;
	etHour: number;
	etMinute: number;
}

interface DisplayData {
	displayCandles: ReturnType<typeof useCandles>["data"];
	displayIndicators: ReturnType<typeof useIndicators>["data"];
	displayQuote: ReturnType<typeof useQuote>["data"] | undefined;
	isWaitingForData: boolean;
}

const NEW_YORK_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
	timeZone: "America/New_York",
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
	hour: "numeric",
	minute: "numeric",
	hour12: false,
});

function getEasternDateParts(timestamp: string): { dateKey: string; hour: number; minute: number } {
	const parts = NEW_YORK_TIME_FORMATTER.formatToParts(new Date(timestamp));
	const year = parts.find((part) => part.type === "year")?.value ?? "";
	const month = parts.find((part) => part.type === "month")?.value ?? "";
	const day = parts.find((part) => part.type === "day")?.value ?? "";
	const hour = Number.parseInt(parts.find((part) => part.type === "hour")?.value ?? "0", 10);
	const minute = Number.parseInt(parts.find((part) => part.type === "minute")?.value ?? "0", 10);
	return { dateKey: `${year}-${month}-${day}`, hour, minute };
}

function groupCandlesByDate(candles: { timestamp: string }[]): Map<string, CandleWithEtTime[]> {
	const grouped = new Map<string, CandleWithEtTime[]>();
	for (const candle of candles) {
		const { dateKey, hour, minute } = getEasternDateParts(candle.timestamp);
		const entry = grouped.get(dateKey) ?? [];
		entry.push({ timestamp: candle.timestamp, etHour: hour, etMinute: minute });
		grouped.set(dateKey, entry);
	}
	return grouped;
}

function findClosestBoundaryTimestamp(
	dayCandles: CandleWithEtTime[],
	targetMinutes: number,
	maxDiffMinutes = 5,
): string | null {
	let closestTimestamp: string | null = null;
	let closestDiff = Number.POSITIVE_INFINITY;

	for (const candle of dayCandles) {
		const candleMinutes = candle.etHour * 60 + candle.etMinute;
		const diff = Math.abs(candleMinutes - targetMinutes);
		if (diff <= maxDiffMinutes && diff < closestDiff) {
			closestTimestamp = candle.timestamp;
			closestDiff = diff;
		}
	}

	return closestTimestamp;
}

function resolveDisplayData(
	symbol: string,
	candles: ReturnType<typeof useCandles>["data"],
	indicators: ReturnType<typeof useIndicators>["data"],
	quote: ReturnType<typeof useQuote>["data"],
): DisplayData {
	const hasCurrentData = Boolean(candles && candles.length > 0);
	if (hasCurrentData) {
		chartDataCache = { symbol, candles, indicators, quote };
	}

	const cacheMatchesSymbol = chartDataCache?.symbol === symbol;
	const displayCandles = hasCurrentData
		? candles
		: cacheMatchesSymbol
			? chartDataCache?.candles
			: undefined;
	const displayIndicators = hasCurrentData
		? indicators
		: cacheMatchesSymbol
			? chartDataCache?.indicators
			: undefined;
	const displayQuote = quote ?? (cacheMatchesSymbol ? chartDataCache?.quote : undefined);
	const isWaitingForData = !hasCurrentData && cacheMatchesSymbol && chartDataCache !== null;

	return { displayCandles, displayIndicators, displayQuote, isWaitingForData };
}

function useChartSeries(displayCandles: ReturnType<typeof useCandles>["data"]) {
	return useMemo(() => {
		if (!displayCandles || displayCandles.length === 0) {
			return [];
		}
		return displayCandles.map((candle) => ({
			time: timeToLocal(new Date(candle.timestamp).getTime() / 1000),
			open: candle.open,
			high: candle.high,
			low: candle.low,
			close: candle.close,
			volume: candle.volume,
		}));
	}, [displayCandles]);
}

function useDayRange(displayCandles: ReturnType<typeof useCandles>["data"]) {
	return useMemo(() => {
		if (!displayCandles || displayCandles.length === 0) {
			return { high: undefined, low: undefined };
		}
		return {
			high: Math.max(...displayCandles.map((candle) => candle.high)),
			low: Math.min(...displayCandles.map((candle) => candle.low)),
		};
	}, [displayCandles]);
}

interface ChartQueryState {
	candles: ReturnType<typeof useCandles>["data"];
	candlesLoading: boolean;
	candlesFetching: boolean;
	candlesError: boolean;
	indicators: ReturnType<typeof useIndicators>["data"];
	indicatorsLoading: boolean;
	indicatorsFetching: boolean;
	indicatorsError: boolean;
	quote: ReturnType<typeof useQuote>["data"];
	quoteLoading: boolean;
	quoteError: boolean;
	regime: ReturnType<typeof useRegime>["data"];
}

function useChartQueryState(
	symbol: string,
	timeframe: ChartTimeframe,
	limit: number,
): ChartQueryState {
	const {
		data: candles,
		isLoading: candlesLoading,
		isFetching: candlesFetching,
		isError: candlesError,
	} = useCandles(symbol, timeframe, limit);
	const {
		data: indicators,
		isLoading: indicatorsLoading,
		isFetching: indicatorsFetching,
		isError: indicatorsError,
	} = useIndicators(symbol, timeframe);
	const { data: quote, isLoading: quoteLoading, isError: quoteError } = useQuote(symbol);
	const { data: regime } = useRegime();

	return {
		candles,
		candlesLoading,
		candlesFetching,
		candlesError,
		indicators,
		indicatorsLoading,
		indicatorsFetching,
		indicatorsError,
		quote,
		quoteLoading,
		quoteError,
		regime,
	};
}

function useChartComputedState(
	displayCandles: ReturnType<typeof useCandles>["data"],
	enabledMAs: string[],
) {
	const chartData = useChartSeries(displayCandles);
	const maOverlays = useMemo(() => {
		if (chartData.length === 0) {
			return [];
		}
		return calculateMAOverlays(chartData, enabledMAs);
	}, [chartData, enabledMAs]);
	const sessionBoundaries = useMemo(() => {
		if (!displayCandles || displayCandles.length === 0) {
			return undefined;
		}
		return findSessionBoundaries(displayCandles);
	}, [displayCandles]);
	const dayHighLow = useDayRange(displayCandles);

	return { chartData, maOverlays, sessionBoundaries, dayHighLow };
}

/**
 * Find session boundary timestamps (market open 9:30 AM ET, close 4:00 PM ET).
 * Takes original candle timestamps (ISO strings) and returns local timestamps for chart.
 */
export function findSessionBoundaries(candles: { timestamp: string }[]): SessionBoundaries {
	const openTimes: number[] = [];
	const closeTimes: number[] = [];
	const byDate = groupCandlesByDate(candles);
	for (const dayCandles of byDate.values()) {
		const openTimestamp = findClosestBoundaryTimestamp(dayCandles, 9 * 60 + 30);
		if (openTimestamp) {
			openTimes.push(timeToLocal(new Date(openTimestamp).getTime() / 1000));
		}

		const closeTimestamp = findClosestBoundaryTimestamp(dayCandles, 16 * 60);
		if (closeTimestamp) {
			closeTimes.push(timeToLocal(new Date(closeTimestamp).getTime() / 1000));
		}
	}

	return { openTimes, closeTimes };
}

/**
 * Custom hook for chart data including candles, indicators, quote, and regime.
 *
 * Uses module-level cache to show previous data while loading new symbol's data.
 * This prevents UI flicker during navigation.
 */
export function useChartData(symbol: string, timeframe: ChartTimeframe, enabledMAs: string[]) {
	const limit = CANDLE_LIMITS[timeframe] ?? 300;
	const queryState = useChartQueryState(symbol, timeframe, limit);
	const isSymbolError =
		queryState.candlesError && queryState.indicatorsError && queryState.quoteError;
	const { displayCandles, displayIndicators, displayQuote, isWaitingForData } = resolveDisplayData(
		symbol,
		queryState.candles,
		queryState.indicators,
		queryState.quote,
	);
	const { chartData, maOverlays, sessionBoundaries, dayHighLow } = useChartComputedState(
		displayCandles,
		enabledMAs,
	);
	const hasDisplayData = Boolean(displayCandles && displayCandles.length > 0);
	const isRefetching =
		((queryState.candlesFetching || queryState.indicatorsFetching) && hasDisplayData) ||
		isWaitingForData;

	return {
		candles: displayCandles,
		chartData,
		maOverlays,
		sessionBoundaries,
		indicators: displayIndicators,
		quote: displayQuote,
		regime: queryState.regime,
		dayHighLow,
		candlesLoading: queryState.candlesLoading && !isWaitingForData,
		indicatorsLoading: queryState.indicatorsLoading && !isWaitingForData,
		quoteLoading: queryState.quoteLoading,
		isRefetching,
		isSymbolError,
	};
}

/**
 * Custom hook for managing MA toggle state.
 */
export function useMAToggle(initialMAs: string[] = ["sma20", "sma50", "sma200"]) {
	const [enabledMAs, setEnabledMAs] = useState<string[]>(initialMAs);

	const toggleMA = useCallback((maId: string) => {
		setEnabledMAs((prev) =>
			prev.includes(maId) ? prev.filter((id) => id !== maId) : [...prev, maId],
		);
	}, []);

	return { enabledMAs, toggleMA };
}

/**
 * Custom hook for stream panel toggle with keyboard shortcut.
 */
export function useStreamToggle() {
	const [isStreamOpen, setIsStreamOpen] = useState(false);

	const toggleStream = useCallback(() => {
		setIsStreamOpen((prev) => !prev);
	}, []);

	const closeStream = useCallback(() => {
		setIsStreamOpen(false);
	}, []);

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent): void {
			if (e.shiftKey && e.key === "E") {
				e.preventDefault();
				toggleStream();
			}
		}

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [toggleStream]);

	return { isStreamOpen, toggleStream, closeStream };
}

/**
 * Format price for display.
 */
export function formatPrice(price: number | null | undefined): string {
	return price != null ? `$${price.toFixed(2)}` : "--";
}
