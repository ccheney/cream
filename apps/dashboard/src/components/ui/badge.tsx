/**
 * Badge Component
 *
 * Pill-shaped badge for status labels and indicators.
 *
 * @see docs/plans/ui/24-components.md Status Badges section (lines 89-96)
 */

import { forwardRef, type HTMLAttributes } from "react";

// Simple className merger utility
function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

// ============================================
// Types
// ============================================

export type BadgeVariant =
  | "success"
  | "warning"
  | "error"
  | "info"
  | "neutral"
  | "active"
  | "paused"
  | "stopped";

export type BadgeSize = "sm" | "md";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Visual variant determining color scheme */
  variant?: BadgeVariant;
  /** Size variant */
  size?: BadgeSize;
  /** Show leading dot indicator */
  dot?: boolean;
  /** Additional class names */
  className?: string;
}

// ============================================
// Variant Configuration
// ============================================

const variantConfig: Record<
  BadgeVariant,
  { bg: string; text: string; dot: string; border?: string }
> = {
  success: {
    bg: "bg-green-100 dark:bg-green-900/30",
    text: "text-green-800 dark:text-green-300",
    dot: "bg-green-500",
  },
  warning: {
    bg: "bg-amber-100 dark:bg-amber-900/30",
    text: "text-amber-800 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  error: {
    bg: "bg-red-100 dark:bg-red-900/30",
    text: "text-red-800 dark:text-red-300",
    dot: "bg-red-500",
  },
  info: {
    bg: "bg-blue-100 dark:bg-blue-900/30",
    text: "text-blue-800 dark:text-blue-300",
    dot: "bg-blue-500",
  },
  neutral: {
    bg: "bg-stone-100 dark:bg-stone-800",
    text: "text-stone-700 dark:text-stone-300",
    dot: "bg-stone-500",
  },
  // Semantic aliases for system status
  active: {
    bg: "bg-green-100 dark:bg-green-900/30",
    text: "text-green-800 dark:text-green-300",
    dot: "bg-green-500",
  },
  paused: {
    bg: "bg-amber-100 dark:bg-amber-900/30",
    text: "text-amber-800 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  stopped: {
    bg: "bg-stone-100 dark:bg-stone-800",
    text: "text-stone-600 dark:text-stone-400",
    dot: "bg-stone-400",
  },
};

const sizeConfig: Record<
  BadgeSize,
  { padding: string; fontSize: string; dotSize: string; gap: string }
> = {
  sm: {
    padding: "px-2 py-0.5",
    fontSize: "text-xs",
    dotSize: "h-1.5 w-1.5",
    gap: "gap-1",
  },
  md: {
    padding: "px-2.5 py-1",
    fontSize: "text-sm",
    dotSize: "h-2 w-2",
    gap: "gap-1.5",
  },
};

// ============================================
// Component
// ============================================

/**
 * Badge - Pill-shaped status indicator.
 *
 * @example
 * ```tsx
 * // Simple badge
 * <Badge variant="success">Active</Badge>
 *
 * // Badge with dot indicator
 * <Badge variant="warning" dot>Processing</Badge>
 *
 * // Small badge
 * <Badge variant="error" size="sm">Failed</Badge>
 *
 * // System status badges
 * <Badge variant="active" dot>Running</Badge>
 * <Badge variant="paused" dot>Paused</Badge>
 * <Badge variant="stopped" dot>Stopped</Badge>
 * ```
 */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = "neutral", size = "md", dot = false, className, children, ...props }, ref) => {
    const variantStyles = variantConfig[variant];
    const sizeStyles = sizeConfig[size];

    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center rounded-full font-medium",
          sizeStyles.padding,
          sizeStyles.fontSize,
          sizeStyles.gap,
          variantStyles.bg,
          variantStyles.text,
          className
        )}
        {...props}
      >
        {dot && (
          <span
            className={cn("rounded-full shrink-0", sizeStyles.dotSize, variantStyles.dot)}
            aria-hidden="true"
          />
        )}
        {children}
      </span>
    );
  }
);

Badge.displayName = "Badge";

// ============================================
// Exports
// ============================================

export default Badge;
