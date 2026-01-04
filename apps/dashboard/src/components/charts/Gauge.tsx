/**
 * Semi-Circular Gauge Component
 *
 * Risk utilization gauge with color-coded thresholds.
 *
 * @see docs/plans/ui/26-data-viz.md lines 153-159
 */

"use client";

import { memo, useMemo, useEffect, useRef, useState } from "react";
import { CHART_COLORS } from "@/lib/chart-config";

// ============================================
// Types
// ============================================

export interface GaugeThresholds {
  /** Comfortable threshold (0-60%) */
  comfortable: number;
  /** Warning threshold (60-80%) */
  warning: number;
  /** Critical threshold (80-100%) */
  critical: number;
}

export interface GaugeProps {
  /** Value (0-100) */
  value: number;

  /** Maximum value (default: 100) */
  max?: number;

  /** Label text below value */
  label?: string;

  /** Custom thresholds */
  thresholds?: GaugeThresholds;

  /** Diameter in pixels (default: 120) */
  size?: number;

  /** Show numeric value (default: true) */
  showValue?: boolean;

  /** Animate on mount and value change (default: true) */
  animate?: boolean;

  /** Animation duration in ms (default: 500) */
  animationDuration?: number;

  /** Additional CSS class */
  className?: string;
}

// ============================================
// Constants
// ============================================

/**
 * Default thresholds.
 */
export const DEFAULT_THRESHOLDS: GaugeThresholds = {
  comfortable: 60,
  warning: 80,
  critical: 100,
};

/**
 * Gauge colors.
 */
export const GAUGE_COLORS = {
  /** Track background */
  track: "#E7E5E4", // cream-300

  /** Comfortable zone (0-60%) */
  comfortable: "#78716C", // stone-400

  /** Warning zone (60-80%) */
  warning: "#D97706", // amber/primary

  /** Critical zone (80-100%) */
  critical: "#EF4444", // red/loss
} as const;

// ============================================
// SVG Path Helpers
// ============================================

/**
 * Convert degrees to radians.
 */
function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Get point on arc.
 */
function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  degrees: number
): { x: number; y: number } {
  const radians = degreesToRadians(degrees);
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

/**
 * Generate SVG arc path.
 * Arc from -120° to +120° (240° total, open at bottom).
 */
function describeArc(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return [
    "M",
    start.x,
    start.y,
    "A",
    radius,
    radius,
    0,
    largeArcFlag,
    0,
    end.x,
    end.y,
  ].join(" ");
}

/**
 * Calculate angle from value.
 * Maps 0-100 to -120 to +120 degrees.
 */
function valueToAngle(value: number, max: number): number {
  const percentage = Math.min(Math.max(value / max, 0), 1);
  // Map 0% to -120°, 100% to +120°
  return -120 + percentage * 240;
}

/**
 * Get color based on value and thresholds.
 */
export function getGaugeColor(value: number, thresholds: GaugeThresholds): string {
  const percentage = value;
  if (percentage < thresholds.comfortable) {
    return GAUGE_COLORS.comfortable;
  } else if (percentage < thresholds.warning) {
    return GAUGE_COLORS.warning;
  } else {
    return GAUGE_COLORS.critical;
  }
}

// ============================================
// Component
// ============================================

/**
 * Semi-circular gauge component for risk utilization.
 */
function GaugeComponent({
  value,
  max = 100,
  label,
  thresholds = DEFAULT_THRESHOLDS,
  size = 120,
  showValue = true,
  animate = true,
  animationDuration = 500,
  className,
}: GaugeProps) {
  const [displayValue, setDisplayValue] = useState(animate ? 0 : value);
  const animationRef = useRef<number | null>(null);

  // Calculate dimensions
  const strokeWidth = size * 0.08;
  const valueStrokeWidth = size * 0.1;
  const radius = (size - valueStrokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;

  // Arc angles
  const startAngle = -120;
  const endAngle = 120;

  // Animated value
  useEffect(() => {
    if (!animate) {
      setDisplayValue(value);
      return;
    }

    const startValue = displayValue;
    const endValue = Math.min(Math.max(value, 0), max);
    const startTime = performance.now();

    const animateValue = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / animationDuration, 1);

      // Ease-out
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentValue = startValue + (endValue - startValue) * eased;

      setDisplayValue(currentValue);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animateValue);
      }
    };

    animationRef.current = requestAnimationFrame(animateValue);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [value, max, animate, animationDuration]);

  // Memoize paths
  const trackPath = useMemo(
    () => describeArc(cx, cy, radius, startAngle, endAngle),
    [cx, cy, radius]
  );

  const valueAngle = useMemo(
    () => valueToAngle(displayValue, max),
    [displayValue, max]
  );

  const valuePath = useMemo(
    () => describeArc(cx, cy, radius, startAngle, valueAngle),
    [cx, cy, radius, valueAngle]
  );

  // Get color
  const color = useMemo(
    () => getGaugeColor((displayValue / max) * 100, thresholds),
    [displayValue, max, thresholds]
  );

  // Format display value
  const formattedValue = useMemo(() => {
    const percentage = (displayValue / max) * 100;
    return `${Math.round(percentage)}%`;
  }, [displayValue, max]);

  return (
    <div
      className={className}
      style={{ width: size, height: size * 0.65 }}
    >
      <svg
        width={size}
        height={size * 0.65}
        viewBox={`0 0 ${size} ${size * 0.65}`}
        role="img"
        aria-label={`Gauge showing ${formattedValue}${label ? ` - ${label}` : ""}`}
      >
        {/* Background track */}
        <path
          d={trackPath}
          fill="none"
          stroke={GAUGE_COLORS.track}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Value arc */}
        {displayValue > 0 && (
          <path
            d={valuePath}
            fill="none"
            stroke={color}
            strokeWidth={valueStrokeWidth}
            strokeLinecap="round"
          />
        )}

        {/* Value text */}
        {showValue && (
          <text
            x={cx}
            y={size * 0.55}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={CHART_COLORS.text}
            fontSize={size * 0.2}
            fontFamily="Geist Mono, monospace"
            fontWeight="600"
          >
            {formattedValue}
          </text>
        )}

        {/* Label text */}
        {label && (
          <text
            x={cx}
            y={size * 0.62}
            textAnchor="middle"
            dominantBaseline="hanging"
            fill={CHART_COLORS.text}
            fontSize={size * 0.1}
            fontFamily="Geist Mono, monospace"
          >
            {label}
          </text>
        )}
      </svg>
    </div>
  );
}

/**
 * Memoized Gauge component.
 */
export const Gauge = memo(GaugeComponent);

export default Gauge;

// ============================================
// Utility Exports
// ============================================

export {
  describeArc,
  valueToAngle,
  polarToCartesian,
  degreesToRadians,
};
