/**
 * LimitBar Component
 *
 * Horizontal progress bar for displaying limit utilization with semantic coloring.
 *
 * @see docs/plans/ui/24-components.md Progress Bars section (lines 98-110)
 * @see docs/plans/ui/32-design-appendix.md limit-bar.tsx
 */

import { forwardRef, type HTMLAttributes, useMemo } from "react";

// Simple className merger utility
function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

// ============================================
// Types
// ============================================

export interface LimitBarThresholds {
  /** Threshold for caution state (default: 60) */
  caution?: number;
  /** Threshold for critical state (default: 80) */
  critical?: number;
}

export type LimitBarVariant = "comfortable" | "caution" | "critical";

export interface LimitBarProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** Current value */
  value: number;
  /** Maximum value (default: 100) */
  max?: number;
  /** Label for the progress bar */
  label?: string;
  /** Show percentage value */
  showValue?: boolean;
  /** Custom format for value display */
  formatValue?: (value: number, max: number) => string;
  /** Thresholds for color transitions */
  thresholds?: LimitBarThresholds;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Additional class names */
  className?: string;
}

// ============================================
// Configuration
// ============================================

const DEFAULT_THRESHOLDS: Required<LimitBarThresholds> = {
  caution: 60,
  critical: 80,
};

const variantColors: Record<LimitBarVariant, { bar: string; bg: string }> = {
  comfortable: {
    bar: "bg-stone-500 dark:bg-stone-400",
    bg: "bg-stone-200 dark:bg-stone-700",
  },
  caution: {
    bar: "bg-amber-500 dark:bg-amber-400",
    bg: "bg-amber-100 dark:bg-amber-900/30",
  },
  critical: {
    bar: "bg-red-500 dark:bg-red-400",
    bg: "bg-red-100 dark:bg-red-900/30",
  },
};

const sizeConfig: Record<"sm" | "md" | "lg", { height: string; fontSize: string }> = {
  sm: { height: "h-1.5", fontSize: "text-xs" },
  md: { height: "h-2", fontSize: "text-sm" },
  lg: { height: "h-3", fontSize: "text-sm" },
};

// ============================================
// Component
// ============================================

/**
 * LimitBar - Progress bar with semantic coloring based on utilization.
 *
 * Colors shift based on utilization percentage:
 * - 0-60%: Stone (comfortable)
 * - 60-80%: Amber (caution)
 * - 80-100%: Red (critical)
 *
 * @example
 * ```tsx
 * // Basic usage
 * <LimitBar value={45} label="Gross Exposure" showValue />
 *
 * // Custom thresholds
 * <LimitBar
 *   value={75}
 *   max={100}
 *   label="Position Size"
 *   thresholds={{ caution: 50, critical: 75 }}
 *   showValue
 * />
 *
 * // Custom value format
 * <LimitBar
 *   value={500000}
 *   max={1000000}
 *   label="Capital Usage"
 *   formatValue={(v, m) => `$${(v / 1000).toFixed(0)}K / $${(m / 1000).toFixed(0)}K`}
 * />
 * ```
 */
export const LimitBar = forwardRef<HTMLDivElement, LimitBarProps>(
  (
    {
      value,
      max = 100,
      label,
      showValue = false,
      formatValue,
      thresholds,
      size = "md",
      className,
      ...props
    },
    ref
  ) => {
    const resolvedThresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
    const sizeStyles = sizeConfig[size];

    // Calculate percentage and variant
    const { percentage, variant } = useMemo(() => {
      const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
      let variantResult: LimitBarVariant = "comfortable";

      if (pct >= resolvedThresholds.critical) {
        variantResult = "critical";
      } else if (pct >= resolvedThresholds.caution) {
        variantResult = "caution";
      }

      return { percentage: pct, variant: variantResult };
    }, [value, max, resolvedThresholds.caution, resolvedThresholds.critical]);

    const colors = variantColors[variant];

    // Format the display value
    const displayValue = formatValue ? formatValue(value, max) : `${Math.round(percentage)}%`;

    return (
      <div ref={ref} className={cn("w-full", className)} {...props}>
        {/* Label and value row */}
        {(label || showValue) && (
          <div className="flex items-center justify-between mb-1">
            {label && (
              <span className={cn("text-stone-600 dark:text-stone-400", sizeStyles.fontSize)}>
                {label}
              </span>
            )}
            {showValue && (
              <span
                className={cn(
                  "font-medium tabular-nums",
                  sizeStyles.fontSize,
                  variant === "critical"
                    ? "text-red-600 dark:text-red-400"
                    : variant === "caution"
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-stone-700 dark:text-stone-300"
                )}
              >
                {displayValue}
              </span>
            )}
          </div>
        )}

        {/* Progress bar */}
        <div
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-label={label ?? "Progress"}
          className={cn("w-full rounded-full overflow-hidden", sizeStyles.height, colors.bg)}
        >
          <div
            className={cn("h-full rounded-full transition-all duration-300 ease-out", colors.bar)}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    );
  }
);

LimitBar.displayName = "LimitBar";

// ============================================
// Convenience Components
// ============================================

/**
 * ExposureBar - Pre-configured LimitBar for exposure metrics.
 */
export const ExposureBar = forwardRef<
  HTMLDivElement,
  Omit<LimitBarProps, "formatValue" | "showValue">
>((props, ref) => (
  <LimitBar ref={ref} showValue formatValue={(_, __) => `${props.value}%`} {...props} />
));

ExposureBar.displayName = "ExposureBar";

// ============================================
// Exports
// ============================================

export default LimitBar;
