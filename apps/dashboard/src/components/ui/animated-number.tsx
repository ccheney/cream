/**
 * Animated Number Component
 *
 * Displays numbers with smooth transitions using Framer Motion.
 * Used for portfolio values, P&L, and other dynamic numeric displays.
 *
 * @see docs/plans/ui/31-realtime-patterns.md lines 29-44
 */

"use client";

import { AnimatePresence, motion } from "framer-motion";
import { memo, useEffect, useMemo, useRef, useState } from "react";

// ============================================
// Types
// ============================================

export type NumberFormat = "currency" | "percent" | "decimal" | "integer";

export interface AnimatedNumberProps {
  /** The numeric value to display */
  value: number;
  /** Format type for the number */
  format?: NumberFormat;
  /** Number of decimal places (default based on format) */
  decimals?: number;
  /** Prefix string (e.g., "$" for custom currency) */
  prefix?: string;
  /** Suffix string (e.g., "%" for custom percent) */
  suffix?: string;
  /** Enable/disable animation (default: true) */
  animate?: boolean;
  /** Minimum change threshold for animation (default: 0.01 = 1%) */
  animationThreshold?: number;
  /** CSS class name for styling */
  className?: string;
  /** ARIA label for accessibility */
  "aria-label"?: string;
  /** Test ID for testing */
  "data-testid"?: string;
}

// ============================================
// Constants
// ============================================

const ANIMATION_DURATION = 0.2; // 200ms
const DEBOUNCE_INTERVAL = 200; // 200ms max animation frequency
const DEFAULT_THRESHOLD = 0.01; // 1% change threshold

// ============================================
// Formatters
// ============================================

/**
 * Get default decimal places for format type
 */
function getDefaultDecimals(format: NumberFormat): number {
  switch (format) {
    case "currency":
      return 2;
    case "percent":
      return 2;
    case "decimal":
      return 2;
    case "integer":
      return 0;
    default:
      return 2;
  }
}

/**
 * Format number based on format type
 */
function formatNumber(
  value: number,
  format: NumberFormat,
  decimals: number,
  prefix?: string,
  suffix?: string
): string {
  let formatted: string;

  switch (format) {
    case "currency":
      formatted = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(value);
      break;

    case "percent":
      formatted = new Intl.NumberFormat("en-US", {
        style: "percent",
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(value / 100); // Divide by 100 for percent display
      break;

    case "integer":
      formatted = new Intl.NumberFormat("en-US", {
        style: "decimal",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(Math.round(value));
      break;
    default:
      formatted = new Intl.NumberFormat("en-US", {
        style: "decimal",
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(value);
      break;
  }

  // Apply custom prefix/suffix (overrides format defaults)
  if (prefix || suffix) {
    // For currency, remove the default $ if custom prefix provided
    if (format === "currency" && prefix) {
      formatted = formatted.replace("$", "");
    }
    // For percent, remove the default % if custom suffix provided
    if (format === "percent" && suffix) {
      formatted = formatted.replace("%", "");
    }
    formatted = `${prefix ?? ""}${formatted}${suffix ?? ""}`;
  }

  return formatted;
}

/**
 * Check if user prefers reduced motion
 */
function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  return prefersReducedMotion;
}

// ============================================
// Component
// ============================================

/**
 * AnimatedNumber displays a number with smooth slide/fade animations
 * when the value changes significantly.
 *
 * @example
 * ```tsx
 * // Currency display
 * <AnimatedNumber value={1234.56} format="currency" />
 *
 * // Percentage display
 * <AnimatedNumber value={12.5} format="percent" />
 *
 * // Custom formatting
 * <AnimatedNumber value={1000} prefix="+" suffix=" units" />
 * ```
 */
export const AnimatedNumber = memo(function AnimatedNumber({
  value,
  format = "decimal",
  decimals,
  prefix,
  suffix,
  animate = true,
  animationThreshold = DEFAULT_THRESHOLD,
  className = "",
  "aria-label": ariaLabel,
  "data-testid": testId,
}: AnimatedNumberProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const previousValueRef = useRef(value);
  const lastAnimationRef = useRef(0);
  const [displayValue, setDisplayValue] = useState(value);
  const [animationKey, setAnimationKey] = useState(0);

  // Calculate actual decimals
  const actualDecimals = decimals ?? getDefaultDecimals(format);

  // Determine if we should animate this change
  const shouldAnimate = useMemo(() => {
    if (!animate || prefersReducedMotion) {
      return false;
    }

    const previousValue = previousValueRef.current;
    if (previousValue === 0) {
      return value !== 0;
    }

    const percentChange = Math.abs((value - previousValue) / previousValue);
    return percentChange >= animationThreshold;
  }, [value, animate, prefersReducedMotion, animationThreshold]);

  // Update display value with debouncing
  useEffect((): undefined | (() => void) => {
    const now = Date.now();
    const timeSinceLastAnimation = now - lastAnimationRef.current;

    // Debounce: schedule update after remaining debounce time
    if (shouldAnimate && timeSinceLastAnimation < DEBOUNCE_INTERVAL) {
      const remainingTime = DEBOUNCE_INTERVAL - timeSinceLastAnimation;
      const timeoutId = setTimeout(() => {
        lastAnimationRef.current = Date.now();
        setAnimationKey((prev) => prev + 1);
        setDisplayValue(value);
      }, remainingTime);

      previousValueRef.current = value;
      return () => clearTimeout(timeoutId);
    }

    // Trigger animation immediately
    if (shouldAnimate) {
      lastAnimationRef.current = now;
      setAnimationKey((prev) => prev + 1);
    }

    // Update display value
    setDisplayValue(value);
    previousValueRef.current = value;
  }, [value, shouldAnimate]);

  // Format the display value
  const formattedValue = formatNumber(displayValue, format, actualDecimals, prefix, suffix);

  // Animation variants
  const variants = {
    initial: { y: 10, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: -10, opacity: 0 },
  };

  // Disable animation if not needed
  const shouldRenderAnimated = animate && !prefersReducedMotion;

  return (
    <span
      className={`inline-block ${className}`}
      aria-label={ariaLabel}
      aria-live="polite"
      aria-atomic="true"
      data-testid={testId}
      style={{ willChange: shouldRenderAnimated ? "transform, opacity" : "auto" }}
    >
      {shouldRenderAnimated ? (
        <AnimatePresence mode="wait">
          <motion.span
            key={animationKey}
            variants={variants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: ANIMATION_DURATION, ease: "easeOut" }}
            className="inline-block"
          >
            {formattedValue}
          </motion.span>
        </AnimatePresence>
      ) : (
        <span>{formattedValue}</span>
      )}
    </span>
  );
});

// ============================================
// Exports
// ============================================

export default AnimatedNumber;
