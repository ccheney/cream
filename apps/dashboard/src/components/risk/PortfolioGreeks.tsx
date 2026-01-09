/**
 * PortfolioGreeks Component
 *
 * Aggregated real-time portfolio Greeks dashboard with delta gauge and cards.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 4.3
 */

"use client";

import { RefreshCw } from "lucide-react";
import { memo } from "react";
import { Spinner } from "@/components/ui/spinner";
import { type AggregateGreeksData, useAggregateGreeks } from "@/hooks/useAggregateGreeks";
import { DeltaGauge } from "./DeltaGauge";
import { GreekCard } from "./GreekCard";

export interface PortfolioGreeksProps {
  /** Delta limit for gauge */
  deltaLimit?: number;
  /** Gamma limit */
  gammaLimit?: number;
  /** Theta limit */
  thetaLimit?: number;
  /** Vega limit */
  vegaLimit?: number;
  /** Show delta gauge */
  showGauge?: boolean;
  /** Show limit markers on gauge */
  showLimits?: boolean;
  /** Display variant */
  variant?: "full" | "compact";
  /** Additional class names */
  className?: string;
}

export const PortfolioGreeks = memo(function PortfolioGreeks({
  deltaLimit = 500000,
  gammaLimit,
  thetaLimit,
  vegaLimit,
  showGauge = true,
  showLimits = false,
  variant = "full",
  className = "",
}: PortfolioGreeksProps) {
  const { data, isLoading, isStreaming, refresh } = useAggregateGreeks({
    throttleMs: 100,
    enabled: true,
  });

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const getTimeSinceUpdate = (date: Date) => {
    const ms = Date.now() - date.getTime();
    if (ms < 1000) {
      return `${ms}ms ago`;
    }
    return `${(ms / 1000).toFixed(1)}s ago`;
  };

  if (isLoading) {
    return (
      <div
        className={`bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6 ${className}`}
      >
        <div className="flex items-center justify-center h-48">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div
        className={`bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6 ${className}`}
      >
        <div className="text-center text-cream-500 dark:text-cream-400 py-8">
          No options positions to calculate Greeks
        </div>
      </div>
    );
  }

  if (variant === "compact") {
    return <CompactGreeks data={data} isStreaming={isStreaming} className={className} />;
  }

  return (
    <div
      className={`bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 ${className}`}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-cream-200 dark:border-night-700">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100">
            Portfolio Greeks
          </h2>
          {isStreaming && (
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-cream-500 dark:text-cream-400">Streaming</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-cream-400 dark:text-cream-500">
            {formatTimestamp(data.lastUpdated)} ({getTimeSinceUpdate(data.lastUpdated)})
          </span>
          <button
            type="button"
            onClick={refresh}
            className="p-1.5 rounded-md text-cream-500 hover:bg-cream-100 dark:hover:bg-night-700 transition-colors"
            aria-label="Refresh Greeks"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {showGauge && (
          <DeltaGauge
            deltaNotional={data.deltaNotional}
            deltaSPYEquivalent={data.deltaSPYEquivalent}
            maxValue={deltaLimit}
            showLimits={showLimits}
            size="md"
          />
        )}

        <div className="grid grid-cols-4 gap-4">
          <GreekCard
            type="gamma"
            value={data.gammaTotal}
            limit={gammaLimit}
            isStreaming={isStreaming}
          />
          <GreekCard
            type="theta"
            value={data.thetaDaily}
            limit={thetaLimit}
            isStreaming={isStreaming}
          />
          <GreekCard
            type="vega"
            value={data.vegaTotal}
            limit={vegaLimit}
            isStreaming={isStreaming}
          />
          <GreekCard type="rho" value={data.rhoTotal} isStreaming={isStreaming} />
        </div>

        <div className="text-center text-xs text-cream-400 dark:text-cream-500">
          {data.positionCount} option position{data.positionCount !== 1 ? "s" : ""}
        </div>
      </div>
    </div>
  );
});

interface CompactGreeksProps {
  data: AggregateGreeksData;
  isStreaming: boolean;
  className?: string;
}

const CompactGreeks = memo(function CompactGreeks({
  data,
  isStreaming,
  className = "",
}: CompactGreeksProps) {
  const formatValue = (value: number, type: "currency" | "number") => {
    const sign = value >= 0 ? "+" : "";
    if (type === "currency") {
      return `${sign}$${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    }
    return `${sign}${value.toFixed(0)}`;
  };

  return (
    <div
      className={`flex items-center gap-6 px-4 py-3 bg-cream-50 dark:bg-night-750 rounded-lg ${className}`}
    >
      {isStreaming && (
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[10px] text-cream-500 dark:text-cream-400">Live</span>
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-cream-500 dark:text-cream-400 font-medium">Δ</span>
        <span
          className={`text-sm font-mono ${
            data.deltaNotional >= 0
              ? "text-green-600 dark:text-green-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {formatValue(data.deltaNotional, "currency")}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-cream-500 dark:text-cream-400 font-medium">Γ</span>
        <span className="text-sm font-mono text-cream-700 dark:text-cream-300">
          {formatValue(data.gammaTotal, "number")}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-cream-500 dark:text-cream-400 font-medium">Θ</span>
        <span
          className={`text-sm font-mono ${
            data.thetaDaily <= 0 ? "text-red-500" : "text-green-500"
          }`}
        >
          ${Math.abs(data.thetaDaily).toFixed(0)}/day
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-xs text-cream-500 dark:text-cream-400 font-medium">V</span>
        <span className="text-sm font-mono text-cream-700 dark:text-cream-300">
          {formatValue(data.vegaTotal, "currency")}
        </span>
      </div>
    </div>
  );
});

export default PortfolioGreeks;
