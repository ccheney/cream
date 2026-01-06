/**
 * Market Calendar and Session Handling
 *
 * NYSE holiday schedule, trading sessions, and option expiration dates.
 * Includes session validation for DecisionPlan actions.
 *
 * @see docs/plans/02-data-layer.md - Session and Calendar Handling
 * @see docs/plans/07-execution.md - Trading Calendar Feasibility
 */

import { z } from "zod";

// ============================================
// Types
// ============================================

/**
 * Trading session type
 */
export const TradingSession = z.enum(["PRE_MARKET", "RTH", "AFTER_HOURS", "CLOSED"]);
export type TradingSession = z.infer<typeof TradingSession>;

/**
 * Holiday type
 */
export const HolidayType = z.enum(["FULL_CLOSE", "EARLY_CLOSE"]);
export type HolidayType = z.infer<typeof HolidayType>;

/**
 * Holiday definition
 */
export interface Holiday {
  /** Date in YYYY-MM-DD format */
  date: string;
  /** Holiday name */
  name: string;
  /** Type of closure */
  type: HolidayType;
  /** Close time in HH:MM ET (for early close only) */
  closeTime?: string;
}

/**
 * Session hours definition
 */
export interface SessionHours {
  /** Start time in HH:MM ET */
  start: string;
  /** End time in HH:MM ET */
  end: string;
}

/**
 * Option expiration type
 */
export const ExpirationCycle = z.enum(["MONTHLY", "WEEKLY", "DAILY"]);
export type ExpirationCycle = z.infer<typeof ExpirationCycle>;

/**
 * Instrument type for session validation
 * Note: This mirrors the InstrumentType from decision.ts but is duplicated
 * here to avoid circular dependencies.
 */
export const InstrumentTypeForSession = z.enum(["EQUITY", "OPTION"]);
export type InstrumentTypeForSession = z.infer<typeof InstrumentTypeForSession>;

/**
 * Action type for session validation
 * Note: This mirrors the Action enum from decision.ts but is duplicated
 * here to avoid circular dependencies.
 */
export const ActionForSession = z.enum(["BUY", "SELL", "HOLD", "INCREASE", "REDUCE", "CLOSE"]);
export type ActionForSession = z.infer<typeof ActionForSession>;

/**
 * Configuration for session validation
 */
export interface SessionValidationConfig {
  /** Override to always consider market open (for testing/backtesting) */
  alwaysOpen?: boolean;
  /** Allow equity extended hours trading */
  allowExtendedHours?: boolean;
}

/**
 * Result of session validation
 */
export interface SessionValidationResult {
  /** Whether the action is allowed */
  valid: boolean;
  /** Current trading session */
  session: TradingSession;
  /** Reason for rejection (if invalid) */
  reason?: string;
  /** Suggestion for re-planning (if invalid) */
  suggestion?: string;
}

// ============================================
// NYSE 2026 Holidays
// ============================================

/**
 * 2026 NYSE Holiday Calendar
 *
 * Source: NYSE official schedule
 * Note: Good Friday moves option expiration to Thursday
 */
export const NYSE_HOLIDAYS_2026: Holiday[] = [
  { date: "2026-01-01", name: "New Year's Day", type: "FULL_CLOSE" },
  { date: "2026-01-19", name: "Martin Luther King Jr. Day", type: "FULL_CLOSE" },
  { date: "2026-02-16", name: "Presidents' Day", type: "FULL_CLOSE" },
  { date: "2026-04-03", name: "Good Friday", type: "FULL_CLOSE" },
  { date: "2026-05-25", name: "Memorial Day", type: "FULL_CLOSE" },
  { date: "2026-06-19", name: "Juneteenth", type: "FULL_CLOSE" },
  { date: "2026-07-03", name: "Independence Day (observed)", type: "FULL_CLOSE" },
  { date: "2026-09-07", name: "Labor Day", type: "FULL_CLOSE" },
  { date: "2026-11-26", name: "Thanksgiving Day", type: "FULL_CLOSE" },
  { date: "2026-11-27", name: "Day After Thanksgiving", type: "EARLY_CLOSE", closeTime: "13:00" },
  { date: "2026-12-24", name: "Christmas Eve", type: "EARLY_CLOSE", closeTime: "13:00" },
  { date: "2026-12-25", name: "Christmas Day", type: "FULL_CLOSE" },
];

