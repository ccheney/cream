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
 */
export const EVENT_COLORS = {
  high: {
    main: "#dc2626", // red-600
    container: "#fef2f2", // red-50
    onContainer: "#991b1b", // red-800
  },
  medium: {
    main: "#d97706", // amber-600
    container: "#fffbeb", // amber-50
    onContainer: "#92400e", // amber-800
  },
  low: {
    main: "#2563eb", // blue-600
    container: "#eff6ff", // blue-50
    onContainer: "#1e40af", // blue-800
  },
} as const;

/**
 * Get event color by impact level.
 */
export function getEventColor(impact: "high" | "medium" | "low") {
  return EVENT_COLORS[impact];
}
