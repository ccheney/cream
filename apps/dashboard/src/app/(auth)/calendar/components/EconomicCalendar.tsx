/**
 * Economic Calendar Component
 *
 * Schedule-X calendar displaying economic events from FRED.
 * Supports week and month views with dark mode.
 *
 * @see docs/plans/41-economic-calendar-page.md
 */

"use client";

import "temporal-polyfill/global";

import { createViewMonthAgenda, createViewMonthGrid, createViewWeek } from "@schedule-x/calendar";
import { createEventsServicePlugin } from "@schedule-x/events-service";
import { ScheduleXCalendar, useNextCalendarApp } from "@schedule-x/react";
import "@schedule-x/theme-default/dist/index.css";
import "@/styles/schedule-x-theme.css";
import { CalendarDays } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState, ErrorEmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useEconomicCalendar } from "@/hooks/queries";
import type { EconomicEvent } from "@/lib/api/types";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import {
	type CalendarFilterState,
	CalendarFilters,
	DEFAULT_FILTERS,
	getDateRangeFromFilter,
} from "./CalendarFilters";
import { MonthGridEventCard, TimeGridEventCard } from "./EventCard";
import { EventDetailDrawer } from "./EventDetailDrawer";

// ============================================
// Types
// ============================================

interface CalendarEvent {
	id: string;
	title: string;
	start: Temporal.ZonedDateTime;
	end: Temporal.ZonedDateTime;
	calendarId: string;
	description?: string;
	location?: string;
}

// ============================================
// Constants
// ============================================

const IMPACT_CALENDARS = {
	high: {
		colorName: "high-impact",
		lightColors: {
			main: "#F97316",
			container: "#FFF7ED",
			onContainer: "#9A3412",
		},
		darkColors: {
			main: "#FB923C",
			container: "#7C2D12",
			onContainer: "#FFEDD5",
		},
	},
	medium: {
		colorName: "medium-impact",
		lightColors: {
			main: "#14B8A6",
			container: "#CCFBF1",
			onContainer: "#115E59",
		},
		darkColors: {
			main: "#5EEAD4",
			container: "#115E59",
			onContainer: "#CCFBF1",
		},
	},
	low: {
		colorName: "low-impact",
		lightColors: {
			main: "#78716C",
			container: "#F5F5F4",
			onContainer: "#44403C",
		},
		darkColors: {
			main: "#A8A29E",
			container: "#44403C",
			onContainer: "#E7E5E4",
		},
	},
} as const;

// ============================================
// Custom Components for Schedule-X
// ============================================

const customComponents = {
	timeGridEvent: TimeGridEventCard,
	monthGridEvent: MonthGridEventCard,
};

// ============================================
// Utilities
// ============================================

const DEFAULT_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

function convertToCalendarEvents(events: EconomicEvent[]): CalendarEvent[] {
	return events.map((event) => {
		const timeStr = event.time.slice(0, 5);
		const start = Temporal.ZonedDateTime.from(`${event.date}T${timeStr}:00[${DEFAULT_TIMEZONE}]`);
		const end = start.add({ minutes: 30 });

		const parts: string[] = [];
		if (event.actual) {
			parts.push(`Actual: ${event.actual}${event.unit ?? ""}`);
		}
		if (event.forecast) {
			parts.push(`Forecast: ${event.forecast}${event.unit ?? ""}`);
		}
		if (event.previous) {
			parts.push(`Previous: ${event.previous}${event.unit ?? ""}`);
		}

		return {
			id: event.id,
			title: event.name,
			start,
			end,
			calendarId: event.impact,
			description: parts.length > 0 ? parts.join(" | ") : undefined,
			location: `${event.country} | ${event.impact.toUpperCase()} impact`,
		};
	});
}

// ============================================
// Sub-components
// ============================================

