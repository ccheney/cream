/**
 * Color Scale Utilities
 *
 * Diverging and sequential color scales for data visualization.
 *
 * @see docs/plans/ui/26-data-viz.md lines 139-149
 */

// ============================================
// Types
// ============================================

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface ColorStop {
  value: number;
  color: RGB;
}

// ============================================
// Color Constants
// ============================================

/**
 * Correlation color scale.
 */
export const CORRELATION_COLORS = {
  /** Negative correlation (-1.0) */
  negative: "#EF4444",
  /** Neutral correlation (0.0) */
  neutral: "#FBF8F3",
  /** Positive correlation (+1.0) */
  positive: "#22C55E",
} as const;

// ============================================
// Color Parsing
// ============================================

/**
 * Parse hex color to RGB.
 */
export function hexToRgb(hex: string): RGB {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

/**
 * Convert RGB to hex.
 */
export function rgbToHex(rgb: RGB): string {
  const toHex = (n: number) =>
    Math.round(Math.max(0, Math.min(255, n)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`.toUpperCase();
}

/**
 * Convert RGB to CSS rgba string.
 */
export function rgbToCss(rgb: RGB, alpha: number = 1): string {
  return `rgba(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)}, ${alpha})`;
}

// ============================================
// Color Interpolation
// ============================================

/**
 * Linearly interpolate between two RGB colors.
 */
export function lerpColor(a: RGB, b: RGB, t: number): RGB {
  const clampedT = Math.max(0, Math.min(1, t));
  return {
    r: a.r + (b.r - a.r) * clampedT,
    g: a.g + (b.g - a.g) * clampedT,
    b: a.b + (b.b - a.b) * clampedT,
  };
}

/**
 * Create a diverging color scale function.
 * Maps values from [minValue, maxValue] to colors [negativeColor, neutralColor, positiveColor].
 */
export function createDivergingScale(
  negativeColor: string,
  neutralColor: string,
  positiveColor: string,
  minValue: number = -1,
  maxValue: number = 1
): (value: number) => string {
  const negativeRgb = hexToRgb(negativeColor);
  const neutralRgb = hexToRgb(neutralColor);
  const positiveRgb = hexToRgb(positiveColor);

  return (value: number): string => {
    // Clamp value to range
    const clampedValue = Math.max(minValue, Math.min(maxValue, value));

    // Normalize to [-1, 1]
    const midpoint = (minValue + maxValue) / 2;
    const range = maxValue - minValue;

    if (clampedValue < midpoint) {
      // Interpolate from negative to neutral
      const t = (clampedValue - minValue) / (midpoint - minValue);
      return rgbToHex(lerpColor(negativeRgb, neutralRgb, t));
    } else {
      // Interpolate from neutral to positive
      const t = (clampedValue - midpoint) / (maxValue - midpoint);
      return rgbToHex(lerpColor(neutralRgb, positiveRgb, t));
    }
  };
}

/**
 * Pre-configured correlation color scale.
 * Maps correlation values from -1 to +1.
 */
export const correlationScale = createDivergingScale(
  CORRELATION_COLORS.negative,
  CORRELATION_COLORS.neutral,
  CORRELATION_COLORS.positive,
  -1,
  1
);

/**
 * Get correlation color with optional caching.
 */
const colorCache = new Map<number, string>();

export function getCorrelationColor(value: number): string {
  // Round to 2 decimal places for caching
  const rounded = Math.round(value * 100) / 100;

  if (colorCache.has(rounded)) {
    return colorCache.get(rounded)!;
  }

  const color = correlationScale(rounded);
  colorCache.set(rounded, color);
  return color;
}

/**
 * Clear the color cache.
 */
export function clearColorCache(): void {
  colorCache.clear();
}

// ============================================
// Sequential Scales
// ============================================

/**
 * Create a sequential color scale (single hue).
 * Maps values from [minValue, maxValue] to colors [startColor, endColor].
 */
export function createSequentialScale(
  startColor: string,
  endColor: string,
  minValue: number = 0,
  maxValue: number = 1
): (value: number) => string {
  const startRgb = hexToRgb(startColor);
  const endRgb = hexToRgb(endColor);

  return (value: number): string => {
    const t = (value - minValue) / (maxValue - minValue);
    const clampedT = Math.max(0, Math.min(1, t));
    return rgbToHex(lerpColor(startRgb, endRgb, clampedT));
  };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Check if correlation is high (> threshold).
 */
export function isHighCorrelation(
  value: number,
  threshold: number = 0.7
): boolean {
  return Math.abs(value) > threshold;
}

/**
 * Format correlation value for display.
 */
export function formatCorrelation(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}
