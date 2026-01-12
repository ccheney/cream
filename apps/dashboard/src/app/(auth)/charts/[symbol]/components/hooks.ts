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
      d.getSeconds()
    ) / 1000
  );
}

interface SessionBoundaries {
  openTimes: number[];
  closeTimes: number[];
}

/**
 * Find session boundary timestamps (market open 9:30 AM ET, close 4:00 PM ET).
 * Takes original candle timestamps (ISO strings) and returns local timestamps for chart.
 */
export function findSessionBoundaries(candles: { timestamp: string }[]): SessionBoundaries {
  const openTimes: number[] = [];
  const closeTimes: number[] = [];

  const byDate = new Map<string, { timestamp: string; etHour: number; etMinute: number }[]>();

  for (const candle of candles) {
    const utcDate = new Date(candle.timestamp);
    const etFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    });
    const parts = etFormatter.formatToParts(utcDate);
    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    const hour = Number.parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const minute = Number.parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);

    const dateKey = `${year}-${month}-${day}`;
    if (!byDate.has(dateKey)) {
      byDate.set(dateKey, []);
    }
    byDate.get(dateKey)?.push({ timestamp: candle.timestamp, etHour: hour, etMinute: minute });
  }

  for (const dayCandles of byDate.values()) {
    const openTarget = 9 * 60 + 30;
    let closestOpen: { timestamp: string; diff: number } | null = null;
    for (const c of dayCandles) {
      const candleMinutes = c.etHour * 60 + c.etMinute;
      const diff = Math.abs(candleMinutes - openTarget);
      if (diff <= 5 && (!closestOpen || diff < closestOpen.diff)) {
        closestOpen = { timestamp: c.timestamp, diff };
      }
    }
    if (closestOpen) {
      openTimes.push(timeToLocal(new Date(closestOpen.timestamp).getTime() / 1000));
    }

    const closeTarget = 16 * 60;
    let closestClose: { timestamp: string; diff: number } | null = null;
    for (const c of dayCandles) {
      const candleMinutes = c.etHour * 60 + c.etMinute;
      const diff = Math.abs(candleMinutes - closeTarget);
      if (diff <= 5 && (!closestClose || diff < closestClose.diff)) {
        closestClose = { timestamp: c.timestamp, diff };
      }
    }
    if (closestClose) {
      closeTimes.push(timeToLocal(new Date(closestClose.timestamp).getTime() / 1000));
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

  // Detect if symbol is invalid (all APIs return errors)
  const isSymbolError = candlesError && indicatorsError && quoteError;

  // Update cache when we have valid data for this symbol
  const hasCurrentData = Boolean(candles && candles.length > 0);
  if (hasCurrentData) {
    chartDataCache = { symbol, candles, indicators, quote };
  }

  // Only use cached data if it's for the same symbol (prevents showing stale data for non-existent symbols)
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

  const chartData = useMemo(() => {
    if (!displayCandles || displayCandles.length === 0) {
      return [];
    }
    return displayCandles.map((c) => ({
      time: timeToLocal(new Date(c.timestamp).getTime() / 1000),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
  }, [displayCandles]);

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

  const dayHighLow = useMemo(() => {
    if (!displayCandles || displayCandles.length === 0) {
      return { high: undefined, low: undefined };
    }
    return {
      high: Math.max(...displayCandles.map((c) => c.high)),
      low: Math.min(...displayCandles.map((c) => c.low)),
    };
  }, [displayCandles]);

  // Show overlay when refetching data or waiting for new symbol's data
  const hasDisplayData = Boolean(displayCandles && displayCandles.length > 0);
  const isRefetching =
    ((candlesFetching || indicatorsFetching) && hasDisplayData) || isWaitingForData;

  return {
    candles: displayCandles,
    chartData,
    maOverlays,
    sessionBoundaries,
    indicators: displayIndicators,
    quote: displayQuote,
    regime,
    dayHighLow,
    candlesLoading: candlesLoading && !isWaitingForData,
    indicatorsLoading: indicatorsLoading && !isWaitingForData,
    quoteLoading,
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
      prev.includes(maId) ? prev.filter((id) => id !== maId) : [...prev, maId]
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
