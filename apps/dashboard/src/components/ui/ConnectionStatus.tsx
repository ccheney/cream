/**
 * ConnectionStatus Component
 *
 * Displays WebSocket connection state with reconnection status.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 6.3
 */

"use client";

import { RefreshCw, Wifi, WifiOff, Zap } from "lucide-react";
import { memo } from "react";

// ============================================
// Types
// ============================================

export interface ConnectionStatusProps {
  /** Connection state */
  state: "connected" | "connecting" | "reconnecting" | "disconnected";
  /** Current reconnection attempt */
  attempt?: number;
  /** Maximum reconnection attempts */
  maxAttempts?: number;
  /** Seconds until next retry */
  nextRetryIn?: number | null;
  /** Show detailed status */
  showDetails?: boolean;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Custom class */
  className?: string;
}

// ============================================
// Component
// ============================================

/**
 * ConnectionStatus shows the WebSocket connection state.
 *
 * States:
 * - Connected: Green dot with "Connected" label
 * - Connecting: Yellow pulsing dot with "Connecting..."
 * - Reconnecting: Yellow pulsing dot with attempt count and countdown
 * - Disconnected: Red dot with "Disconnected"
 */
export const ConnectionStatus = memo(function ConnectionStatus({
  state,
  attempt = 0,
  maxAttempts = 10,
  nextRetryIn,
  showDetails = false,
  size = "md",
  className = "",
}: ConnectionStatusProps) {
  const sizeClasses = {
    sm: { dot: "w-1.5 h-1.5", text: "text-xs", icon: "w-3 h-3" },
    md: { dot: "w-2 h-2", text: "text-sm", icon: "w-4 h-4" },
    lg: { dot: "w-2.5 h-2.5", text: "text-base", icon: "w-5 h-5" },
  };

  const styles = sizeClasses[size];

  const stateConfig = {
    connected: {
      dotColor: "bg-green-500",
      textColor: "text-green-600 dark:text-green-400",
      label: "Connected",
      icon: Wifi,
      animate: false,
    },
    connecting: {
      dotColor: "bg-yellow-500",
      textColor: "text-yellow-600 dark:text-yellow-400",
      label: "Connecting...",
      icon: RefreshCw,
      animate: true,
    },
    reconnecting: {
      dotColor: "bg-yellow-500",
      textColor: "text-yellow-600 dark:text-yellow-400",
      label: `Reconnecting (${attempt}/${maxAttempts})`,
      icon: RefreshCw,
      animate: true,
    },
    disconnected: {
      dotColor: "bg-red-500",
      textColor: "text-red-600 dark:text-red-400",
      label: "Disconnected",
      icon: WifiOff,
      animate: false,
    },
  };

  const config = stateConfig[state];
  const Icon = config.icon;

  return (
    <output className={`flex items-center gap-2 ${className}`} aria-live="polite">
      {/* Status dot */}
      <span
        className={`${styles.dot} rounded-full ${config.dotColor} ${config.animate ? "animate-pulse" : ""}`}
      />

      {/* Icon (for larger sizes or when showing details) */}
      {(showDetails || size === "lg") && (
        <Icon
          className={`${styles.icon} ${config.textColor} ${config.animate ? "animate-spin" : ""}`}
        />
      )}

      {/* Label */}
      <span className={`${styles.text} ${config.textColor}`}>{config.label}</span>

      {/* Countdown (reconnecting only) */}
      {state === "reconnecting" &&
        nextRetryIn !== null &&
        nextRetryIn !== undefined &&
        nextRetryIn > 0 && (
          <span className={`${styles.text} text-cream-500 dark:text-cream-400`}>
            ({nextRetryIn}s)
          </span>
        )}

      {/* Streaming indicator when connected */}
      {state === "connected" && showDetails && (
        <span title="Streaming active">
          <Zap className={`${styles.icon} text-green-500 animate-pulse`} />
        </span>
      )}
    </output>
  );
});

// ============================================
// Exports
// ============================================

export default ConnectionStatus;