// Create lookup map for fast access
const holidayMap = new Map<string, Holiday>(NYSE_HOLIDAYS_2026.map((h) => [h.date, h]));

// ============================================
// Session Definitions
// ============================================

/**
 * NYSE Trading Session Hours (Eastern Time)
 */
export const NYSE_SESSIONS: Record<Exclude<TradingSession, "CLOSED">, SessionHours> = {
  PRE_MARKET: { start: "04:00", end: "09:30" },
  RTH: { start: "09:30", end: "16:00" },
  AFTER_HOURS: { start: "16:00", end: "20:00" },
};

/**
 * Default market close time (4:00 PM ET)
 */
export const DEFAULT_CLOSE_TIME = "16:00";

/**
 * Early close time (1:00 PM ET)
 */
export const EARLY_CLOSE_TIME = "13:00";

// ============================================
// Calendar Functions
// ============================================

/**
 * Check if a date is a market holiday
 *
 * @param date - Date to check (ISO string or Date object)
 * @returns Holiday object if holiday, null otherwise
 */
export function getHoliday(date: Date | string): Holiday | null {
  const dateStr = typeof date === "string" ? date.slice(0, 10) : formatDateOnly(date);
  return holidayMap.get(dateStr) ?? null;
}

/**
 * Check if the market is open on a given date
 *
 * @param date - Date to check
 * @returns true if market is open (or partially open), false for full closures
 */
export function isMarketOpen(date: Date | string): boolean {
  const dateObj = typeof date === "string" ? new Date(date) : date;

  // Check weekend (Saturday = 6, Sunday = 0)
  const dayOfWeek = dateObj.getUTCDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }

  // Check holidays
  const holiday = getHoliday(date);
  if (holiday?.type === "FULL_CLOSE") {
    return false;
  }

  return true;
}

/**
 * Get the market close time for a given date
 *
 * @param date - Date to check
 * @returns Close time in HH:MM ET, or null if market is closed all day
 */
export function getMarketCloseTime(date: Date | string): string | null {
  if (!isMarketOpen(date)) {
    return null;
  }

  const holiday = getHoliday(date);
  if (holiday?.type === "EARLY_CLOSE") {
    return holiday.closeTime ?? EARLY_CLOSE_TIME;
  }

  return DEFAULT_CLOSE_TIME;
}

/**
 * Get the current trading session for a given datetime
 *
 * @param datetime - DateTime to check (must include time)
 * @returns Current trading session
 */
export function getTradingSession(datetime: Date | string): TradingSession {
  const dateObj = typeof datetime === "string" ? new Date(datetime) : datetime;
  const dateStr = formatDateOnly(dateObj);

  // Check if market is open on this date
  if (!isMarketOpen(dateStr)) {
    return "CLOSED";
  }

  // Get time in ET (approximate using UTC-5)
  const hours = dateObj.getUTCHours() - 5;
  const minutes = dateObj.getUTCMinutes();
  const timeMinutes = hours * 60 + minutes;

  // Handle negative hours (next day UTC)
  const adjustedTimeMinutes = timeMinutes < 0 ? timeMinutes + 24 * 60 : timeMinutes;

  // Check early close
  const closeTime = getMarketCloseTime(dateStr);
  const closeMinutes = closeTime
    ? parseTimeToMinutes(closeTime)
    : parseTimeToMinutes(DEFAULT_CLOSE_TIME);

  // Determine session based on time
  const preMarketStart = parseTimeToMinutes(NYSE_SESSIONS.PRE_MARKET.start);
  const rthStart = parseTimeToMinutes(NYSE_SESSIONS.RTH.start);
  const afterHoursEnd = parseTimeToMinutes(NYSE_SESSIONS.AFTER_HOURS.end);

  if (adjustedTimeMinutes < preMarketStart || adjustedTimeMinutes >= afterHoursEnd) {
    return "CLOSED";
  }

  if (adjustedTimeMinutes < rthStart) {
    return "PRE_MARKET";
  }

  if (adjustedTimeMinutes < closeMinutes) {
    return "RTH";
  }

  if (closeMinutes < parseTimeToMinutes(DEFAULT_CLOSE_TIME)) {
    // Early close day - no after hours
    return "CLOSED";
  }

  return "AFTER_HOURS";
}

