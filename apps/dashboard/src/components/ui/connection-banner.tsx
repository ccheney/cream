/**
 * Connection Banner Component
 *
 * Displays WebSocket disconnection state with reconnection functionality.
 *
 * @see docs/plans/ui/28-states.md lines 89-96
 */

"use client";

import type React from "react";
import type { ConnectionStatus } from "../../lib/ws/connection-monitor";

// ============================================
// Types
// ============================================

/**
 * Connection banner props.
 */
export interface ConnectionBannerProps {
  /** Current connection status */
  status: ConnectionStatus;
  /** Number of reconnection attempts */
  retryCount?: number;
  /** Time until next retry in ms */
  nextRetryIn?: number;
  /** Callback when manual reconnect is clicked */
  onReconnect?: () => void;
  /** Callback when dismiss is clicked */
  onDismiss?: () => void;
  /** Test ID for testing */
  testId?: string;
}

// ============================================
// Styles
// ============================================

const bannerStyles = {
  container: {
    position: "sticky" as const,
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "12px 16px",
    backgroundColor: "#fef3c7", // amber-100
    borderBottom: "1px solid #f59e0b", // amber-500
    boxSizing: "border-box" as const,
  },
  icon: {
    flexShrink: 0,
    width: "20px",
    height: "20px",
    color: "#d97706", // amber-600
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#92400e", // amber-800
    marginBottom: "2px",
  },
  message: {
    fontSize: "13px",
    color: "#b45309", // amber-700
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexShrink: 0,
  },
  reconnectButton: {
    padding: "6px 12px",
    fontSize: "13px",
    fontWeight: 500,
    color: "#ffffff",
    backgroundColor: "#d97706", // amber-600
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    transition: "background-color 0.2s",
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  dismissButton: {
    padding: "4px",
    backgroundColor: "transparent",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    color: "#92400e", // amber-800
    transition: "background-color 0.2s",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  spinner: {
    width: "14px",
    height: "14px",
    border: "2px solid rgba(255, 255, 255, 0.3)",
    borderTopColor: "#ffffff",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
};

// Inline keyframes for spinner
const spinnerKeyframes = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

// ============================================
// Icons
// ============================================

function WarningIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function CloseIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function RefreshIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

// ============================================
// Helper Functions
// ============================================

/**
 * Format milliseconds as human-readable time.
 */
export function formatRetryTime(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds <= 0) {
    return "now";
  }
  if (seconds === 1) {
    return "1 second";
  }
  if (seconds < 60) {
    return `${seconds} seconds`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes} minute${minutes > 1 ? "s" : ""}`;
}

/**
 * Get status message based on connection state.
 */
export function getStatusMessage(
  status: ConnectionStatus,
  nextRetryIn: number,
  retryCount: number
): { title: string; message: string } {
  switch (status) {
    case "disconnected":
      return {
        title: "Connection Lost",
        message: "Live updates paused. Attempting to reconnect...",
      };
    case "reconnecting":
      if (nextRetryIn > 0) {
        return {
          title: "Reconnecting...",
          message: `Next attempt in ${formatRetryTime(nextRetryIn)}`,
        };
      }
      return {
        title: "Reconnecting...",
        message: `Attempt ${retryCount + 1} in progress`,
      };
    case "failed":
      return {
        title: "Connection Failed",
        message: "Unable to reconnect. Please try manually.",
      };
    default:
      return {
        title: "Connection Lost",
        message: "Live updates paused.",
      };
  }
}

// ============================================
// Component
// ============================================

/**
 * Connection banner component for WebSocket disconnection state.
 *
 * @example
 * ```tsx
 * <ConnectionBanner
 *   status="reconnecting"
 *   retryCount={3}
 *   nextRetryIn={8000}
 *   onReconnect={() => ws.connect()}
 *   onDismiss={() => setDismissed(true)}
 * />
 * ```
 */
export function ConnectionBanner({
  status,
  retryCount = 0,
  nextRetryIn = 0,
  onReconnect,
  onDismiss,
  testId = "connection-banner",
}: ConnectionBannerProps) {
  // Don't render when connected
  if (status === "connected") {
    return null;
  }

  const { title, message } = getStatusMessage(status, nextRetryIn, retryCount);
  const isReconnecting = status === "reconnecting" && nextRetryIn === 0;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: spinnerKeyframes }} />
      <div role="alert" aria-live="assertive" data-testid={testId} style={bannerStyles.container}>
        {/* Warning Icon */}
        <WarningIcon style={bannerStyles.icon} />

        {/* Content */}
        <div style={bannerStyles.content}>
          <div style={bannerStyles.title}>{title}</div>
          <div style={bannerStyles.message}>{message}</div>
        </div>

        {/* Actions */}
        <div style={bannerStyles.actions}>
          {/* Reconnect Button */}
          <button
            type="button"
            onClick={onReconnect}
            disabled={isReconnecting}
            style={{
              ...bannerStyles.reconnectButton,
              opacity: isReconnecting ? 0.7 : 1,
              cursor: isReconnecting ? "not-allowed" : "pointer",
            }}
            onMouseOver={(e) => {
              if (!isReconnecting) {
                e.currentTarget.style.backgroundColor = "#b45309";
              }
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = "#d97706";
            }}
            aria-label={isReconnecting ? "Reconnecting" : "Reconnect now"}
          >
            {isReconnecting ? (
              <div style={bannerStyles.spinner} />
            ) : (
              <RefreshIcon style={{ width: "14px", height: "14px" }} />
            )}
            {isReconnecting ? "Reconnecting..." : "Reconnect Now"}
          </button>

          {/* Dismiss Button */}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              style={bannerStyles.dismissButton}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(146, 64, 14, 0.1)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
              aria-label="Dismiss banner"
            >
              <CloseIcon style={{ width: "18px", height: "18px" }} />
            </button>
          )}
        </div>
      </div>
    </>
  );
}

export default ConnectionBanner;
