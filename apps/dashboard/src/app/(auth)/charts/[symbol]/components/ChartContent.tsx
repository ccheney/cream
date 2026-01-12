// biome-ignore-all lint/suspicious/noArrayIndexKey: Chart candles use time-ordered indices
"use client";

/**
 * ChartContent Component
 *
 * Main chart content including quote header, candlestick chart, and indicators.
 */

import { EnhancedQuoteHeader } from "@/components/charts/EnhancedQuoteHeader";
import { StreamPanel } from "@/components/charts/StreamPanel";
import { TradingViewChart } from "@/components/charts/TradingViewChart";
import { IndicatorSnapshotPanel } from "@/components/indicators";
import { LoadingOverlay } from "@/components/ui/spinner";
import { getTickerName } from "@/lib/ticker-names";
import { useChartPreferences } from "@/stores/ui-store";
import { ChartControls } from "./ChartControls";
import { ChartHeader } from "./ChartHeader";
import { useChartData, useMAToggle, useStreamToggle } from "./hooks";
import type { ChartContentProps } from "./types";

function QuoteHeaderSkeleton() {
  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-baseline gap-4">
          <div className="h-8 w-16 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
          <div className="h-8 w-24 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
          <div className="h-6 w-32 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
        </div>
      </div>
      <div className="mb-4">
        <div className="flex items-center justify-between gap-4">
          <div className="h-5 w-24 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
          <div className="h-4 w-16 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
          <div className="h-5 w-24 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
        </div>
        <div className="mt-2 h-1.5 bg-cream-100 dark:bg-night-700 rounded-full animate-pulse" />
      </div>
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
  );
}

function ChartSkeleton() {
  return (
    <div className="h-96 bg-cream-50 dark:bg-night-800 rounded border border-cream-200 dark:border-night-700 relative overflow-hidden">
      <div className="absolute left-2 top-4 bottom-12 w-12 flex flex-col justify-between">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-3 w-10 bg-cream-200 dark:bg-night-600 rounded animate-pulse" />
        ))}
      </div>
      <div className="absolute left-16 right-4 top-4 bottom-12 flex flex-col justify-between">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-px bg-cream-200 dark:bg-night-700" />
        ))}
      </div>
      <div className="absolute left-16 right-4 top-8 bottom-16 flex items-end justify-around gap-1">
        {[...Array(40)].map((_, i) => {
          const height = 25 + Math.sin(i * 0.4) * 20 + Math.cos(i * 0.7) * 15;
          const isGreen = i % 3 !== 0;
          return (
            <div
              key={i}
              className={`w-1.5 rounded-sm animate-pulse ${
                isGreen ? "bg-bullish/40 dark:bg-bullish/30" : "bg-bearish/40 dark:bg-bearish/30"
              }`}
              style={{ height: `${height}%` }}
            />
          );
        })}
      </div>
      <div className="absolute left-16 right-4 bottom-2 flex justify-between">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-3 w-8 bg-cream-200 dark:bg-night-600 rounded animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export function ChartContent({ symbol }: ChartContentProps) {
  const upperSymbol = symbol.toUpperCase();
  const companyName = getTickerName(upperSymbol);
  const { timeframe, setTimeframe } = useChartPreferences();
  const { isStreamOpen, toggleStream, closeStream } = useStreamToggle();
  const { enabledMAs, toggleMA } = useMAToggle();

  const {
    candles,
    chartData,
    maOverlays,
    sessionBoundaries,
    quote,
    regime,
    dayHighLow,
    candlesLoading,
    quoteLoading,
    isRefetching,
    isSymbolError,
  } = useChartData(upperSymbol, timeframe, enabledMAs);

  // Show error state for invalid symbols
  if (isSymbolError) {
    return (
      <div className="flex flex-col h-full">
        <ChartHeader
          symbol={upperSymbol}
          companyName={companyName}
          timeframe={timeframe}
          onTimeframeChange={setTimeframe}
          isStreamOpen={false}
          onStreamToggle={toggleStream}
        />
        <div className="flex-1 flex items-center justify-center bg-white dark:bg-night-800">
          <div className="text-center">
            <div className="text-4xl mb-4">?</div>
            <h2 className="text-xl font-semibold text-cream-700 dark:text-cream-300 mb-2">
              Unknown Symbol
            </h2>
            <p className="text-cream-500 dark:text-cream-400">
              Could not find market data for{" "}
              <span className="font-mono font-medium">{upperSymbol}</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <ChartHeader
        symbol={upperSymbol}
        companyName={companyName}
        timeframe={timeframe}
        onTimeframeChange={setTimeframe}
        isStreamOpen={isStreamOpen}
        onStreamToggle={toggleStream}
      />

      <StreamPanel symbol={upperSymbol} isOpen={isStreamOpen} onClose={closeStream} />

      <div className="flex-1 overflow-auto p-4 space-y-4 bg-white dark:bg-night-800">
        {!quote && quoteLoading ? (
          <QuoteHeaderSkeleton />
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
              high: dayHighLow.high,
              low: dayHighLow.low,
            }}
            regime={regime?.label}
            showDepth={true}
          />
        ) : null}

        <div>
          <ChartControls enabledMAs={enabledMAs} onToggleMA={toggleMA} />

          {!candles && candlesLoading ? (
            <ChartSkeleton />
          ) : chartData.length > 0 ? (
            <LoadingOverlay isLoading={isRefetching} label="Loading chart data">
              <TradingViewChart
                data={chartData}
                maOverlays={maOverlays}
                sessionBoundaries={sessionBoundaries}
                height={384}
              />
            </LoadingOverlay>
          ) : (
            <div className="h-96 flex items-center justify-center text-cream-400">
              No chart data available
            </div>
          )}
        </div>

        <IndicatorSnapshotPanel symbol={upperSymbol} layout="full" />
      </div>
    </div>
  );
}