/**
 * Check if a date/time is within Regular Trading Hours (RTH)
 *
 * @param datetime - DateTime to check
 * @returns true if within RTH
 */
export function isRTH(datetime: Date | string): boolean {
  return getTradingSession(datetime) === "RTH";
}

// ============================================
// Option Expiration Functions
// ============================================

/**
 * Get the third Friday of a month (standard monthly expiration)
 *
 * @param year - Year
 * @param month - Month (1-12)
 * @returns Date of third Friday
 */
export function getThirdFriday(year: number, month: number): Date {
  // Start from first of month
  const firstDay = new Date(Date.UTC(year, month - 1, 1));

  // Find first Friday
  // dayOfWeek: 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  const dayOfWeek = firstDay.getUTCDay();
  // Days from 1st to first Friday (0 if 1st is Friday)
  const daysToFriday = (5 - dayOfWeek + 7) % 7;
  // Day of month for first Friday
  const firstFridayDay = 1 + daysToFriday;

  // Third Friday is first Friday + 14 days
  const thirdFriday = new Date(Date.UTC(year, month - 1, firstFridayDay + 14));

  return thirdFriday;
}

/**
 * Get the monthly option expiration date, adjusted for holidays
 *
 * If expiration falls on a holiday, moves to Thursday before.
 *
 * @param year - Year
 * @param month - Month (1-12)
 * @returns Adjusted expiration date
 */
export function getMonthlyExpiration(year: number, month: number): Date {
  let expiration = getThirdFriday(year, month);

  // Check if expiration is a holiday (e.g., Good Friday)
  const holiday = getHoliday(expiration);
  if (holiday?.type === "FULL_CLOSE") {
    // Move to Thursday before
    expiration = new Date(expiration.getTime() - 24 * 60 * 60 * 1000);
  }

  return expiration;
}

/**
 * Check if a date is a monthly option expiration
 *
 * @param date - Date to check
 * @returns true if monthly expiration
 */
export function isMonthlyExpiration(date: Date | string): boolean {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const year = dateObj.getUTCFullYear();
  const month = dateObj.getUTCMonth() + 1;

  const expiration = getMonthlyExpiration(year, month);
  return formatDateOnly(dateObj) === formatDateOnly(expiration);
}

/**
 * Check if a date is a weekly option expiration (any Friday, excluding monthly)
 *
 * @param date - Date to check
 * @returns true if weekly expiration
 */
export function isWeeklyExpiration(date: Date | string): boolean {
  const dateObj = typeof date === "string" ? new Date(date) : date;

  // Must be Friday (5 = Friday in UTC)
  if (dateObj.getUTCDay() !== 5) {
    return false;
  }

  // Must not be monthly expiration
  return !isMonthlyExpiration(date);
}

/**
 * Check if a symbol has daily (0DTE) options
 *
 * @param symbol - Ticker symbol
 * @returns true if symbol has daily options
 */
export function hasDailyOptions(symbol: string): boolean {
  // Major indices with daily options
  const dailyOptionSymbols = new Set(["SPY", "QQQ", "IWM", "SPX", "NDX", "RUT", "XSP"]);

  return dailyOptionSymbols.has(symbol.toUpperCase());
}

/**
 * Check if a date is a 0DTE (daily) expiration for a symbol
 *
 * @param symbol - Ticker symbol
 * @param date - Date to check
 * @returns true if 0DTE expiration
 */
export function isDailyExpiration(symbol: string, date: Date | string): boolean {
  if (!hasDailyOptions(symbol)) {
    return false;
  }

  // Must be a trading day
  return isMarketOpen(date);
}

