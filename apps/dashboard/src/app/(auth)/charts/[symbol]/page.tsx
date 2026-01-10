// biome-ignore-all lint/suspicious/noArrayIndexKey: Chart candles use time-ordered indices
"use client";

/**
 * Charts Page - Market context with candle charts and indicators
 *
 * @see docs/plans/ui/40-streaming-data-integration.md
 */

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EnhancedQuoteHeader } from "@/components/charts/EnhancedQuoteHeader";
import { StreamPanel, StreamToggleButton } from "@/components/charts/StreamPanel";
import { TradingViewChart } from "@/components/charts/TradingViewChart";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCandles, useIndicators, useQuote, useRegime } from "@/hooks/queries";
import { calculateMAOverlays, DEFAULT_MA_CONFIGS } from "@/lib/chart-indicators";
import { getTickerName } from "@/lib/ticker-names";
import { type ChartTimeframe, useChartPreferences } from "@/stores/ui-store";

const TIMEFRAME_OPTIONS: ChartTimeframe[] = ["1m", "5m", "15m"];

/**
 * Convert UTC timestamp to local time for chart display.
 * Lightweight-charts displays timestamps as UTC, so we need to
 * re-encode local time components as if they were UTC.
 */
function timeToLocal(utcTimestamp: number): number {
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

/**
 * Find session boundary timestamps (market open 9:30 AM ET, close 4:00 PM ET).
 * Takes original candle timestamps (ISO strings) and returns local timestamps for chart.
 */
function findSessionBoundaries(candles: { timestamp: string }[]): {
  openTimes: number[];
  closeTimes: number[];
} {
  const openTimes: number[] = [];
  const closeTimes: number[] = [];

  // Group by ET date and find candles closest to open/close
  const byDate = new Map<string, { timestamp: string; etHour: number; etMinute: number }[]>();

  for (const candle of candles) {
    // Parse the original UTC timestamp and get ET components
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

  // For each date, find candles closest to 9:30 and 16:00 ET
  for (const dayCandles of byDate.values()) {
    // Find candle closest to market open (9:30 ET = 570 minutes)
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
      // Convert to local time for chart display
      openTimes.push(timeToLocal(new Date(closestOpen.timestamp).getTime() / 1000));
    }

    // Find candle closest to market close (16:00 ET = 960 minutes)
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
      // Convert to local time for chart display
      closeTimes.push(timeToLocal(new Date(closestClose.timestamp).getTime() / 1000));
    }
  }

  return { openTimes, closeTimes };
}

interface ChartPageProps {
  params: Promise<{ symbol: string }>;
}

