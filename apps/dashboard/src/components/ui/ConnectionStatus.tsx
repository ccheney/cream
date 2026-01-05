/**
 * Connection Status Indicator Component
 *
 * Compact WebSocket connection status indicator with three states:
 * - Connected: Green dot, stable
 * - Connecting: Amber dot, pulsing animation
 * - Disconnected: Red dot, action needed
 *
 * @see docs/plans/ui/31-realtime-patterns.md lines 7-16
 */

"use client";

import { useCallback, useState } from "react";
import type { ConnectionState } from "../../hooks/useWebSocket.js";

// ============================================
// Types
// ============================================

export interface ConnectionStatusProps {
  /** Current connection state */
  connectionState: ConnectionState;
  /** Last connected timestamp */
  lastConnectedAt?: Date;
  /** Callback when reconnect is clicked */
  onReconnect?: () => void;
  /** Number of reconnection attempts */
  reconnectAttempts?: number;
  /** Show text label (default: false for compact mode) */
  showLabel?: boolean;
  /** Test ID for testing */
  testId?: string;
}

// ============================================
// Constants
// ============================================

const STATE_CONFIG = {
  connected: {
    color: "#22c55e", // green-500
    bgColor: "#22c55e",
    label: "Connected",
    ariaLabel: "WebSocket connected",
    pulse: false,
  },
  connecting: {
    color: "#f59e0b", // amber-500
    bgColor: "#f59e0b",
    label: "Connecting...",
    ariaLabel: "Connecting to server",
    pulse: true,
  },
  reconnecting: {
    color: "#f59e0b", // amber-500
    bgColor: "#f59e0b",
    label: "Reconnecting...",
    ariaLabel: "Reconnecting to server",
    pulse: true,
  },
  disconnected: {
    color: "#ef4444", // red-500
    bgColor: "#ef4444",
    label: "Disconnected",
    ariaLabel: "WebSocket disconnected. Click to reconnect.",
    pulse: false,
  },
} as const;

// ============================================
// Styles
// ============================================

const styles = {
  container: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    cursor: "pointer",
    padding: "4px 8px",
    borderRadius: "6px",
    transition: "background-color 0.2s ease",
  },
  dot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    flexShrink: 0,
    transition: "background-color 0.2s ease",
  },
  label: {
    fontSize: "12px",
    fontWeight: 500,
    color: "#6b7280", // gray-500
    transition: "color 0.2s ease",
  },
  tooltip: {
    position: "absolute" as const,
    bottom: "100%",
    left: "50%",
    transform: "translateX(-50%)",
    marginBottom: "8px",
    padding: "8px 12px",
    backgroundColor: "#1f2937", // gray-800
    color: "#f9fafb", // gray-50
    fontSize: "12px",
    borderRadius: "6px",
    whiteSpace: "nowrap" as const,
    zIndex: 50,
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
  },
  tooltipArrow: {
    position: "absolute" as const,
    top: "100%",
    left: "50%",
    transform: "translateX(-50%)",
    borderWidth: "6px",
    borderStyle: "solid",
    borderColor: "#1f2937 transparent transparent transparent",
  },
};

// Pulse animation keyframes
const pulseKeyframes = `
  @keyframes connection-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(1.1); }
  }
`;

// ============================================
// Helper Functions
// ============================================

/**
 * Format the last connected time for tooltip.
 */
function formatLastConnected(date?: Date): string {
  if (!date) {
    return "";
  }
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);

  if (diffSecs < 60) {
    return `Last connected: ${diffSecs}s ago`;
  }
  if (diffMins < 60) {
    return `Last connected: ${diffMins}m ago`;
  }
  return `Last connected: ${diffHours}h ago`;
}

/**
 * Get tooltip content based on state.
 */
function getTooltipContent(
  state: ConnectionState,
  lastConnectedAt?: Date,
  reconnectAttempts?: number
): string {
  const config = STATE_CONFIG[state];
  let content = config.label;

  if (state === "reconnecting" && reconnectAttempts !== undefined) {
    content += ` (attempt ${reconnectAttempts + 1})`;
  }

  if (state === "disconnected" && lastConnectedAt) {
    content += `\n${formatLastConnected(lastConnectedAt)}`;
    content += "\nClick to reconnect";
  }

  return content;
}

// ============================================
// Component
// ============================================

/**
 * Compact connection status indicator.
 *
 * @example
 * ```tsx
 * <ConnectionStatus
 *   connectionState="connected"
 *   onReconnect={() => ws.connect()}
 * />
 * ```
 */
export function ConnectionStatus({
  connectionState,
  lastConnectedAt,
  onReconnect,
  reconnectAttempts,
  showLabel = false,
  testId = "connection-status",
}: ConnectionStatusProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const config = STATE_CONFIG[connectionState];

  const handleClick = useCallback(() => {
    if (connectionState === "disconnected" && onReconnect) {
      onReconnect();
    }
  }, [connectionState, onReconnect]);

  const tooltipContent = getTooltipContent(connectionState, lastConnectedAt, reconnectAttempts);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: pulseKeyframes }} />
      <div
        role="status"
        aria-label={config.ariaLabel}
        data-testid={testId}
        data-state={connectionState}
        style={{
          ...styles.container,
          position: "relative",
          cursor: connectionState === "disconnected" ? "pointer" : "default",
        }}
        onClick={handleClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            handleClick();
          }
        }}
        tabIndex={connectionState === "disconnected" ? 0 : -1}
      >
        {/* Status Dot */}
        <div
          style={{
            ...styles.dot,
            backgroundColor: config.bgColor,
            animation: config.pulse ? "connection-pulse 1.5s ease-in-out infinite" : "none",
          }}
          aria-hidden="true"
        />

        {/* Label (optional) */}
        {showLabel && (
          <span style={{ ...styles.label, color: config.color }}>{config.label}</span>
        )}

        {/* Tooltip */}
        {showTooltip && (
          <div style={styles.tooltip} role="tooltip">
            {tooltipContent.split("\n").map((line, i) => (
              <div key={i}>{line}</div>
            ))}
            <div style={styles.tooltipArrow} aria-hidden="true" />
          </div>
        )}
      </div>
    </>
  );
}

export default ConnectionStatus;
