"use client";

/**
 * Charts Page - Market context with candle charts and indicators
 */

import { useState } from "react";
import { EnhancedQuoteHeader } from "@/components/charts/EnhancedQuoteHeader";
import { useCandles, useIndicators, useQuote, useRegime } from "@/hooks/queries";

export default function ChartsPage() {
  const [symbol, setSymbol] = useState("AAPL");
  const [timeframe, setTimeframe] = useState<"1h" | "4h" | "1d">("1h");

  const { data: candles, isLoading: candlesLoading } = useCandles(symbol, timeframe, 100);
  const { data: indicators, isLoading: indicatorsLoading } = useIndicators(symbol, timeframe);
  const { data: quote, isLoading: quoteLoading } = useQuote(symbol);
  const { data: regime } = useRegime();

  const formatPrice = (price: number | null | undefined) =>
    price != null ? `$${price.toFixed(2)}` : "--";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-cream-900 dark:text-cream-100">Charts</h1>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="Symbol..."
            className="text-sm border border-cream-200 dark:border-night-700 rounded-md px-3 py-1.5 bg-white dark:bg-night-800 text-cream-900 dark:text-cream-100 w-24"
          />
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as "1h" | "4h" | "1d")}
            className="text-sm border border-cream-200 dark:border-night-700 rounded-md px-3 py-1.5 bg-white dark:bg-night-800 text-cream-900 dark:text-cream-100"
          >
            <option value="1h">1H</option>
            <option value="4h">4H</option>
            <option value="1d">1D</option>
          </select>
        </div>
      </div>

      {/* Enhanced Quote Header */}
      {!quoteLoading && quote && (
        <EnhancedQuoteHeader
          symbol={symbol}
          quote={{
            bid: quote.bid,
            ask: quote.ask,
            bidSize: quote.bidSize,
            askSize: quote.askSize,
            last: quote.last,
            previousClose: quote.prevClose,
            volume: quote.volume,
            // high, low, avgVolume derived from candles if available
            high:
              candles && candles.length > 0 ? Math.max(...candles.map((c) => c.high)) : undefined,
            low: candles && candles.length > 0 ? Math.min(...candles.map((c) => c.low)) : undefined,
          }}
          regime={regime?.label}
          showDepth={true}
        />
      )}

      {/* Main Chart */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
        {candlesLoading ? (
          <div className="h-96 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
        ) : candles && candles.length > 0 ? (
          <div className="h-96 relative">
            {/* Simple candlestick visualization */}
            <div className="absolute inset-0 flex items-end gap-px p-4">
              {candles.slice(-60).map((candle, i) => {
                const min = Math.min(...candles.slice(-60).map((c) => c.low));
                const max = Math.max(...candles.slice(-60).map((c) => c.high));
                const range = max - min || 1;
                const isGreen = candle.close >= candle.open;
                const bodyTop = ((max - Math.max(candle.open, candle.close)) / range) * 100;
                const bodyHeight = (Math.abs(candle.close - candle.open) / range) * 100 || 0.5;

                return (
                  <div
                    key={i}
                    className="flex-1 relative"
                    title={`O: ${candle.open.toFixed(2)} H: ${candle.high.toFixed(2)} L: ${candle.low.toFixed(2)} C: ${candle.close.toFixed(2)}`}
                  >
                    {/* Wick */}
                    <div
                      className="absolute left-1/2 w-px bg-cream-400 dark:bg-cream-600 -translate-x-1/2"
                      style={{
                        top: `${((max - candle.high) / range) * 100}%`,
                        height: `${((candle.high - candle.low) / range) * 100}%`,
                      }}
                    />
                    {/* Body */}
                    <div
                      className={`absolute left-0 right-0 mx-0.5 rounded-sm ${
                        isGreen ? "bg-green-500 dark:bg-green-400" : "bg-red-500 dark:bg-red-400"
                      }`}
                      style={{
                        top: `${bodyTop}%`,
                        height: `${Math.max(bodyHeight, 1)}%`,
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
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
        <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
          <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-4">
            Moving Averages
          </h2>
          <div className="grid grid-cols-6 gap-4 text-sm">
            <div>
              <span className="text-cream-500 dark:text-cream-400">SMA 20</span>
              <div className="font-mono text-cream-900 dark:text-cream-100">
                {formatPrice(indicators.sma20)}
              </div>
            </div>
            <div>
              <span className="text-cream-500 dark:text-cream-400">SMA 50</span>
              <div className="font-mono text-cream-900 dark:text-cream-100">
                {formatPrice(indicators.sma50)}
              </div>
            </div>
            <div>
              <span className="text-cream-500 dark:text-cream-400">SMA 200</span>
              <div className="font-mono text-cream-900 dark:text-cream-100">
                {formatPrice(indicators.sma200)}
              </div>
            </div>
            <div>
              <span className="text-cream-500 dark:text-cream-400">EMA 12</span>
              <div className="font-mono text-cream-900 dark:text-cream-100">
                {formatPrice(indicators.ema12)}
              </div>
            </div>
            <div>
              <span className="text-cream-500 dark:text-cream-400">EMA 26</span>
              <div className="font-mono text-cream-900 dark:text-cream-100">
                {formatPrice(indicators.ema26)}
              </div>
            </div>
            <div>
              <span className="text-cream-500 dark:text-cream-400">MACD</span>
              <div className="font-mono text-cream-900 dark:text-cream-100">
                {indicators.macdLine?.toFixed(2) ?? "--"}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IndicatorCard({
  name,
  value,
  status,
  isLoading,
}: {
  name: string;
  value: string;
  status?: "overbought" | "oversold" | "bullish" | "bearish" | "neutral";
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
        <div className="h-4 w-16 bg-cream-100 dark:bg-night-700 rounded animate-pulse mb-2" />
        <div className="h-6 w-12 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
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

  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
      <div className="text-sm text-cream-500 dark:text-cream-400">{name}</div>
      <div className={`mt-1 text-xl font-mono font-medium ${statusColors[status ?? "neutral"]}`}>
        {value}
      </div>
    </div>
  );
}