function CalendarLoadingState() {
	return (
		<div className="flex flex-col h-full gap-3">
			{/* Filters skeleton */}
			<div className="shrink-0 flex items-center gap-3">
				<Skeleton width={140} height={32} radius={6} />
				<Skeleton width={140} height={32} radius={6} />
				<div className="w-px h-5 bg-cream-300 dark:bg-night-600" />
				<div className="flex items-center gap-1.5">
					<Skeleton width={60} height={26} radius={13} />
					<Skeleton width={70} height={26} radius={13} />
					<Skeleton width={50} height={26} radius={13} />
				</div>
			</div>
			{/* Legend skeleton */}
			<div className="shrink-0 flex items-center justify-between">
				<div className="flex items-center gap-4">
					<Skeleton width={80} height={12} />
					<Skeleton width={100} height={12} />
					<Skeleton width={70} height={12} />
				</div>
				<Skeleton width={120} height={12} />
			</div>
			{/* Calendar skeleton */}
			<div className="flex-1 min-h-0 bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 overflow-hidden">
				<div className="flex items-center justify-center h-full">
					<div className="flex flex-col items-center gap-3">
						<div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
						<span className="text-sm text-stone-500 dark:text-night-400">Loading events...</span>
					</div>
				</div>
			</div>
		</div>
	);
}

function CalendarErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
	return (
		<div className="flex items-center justify-center h-full bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
			<ErrorEmptyState
				title="Failed to Load Calendar"
				description={message ?? "We couldn't load the economic calendar. Please try again."}
				action={onRetry ? { label: "Retry", onClick: onRetry } : undefined}
			/>
		</div>
	);
}

function CalendarEmptyState({
	onClearFilters,
	hasActiveFilters,
}: {
	onClearFilters?: () => void;
	hasActiveFilters?: boolean;
}) {
	return (
		<div className="flex items-center justify-center h-full bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
			<EmptyState
				icon={<CalendarDays className="h-10 w-10" />}
				title="No Economic Events"
				description={
					hasActiveFilters
						? "No events found for the selected filters. Try adjusting your filters."
						: "No upcoming economic events scheduled for this period."
				}
				action={
					hasActiveFilters && onClearFilters
						? { label: "Clear Filters", onClick: onClearFilters }
						: undefined
				}
			/>
		</div>
	);
}

function ImpactLegend({ compact = false }: { compact?: boolean }) {
	if (compact) {
		return (
			<div className="flex items-center gap-2 text-[10px]">
				<div className="flex items-center gap-1">
					<span className="w-2 h-2 rounded-full bg-orange-500" />
					<span className="text-stone-600 dark:text-night-300">High</span>
				</div>
				<div className="flex items-center gap-1">
					<span className="w-2 h-2 rounded-full bg-teal-500" />
					<span className="text-stone-600 dark:text-night-300">Med</span>
				</div>
				<div className="flex items-center gap-1">
					<span className="w-2 h-2 rounded-full bg-stone-400" />
					<span className="text-stone-600 dark:text-night-300">Low</span>
				</div>
			</div>
		);
	}
	return (
		<div className="flex items-center gap-4 text-xs">
			<div className="flex items-center gap-1.5">
				<span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
				<span className="text-stone-600 dark:text-night-300">High Impact</span>
			</div>
			<div className="flex items-center gap-1.5">
				<span className="w-2.5 h-2.5 rounded-full bg-teal-500" />
				<span className="text-stone-600 dark:text-night-300">Medium Impact</span>
			</div>
			<div className="flex items-center gap-1.5">
				<span className="w-2.5 h-2.5 rounded-full bg-stone-400" />
				<span className="text-stone-600 dark:text-night-300">Low Impact</span>
			</div>
		</div>
	);
}

function useCalendarFiltersState() {
	const [filters, setFilters] = useState<CalendarFilterState>(DEFAULT_FILTERS);
	const { start, end } = useMemo(
		() => getDateRangeFromFilter(filters.dateRange),
		[filters.dateRange],
	);

	const handleFilterChange = useCallback((newFilters: CalendarFilterState) => {
		setFilters(newFilters);
	}, []);
	const handleClearFilters = useCallback(() => {
		setFilters(DEFAULT_FILTERS);
	}, []);
	const hasActiveFilters = useMemo(() => {
		return (
			filters.country !== DEFAULT_FILTERS.country ||
			filters.impact.length !== DEFAULT_FILTERS.impact.length ||
			filters.dateRange !== DEFAULT_FILTERS.dateRange
		);
	}, [filters]);

	return { filters, start, end, handleFilterChange, handleClearFilters, hasActiveFilters };
}

