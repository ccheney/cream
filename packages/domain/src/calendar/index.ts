/**
 * Calendar Module
 *
 * Market calendar service abstraction for trading day and session operations.
 *
 * @example
 * ```typescript
 * import { CalendarService, CalendarDay, MarketClock } from "@cream/domain/calendar";
 * ```
 */

// Hardcoded calendar data for BACKTEST mode
export {
  EARLY_CLOSE,
  generateCalendarRange,
  getCalendarDay,
  getNextTradingDay,
  getPreviousTradingDay,
  isEarlyClose,
  isHoliday,
  isTradingDay,
  NYSE_EARLY_CLOSES,
  NYSE_HOLIDAYS,
  REGULAR_CLOSE,
  REGULAR_OPEN,
  SESSION_CLOSE,
  SESSION_OPEN,
} from "./hardcoded";
export {
  // Types
  type AlpacaCalendarResponse,
  // Schemas
  AlpacaCalendarResponseSchema,
  type AlpacaClockResponse,
  AlpacaClockResponseSchema,
  type CalendarCacheEntry,
  type CalendarDay,
  CalendarDaySchema,
  type CalendarService,
  type CalendarServiceOptions,
  type MarketClock,
  MarketClockSchema,
  type TradingSession,
  TradingSessionSchema,
} from "./types";
