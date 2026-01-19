/**
 * Economic Calendar Query Hook
 *
 * TanStack Query hook for fetching economic calendar events from FRED.
 * Events include FOMC meetings, CPI releases, employment reports, etc.
 *
 * @see docs/plans/41-economic-calendar-page.md
 */

import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api/client";
import { CACHE_TIMES, queryKeys, STALE_TIMES } from "@/lib/api/query-client";
import type {
	EconomicCalendarResponse,
	EconomicEvent,
	EventHistoryResponse,
	ImpactLevel,
} from "@/lib/api/types";

// ============================================
// Types
// ============================================

export interface UseEconomicCalendarOptions {
	/** Start date (YYYY-MM-DD). Defaults to today. */
	startDate?: string;
	/** End date (YYYY-MM-DD). Defaults to 30 days from start. */
	endDate?: string;
	/** Filter by impact level. Multiple values comma-separated. */
	impact?: ImpactLevel | ImpactLevel[];
	/** Country filter. Defaults to US. */
	country?: string;
	/** Whether to enable the query. Defaults to true. */
	enabled?: boolean;
}

// ============================================
// Utilities
// ============================================

/**
 * Format date as YYYY-MM-DD in New York timezone.
 */
function formatDate(date: Date): string {
	return date.toLocaleDateString("en-US", { timeZone: "America/New_York" });
}

/**
 * Get today's date in YYYY-MM-DD format.
 */
function getToday(): string {
	return formatDate(new Date());
}

/**
 * Get date N days from now in YYYY-MM-DD format.
 */
function getDatePlusDays(days: number): string {
	const date = new Date();
	date.setDate(date.getDate() + days);
	return formatDate(date);
}

// ============================================
// Hook
// ============================================

/**
 * Fetch economic calendar events.
 *
 * @example
 * ```tsx
 * // Fetch next 30 days of high-impact events
 * const { data, isLoading } = useEconomicCalendar({
 *   impact: 'high',
 * });
 *
 * // Fetch specific date range
 * const { data } = useEconomicCalendar({
 *   startDate: '2025-01-01',
 *   endDate: '2025-01-31',
 *   impact: ['high', 'medium'],
 * });
 * ```
 */
export function useEconomicCalendar(options: UseEconomicCalendarOptions = {}) {
	const {
		startDate = getToday(),
		endDate = getDatePlusDays(30),
		impact,
		country = "US",
		enabled = true,
	} = options;

	// Build impact filter string
	const impactFilter = Array.isArray(impact) ? impact.join(",") : impact;

	return useQuery({
		queryKey: queryKeys.economicCalendar.events(startDate, endDate, impactFilter),
		queryFn: async () => {
			const params = new URLSearchParams({
				start: startDate,
				end: endDate,
				country,
			});
			if (impactFilter) {
				params.set("impact", impactFilter);
			}

			const { data } = await get<EconomicCalendarResponse>(
				`/api/economic-calendar?${params.toString()}`
			);
			return data;
		},
		enabled,
		staleTime: STALE_TIMES.ECONOMIC_CALENDAR,
		gcTime: CACHE_TIMES.ECONOMIC_CALENDAR,
	});
}

/**
 * Fetch a single economic event by ID.
 */
export function useEconomicEvent(id: string, enabled = true) {
	return useQuery({
		queryKey: queryKeys.economicCalendar.event(id),
		queryFn: async () => {
			const { data } = await get<{ event: EconomicEvent }>(`/api/economic-calendar/${id}`);
			return data.event;
		},
		enabled: enabled && Boolean(id),
		staleTime: STALE_TIMES.ECONOMIC_CALENDAR,
		gcTime: CACHE_TIMES.ECONOMIC_CALENDAR,
	});
}

// ============================================
// Utility Hooks
// ============================================

/**
 * Fetch upcoming high-impact events (next 7 days).
 */
export function useUpcomingHighImpactEvents() {
	return useEconomicCalendar({
		startDate: getToday(),
		endDate: getDatePlusDays(7),
		impact: "high",
	});
}

/**
 * Fetch this week's events.
 */
export function useThisWeekEvents() {
	return useEconomicCalendar({
		startDate: getToday(),
		endDate: getDatePlusDays(7),
	});
}

/**
 * Fetch historical observations for an economic event.
 * Returns the last 12 observations for the event's primary FRED series.
 */
export function useEventHistory(eventId: string | null) {
	return useQuery({
		queryKey: queryKeys.economicCalendar.history(eventId ?? ""),
		queryFn: async () => {
			const { data } = await get<EventHistoryResponse>(`/api/economic-calendar/${eventId}/history`);
			return data;
		},
		enabled: Boolean(eventId),
		staleTime: STALE_TIMES.ECONOMIC_CALENDAR,
		gcTime: CACHE_TIMES.ECONOMIC_CALENDAR,
	});
}