function useEventSelection(events: EconomicEvent[] | undefined) {
	const [selectedEvent, setSelectedEvent] = useState<EconomicEvent | null>(null);
	const [isDrawerOpen, setIsDrawerOpen] = useState(false);
	const eventsRef = useRef<EconomicEvent[]>([]);

	useEffect(() => {
		eventsRef.current = events ?? [];
	}, [events]);

	const handleEventClick = useCallback((eventId: string) => {
		const event = eventsRef.current.find((candidate) => candidate.id === eventId);
		if (!event) {
			return;
		}
		setSelectedEvent(event);
		setIsDrawerOpen(true);
	}, []);
	const handleDrawerClose = useCallback(() => {
		setIsDrawerOpen(false);
	}, []);

	return { selectedEvent, isDrawerOpen, handleEventClick, handleDrawerClose };
}

function useIsDarkMode() {
	const [isDark, setIsDark] = useState(false);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}
		const root = document.documentElement;
		if (!root) {
			return;
		}

		const checkDarkMode = () => {
			setIsDark(root.classList.contains("dark"));
		};
		checkDarkMode();

		const observer = new MutationObserver(checkDarkMode);
		observer.observe(root, { attributes: true, attributeFilter: ["class"] });
		return () => observer.disconnect();
	}, []);

	return isDark;
}

function useCalendarViews(isMobile: boolean) {
	return useMemo(() => {
		if (isMobile) {
			return [createViewMonthAgenda()];
		}
		return [createViewMonthAgenda(), createViewMonthGrid(), createViewWeek()];
	}, [isMobile]) as [ReturnType<typeof createViewWeek>, ...ReturnType<typeof createViewWeek>[]];
}

function useCalendarEvents(events: EconomicEvent[] | undefined) {
	return useMemo(() => {
		if (!events) {
			return [];
		}
		return convertToCalendarEvents(events);
	}, [events]);
}

interface UseCalendarAppProps {
	isMobile: boolean;
	isDark: boolean;
	calendarEvents: CalendarEvent[];
	eventsService: ReturnType<typeof createEventsServicePlugin>;
	onEventClick: (eventId: string) => void;
}

function useCalendarApp({
	isMobile,
	isDark,
	calendarEvents,
	eventsService,
	onEventClick,
}: UseCalendarAppProps) {
	const views = useCalendarViews(isMobile);

	return useNextCalendarApp({
		views,
		defaultView: "month-agenda",
		locale: "en-US",
		firstDayOfWeek: 1,
		isDark,
		dayBoundaries: { start: "06:00", end: "20:00" },
		weekOptions: { gridHeight: isMobile ? 500 : 800, nDays: isMobile ? 1 : 5, eventWidth: 95 },
		calendars: IMPACT_CALENDARS,
		events: calendarEvents,
		plugins: [eventsService],
		callbacks: {
			onEventClick(event) {
				onEventClick(String(event.id));
			},
		},
	});
}

function useSyncCalendarTheme(calendar: ReturnType<typeof useNextCalendarApp>, isDark: boolean) {
	useEffect(() => {
		if (calendar) {
			calendar.setTheme(isDark ? "dark" : "light");
		}
	}, [calendar, isDark]);
}

function useSyncCalendarEvents(
	calendar: ReturnType<typeof useNextCalendarApp>,
	eventsService: ReturnType<typeof createEventsServicePlugin>,
	calendarEvents: CalendarEvent[],
) {
	useEffect(() => {
		if (
			calendar &&
			eventsService &&
			typeof eventsService.set === "function" &&
			calendarEvents.length > 0
		) {
			eventsService.set(calendarEvents);
		}
	}, [calendar, eventsService, calendarEvents]);
}

