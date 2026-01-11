// biome-ignore-all lint/suspicious/noArrayIndexKey: Chart candles use time-ordered indices
"use client";

/**
 * ChartContent Component
 *
 * Main chart content including quote header, candlestick chart, and indicators.
 */

import { EnhancedQuoteHeader } from "@/components/charts/EnhancedQuoteHeader.js";
import { StreamPanel } from "@/components/charts/StreamPanel.js";
import { TradingViewChart } from "@/components/charts/TradingViewChart.js";
import { getTickerName } from "@/lib/ticker-names.js";
import { useChartPreferences } from "@/stores/ui-store.js";
import { ChartControls } from "./ChartControls.js";
import { ChartHeader } from "./ChartHeader.js";
import { formatPrice, useChartData, useMAToggle, useStreamToggle } from "./hooks.js";
import { IndicatorCard } from "./IndicatorCard.js";
import { MovingAveragesPanel } from "./MovingAveragesPanel.js";
import type { ChartContentProps, IndicatorStatus } from "./types.js";

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

function getRSIStatus(rsi: number | undefined | null): IndicatorStatus {
  if (rsi == null) {
    return "neutral";
  }
  if (rsi > 70) {
    return "overbought";
  }
  if (rsi < 30) {
    return "oversold";
  }
  return "neutral";
}

function getMACDStatus(macdHist: number | undefined | null): IndicatorStatus {
  if (macdHist == null) {
    return "neutral";
  }
  return macdHist > 0 ? "bullish" : "bearish";
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
    indicators,
    quote,
    regime,
    dayHighLow,
    candlesLoading,
    indicatorsLoading,
    quoteLoading,
  } = useChartData(upperSymbol, timeframe, enabledMAs);

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

        <div className="grid grid-cols-4 gap-4">
          <IndicatorCard
            name="RSI(14)"
            tooltip="Relative Strength Index: measures overbought (>70) or oversold (<30) conditions"
            value={indicatorsLoading ? "--" : (indicators?.rsi14?.toFixed(1) ?? "--")}
            status={getRSIStatus(indicators?.rsi14)}
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
            status={getMACDStatus(indicators?.macdHist)}
            isLoading={indicatorsLoading}
          />
        </div>

        {!indicatorsLoading && indicators && (
          <MovingAveragesPanel
            indicators={{
              sma20: indicators.sma20,
              sma50: indicators.sma50,
              sma200: indicators.sma200,
              ema12: indicators.ema12,
              ema26: indicators.ema26,
              macdLine: indicators.macdLine,
            }}
          />
        )}
      </div>
    </div>
  );
}
