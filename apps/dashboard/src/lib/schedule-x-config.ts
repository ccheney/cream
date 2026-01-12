/**
 * Schedule-X Calendar Configuration
 *
 * Configuration for the economic calendar using Schedule-X library.
 * Import view factories directly from @schedule-x/calendar as needed.
 *
 * @see https://schedule-x.dev/docs/frameworks/react
 */

/**
 * Calendar configuration defaults.
 */
export const CALENDAR_CONFIG = {
  locale: "en-US",
  firstDayOfWeek: 0 as const, // Sunday
  timezone: "America/New_York",
};

/**
 * Event color mapping by impact level.
 * Uses warm palette from design system (docs/plans/ui/21-color-system.md)
 */
export const EVENT_COLORS = {
  high: {
    main: "#F97316", // orange-500 (--agent-risk)
    container: "#FFF7ED", // orange-50
    onContainer: "#9A3412", // orange-800
  },
  medium: {
    main: "#14B8A6", // teal-500 (--agent-fundamentals)
    container: "#CCFBF1", // teal-100
    onContainer: "#115E59", // teal-800
  },
  low: {
    main: "#78716C", // stone-500
    container: "#F5F5F4", // stone-100
    onContainer: "#44403C", // stone-700
  },
} as const;

/**
 * Get event color by impact level.
 */
export function getEventColor(impact: "high" | "medium" | "low") {
  return EVENT_COLORS[impact];
}
