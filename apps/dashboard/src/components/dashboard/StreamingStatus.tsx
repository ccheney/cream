/**
 * Streaming Status Widget
 *
 * Displays WebSocket connection health, subscription counts, and latency metrics.
 * Shows real-time streaming indicators for stocks and options WebSocket connections.
 *
 * @see bead cream-wsw5n
 * @see docs/plans/ui/40-streaming-data-integration.md Part 4.1
 */

"use client";

import { useStreamingMetrics } from "@/hooks/useStreamingMetrics";
import type { HealthStatus } from "@/stores/streaming-metrics-store";

// ============================================
// Types
// ============================================

export interface StreamingStatusProps {
  /** Display variant */
  variant?: "full" | "compact";
  /** Show options WebSocket status */
  showOptions?: boolean;
}

// ============================================
// Helper Components
// ============================================

interface StatusDotProps {
  status: HealthStatus | "connecting";
}

function StatusDot({ status }: StatusDotProps) {
  const colorClasses = {
    healthy: "bg-profit",
    degraded: "bg-neutral",
    disconnected: "bg-loss",
    connecting: "bg-neutral",
  };

  const glowClasses = {
    healthy: "shadow-[0_0_4px_theme(colors.profit)]",
    degraded: "shadow-[0_0_4px_theme(colors.neutral)]",
    disconnected: "shadow-[0_0_4px_theme(colors.loss)]",
    connecting: "shadow-[0_0_4px_theme(colors.neutral)]",
  };

  const isPulsing = status === "connecting" || status === "degraded";

  return (
    <span
      className={`
        inline-block w-2 h-2 rounded-full
        ${colorClasses[status]}
        ${glowClasses[status]}
        ${isPulsing ? "animate-pulse" : ""}
      `}
      aria-hidden="true"
    />
  );
}

interface ConnectionRowProps {
  label: string;
  connected: boolean;
  count: number;
  countLabel: string;
  quotesPerMinute: number;
  healthStatus: HealthStatus;
}

function ConnectionRow({
  label,
  connected,
  count,
  countLabel,
  quotesPerMinute,
  healthStatus,
}: ConnectionRowProps) {
  const status = connected ? healthStatus : "disconnected";

  return (
    <div className="flex items-center justify-between gap-4 text-xs">
      <div className="flex items-center gap-2 min-w-0">
        <StatusDot status={status} />
        <span className="text-text-secondary truncate">{label}</span>
      </div>
      <div className="flex items-center gap-4 text-text-muted">
        <span>{connected ? "Connected" : "Disconnected"}</span>
        <span>
          {countLabel}: {count}
        </span>
        <span>
          Quotes: {quotesPerMinute.toLocaleString()}
          /min
        </span>
      </div>
    </div>
  );
}

function formatLatency(ms: number): string {
  if (ms < 1) {
    return "<1ms";
  }
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTimeAgo(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms ago`;
  }
  if (ms < 60000) {
    return `${Math.round(ms / 1000)}s ago`;
  }
  return `${Math.round(ms / 60000)}m ago`;
}

// ============================================
// Main Component
// ============================================

export function StreamingStatus({ variant = "full", showOptions = true }: StreamingStatusProps) {
  const {
    stocksConnected,
    optionsConnected,
    symbolCount,
    contractCount,
    quotesPerMinute,
    optionsQuotesPerMinute,
    lastMessageAgo,
    avgLatency,
    reconnectAttempts,
    healthStatus,
    connectionState,
  } = useStreamingMetrics();

  const isConnecting = connectionState === "connecting";
  const isReconnecting = connectionState === "reconnecting";
  const displayStatus = isConnecting || isReconnecting ? "connecting" : healthStatus;

  // Compact variant: just a status dot with tooltip
  if (variant === "compact") {
    const tooltipText = stocksConnected
      ? `Streaming: ${symbolCount} symbols, ${quotesPerMinute}/min, ${formatLatency(avgLatency)} avg`
      : "Streaming: Disconnected";

    return (
      <div
        className="inline-flex items-center gap-1.5"
        title={tooltipText}
        role="status"
        aria-label={tooltipText}
      >
        <StatusDot status={displayStatus} />
        <span className="text-xs text-text-muted">
          {stocksConnected ? `${quotesPerMinute.toLocaleString()}/min` : "Offline"}
        </span>
      </div>
    );
  }

  // Full variant
  return (
    <div
      className="rounded-md border border-border bg-surface-secondary p-3"
      role="region"
      aria-label="Streaming Status"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-text-primary">Streaming Status</h3>
        {isReconnecting && reconnectAttempts > 0 && (
          <span className="text-xs text-neutral animate-pulse">
            Reconnecting ({reconnectAttempts})...
          </span>
        )}
      </div>

      {/* Connection Rows */}
      <div className="space-y-2">
        <ConnectionRow
          label="Stocks WebSocket"
          connected={stocksConnected}
          count={symbolCount}
          countLabel="Symbols"
          quotesPerMinute={quotesPerMinute}
          healthStatus={healthStatus}
        />

        {showOptions && (
          <ConnectionRow
            label="Options WebSocket"
            connected={optionsConnected}
            count={contractCount}
            countLabel="Contracts"
            quotesPerMinute={optionsQuotesPerMinute}
            healthStatus={healthStatus}
          />
        )}
      </div>

      {/* Metrics Row */}
      {(stocksConnected || optionsConnected) && (
        <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/50 text-xs text-text-muted">
          <span>Last Message: {lastMessageAgo > 0 ? formatTimeAgo(lastMessageAgo) : "-"}</span>
          <span>Latency: {avgLatency > 0 ? formatLatency(avgLatency) : "-"} avg</span>
        </div>
      )}
    </div>
  );
}

// ============================================
// Export
// ============================================

export default StreamingStatus;
