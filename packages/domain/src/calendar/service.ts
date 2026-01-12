/**
 * HardcodedCalendarService
 *
 * CalendarService implementation for BACKTEST mode.
 * Uses static hardcoded data - no API calls, fully synchronous internally.
 *
 * This service is ONLY for BACKTEST mode. PAPER and LIVE modes should use
 * AlpacaCalendarService which calls the live Alpaca Calendar API.
 *
 * @see docs/plans/02-data-layer.md - Session and Calendar Handling
 */

import {
  EARLY_CLOSE,
  generateCalendarRange,
  getNextTradingDay as getNextTradingDayStr,
  getPreviousTradingDay as getPreviousTradingDayStr,
  isEarlyClose,
  isTradingDay as isTradingDayStr,
  REGULAR_CLOSE,
  REGULAR_OPEN,
} from "./hardcoded";
import type { CalendarDay, CalendarService, MarketClock, TradingSession } from "./types";

// ============================================
// Constants
// ============================================

/** Pre-market start in minutes from midnight ET */
const PRE_MARKET_START_MINUTES = 4 * 60; // 04:00

/** RTH start in minutes from midnight ET */
const RTH_START_MINUTES = 9 * 60 + 30; // 09:30

/** Regular close in minutes from midnight ET */
const REGULAR_CLOSE_MINUTES = 16 * 60; // 16:00

/** Early close in minutes from midnight ET */
const EARLY_CLOSE_MINUTES = 13 * 60; // 13:00

/** After-hours end in minutes from midnight ET */
const AFTER_HOURS_END_MINUTES = 20 * 60; // 20:00

// ============================================
// Utilities
// ============================================

/**
 * Format a Date to YYYY-MM-DD string.
 */
