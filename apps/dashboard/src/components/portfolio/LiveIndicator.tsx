"use client";

/**
 * LiveIndicator Component
 *
 * Shows WebSocket streaming status with visual indicator.
 * Displays: LIVE (streaming), CONNECTED (idle), OFFLINE, RECONNECTING
 *
 * @see docs/plans/ui/31-realtime-patterns.md for streaming status patterns
 */

import { memo } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// ============================================
// Types
// ============================================

export type ConnectionStatus = "streaming" | "connected" | "disconnected" | "reconnecting";

export interface LiveIndicatorProps {
  /** Whether data is actively streaming */
  isStreaming?: boolean;
  /** Whether WebSocket is connected */
  isConnected?: boolean;
  /** Last data update timestamp */
  lastUpdated?: Date | null;
}

// ============================================
// Status Configuration
// ============================================

interface StatusConfig {
  label: string;
  dotClass: string;
  textClass: string;
}

const STATUS_CONFIG: Record<ConnectionStatus, StatusConfig> = {
  streaming: {
    label: "LIVE",
    dotClass: "bg-green-500 animate-pulse",
    textClass: "text-green-600 dark:text-green-400",
  },
  connected: {
    label: "CONNECTED",
    dotClass: "bg-amber-500",
    textClass: "text-amber-600 dark:text-amber-400",
  },
  disconnected: {
    label: "OFFLINE",
    dotClass: "bg-red-500",
    textClass: "text-red-600 dark:text-red-400",
  },
  reconnecting: {
    label: "RECONNECTING",
    dotClass: "bg-amber-500 animate-pulse",
    textClass: "text-amber-600 dark:text-amber-400",
  },
};

// ============================================
// Helper Functions
// ============================================

function getStatus(isStreaming?: boolean, isConnected?: boolean): ConnectionStatus {
  if (isStreaming) {
    return "streaming";
  }
  if (isConnected) {
    return "connected";
  }
  return "disconnected";
}

function formatLastUpdated(date: Date | null | undefined): string {
  if (!date) {
    return "No data received";
  }
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 5) {
    return "Just now";
  }
  if (diffSec < 60) {
    return `${diffSec}s ago`;
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }
  return date.toLocaleTimeString();
}

// ============================================
// Main Component
// ============================================

export const LiveIndicator = memo(function LiveIndicator({
  isStreaming = false,
  isConnected = false,
  lastUpdated,
}: LiveIndicatorProps) {
  const status = getStatus(isStreaming, isConnected);
  const config = STATUS_CONFIG[status];

  const tooltipContent =
    status === "streaming" || status === "connected"
      ? `Last update: ${formatLastUpdated(lastUpdated)}`
      : status === "reconnecting"
        ? "Attempting to reconnect..."
        : "WebSocket disconnected";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-2 cursor-help">
          <span className={`h-2 w-2 rounded-full ${config.dotClass}`} aria-hidden="true" />
          <span className={`text-sm font-medium ${config.textClass}`}>{config.label}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent position="bottom">{tooltipContent}</TooltipContent>
    </Tooltip>
  );
});

export default LiveIndicator;
