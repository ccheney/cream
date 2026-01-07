/**
 * Refresh Indicator Component
 *
 * Small inline indicator showing when data is being refreshed.
 * Designed for streaming/live data contexts where we want to show
 * current data while indicating a refresh is happening in the background.
 *
 * @see docs/plans/ui/28-states.md
 */

import type React from "react";

// ============================================
// Types
// ============================================

export type RefreshIndicatorVariant = "dot" | "bar" | "pulse" | "icon";
export type RefreshIndicatorPosition = "inline" | "corner" | "header";

export interface RefreshIndicatorProps {
  /** Whether refresh is in progress */
  isRefreshing: boolean;
  /** Visual variant */
  variant?: RefreshIndicatorVariant;
  /** Position relative to content */
  position?: RefreshIndicatorPosition;
  /** Custom label for accessibility */
  label?: string;
  /** Custom className */
  className?: string;
  /** Children to render (for wrapping mode) */
  children?: React.ReactNode;
}

// ============================================
// Keyframes
// ============================================

const pulseKeyframes = `
  @keyframes refresh-pulse {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 1; }
  }
`;

const spinKeyframes = `
  @keyframes refresh-spin {
    to { transform: rotate(360deg); }
  }
`;

const slideKeyframes = `
  @keyframes refresh-slide {
    0% { left: -30%; }
    100% { left: 100%; }
  }
`;

// ============================================
// Sub-components
// ============================================

/**
 * Animated dot indicator.
 */
function DotIndicator({ isRefreshing }: { isRefreshing: boolean }) {
  return (
    <>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: Safe - hardcoded CSS keyframes */}
      <style dangerouslySetInnerHTML={{ __html: pulseKeyframes }} />
      <span
        style={{
          display: "inline-block",
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          backgroundColor: "currentColor",
          opacity: isRefreshing ? 1 : 0.3,
          animation: isRefreshing ? "refresh-pulse 1s ease-in-out infinite" : "none",
          transition: "opacity 0.2s",
        }}
        aria-hidden="true"
      />
    </>
  );
}

/**
 * Sliding bar indicator.
 */
function BarIndicator({ isRefreshing }: { isRefreshing: boolean }) {
  return (
    <>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: Safe - hardcoded CSS keyframes */}
      <style dangerouslySetInnerHTML={{ __html: slideKeyframes }} />
      <span
        style={{
          display: "block",
          width: "100%",
          height: "2px",
          backgroundColor: "currentColor",
          opacity: 0.1,
          position: "relative",
          overflow: "hidden",
          borderRadius: "1px",
        }}
        aria-hidden="true"
      >
        {isRefreshing && (
          <span
            style={{
              position: "absolute",
              top: 0,
              left: "-30%",
              width: "30%",
              height: "100%",
              backgroundColor: "currentColor",
              opacity: 0.8,
              animation: "refresh-slide 1s ease-in-out infinite",
              borderRadius: "1px",
            }}
          />
        )}
      </span>
    </>
  );
}

/**
 * Pulse ring indicator.
 */
function PulseIndicator({ isRefreshing }: { isRefreshing: boolean }) {
  return (
    <>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: Safe - hardcoded CSS keyframes */}
      <style dangerouslySetInnerHTML={{ __html: pulseKeyframes }} />
      <span
        style={{
          display: "inline-flex",
          position: "relative",
          width: "8px",
          height: "8px",
        }}
        aria-hidden="true"
      >
        <span
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            backgroundColor: "currentColor",
            opacity: isRefreshing ? 0.75 : 0.3,
            animation: isRefreshing ? "refresh-pulse 1.5s ease-in-out infinite" : "none",
          }}
        />
        {isRefreshing && (
          <span
            style={{
              position: "absolute",
              inset: "-4px",
              borderRadius: "50%",
              border: "1px solid currentColor",
              opacity: 0.3,
              animation: "refresh-pulse 1.5s ease-in-out infinite",
              animationDelay: "0.5s",
            }}
          />
        )}
      </span>
    </>
  );
}

/**
 * Spinning icon indicator.
 */