export default function ChartPage({ params }: ChartPageProps) {
  const [symbol, setSymbol] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  useEffect(() => {
    params.then((p) => {
      setSymbol(p.symbol);
      setIsInitialLoad(false);
    });
  }, [params]);

  // Only show skeleton on very first load, not on symbol changes
  if (!symbol && isInitialLoad) {
    return (
      <div className="flex flex-col h-full bg-cream-50 dark:bg-night-900">
        {/* Header skeleton */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-cream-200 dark:border-night-700 bg-white dark:bg-night-800">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 bg-cream-200 dark:bg-night-600 rounded animate-pulse" />
            <div className="h-6 w-24 bg-cream-200 dark:bg-night-600 rounded animate-pulse" />
          </div>
          <div className="flex items-center gap-3">
            <div className="h-8 w-28 bg-cream-200 dark:bg-night-600 rounded animate-pulse" />
            <div className="h-8 w-20 bg-cream-200 dark:bg-night-600 rounded animate-pulse" />
          </div>
        </div>
        {/* Content skeleton */}
        <div className="flex-1 p-4 space-y-4">
          <div className="h-24 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
          <div className="h-96 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  // Keep showing previous symbol's content while new params resolve
  if (!symbol) {
    return null;
  }

  return <ChartContent symbol={symbol} />;
}

const MA_OPTIONS = ["sma20", "sma50", "sma200", "ema12", "ema26"] as const;

function ChartContent({ symbol }: { symbol: string }) {
  const upperSymbol = symbol.toUpperCase();
  const companyName = getTickerName(upperSymbol);
  const { timeframe, setTimeframe } = useChartPreferences();
  const [isStreamOpen, setIsStreamOpen] = useState(false);
  const [enabledMAs, setEnabledMAs] = useState<string[]>(["sma20", "sma50", "sma200"]);

  // Limit candles to ~1 trading day per timeframe (6.5 market hours = 390 min)
  // Plus extra for MA calculations (SMA 200 needs 200+ candles)
  const CANDLE_LIMITS: Record<string, number> = {
    "1m": 500, // ~1.3 days, enough for SMA 200
    "5m": 300, // ~1.5 days at 78/day
    "15m": 100, // ~4 days at 26/day
  };
  const limit = CANDLE_LIMITS[timeframe] ?? 300;
  const { data: candles, isLoading: candlesLoading } = useCandles(upperSymbol, timeframe, limit);
  const { data: indicators, isLoading: indicatorsLoading } = useIndicators(upperSymbol, timeframe);
  const { data: quote, isLoading: quoteLoading } = useQuote(upperSymbol);
  const { data: regime } = useRegime();

  // Compute chart data with local timestamps
  const chartData = useMemo(() => {
    if (!candles || candles.length === 0) {
      return [];
    }
    return candles.map((c) => ({
      time: timeToLocal(new Date(c.timestamp).getTime() / 1000),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
  }, [candles]);

  // Compute MA overlays from candle data
  const maOverlays = useMemo(() => {
    if (chartData.length === 0) {
      return [];
    }
    return calculateMAOverlays(chartData, enabledMAs);
  }, [chartData, enabledMAs]);

  // Compute session boundaries (market open/close markers)
  // Use original candles (with UTC timestamps) to correctly detect ET times
  const sessionBoundaries = useMemo(() => {
    if (!candles || candles.length === 0) {
      return undefined;
    }
    return findSessionBoundaries(candles);
  }, [candles]);

  const toggleMA = useCallback((maId: string) => {
    setEnabledMAs((prev) =>
      prev.includes(maId) ? prev.filter((id) => id !== maId) : [...prev, maId]
    );
  }, []);

  const formatPrice = (price: number | null | undefined) =>
    price != null ? `$${price.toFixed(2)}` : "--";

  const toggleStream = useCallback(() => {
    setIsStreamOpen((prev) => !prev);
  }, []);

  // Keyboard shortcut: Shift+E to toggle stream
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === "E") {
        e.preventDefault();
        toggleStream();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleStream]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-cream-200 dark:border-night-700 bg-white dark:bg-night-800">
        <div className="flex items-center justify-between">
          {/* Left: Back + Symbol */}
          <div className="flex items-center gap-4">
            <Link
              href="/charts"
              className="p-1.5 -ml-1.5 rounded-md text-stone-500 hover:bg-cream-100 dark:hover:bg-night-700"
              aria-label="Back to charts"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-xl font-semibold text-stone-900 dark:text-cream-100">
              {companyName || upperSymbol}
            </h1>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-3">
            <div className="flex bg-cream-100 dark:bg-night-700 rounded-lg p-1">
              {TIMEFRAME_OPTIONS.map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => setTimeframe(tf)}
                  className={`px-3 py-1 text-sm font-mono rounded transition-colors ${
                    timeframe === tf
                      ? "bg-night-800 text-white dark:bg-cream-100 dark:text-night-900 shadow-md font-semibold"
                      : "text-cream-600 dark:text-cream-400 hover:text-cream-900 dark:hover:text-cream-100"
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
            <Link
              href={`/options/${upperSymbol}`}
              className="px-3 py-1.5 text-sm font-medium text-stone-600 dark:text-night-200 border border-cream-200 dark:border-night-700 rounded-md hover:bg-cream-100 dark:hover:bg-night-700 transition-colors"
            >
              Options →
            </Link>
            <StreamToggleButton isOpen={isStreamOpen} onClick={toggleStream} />
          </div>
        </div>
      </div>

      {/* Stream Panel (slide-out) */}
      <StreamPanel
        symbol={upperSymbol}
        isOpen={isStreamOpen}
        onClose={() => setIsStreamOpen(false)}
      />

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4 bg-white dark:bg-night-800">
        {/* Enhanced Quote Header - only show skeleton on initial load */}
        {!quote && quoteLoading ? (
          <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
            {/* Skeleton: Header row */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-baseline gap-4">
                <div className="h-8 w-16 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
                <div className="h-8 w-24 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
                <div className="h-6 w-32 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
              </div>
            </div>
            {/* Skeleton: Bid/Ask row */}
            <div className="mb-4">
              <div className="flex items-center justify-between gap-4">
                <div className="h-5 w-24 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
                <div className="h-4 w-16 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
                <div className="h-5 w-24 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
              </div>
              <div className="mt-2 h-1.5 bg-cream-100 dark:bg-night-700 rounded-full animate-pulse" />
            </div>
            {/* Skeleton: Day range and volume */}
            <div className="flex items-center gap-6">
              <div className="flex-1">
                <div className="h-3 w-16 bg-cream-100 dark:bg-night-700 rounded animate-pulse mb-1" />
                <div className="h-2 bg-cream-100 dark:bg-night-700 rounded-full animate-pulse" />
              </div>
              <div className="text-right">
                <div className="h-3 w-12 bg-cream-100 dark:bg-night-700 rounded animate-pulse mb-1" />
                <div className="h-5 w-20 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
              </div>
            </div>
          </div>
        ) : quote ? (
          <EnhancedQuoteHeader
            symbol={upperSymbol}
            quote={{
              bid: quote.bid,
              ask: quote.ask,
              bidSize: quote.bidSize,
              askSize: quote.askSize,
              last: quote.last,
              previousClose: quote.prevClose,
              volume: quote.volume,
              high:
                candles && candles.length > 0 ? Math.max(...candles.map((c) => c.high)) : undefined,
              low:
                candles && candles.length > 0 ? Math.min(...candles.map((c) => c.low)) : undefined,
            }}
            regime={regime?.label}
            showDepth={true}
          />
        ) : null}

        {/* Main Chart */}
        <div>
          {/* MA Toggles */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-cream-500 dark:text-cream-400 mr-1">Overlays:</span>
            {MA_OPTIONS.map((maId) => {
              const config = DEFAULT_MA_CONFIGS[maId];
              const isEnabled = enabledMAs.includes(maId);
              return (
                <button
                  key={maId}
                  type="button"
                  onClick={() => toggleMA(maId)}
                  className={`
                    px-2 py-0.5 text-xs font-mono rounded transition-all
                    ${
                      isEnabled
                        ? "text-white shadow-sm"
                        : "bg-cream-100 dark:bg-night-700 text-cream-500 dark:text-cream-400 hover:text-cream-700 dark:hover:text-cream-200"
                    }
                  `}
                  style={isEnabled ? { backgroundColor: config?.color } : undefined}
                >
                  {config?.label}
                </button>
              );
            })}
          </div>

          {/* Chart */}
          {!candles && candlesLoading ? (
            <div className="h-96 bg-cream-50 dark:bg-night-800 rounded border border-cream-200 dark:border-night-700 relative overflow-hidden">
              {/* Y-axis labels skeleton */}
              <div className="absolute left-2 top-4 bottom-12 w-12 flex flex-col justify-between">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="h-3 w-10 bg-cream-200 dark:bg-night-600 rounded animate-pulse"
                  />
                ))}
              </div>
              {/* Grid lines */}
              <div className="absolute left-16 right-4 top-4 bottom-12 flex flex-col justify-between">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-px bg-cream-200 dark:bg-night-700" />
                ))}
              </div>
              {/* Candlestick skeletons */}
              <div className="absolute left-16 right-4 top-8 bottom-16 flex items-end justify-around gap-1">
                {[...Array(40)].map((_, i) => {
                  const height = 25 + Math.sin(i * 0.4) * 20 + Math.cos(i * 0.7) * 15;
                  const isGreen = i % 3 !== 0;
                  return (
                    <div
                      key={i}
                      className={`w-1.5 rounded-sm animate-pulse ${
                        isGreen
                          ? "bg-bullish/40 dark:bg-bullish/30"
                          : "bg-bearish/40 dark:bg-bearish/30"
                      }`}
                      style={{ height: `${height}%` }}
                    />
                  );
                })}
              </div>
              {/* X-axis labels skeleton */}
              <div className="absolute left-16 right-4 bottom-2 flex justify-between">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className="h-3 w-8 bg-cream-200 dark:bg-night-600 rounded animate-pulse"
                  />
                ))}
              </div>
            </div>
          ) : chartData.length > 0 ? (
            <TradingViewChart
              data={chartData}
              maOverlays={maOverlays}
              sessionBoundaries={sessionBoundaries}
              height={384}
            />
          ) : (
            <div className="h-96 flex items-center justify-center text-cream-400">
              No chart data available
            </div>
          )}
        </div>

        {/* Indicators Panel */}
        <div className="grid grid-cols-4 gap-4">
          <IndicatorCard
            name="RSI(14)"
            tooltip="Relative Strength Index: measures overbought (>70) or oversold (<30) conditions"
            value={indicatorsLoading ? "--" : (indicators?.rsi14?.toFixed(1) ?? "--")}
            status={
              indicators?.rsi14 != null
                ? indicators.rsi14 > 70
                  ? "overbought"
                  : indicators.rsi14 < 30
                    ? "oversold"
                    : "neutral"
                : "neutral"
            }
            isLoading={indicatorsLoading}
          />
          <IndicatorCard
            name="ATR(14)"
            tooltip="Average True Range: measures price volatility over 14 periods"
            value={
              indicatorsLoading
                ? "--"
                : indicators?.atr14 != null
                  ? `$${indicators.atr14.toFixed(2)}`
                  : "--"
            }
            isLoading={indicatorsLoading}
          />
          <IndicatorCard
            name="SMA(20)"
            tooltip="Simple Moving Average: 20-period average price for trend identification"
            value={
              indicatorsLoading
                ? "--"
                : indicators?.sma20 != null
                  ? formatPrice(indicators.sma20)
                  : "--"
            }
            isLoading={indicatorsLoading}
          />
          <IndicatorCard
            name="MACD"
            tooltip="Moving Average Convergence Divergence: momentum and trend-following indicator"
            value={indicatorsLoading ? "--" : (indicators?.macdHist?.toFixed(2) ?? "--")}
            status={
              indicators?.macdHist != null
                ? indicators.macdHist > 0
                  ? "bullish"
                  : "bearish"
                : "neutral"
            }
            isLoading={indicatorsLoading}
          />
        </div>

        {/* Moving Averages */}
        {!indicatorsLoading && indicators && (
          <div className="border-t border-cream-200 dark:border-night-700 pt-4">
            <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-4">
              Moving Averages
            </h2>
            <div className="grid grid-cols-6 gap-4 text-sm">
              <div className="flex items-start gap-2">
                <span
                  className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                  style={{ backgroundColor: DEFAULT_MA_CONFIGS.sma20?.color }}
                />
                <div>
                  <Tooltip>
                    <TooltipTrigger className="cursor-help text-cream-500 dark:text-cream-400">
                      SMA 20
                    </TooltipTrigger>
                    <TooltipContent>
                      Simple Moving Average: 20-period average, short-term trend
                    </TooltipContent>
                  </Tooltip>
                  <div className="font-mono text-cream-900 dark:text-cream-100">
                    {formatPrice(indicators.sma20)}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span
                  className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                  style={{ backgroundColor: DEFAULT_MA_CONFIGS.sma50?.color }}
                />
                <div>
                  <Tooltip>
                    <TooltipTrigger className="cursor-help text-cream-500 dark:text-cream-400">
                      SMA 50
                    </TooltipTrigger>
                    <TooltipContent>
                      Simple Moving Average: 50-period average, medium-term trend
                    </TooltipContent>
                  </Tooltip>
                  <div className="font-mono text-cream-900 dark:text-cream-100">
                    {formatPrice(indicators.sma50)}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span
                  className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                  style={{ backgroundColor: DEFAULT_MA_CONFIGS.sma200?.color }}
                />
                <div>
                  <Tooltip>
                    <TooltipTrigger className="cursor-help text-cream-500 dark:text-cream-400">
                      SMA 200
                    </TooltipTrigger>
                    <TooltipContent>
                      Simple Moving Average: 200-period average, long-term trend
                    </TooltipContent>
                  </Tooltip>
                  <div className="font-mono text-cream-900 dark:text-cream-100">
                    {formatPrice(indicators.sma200)}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span
                  className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                  style={{ backgroundColor: DEFAULT_MA_CONFIGS.ema12?.color }}
                />
                <div>
                  <Tooltip>
                    <TooltipTrigger className="cursor-help text-cream-500 dark:text-cream-400">
                      EMA 12
                    </TooltipTrigger>
                    <TooltipContent>
                      Exponential Moving Average: 12-period, fast signal line
                    </TooltipContent>
                  </Tooltip>
                  <div className="font-mono text-cream-900 dark:text-cream-100">
                    {formatPrice(indicators.ema12)}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span
                  className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                  style={{ backgroundColor: DEFAULT_MA_CONFIGS.ema26?.color }}
                />
                <div>
                  <Tooltip>
                    <TooltipTrigger className="cursor-help text-cream-500 dark:text-cream-400">
                      EMA 26
                    </TooltipTrigger>
                    <TooltipContent>
                      Exponential Moving Average: 26-period, slow signal line
                    </TooltipContent>
                  </Tooltip>
                  <div className="font-mono text-cream-900 dark:text-cream-100">
                    {formatPrice(indicators.ema26)}
                  </div>
                </div>
              </div>
              <div>
                <Tooltip>
                  <TooltipTrigger className="cursor-help text-cream-500 dark:text-cream-400">
                    MACD
                  </TooltipTrigger>
                  <TooltipContent>MACD Line: difference between EMA 12 and EMA 26</TooltipContent>
                </Tooltip>
                <div className="font-mono text-cream-900 dark:text-cream-100">
                  {indicators.macdLine?.toFixed(2) ?? "--"}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function IndicatorCard({
  name,
  value,
  status,
  tooltip,
  isLoading,
}: {
  name: string;
  value: string;
  status?: "overbought" | "oversold" | "bullish" | "bearish" | "neutral";
  tooltip?: string;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="p-3 rounded-md bg-cream-50 dark:bg-night-700/50">
        <div className="h-4 w-16 bg-cream-100 dark:bg-night-600 rounded animate-pulse mb-2" />
        <div className="h-6 w-12 bg-cream-100 dark:bg-night-600 rounded animate-pulse" />
      </div>
    );
  }

  const statusColors = {
    overbought: "text-red-500",
    oversold: "text-green-500",
    bullish: "text-green-500",
    bearish: "text-red-500",
    neutral: "text-cream-900 dark:text-cream-100",
  };

  const nameElement = <span className="text-sm text-cream-500 dark:text-cream-400">{name}</span>;

  return (
    <div className="p-3 rounded-md bg-cream-50 dark:bg-night-700/50">
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger className="cursor-help">{nameElement}</TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      ) : (
        <div>{nameElement}</div>
      )}
      <div className={`mt-1 text-xl font-mono font-medium ${statusColors[status ?? "neutral"]}`}>
        {value}
      </div>
    </div>
  );
}
