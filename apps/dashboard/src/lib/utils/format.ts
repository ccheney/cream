/**
 * @see docs/plans/ui/22-typography.md number formatting
 */

/**
 * Format a number as currency (USD).
 *
 * @example
 * formatCurrency(1234.56)     // "$1,234.56"
 * formatCurrency(1234)        // "$1,234"
 * formatCurrency(1234.5, 0)   // "$1,235"
 * formatCurrency(-500)        // "-$500"
 */
export function formatCurrency(value: number, decimals?: number): string {
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals ?? (Number.isInteger(value) ? 0 : 2),
    maximumFractionDigits: decimals ?? 2,
  });
  return formatter.format(value);
}

/**
 * Format currency with explicit sign (+ or -).
 *
 * @example
 * formatCurrencyWithSign(500)   // "+$500"
 * formatCurrencyWithSign(-500)  // "-$500"
 * formatCurrencyWithSign(0)     // "$0"
 */
export function formatCurrencyWithSign(value: number, decimals?: number): string {
  if (value === 0) {
    return formatCurrency(0, decimals);
  }
  const prefix = value > 0 ? "+" : "";
  return prefix + formatCurrency(value, decimals);
}

/**
 * Format a number as a percentage.
 *
 * @example
 * formatPercent(12.345)           // "12.35%"
 * formatPercent(12.345, 1)        // "12.3%"
 * formatPercent(12.345, 2, true)  // "+12.35%"
 * formatPercent(-5.5, 2, true)    // "-5.50%"
 */
export function formatPercent(value: number, decimals = 2, showSign = false): string {
  const formatted = value.toFixed(decimals);
  const prefix = showSign && value > 0 ? "+" : "";
  return `${prefix}${formatted}%`;
}

/**
 * Format a decimal as a percentage.
 * Converts 0.1234 to "12.34%".
 *
 * @example
 * formatDecimalAsPercent(0.1234)        // "12.34%"
 * formatDecimalAsPercent(0.1234, true)  // "+12.34%"
 * formatDecimalAsPercent(-0.05, true)   // "-5.00%"
 */
export function formatDecimalAsPercent(value: number, showSign = false, decimals = 2): string {
  return formatPercent(value * 100, decimals, showSign);
}

/**
 * Format a large number with suffix (K, M, B, T).
 *
 * @example
 * formatLargeNumber(1234)       // "1.23K"
 * formatLargeNumber(1234567)    // "1.23M"
 * formatLargeNumber(1234567890) // "1.23B"
 * formatLargeNumber(500)        // "500"
 */
export function formatLargeNumber(value: number, decimals = 2): string {
  const absValue = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (absValue >= 1e12) {
    return `${sign}${(absValue / 1e12).toFixed(decimals)}T`;
  }
  if (absValue >= 1e9) {
    return `${sign}${(absValue / 1e9).toFixed(decimals)}B`;
  }
  if (absValue >= 1e6) {
    return `${sign}${(absValue / 1e6).toFixed(decimals)}M`;
  }
  if (absValue >= 1e3) {
    return `${sign}${(absValue / 1e3).toFixed(decimals)}K`;
  }
  return value.toString();
}

/**
 * Format a quantity with thousand separators.
 *
 * @example
 * formatQuantity(1000)   // "1,000"
 * formatQuantity(12345)  // "12,345"
 */
export function formatQuantity(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

/**
 * Format a Greek value (delta, gamma, theta, vega).
 * Shows 4 decimal places by default.
 *
 * @example
 * formatGreek(0.45678)   // "0.4568"
 * formatGreek(-0.1234)   // "-0.1234"
 * formatGreek(12.3, 2)   // "12.30"
 */
export function formatGreek(value: number, decimals = 4): string {
  return value.toFixed(decimals);
}

/**
 * Format a price (2 decimal places).
 *
 * @example
 * formatPrice(123.456)  // "123.46"
 * formatPrice(100)      // "100.00"
 */
export function formatPrice(value: number): string {
  return value.toFixed(2);
}

/**
 * Format a date as relative time.
 *
 * @example
 * formatRelativeTime(new Date(Date.now() - 30000))  // "30s ago"
 * formatRelativeTime(new Date(Date.now() - 120000)) // "2m ago"
 * formatRelativeTime(new Date(Date.now() - 3600000)) // "1h ago"
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) {
    return `${diffSec}s ago`;
  }
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }
  if (diffHour < 24) {
    return `${diffHour}h ago`;
  }
  if (diffDay < 7) {
    return `${diffDay}d ago`;
  }

  // Fall back to date format
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Format a timestamp (HH:MM:SS).
 *
 * @example
 * formatTimestamp(new Date())  // "14:32:45"
 */
export function formatTimestamp(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Format a date (MMM DD, YYYY).
 *
 * @example
 * formatDate(new Date())  // "Jan 6, 2026"
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format a date and time.
 *
 * @example
 * formatDateTime(new Date())  // "Jan 6, 2026 14:32"
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// ============================================
// Exports
// ============================================

export default {
  formatCurrency,
  formatCurrencyWithSign,
  formatPercent,
  formatDecimalAsPercent,
  formatLargeNumber,
  formatQuantity,
  formatGreek,
  formatPrice,
  formatRelativeTime,
  formatTimestamp,
  formatDate,
  formatDateTime,
};
