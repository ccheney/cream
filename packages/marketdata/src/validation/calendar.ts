/**
 * Trading Calendar
 *
 * Calendar-aware validation for US equity markets.
 * Handles weekends, holidays, and market hours.
 *
 * @see docs/plans/02-data-layer.md
 */

// ============================================
// Types
// ============================================

export interface MarketHours {
  open: { hour: number; minute: number };
  close: { hour: number; minute: number };
  timezone: string;
}

export interface MarketCalendarConfig {
  /** Regular market hours */
  regularHours: MarketHours;
  /** Extended/pre-market hours (optional) */
  extendedHours?: MarketHours;
  /** US market holidays (month-day or full date) */
  holidays: Set<string>;
  /** Early close dates (month-day or full date) */
  earlyCloses: Set<string>;
}

// ============================================
// US Market Constants
// ============================================

/**
 * US equity market regular hours (EST/EDT).
 */
export const US_MARKET_HOURS: MarketHours = {
  open: { hour: 9, minute: 30 },
  close: { hour: 16, minute: 0 },
  timezone: "America/New_York",
};

/**
 * US equity extended hours.
 */
export const US_EXTENDED_HOURS: MarketHours = {
  open: { hour: 4, minute: 0 },
  close: { hour: 20, minute: 0 },
  timezone: "America/New_York",
};

/**
 * US market holidays for 2024-2026.
 *
 * Format: YYYY-MM-DD
 */
export const US_MARKET_HOLIDAYS_2024_2026 = new Set([
  // 2024
  "2024-01-01", // New Year's Day
  "2024-01-15", // MLK Day
  "2024-02-19", // Presidents' Day
  "2024-03-29", // Good Friday
  "2024-05-27", // Memorial Day
  "2024-06-19", // Juneteenth
  "2024-07-04", // Independence Day
  "2024-09-02", // Labor Day
  "2024-11-28", // Thanksgiving
  "2024-12-25", // Christmas

  // 2025
  "2025-01-01", // New Year's Day
  "2025-01-20", // MLK Day
  "2025-02-17", // Presidents' Day
  "2025-04-18", // Good Friday
  "2025-05-26", // Memorial Day
  "2025-06-19", // Juneteenth
  "2025-07-04", // Independence Day
  "2025-09-01", // Labor Day
  "2025-11-27", // Thanksgiving
  "2025-12-25", // Christmas

  // 2026
  "2026-01-01", // New Year's Day
  "2026-01-19", // MLK Day
  "2026-02-16", // Presidents' Day
  "2026-04-03", // Good Friday
  "2026-05-25", // Memorial Day
  "2026-06-19", // Juneteenth
  "2026-07-03", // Independence Day (observed)
  "2026-09-07", // Labor Day
  "2026-11-26", // Thanksgiving
  "2026-12-25", // Christmas
]);

/**
 * US market early close dates (1pm ET close).
 */
export const US_EARLY_CLOSES_2024_2026 = new Set([
  // 2024
  "2024-07-03", // Day before Independence Day
  "2024-11-29", // Day after Thanksgiving
  "2024-12-24", // Christmas Eve

  // 2025
  "2025-07-03", // Day before Independence Day
  "2025-11-28", // Day after Thanksgiving
  "2025-12-24", // Christmas Eve

  // 2026
  "2026-11-27", // Day after Thanksgiving
  "2026-12-24", // Christmas Eve
]);

/**
 * Default US market calendar configuration.
 */
export const DEFAULT_US_CALENDAR: MarketCalendarConfig = {
  regularHours: US_MARKET_HOURS,
  extendedHours: US_EXTENDED_HOURS,
  holidays: US_MARKET_HOLIDAYS_2024_2026,
  earlyCloses: US_EARLY_CLOSES_2024_2026,
};

// ============================================
// Calendar Functions
// ============================================

/**
 * Check if a date is a weekend (Saturday or Sunday).
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6; // Sunday = 0, Saturday = 6
}

/**
 * Check if a date is a US market holiday.
 */
export function isHoliday(date: Date, holidays = US_MARKET_HOLIDAYS_2024_2026): boolean {
  const dateStr = date.toISOString().split("T")[0]!;
  return holidays.has(dateStr);
}

/**
 * Check if a date is an early close day.
 */
export function isEarlyClose(date: Date, earlyCloses = US_EARLY_CLOSES_2024_2026): boolean {
  const dateStr = date.toISOString().split("T")[0]!;
  return earlyCloses.has(dateStr);
}

/**
 * Check if a date is a trading day (not weekend or holiday).
 */
export function isTradingDay(date: Date, config = DEFAULT_US_CALENDAR): boolean {
  return !isWeekend(date) && !isHoliday(date, config.holidays);
}

/**
 * Check if market is open at a given timestamp.
 *
 * @param timestamp - ISO timestamp or Date
 * @param config - Calendar configuration
 * @param includeExtended - Include extended hours
 * @returns true if market is open
 */