/**
 * Get the expiration cycle for a date and symbol
 *
 * @param symbol - Ticker symbol
 * @param date - Date to check
 * @returns Expiration cycle type, or null if not an expiration
 */
export function getExpirationCycle(symbol: string, date: Date | string): ExpirationCycle | null {
  if (isMonthlyExpiration(date)) {
    return "MONTHLY";
  }

  if (isWeeklyExpiration(date)) {
    return "WEEKLY";
  }

  if (isDailyExpiration(symbol, date)) {
    return "DAILY";
  }

  return null;
}

// ============================================
// Cycle Scheduling
// ============================================

/**
 * Minimum minutes before market close to allow new cycles
 */
export const MIN_MINUTES_BEFORE_CLOSE = 5;

/**
 * Check if a new trading cycle can be started at the given time
 *
 * @param datetime - DateTime to check
 * @returns true if cycle can be started
 */
export function canStartCycle(datetime: Date | string): boolean {
  const dateObj = typeof datetime === "string" ? new Date(datetime) : datetime;
  const dateStr = formatDateOnly(dateObj);

  // Must be market open
  if (!isMarketOpen(dateStr)) {
    return false;
  }

  // Must be RTH
  const session = getTradingSession(datetime);
  if (session !== "RTH") {
    return false;
  }

  // Check time until close
  const closeTime = getMarketCloseTime(dateStr);
  if (!closeTime) {
    return false;
  }

  // Get current time in minutes since midnight ET
  const hours = dateObj.getUTCHours() - 5;
  const minutes = dateObj.getUTCMinutes();
  const currentMinutes = hours * 60 + minutes;

  // Get close time in minutes
  const closeMinutes = parseTimeToMinutes(closeTime);

  // Must be at least MIN_MINUTES_BEFORE_CLOSE before close
  return closeMinutes - currentMinutes >= MIN_MINUTES_BEFORE_CLOSE;
}

/**
 * Get the next valid trading day
 *
 * @param date - Starting date
 * @returns Next trading day
 */
export function getNextTradingDay(date: Date | string): Date {
  const nextDay = typeof date === "string" ? new Date(date) : new Date(date.getTime());

  // Add one day
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);

  // Keep adding days until we find an open market day
  while (!isMarketOpen(nextDay)) {
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  }

  return nextDay;
}

/**
 * Get the previous trading day
 *
 * @param date - Starting date
 * @returns Previous trading day
 */
export function getPreviousTradingDay(date: Date | string): Date {
  const prevDay = typeof date === "string" ? new Date(date) : new Date(date.getTime());

  // Subtract one day
  prevDay.setUTCDate(prevDay.getUTCDate() - 1);

  // Keep subtracting days until we find an open market day
  while (!isMarketOpen(prevDay)) {
    prevDay.setUTCDate(prevDay.getUTCDate() - 1);
  }

  return prevDay;
}

// ============================================
// Utilities
// ============================================

/**
 * Format a Date to YYYY-MM-DD string
 */
