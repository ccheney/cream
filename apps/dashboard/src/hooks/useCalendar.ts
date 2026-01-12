"use client";

/**
 * Calendar API Hooks
 *
 * React Query hooks for market calendar data.
 * Provides real-time market clock status and calendar range queries.
 *
 * @see apps/dashboard-api/src/routes/calendar.ts
 * @see docs/plans/ui/08-realtime.md
 */

import { type UseQueryOptions, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { CACHE_TIMES, queryKeys, STALE_TIMES } from "@/lib/api/query-client";

// ============================================
// Types
// ============================================

/**
 * Calendar day with market hours.
 */
export interface CalendarDayResponse {
  /** Date in YYYY-MM-DD format */
  date: string;
  /** Market open time in HH:MM format (ET) */
  open: string;
  /** Market close time in HH:MM format (ET) */
  close: string;
  /** Extended session open time (ET) */
  sessionOpen?: string;
  /** Extended session close time (ET) */
  sessionClose?: string;
}

/**
 * Market clock status response.
 */
export interface MarketClockResponse {
  /** Whether the market is currently open */
  isOpen: boolean;
  /** Next market open time (ISO 8601) */
  nextOpen: string;
  /** Next market close time (ISO 8601) */
  nextClose: string;
  /** Current timestamp (ISO 8601) */
  timestamp: string;
}

/**
 * Market status with human-readable message.
 */
export interface MarketStatusResponse {
  /** Whether the market is currently open */
  isOpen: boolean;
  /** Current trading session */
  session: "PRE_MARKET" | "RTH" | "AFTER_HOURS" | "CLOSED";
  /** Next market open time (ISO 8601) */
  nextOpen: string;
  /** Next market close time (ISO 8601) */
  nextClose: string;
  /** Human-readable status message */
  message: string;
}

// ============================================
// Fetch Functions
// ============================================

/**
 * Fetch market clock status.
 */
async function fetchMarketClock(): Promise<MarketClockResponse> {
  const { data } = await api.get<MarketClockResponse>("/api/calendar/clock");
  return data;
}

/**
 * Fetch market status with message.
 */
async function fetchMarketStatus(): Promise<MarketStatusResponse> {
  const { data } = await api.get<MarketStatusResponse>("/api/calendar/status");
  return data;
}

/**
 * Fetch calendar days for a date range.
 */
async function fetchCalendarRange(start: string, end: string): Promise<CalendarDayResponse[]> {
  const { data } = await api.get<CalendarDayResponse[]>("/api/calendar", {
    params: { start, end },
  });
  return data;
}

// ============================================
// Hooks
// ============================================

/**
 * Hook for real-time market clock status.
 *
 * Auto-refreshes every 30 seconds to keep status current.
 *
 * @example
 * ```typescript
 * const { data: clock, isLoading } = useMarketClock();
 * if (clock?.isOpen) {
 *   console.log("Market is open until", clock.nextClose);
 * }
 * ```
 */
export function useMarketClock(
  options?: Omit<UseQueryOptions<MarketClockResponse>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: queryKeys.calendar.clock(),
    queryFn: fetchMarketClock,
    staleTime: STALE_TIMES.MARKET,
    gcTime: CACHE_TIMES.MARKET,
    // Auto-refresh every 30 seconds
    refetchInterval: 30 * 1000,
    ...options,
  });
}

/**
 * Hook for market status with human-readable message.
 *
 * Provides a formatted message for UI display.
 *
 * @example
 * ```typescript
 * const { data: status } = useMarketStatus();
 * return <span>{status?.message}</span>;
 * // "Market open. Closes in 2h 30m."
 * ```
 */
export function useMarketStatus(
  options?: Omit<UseQueryOptions<MarketStatusResponse>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: queryKeys.calendar.status(),
    queryFn: fetchMarketStatus,
    staleTime: STALE_TIMES.MARKET,
    gcTime: CACHE_TIMES.MARKET,
    // Auto-refresh every 30 seconds
    refetchInterval: 30 * 1000,
    ...options,
  });
}

/**
 * Hook for calendar data within a date range.
 *
 * Returns trading days with open/close times for the specified range.
 * Uses longer cache times since calendar data is static.
 *
 * @param start - Start date in YYYY-MM-DD format
 * @param end - End date in YYYY-MM-DD format
 *
 * @example
 * ```typescript
 * const { data: days } = useCalendarRange("2025-01-01", "2025-01-31");
 * const tradingDays = days?.length; // Number of trading days in January
 * ```
 */
export function useCalendarRange(
  start: string,
  end: string,
  options?: Omit<UseQueryOptions<CalendarDayResponse[]>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: queryKeys.calendar.range(start, end),
    queryFn: () => fetchCalendarRange(start, end),
    staleTime: STALE_TIMES.STATIC,
    gcTime: CACHE_TIMES.STATIC,
    // Only fetch if dates are provided
    enabled: Boolean(start && end),
    ...options,
  });
}

// ============================================
// Utility Hooks
// ============================================

/**
 * Hook to check if market is currently open.
 *
 * Simple boolean wrapper around useMarketClock for common use case.
 *
 * @example
 * ```typescript
 * const { isOpen, isLoading } = useIsMarketOpen();
 * if (!isOpen) {
 *   return <span>Market is closed</span>;
 * }
 * ```
 */
export function useIsMarketOpen() {
  const { data, isLoading, error } = useMarketClock();

  return {
    isOpen: data?.isOpen ?? false,
    isLoading,
    error,
    nextOpen: data?.nextOpen ? new Date(data.nextOpen) : null,
    nextClose: data?.nextClose ? new Date(data.nextClose) : null,
  };
}

/**
 * Hook to get current trading session.
 *
 * Returns the session type (PRE_MARKET, RTH, AFTER_HOURS, CLOSED).
 *
 * @example
 * ```typescript
 * const { session } = useTradingSession();
 * switch (session) {
 *   case "RTH": return "Regular hours";
 *   case "AFTER_HOURS": return "After hours";
 *   // ...
 * }
 * ```
 */
export function useTradingSession() {
  const { data, isLoading, error } = useMarketStatus();

  return {
    session: data?.session ?? "CLOSED",
    message: data?.message ?? "",
    isLoading,
    error,
  };
}