function IconIndicator({ isRefreshing }: { isRefreshing: boolean }) {
  return (
    <>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: Safe - hardcoded CSS keyframes */}
      <style dangerouslySetInnerHTML={{ __html: spinKeyframes }} />
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          opacity: isRefreshing ? 1 : 0.3,
          animation: isRefreshing ? "refresh-spin 1s linear infinite" : "none",
          transition: "opacity 0.2s",
        }}
        aria-hidden="true"
      >
        <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
      </svg>
    </>
  );
}

// ============================================
// Main Component
// ============================================

/**
 * Refresh indicator for streaming/live data.
 *
 * Shows a subtle visual indicator when data is being refreshed,
 * without hiding existing content.
 *
 * @example
 * ```tsx
 * // Inline with label
 * <div className="flex items-center gap-2">
 *   <span>Portfolio Value</span>
 *   <RefreshIndicator isRefreshing={isFetching} variant="dot" />
 * </div>
 *
 * // Wrapping content with corner indicator
 * <RefreshIndicator isRefreshing={isFetching} position="corner">
 *   <DataCard data={data} />
 * </RefreshIndicator>
 *
 * // Header bar style
 * <RefreshIndicator isRefreshing={isFetching} variant="bar" position="header" />
 * ```
 */
export function RefreshIndicator({
  isRefreshing,
  variant = "dot",
  position = "inline",
  label = "Refreshing",
  className,
  children,
}: RefreshIndicatorProps) {
  const indicator = (
    // biome-ignore lint/a11y/useSemanticElements: span with role="status" is correct for live region
    <span
      role="status"
      aria-label={isRefreshing ? label : "Data up to date"}
      aria-live="polite"
      className={className}
    >
      {variant === "dot" && <DotIndicator isRefreshing={isRefreshing} />}
      {variant === "bar" && <BarIndicator isRefreshing={isRefreshing} />}
      {variant === "pulse" && <PulseIndicator isRefreshing={isRefreshing} />}
      {variant === "icon" && <IconIndicator isRefreshing={isRefreshing} />}
    </span>
  );

  // Inline mode - just return the indicator
  if (position === "inline" || !children) {
    return indicator;
  }

  // Corner mode - wrap children with positioned indicator
  if (position === "corner") {
    return (
      <div style={{ position: "relative" }}>
        {children}
        <span
          style={{
            position: "absolute",
            top: "8px",
            right: "8px",
            color: "var(--color-primary, #3b82f6)",
          }}
        >
          {indicator}
        </span>
      </div>
    );
  }

  // Header mode - bar above content
  if (position === "header") {
    return (
      <div>
        <div style={{ marginBottom: "4px", color: "var(--color-primary, #3b82f6)" }}>
          <BarIndicator isRefreshing={isRefreshing} />
        </div>
        {children}
      </div>
    );
  }

  return indicator;
}

// ============================================
// Convenience Components
// ============================================

/**
 * Live data indicator with timestamp.
 */
export function LiveDataIndicator({
  isRefreshing,
  lastUpdated,
  className,
}: {
  isRefreshing: boolean;
  lastUpdated?: Date | string | null;
  className?: string;
}) {
  const formatTime = (date: Date | string) => {
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "12px",
        color: "inherit",
        opacity: 0.7,
      }}
    >
      <RefreshIndicator isRefreshing={isRefreshing} variant="pulse" />
      {lastUpdated && <span>Updated {formatTime(lastUpdated)}</span>}
      {!lastUpdated && isRefreshing && <span>Updating...</span>}
    </span>
  );
}

/**
 * Streaming status badge.
 */
export function StreamingBadge({
  isConnected,
  isRefreshing,
  className,
}: {
  isConnected: boolean;
  isRefreshing?: boolean;
  className?: string;
}) {
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "2px 8px",
        fontSize: "11px",
        fontWeight: 500,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        borderRadius: "4px",
        backgroundColor: isConnected ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)",
        color: isConnected ? "rgb(34, 197, 94)" : "rgb(239, 68, 68)",
      }}
    >
      <RefreshIndicator isRefreshing={isConnected && (isRefreshing ?? true)} variant="dot" />
      {isConnected ? "Live" : "Offline"}
    </span>
  );
}

// ============================================
// Exports
// ============================================

export default RefreshIndicator;
