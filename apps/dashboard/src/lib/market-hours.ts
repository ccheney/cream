/**
 * Market Hours Utilities
 *
 * Client-side utilities for checking if US options market is open.
 * Options trade during regular market hours only (9:30 AM - 4:00 PM ET).
 */

// US market holidays for 2024-2026
const US_MARKET_HOLIDAYS = new Set([
  // 2024
  "2024-01-01",
  "2024-01-15",
  "2024-02-19",
  "2024-03-29",
  "2024-05-27",
  "2024-06-19",
  "2024-07-04",
  "2024-09-02",
  "2024-11-28",
  "2024-12-25",
  // 2025
  "2025-01-01",
  "2025-01-20",
  "2025-02-17",
  "2025-04-18",
  "2025-05-26",
  "2025-06-19",
  "2025-07-04",
  "2025-09-01",
  "2025-11-27",
  "2025-12-25",
  // 2026
  "2026-01-01",
  "2026-01-19",
  "2026-02-16",
  "2026-04-03",
  "2026-05-25",
  "2026-06-19",
  "2026-07-03",
  "2026-09-07",
  "2026-11-26",
  "2026-12-25",
]);

// Early close dates (1pm ET close)
const US_EARLY_CLOSES = new Set([
  "2024-07-03",
  "2024-11-29",
  "2024-12-24",
  "2025-07-03",
  "2025-11-28",
  "2025-12-24",
  "2026-11-27",
  "2026-12-24",
]);

/**
 * Check if options market is currently open.
 * Options trade during regular hours only: 9:30 AM - 4:00 PM ET.
 */
export function isOptionsMarketOpen(date: Date = new Date()): boolean {
  // Get time in ET
  const etFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = etFormatter.formatToParts(date);
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const hour = Number.parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute = Number.parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  // Check weekend (Saturday/Sunday)
  if (weekday === "Sat" || weekday === "Sun") {
    return false;
  }

  // Check holiday
  const dateStr = `${year}-${month}-${day}`;
  if (US_MARKET_HOLIDAYS.has(dateStr)) {
    return false;
  }

  // Calculate minutes since midnight
  const totalMinutes = hour * 60 + minute;

  // Regular hours: 9:30 AM (570 min) - 4:00 PM (960 min)
  const openMinutes = 9 * 60 + 30; // 570
  let closeMinutes = 16 * 60; // 960

  // Early close: 1:00 PM (780 min)
  if (US_EARLY_CLOSES.has(dateStr)) {
    closeMinutes = 13 * 60; // 780
  }

  return totalMinutes >= openMinutes && totalMinutes < closeMinutes;
}

/**
 * Get market status message.
 */
export function getMarketStatus(date: Date = new Date()): {
  isOpen: boolean;
  message: string;
} {
  const isOpen = isOptionsMarketOpen(date);

  if (isOpen) {
    return { isOpen: true, message: "Market Open" };
  }

  // Get time in ET for more specific message
  const etFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "numeric",
    hour12: true,
    weekday: "short",
  });

  const parts = etFormatter.formatToParts(date);
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const hour = Number.parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const dayPeriod = parts.find((p) => p.type === "dayPeriod")?.value;

  if (weekday === "Sat" || weekday === "Sun") {
    return { isOpen: false, message: "Weekend" };
  }

  if (dayPeriod === "AM" && hour < 9) {
    return { isOpen: false, message: "Pre-Market" };
  }

  if (dayPeriod === "PM" && hour >= 4) {
    return { isOpen: false, message: "After Hours" };
  }

  return { isOpen: false, message: "Market Closed" };
}