export function isMarketOpen(
  timestamp: string | Date,
  config = DEFAULT_US_CALENDAR,
  includeExtended = false
): boolean {
  const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;

  // Check if trading day
  if (!isTradingDay(date, config)) {
    return false;
  }

  // Get hours in ET
  const etTime = new Date(date.toLocaleString("en-US", { timeZone: config.regularHours.timezone }));
  const hour = etTime.getHours();
  const minute = etTime.getMinutes();
  const totalMinutes = hour * 60 + minute;

  // Get applicable hours
  const hours = includeExtended && config.extendedHours ? config.extendedHours : config.regularHours;

  const openMinutes = hours.open.hour * 60 + hours.open.minute;
  let closeMinutes = hours.close.hour * 60 + hours.close.minute;

  // Handle early close
  if (isEarlyClose(date, config.earlyCloses)) {
    closeMinutes = 13 * 60; // 1pm ET
  }

  return totalMinutes >= openMinutes && totalMinutes < closeMinutes;
}

/**
 * Get the next trading day after a given date.
 *
 * @param date - Starting date
 * @param config - Calendar configuration
 * @returns Next trading day
 */
export function getNextTradingDay(date: Date, config = DEFAULT_US_CALENDAR): Date {
  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);
  nextDay.setHours(0, 0, 0, 0);

  // Skip weekends and holidays
  while (!isTradingDay(nextDay, config)) {
    nextDay.setDate(nextDay.getDate() + 1);
  }

  return nextDay;
}

/**
 * Get the previous trading day before a given date.
 *
 * @param date - Starting date
 * @param config - Calendar configuration
 * @returns Previous trading day
 */
export function getPreviousTradingDay(date: Date, config = DEFAULT_US_CALENDAR): Date {
  const prevDay = new Date(date);
  prevDay.setDate(prevDay.getDate() - 1);
  prevDay.setHours(0, 0, 0, 0);

  // Skip weekends and holidays
  while (!isTradingDay(prevDay, config)) {
    prevDay.setDate(prevDay.getDate() - 1);
  }

  return prevDay;
}

/**
 * Calculate trading days between two dates (exclusive of start, inclusive of end).
 */
export function getTradingDaysBetween(start: Date, end: Date, config = DEFAULT_US_CALENDAR): number {
  let count = 0;
  const current = new Date(start);
  current.setDate(current.getDate() + 1);

  while (current <= end) {
    if (isTradingDay(current, config)) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}

/**
 * Check if a gap between timestamps is expected (crosses non-trading period).
 *
 * @param timestamp1 - First timestamp (earlier)
 * @param timestamp2 - Second timestamp (later)
 * @param config - Calendar configuration
 * @returns true if gap is expected due to non-trading period
 */
export function isExpectedGap(timestamp1: string, timestamp2: string, config = DEFAULT_US_CALENDAR): boolean {
  const date1 = new Date(timestamp1);
  const date2 = new Date(timestamp2);

  // Check if they're on different trading days
  const day1 = date1.toISOString().split("T")[0]!;
  const day2 = date2.toISOString().split("T")[0]!;

  if (day1 !== day2) {
    // Check if there's at least one non-trading day between them
    const nextTrading = getNextTradingDay(date1, config);
    const nextTradingStr = nextTrading.toISOString().split("T")[0]!;

    // If next trading day is the same as day2, gap is expected (overnight)
    if (nextTradingStr === day2) {
      return true;
    }

    // If there are non-trading days between, gap is expected
    return nextTradingStr !== day2;
  }

  // Same day - check if gap crosses market close
  const etTime1 = new Date(date1.toLocaleString("en-US", { timeZone: config.regularHours.timezone }));
  const etTime2 = new Date(date2.toLocaleString("en-US", { timeZone: config.regularHours.timezone }));

  const closeMinutes = config.regularHours.close.hour * 60 + config.regularHours.close.minute;
  const openMinutes = config.regularHours.open.hour * 60 + config.regularHours.open.minute;

  const minutes1 = etTime1.getHours() * 60 + etTime1.getMinutes();
  const minutes2 = etTime2.getHours() * 60 + etTime2.getMinutes();

  // If first is before close and second is after open next day (or crosses overnight)
  return minutes1 < closeMinutes && minutes2 >= openMinutes && minutes2 < minutes1;
}

export default {
  isWeekend,
  isHoliday,
  isEarlyClose,
  isTradingDay,
  isMarketOpen,
  getNextTradingDay,
  getPreviousTradingDay,
  getTradingDaysBetween,
  isExpectedGap,
  DEFAULT_US_CALENDAR,
  US_MARKET_HOURS,
  US_EXTENDED_HOURS,
  US_MARKET_HOLIDAYS_2024_2026,
  US_EARLY_CLOSES_2024_2026,
};
