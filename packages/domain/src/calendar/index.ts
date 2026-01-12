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
