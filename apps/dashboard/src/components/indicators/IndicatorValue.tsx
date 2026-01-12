/**
 * IndicatorValue Component
 *
 * Displays a single indicator value with label, formatting, and status coloring.
 * Follows the "Precision Warmth" design system.
 *
 * @see docs/plans/ui/20-design-philosophy.md
 */

import { cn } from "@/lib/utils";

export interface IndicatorValueProps {
  label: string;
  value: number | string | null | undefined;
  format?: "number" | "percent" | "currency" | "ratio" | "days";
  decimals?: number;
  status?: "positive" | "negative" | "neutral" | "warning" | "critical";
  tooltip?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

function formatValue(
  value: number | string | null | undefined,
  format: IndicatorValueProps["format"] = "number",
  decimals = 2
): string {
  if (value === null || value === undefined) {
    return "--";
  }

  if (typeof value === "string") {
    return value;
  }

  switch (format) {
    case "percent":
      return `${(value * 100).toFixed(decimals)}%`;
    case "currency":
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(value);
    case "ratio":
      return `${value.toFixed(decimals)}x`;
    case "days":
      return `${value.toFixed(0)}d`;
    default:
      return value.toFixed(decimals);
  }
}

const sizeClasses = {
  sm: {
    label: "text-xs",
    value: "text-sm",
  },
  md: {
    label: "text-xs",
    value: "text-base",
  },
  lg: {
    label: "text-sm",
    value: "text-lg",
  },
};

const statusClasses = {
  positive: "text-profit dark:text-profit",
  negative: "text-loss dark:text-loss",
  neutral: "text-neutral dark:text-neutral",
  warning: "text-amber-500 dark:text-amber-400",
  critical: "text-red-600 dark:text-red-500",
};

export function IndicatorValue({
  label,
  value,
  format = "number",
  decimals = 2,
  status,
  tooltip,
  size = "md",
  className,
}: IndicatorValueProps) {
  const formattedValue = formatValue(value, format, decimals);
  const isNull = value === null || value === undefined;

  return (
    <div className={cn("flex flex-col gap-0.5", className)} title={tooltip}>
      <span
        className={cn(
          "uppercase tracking-wide text-stone-400 dark:text-night-400",
          sizeClasses[size].label
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "font-mono font-medium tabular-nums",
          sizeClasses[size].value,
          isNull && "text-stone-300 dark:text-night-600",
          !isNull && status && statusClasses[status],
          !isNull && !status && "text-stone-700 dark:text-night-200"
        )}
      >
        {formattedValue}
      </span>
    </div>
  );
}

export default IndicatorValue;
