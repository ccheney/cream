/**
 * SystemHealthBadge Component
 *
 * Combines StatusDot with text label to show system health status.
 * Implements the "Living Indicators" design pattern.
 *
 * @see docs/plans/ui/20-design-philosophy.md — Key Visual Signatures
 */

import { forwardRef, type HTMLAttributes } from "react";
import { StatusDot, type StatusDotSize, type StatusDotStatus } from "./status-dot";

// Simple className merger utility
function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

// ============================================
// Types
// ============================================

export type SystemHealthStatus =
  | "connected"
  | "connecting"
  | "disconnected"
  | "degraded"
  | "paused"
  | "live"
  | "streaming";

export interface SystemHealthBadgeProps extends HTMLAttributes<HTMLDivElement> {
  /** Health status */
  status: SystemHealthStatus;
  /** Show the text label */
  showLabel?: boolean;
  /** Custom label text (overrides default) */
  label?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Show glow effect */
  glow?: boolean;
  /** Variant style */
  variant?: "default" | "pill" | "minimal";
  /** Additional class names */
  className?: string;
}

// ============================================
// Status Mapping
// ============================================

const healthToStatusMap: Record<SystemHealthStatus, StatusDotStatus> = {
  connected: "active",
  connecting: "processing",
  disconnected: "error",
  degraded: "idle",
  paused: "paused",
  live: "active",
  streaming: "streaming",
};

const healthLabels: Record<SystemHealthStatus, string> = {
  connected: "Connected",
  connecting: "Connecting",
  disconnected: "Disconnected",
  degraded: "Degraded",
  paused: "Paused",
  live: "LIVE",
  streaming: "Streaming",
};

const sizeToStatusDotSize: Record<"sm" | "md" | "lg", StatusDotSize> = {
  sm: "xs",
  md: "sm",
  lg: "md",
};

// ============================================
// Component
// ============================================

/**
 * SystemHealthBadge - Status indicator with label.
 *
 * @example
 * ```tsx
 * <SystemHealthBadge status="connected" />
 * <SystemHealthBadge status="live" variant="pill" glow />
 * <SystemHealthBadge status="disconnected" label="API Offline" />
 * ```
 */
export const SystemHealthBadge = forwardRef<HTMLDivElement, SystemHealthBadgeProps>(
  (
    {
      status,
      showLabel = true,
      label,
      size = "md",
      glow = false,
      variant = "default",
      className,
      ...props
    },
    ref
  ) => {
    const dotStatus = healthToStatusMap[status];
    const displayLabel = label ?? healthLabels[status];
    const dotSize = sizeToStatusDotSize[size];

    const sizeClasses = {
      sm: "text-xs gap-1",
      md: "text-sm gap-1.5",
      lg: "text-base gap-2",
    };

    const variantClasses = {
      default: "",
      pill: cn(
        "px-2 py-0.5 rounded-full",
        "bg-stone-100 dark:bg-stone-800",
        "border border-stone-200 dark:border-stone-700"
      ),
      minimal: "opacity-80 hover:opacity-100 transition-opacity",
    };

    // Text color based on status
    const textColorClasses: Record<SystemHealthStatus, string> = {
      connected: "text-green-600 dark:text-green-400",
      connecting: "text-amber-600 dark:text-amber-400",
      disconnected: "text-red-600 dark:text-red-400",
      degraded: "text-stone-600 dark:text-stone-400",
      paused: "text-amber-600 dark:text-amber-400",
      live: "text-green-600 dark:text-green-400 font-semibold",
      streaming: "text-blue-600 dark:text-blue-400",
    };

    return (
      <div
        ref={ref}
        role="status"
        aria-label={displayLabel}
        className={cn(
          "inline-flex items-center",
          sizeClasses[size],
          variantClasses[variant],
          className
        )}
        {...props}
      >
        <StatusDot status={dotStatus} size={dotSize} glow={glow} aria-hidden="true" />
        {showLabel && (
          <span className={cn("font-medium tracking-tight", textColorClasses[status])}>
            {displayLabel}
          </span>
        )}
      </div>
    );
  }
);

SystemHealthBadge.displayName = "SystemHealthBadge";

// ============================================
// Presets
// ============================================

/**
 * LiveBadge - Quick preset for live trading status.
 */
export function LiveBadge({ className, ...props }: Omit<SystemHealthBadgeProps, "status">) {
  return <SystemHealthBadge status="live" variant="pill" glow className={className} {...props} />;
}

/**
 * ConnectionBadge - Quick preset for connection status.
 */
export function ConnectionBadge({
  connected,
  className,
  ...props
}: { connected: boolean } & Omit<SystemHealthBadgeProps, "status">) {
  return (
    <SystemHealthBadge
      status={connected ? "connected" : "disconnected"}
      className={className}
      {...props}
    />
  );
}

/**
 * StreamingBadge - Quick preset for data streaming status.
 */
export function StreamingBadge({ className, ...props }: Omit<SystemHealthBadgeProps, "status">) {
  return <SystemHealthBadge status="streaming" glow className={className} {...props} />;
}

// ============================================
// Export
// ============================================

export default SystemHealthBadge;