function formatDateStr(date: Date | string): string {
  if (typeof date === "string") {
    // If already a date string, extract just the date part
    return date.slice(0, 10);
  }
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Get time in ET (Eastern Time) as minutes from midnight.
 * Approximates ET as UTC-5 (ignores DST for simplicity in backtest).
 */
function getETMinutes(date: Date): number {
  const hours = date.getUTCHours() - 5;
  const minutes = date.getUTCMinutes();
  const totalMinutes = hours * 60 + minutes;
  // Handle negative hours (next day UTC)
  return totalMinutes < 0 ? totalMinutes + 24 * 60 : totalMinutes;
}

/**
 * Parse date input to Date object.
 */
function toDate(date: Date | string): Date {
  if (typeof date === "string") {
    // Handle date-only strings by adding noon UTC to avoid timezone issues
    if (date.length === 10) {
      return new Date(`${date}T12:00:00Z`);
    }
    return new Date(date);
  }
  return date;
}

// ============================================
// HardcodedCalendarService
// ============================================

/**
 * CalendarService implementation using hardcoded NYSE calendar data.
 *
 * Features:
 * - All methods are synchronous internally (wrapped in Promise.resolve)
 * - Uses hardcoded holiday/early close data from 2024-2029
 * - getClock() always returns { isOpen: true } for BACKTEST mode
 * - No network calls
 *
 * @example
 * ```typescript
 * const calendar = new HardcodedCalendarService();
 *
 * // Async API (recommended)
 * const isOpen = await calendar.isTradingDay("2026-01-15");
 *
 * // Sync API (for backward compatibility)
 * const session = calendar.getTradingSessionSync(new Date());
 * ```
 */
export class HardcodedCalendarService implements CalendarService {
  // ----------------------------------------
  // Async Methods (Primary API)
  // ----------------------------------------

  /**
   * Check if the market is currently open.
   * In BACKTEST mode, this always returns true during valid trading sessions.
   */
  async isMarketOpen(): Promise<boolean> {
    // In BACKTEST, we consider market always "open" for trading purposes
    // The actual session logic handles RTH vs extended hours
    return true;
  }

  /**
   * Check if a specific date is a trading day.
   */
  async isTradingDay(date: Date | string): Promise<boolean> {
    return this.isTradingDaySync(date);
  }

  /**
   * Get the market close time for a specific date.
   */
  async getMarketCloseTime(date: Date | string): Promise<string | null> {
    return this.getMarketCloseTimeSync(date);
  }

  /**
   * Get the current trading session for a datetime.
   */
  async getTradingSession(datetime: Date | string): Promise<TradingSession> {
    return this.getTradingSessionSync(datetime);
  }

  /**
   * Check if currently within Regular Trading Hours (RTH).
   */
  async isRTH(datetime?: Date | string): Promise<boolean> {
    const dt = datetime ?? new Date();
    return this.getTradingSessionSync(dt) === "RTH";
  }

  /**
   * Get the next trading day after a date.
   */
  async getNextTradingDay(date: Date | string): Promise<Date> {
    const dateStr = formatDateStr(date);
    const nextStr = getNextTradingDayStr(dateStr);
    return new Date(`${nextStr}T12:00:00Z`);
  }

  /**
   * Get the previous trading day before a date.
   */
  async getPreviousTradingDay(date: Date | string): Promise<Date> {
    const dateStr = formatDateStr(date);
    const prevStr = getPreviousTradingDayStr(dateStr);
    return new Date(`${prevStr}T12:00:00Z`);
  }

  /**
   * Get the current market clock status.
   *
   * In BACKTEST mode, always returns isOpen: true with mock timestamps.
   * This allows backtests to execute trades at any point in the simulation.
   */
  async getClock(): Promise<MarketClock> {
    const now = new Date();
    const dateStr = formatDateStr(now);

    // In BACKTEST, market is always "open"
    // We still provide realistic next open/close times
    const nextTradingDay = isTradingDayStr(dateStr) ? dateStr : getNextTradingDayStr(dateStr);

    const closeTime = this.getMarketCloseTimeSync(nextTradingDay) ?? REGULAR_CLOSE;

    return {
      isOpen: true,
      timestamp: now,
      nextOpen: new Date(`${nextTradingDay}T${REGULAR_OPEN}:00.000-05:00`),
      nextClose: new Date(`${nextTradingDay}T${closeTime}:00.000-05:00`),
    };
  }

  /**
   * Get calendar data for a date range.
   */
  async getCalendarRange(start: Date | string, end: Date | string): Promise<CalendarDay[]> {
    const startStr = formatDateStr(start);
    const endStr = formatDateStr(end);
    return generateCalendarRange(startStr, endStr);
  }

  // ----------------------------------------
  // Sync Methods (Backward Compatibility)
  // ----------------------------------------

  /**
   * Synchronous check if a date is a trading day.
   */
  isTradingDaySync(date: Date | string): boolean {
    const dateStr = formatDateStr(date);
    return isTradingDayStr(dateStr);
  }

  /**
   * Synchronous get trading session.
   */
  getTradingSessionSync(datetime: Date | string): TradingSession {
    const dateObj = toDate(datetime);
    const dateStr = formatDateStr(dateObj);

    // Check if market is open on this date
    if (!isTradingDayStr(dateStr)) {
      return "CLOSED";
    }

    // Get time in ET
    const etMinutes = getETMinutes(dateObj);

    // Get close time for this date
    const closeMinutes = isEarlyClose(dateStr) ? EARLY_CLOSE_MINUTES : REGULAR_CLOSE_MINUTES;

    // Determine session based on time
    if (etMinutes < PRE_MARKET_START_MINUTES || etMinutes >= AFTER_HOURS_END_MINUTES) {
      return "CLOSED";
    }

    if (etMinutes < RTH_START_MINUTES) {
      return "PRE_MARKET";
    }

    if (etMinutes < closeMinutes) {
      return "RTH";
    }

    // After close time
    if (isEarlyClose(dateStr)) {
      // Early close day - no after hours
      return "CLOSED";
    }

    return "AFTER_HOURS";
  }

  /**
   * Synchronous get market close time.
   */
  getMarketCloseTimeSync(date: Date | string): string | null {
    const dateStr = formatDateStr(date);

    if (!isTradingDayStr(dateStr)) {
      return null;
    }

    return isEarlyClose(dateStr) ? EARLY_CLOSE : REGULAR_CLOSE;
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a new HardcodedCalendarService instance.
 *
 * @returns CalendarService for BACKTEST mode
 */
export function createHardcodedCalendarService(): CalendarService {
  return new HardcodedCalendarService();
}