function formatDateOnly(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parse HH:MM time string to minutes since midnight
 */
function parseTimeToMinutes(time: string): number {
  const parts = time.split(":").map(Number);
  const hours = parts[0];
  const minutes = parts[1];

  if (hours === undefined || minutes === undefined) {
    throw new Error(`Invalid time format: ${time}`);
  }

  return hours * 60 + minutes;
}

/**
 * Get all 2026 holidays
 *
 * @returns Array of holidays
 */
export function getAllHolidays(): Holiday[] {
  return [...NYSE_HOLIDAYS_2026];
}

/**
 * Get all monthly expiration dates for a year
 *
 * @param year - Year to get expirations for
 * @returns Array of expiration dates
 */
export function getMonthlyExpirations(year: number): Date[] {
  const expirations: Date[] = [];
  for (let month = 1; month <= 12; month++) {
    expirations.push(getMonthlyExpiration(year, month));
  }
  return expirations;
}

// ============================================
// Session Validation for DecisionPlan
// ============================================

/**
 * Actions that open or increase a position (entries)
 * These require regular trading hours (RTH).
 */
const ENTRY_ACTIONS = new Set<ActionForSession>(["BUY", "SELL", "INCREASE"]);

/**
 * Actions that close or reduce a position (exits)
 * These are allowed at any time when market has any session.
 */
const EXIT_ACTIONS = new Set<ActionForSession>(["CLOSE", "REDUCE"]);

/**
 * Check if an action is an entry (opens or increases position)
 *
 * @param action - Action to check
 * @returns true if action is an entry
 */
export function isEntryAction(action: ActionForSession): boolean {
  return ENTRY_ACTIONS.has(action);
}

/**
 * Check if an action is an exit (closes or reduces position)
 *
 * @param action - Action to check
 * @returns true if action is an exit
 */
export function isExitAction(action: ActionForSession): boolean {
  return EXIT_ACTIONS.has(action);
}

/**
 * Check if an action requires no market interaction
 *
 * @param action - Action to check
 * @returns true if action is passive (HOLD)
 */
export function isPassiveAction(action: ActionForSession): boolean {
  return action === "HOLD";
}

/**
 * Get the allowed sessions for an instrument type and action
 *
 * @param instrumentType - Type of instrument (EQUITY or OPTION)
 * @param action - Action being performed
 * @param config - Optional validation configuration
 * @returns Array of allowed trading sessions
 */
export function getAllowedSessions(
  instrumentType: InstrumentTypeForSession,
  action: ActionForSession,
  config: SessionValidationConfig = {}
): TradingSession[] {
  // HOLD is always allowed (no market interaction)
  if (isPassiveAction(action)) {
    return ["PRE_MARKET", "RTH", "AFTER_HOURS", "CLOSED"];
  }

  // Exits are allowed during any open session
  if (isExitAction(action)) {
    if (instrumentType === "OPTION") {
      // Options can only trade during RTH
      return ["RTH"];
    }
    // Equities can exit during any open session
    if (config.allowExtendedHours) {
      return ["PRE_MARKET", "RTH", "AFTER_HOURS"];
    }
    return ["RTH"];
  }

  // Entries require RTH for risk management
  // Options: RTH only (no extended hours)
  // Equities: RTH by default, extended hours if configured
  if (instrumentType === "OPTION") {
    return ["RTH"];
  }

  // Equity entries
  if (config.allowExtendedHours) {
    return ["PRE_MARKET", "RTH", "AFTER_HOURS"];
  }
  return ["RTH"];
}

/**
 * Validate if an action can be executed at a given datetime
 *
 * This is the main validation function for DecisionPlan session feasibility.
 * It enforces:
 * - Entries (BUY, SELL, INCREASE) require RTH
 * - Exits (CLOSE, REDUCE) allowed during any open session
 * - HOLD is always allowed
 * - Options can only trade during RTH
 * - Market holidays/closures are respected
 *
 * @param action - Action to validate
 * @param instrumentType - Type of instrument
 * @param datetime - DateTime to validate against
 * @param config - Optional validation configuration
 * @returns Validation result with session info and rejection reason
 *
 * @example
 * ```typescript
 * const result = validateSessionForAction("BUY", "EQUITY", new Date());
 * if (!result.valid) {
 *   console.log(`Cannot execute: ${result.reason}`);
 *   console.log(`Suggestion: ${result.suggestion}`);
 * }
 * ```
 */
export function validateSessionForAction(
  action: ActionForSession,
  instrumentType: InstrumentTypeForSession,
  datetime: Date | string,
  config: SessionValidationConfig = {}
): SessionValidationResult {
  // Override: always consider market open
  if (config.alwaysOpen) {
    return {
      valid: true,
      session: "RTH",
    };
  }

  const session = getTradingSession(datetime);
  const allowedSessions = getAllowedSessions(instrumentType, action, config);

  // Check if current session is allowed
  if (allowedSessions.includes(session)) {
    return {
      valid: true,
      session,
    };
  }

  // Build rejection reason and suggestion
  const dateObj = typeof datetime === "string" ? new Date(datetime) : datetime;
  const timeStr = dateObj.toISOString();

  if (session === "CLOSED") {
    const dateStr = formatDateOnly(dateObj);
    const holiday = getHoliday(dateStr);

    if (holiday) {
      return {
        valid: false,
        session,
        reason: `Market closed for ${holiday.name}`,
        suggestion: "Re-plan with NO_TRADE or schedule for next trading day",
      };
    }

    return {
      valid: false,
      session,
      reason: `Market closed at ${timeStr}`,
      suggestion: "Re-plan with NO_TRADE or schedule for next trading day",
    };
  }

  // Session is open but not allowed for this action/instrument
  if (isEntryAction(action)) {
    if (instrumentType === "OPTION") {
      return {
        valid: false,
        session,
        reason: `Options can only be traded during RTH (9:30 AM - 4:00 PM ET). Current session: ${session}`,
        suggestion: "Re-plan with NO_TRADE or wait for RTH",
      };
    }

    return {
      valid: false,
      session,
      reason: `Entry actions (${action}) require RTH (9:30 AM - 4:00 PM ET). Current session: ${session}`,
      suggestion: "Re-plan with NO_TRADE or wait for RTH",
    };
  }

  if (isExitAction(action) && instrumentType === "OPTION") {
    return {
      valid: false,
      session,
      reason: `Option exits can only be executed during RTH (9:30 AM - 4:00 PM ET). Current session: ${session}`,
      suggestion: "Schedule exit for next RTH session",
    };
  }

  // Fallback (shouldn't reach here)
  return {
    valid: false,
    session,
    reason: `Action ${action} not allowed during ${session}`,
    suggestion: "Re-plan with NO_TRADE",
  };
}

/**
 * Check if trading is currently possible (market has any open session)
 *
 * @param datetime - DateTime to check
 * @returns true if any trading is possible
 */
export function isTradingPossible(datetime: Date | string): boolean {
  const session = getTradingSession(datetime);
  return session !== "CLOSED";
}

/**
 * Get the next RTH start time from a given datetime
 *
 * @param datetime - Starting datetime
 * @returns DateTime of next RTH start
 */
export function getNextRTHStart(datetime: Date | string): Date {
  const dateObj = typeof datetime === "string" ? new Date(datetime) : new Date(datetime.getTime());

  // Get current session
  const session = getTradingSession(dateObj);

  // If already in RTH, return current time
  if (session === "RTH") {
    return dateObj;
  }

  // If before RTH today and market is open, return today's RTH start
  if (session === "PRE_MARKET") {
    const dateStr = formatDateOnly(dateObj);
    // Return 9:30 AM ET today (approximate: UTC-5)
    const rthStart = new Date(`${dateStr}T14:30:00.000Z`); // 9:30 AM ET = 14:30 UTC
    return rthStart;
  }

  // Otherwise, find next trading day and return its RTH start
  const nextDay = getNextTradingDay(dateObj);
  const nextDayStr = formatDateOnly(nextDay);
  return new Date(`${nextDayStr}T14:30:00.000Z`);
}

/**
 * Get minutes until market close
 *
 * @param datetime - DateTime to check
 * @returns Minutes until close, or null if market closed
 */
export function getMinutesToClose(datetime: Date | string): number | null {
  const dateObj = typeof datetime === "string" ? new Date(datetime) : datetime;
  const dateStr = formatDateOnly(dateObj);

  if (!isMarketOpen(dateStr)) {
    return null;
  }

  const closeTime = getMarketCloseTime(dateStr);
  if (!closeTime) {
    return null;
  }

  // Get current time in minutes since midnight ET
  const hours = dateObj.getUTCHours() - 5;
  const minutes = dateObj.getUTCMinutes();
  const currentMinutes = (hours < 0 ? hours + 24 : hours) * 60 + minutes;

  // Get close time in minutes
  const closeMinutes = parseTimeToMinutes(closeTime);

  const diff = closeMinutes - currentMinutes;
  return diff > 0 ? diff : 0;
}
