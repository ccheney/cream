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

// API client for PAPER/LIVE modes
export {
  AlpacaCalendarClient,
  type AlpacaCalendarClientConfig,
  type AlpacaEnvironment,
  CalendarClientError,
  type CalendarErrorCode,
  createAlpacaCalendarClient,
} from "./alpaca-client";

// Cache for PAPER/LIVE modes
export {
  type CalendarCache,
  type CalendarCacheConfig,
  createCalendarCache,
  InMemoryCalendarCache,
} from "./cache";
// Factory and singleton
export {
  CalendarConfigError,
  type CalendarServiceFactoryOptions,
  createCalendarService,
  getCalendarService,
  initCalendarService,
  isCalendarServiceAvailable,
  requireCalendarService,
  resetCalendarService,
} from "./factory";
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
// Service implementations
export {
  // PAPER/LIVE modes
  AlpacaCalendarService,
  type AlpacaCalendarServiceConfig,
  CalendarServiceError,
  createAlpacaCalendarService,
  // BACKTEST mode
  createHardcodedCalendarService,
  HardcodedCalendarService,
} from "./service";
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