interface CalendarViewProps {
	filters: CalendarFilterState;
	onFilterChange: (filters: CalendarFilterState) => void;
	isMobile: boolean;
	eventCount: number;
	lastUpdated: string;
	calendar: ReturnType<typeof useNextCalendarApp>;
}

function CalendarView({
	filters,
	onFilterChange,
	isMobile,
	eventCount,
	lastUpdated,
	calendar,
}: CalendarViewProps) {
	return (
		<div className="flex flex-col h-full gap-3">
			<div className="shrink-0">
				<CalendarFilters filters={filters} onFilterChange={onFilterChange} />
			</div>
			<div className="shrink-0 flex items-center justify-between">
				<ImpactLegend compact={isMobile} />
				<span className="text-[10px] sm:text-xs text-stone-500 dark:text-night-400">
					{eventCount} events
					<span className="hidden sm:inline">
						{" "}
						• Updated {new Date(lastUpdated).toLocaleTimeString()}
					</span>
				</span>
			</div>
			<div className="flex-1 min-h-0 bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 overflow-hidden [&_.sx-react-calendar-wrapper]:h-full [&_.sx-react-calendar]:h-full">
				<ScheduleXCalendar calendarApp={calendar} customComponents={customComponents} />
			</div>
		</div>
	);
}

interface CalendarStateViewProps {
	isLoading: boolean;
	error: unknown;
	events: ReturnType<typeof useEconomicCalendar>["data"] | undefined;
	hasActiveFilters: boolean;
	onClearFilters: () => void;
	onRetry: () => void;
}

function renderCalendarStateView({
	isLoading,
	error,
	events,
	hasActiveFilters,
	onClearFilters,
	onRetry,
}: CalendarStateViewProps) {
	if (isLoading) {
		return <CalendarLoadingState />;
	}
	if (error) {
		return (
			<CalendarErrorState
				message={error instanceof Error ? error.message : undefined}
				onRetry={onRetry}
			/>
		);
	}
	if (!events?.events || events.events.length === 0) {
		return (
			<CalendarEmptyState hasActiveFilters={hasActiveFilters} onClearFilters={onClearFilters} />
		);
	}
	return null;
}

// ============================================
// Main Component
// ============================================

export function EconomicCalendar() {
	const { isMobile } = useMediaQuery();
	const { filters, start, end, handleFilterChange, handleClearFilters, hasActiveFilters } =
		useCalendarFiltersState();
	const isDark = useIsDarkMode();

	const { data, isLoading, error, refetch } = useEconomicCalendar({
		startDate: start,
		endDate: end,
		impact: filters.impact,
		country: filters.country === "ALL" ? undefined : filters.country,
	});
	const { selectedEvent, isDrawerOpen, handleEventClick, handleDrawerClose } = useEventSelection(
		data?.events,
	);

	const eventsService = useMemo(() => createEventsServicePlugin(), []);
	const calendarEvents = useCalendarEvents(data?.events);
	const calendar = useCalendarApp({
		isMobile,
		isDark,
		calendarEvents,
		eventsService,
		onEventClick: handleEventClick,
	});
	useSyncCalendarTheme(calendar, isDark);
	useSyncCalendarEvents(calendar, eventsService, calendarEvents);

	const stateView = renderCalendarStateView({
		isLoading,
		error,
		events: data,
		hasActiveFilters,
		onClearFilters: handleClearFilters,
		onRetry: () => refetch(),
	});
	if (stateView) {
		return stateView;
	}

	return (
		<>
			<CalendarView
				filters={filters}
				onFilterChange={handleFilterChange}
				isMobile={isMobile}
				eventCount={data.events.length}
				lastUpdated={data.meta.lastUpdated}
				calendar={calendar}
			/>
			<EventDetailDrawer event={selectedEvent} isOpen={isDrawerOpen} onClose={handleDrawerClose} />
		</>
	);
}

export default EconomicCalendar;
