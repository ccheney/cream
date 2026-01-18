/**
 * Calendar Routes
 *
 * REST endpoints for market calendar data including trading days,
 * market clock status, and current session information.
 *
 * @see docs/plans/ui/05-api-endpoints.md
 */

import {
	type CalendarDay,
	getCalendarService,
	initCalendarService,
	type TradingSession,
	TradingSessionSchema,
} from "@cream/domain";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import log from "../logger.js";

// ============================================
// Schemas
// ============================================

const CalendarQuerySchema = z.object({
	start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be in YYYY-MM-DD format"),
	end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be in YYYY-MM-DD format"),
});

const CalendarDayResponseSchema = z.object({
	date: z.string(),
	open: z.string(),
	close: z.string(),
	sessionOpen: z.string().optional(),
	sessionClose: z.string().optional(),
});

const ClockResponseSchema = z.object({
	isOpen: z.boolean(),
	nextOpen: z.string(),
	nextClose: z.string(),
	timestamp: z.string(),
});

const CalendarStatusSchema = z.object({
	isOpen: z.boolean(),
	session: TradingSessionSchema,
	nextOpen: z.string(),
	nextClose: z.string(),
	message: z.string(),
});

const ErrorSchema = z.object({
	error: z.string(),
	message: z.string(),
});

// ============================================
// Helpers
// ============================================

/**
 * Get the calendar service, ensuring it's initialized.
 * Falls back to initialization if not yet done.
 */
async function getService() {
	let service = getCalendarService();
	if (!service) {
		// Initialize with hardcoded service as fallback
		await initCalendarService({ mode: "PAPER" });
		service = getCalendarService();
	}
	if (!service) {
		throw new Error("CalendarService unavailable");
	}
	return service;
}

/**
 * Generate a human-readable status message based on market state.
 */
function getStatusMessage(
	_isOpen: boolean,
	session: TradingSession,
	nextOpen: Date,
	nextClose: Date
): string {
	const now = new Date();

	if (session === "RTH") {
		const minutesUntilClose = Math.round((nextClose.getTime() - now.getTime()) / (1000 * 60));
		const hours = Math.floor(minutesUntilClose / 60);
		const minutes = minutesUntilClose % 60;
		if (hours > 0) {
			return `Market open. Closes in ${hours}h ${minutes}m.`;
		}
		return `Market open. Closes in ${minutes}m.`;
	}

	if (session === "PRE_MARKET") {
		return "Pre-market session. Regular trading begins at 9:30 AM ET.";
	}

	if (session === "AFTER_HOURS") {
		return "After-hours session. Extended hours end at 8:00 PM ET.";
	}

	// CLOSED - calculate time until next open
	const minutesUntilOpen = Math.round((nextOpen.getTime() - now.getTime()) / (1000 * 60));
	const hoursUntilOpen = Math.floor(minutesUntilOpen / 60);
	const daysUntilOpen = Math.floor(hoursUntilOpen / 24);

	if (daysUntilOpen > 0) {
		return `Market closed. Opens in ${daysUntilOpen}d ${hoursUntilOpen % 24}h.`;
	}
	if (hoursUntilOpen > 0) {
		return `Market closed. Opens in ${hoursUntilOpen}h ${minutesUntilOpen % 60}m.`;
	}
	return `Market closed. Opens in ${minutesUntilOpen}m.`;
}

// ============================================
// Routes
// ============================================

const app = new OpenAPIHono();

// GET /api/calendar - Get calendar days for date range
const calendarRangeRoute = createRoute({
	method: "get",
	path: "/",
	request: {
		query: CalendarQuerySchema,
	},
	responses: {
		200: {
			content: {
				"application/json": { schema: z.array(CalendarDayResponseSchema) },
			},
			description: "Calendar days in the requested range",
		},
		400: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Invalid date format",
		},
		503: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Calendar service unavailable",
		},
	},
	tags: ["Calendar"],
});

// @ts-expect-error - Hono OpenAPI multi-response type inference limitation
app.openapi(calendarRangeRoute, async (c) => {
	const { start, end } = c.req.valid("query");

	try {
		const service = await getService();
		const days = await service.getCalendarRange(start, end);

		log.debug({ start, end, count: days.length }, "Fetched calendar range");

		return c.json(
			days.map((day: CalendarDay) => ({
				date: day.date,
				open: day.open,
				close: day.close,
				sessionOpen: day.sessionOpen,
				sessionClose: day.sessionClose,
			}))
		);
	} catch (error) {
		log.error(
			{ error: error instanceof Error ? error.message : String(error) },
			"Failed to fetch calendar range"
		);
		return c.json({ error: "SERVICE_UNAVAILABLE", message: "Calendar service unavailable" }, 503);
	}
});

// GET /api/calendar/clock - Get current market clock
const clockRoute = createRoute({
	method: "get",
	path: "/clock",
	responses: {
		200: {
			content: { "application/json": { schema: ClockResponseSchema } },
			description: "Current market clock status",
		},
		503: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Calendar service unavailable",
		},
	},
	tags: ["Calendar"],
});

// @ts-expect-error - Hono OpenAPI multi-response type inference limitation
app.openapi(clockRoute, async (c) => {
	try {
		const service = await getService();
		const clock = await service.getClock();

		log.debug({ isOpen: clock.isOpen }, "Fetched market clock");

		return c.json({
			isOpen: clock.isOpen,
			nextOpen: clock.nextOpen.toISOString(),
			nextClose: clock.nextClose.toISOString(),
			timestamp: clock.timestamp.toISOString(),
		});
	} catch (error) {
		log.error(
			{ error: error instanceof Error ? error.message : String(error) },
			"Failed to fetch market clock"
		);
		return c.json({ error: "SERVICE_UNAVAILABLE", message: "Calendar service unavailable" }, 503);
	}
});

// GET /api/calendar/status - Get market status with human-readable message
const statusRoute = createRoute({
	method: "get",
	path: "/status",
	responses: {
		200: {
			content: { "application/json": { schema: CalendarStatusSchema } },
			description: "Current market status with human-readable message",
		},
		503: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Calendar service unavailable",
		},
	},
	tags: ["Calendar"],
});

// @ts-expect-error - Hono OpenAPI multi-response type inference limitation
app.openapi(statusRoute, async (c) => {
	try {
		const service = await getService();
		const [clock, session] = await Promise.all([
			service.getClock(),
			service.getTradingSession(new Date()),
		]);

		const message = getStatusMessage(clock.isOpen, session, clock.nextOpen, clock.nextClose);

		log.debug({ isOpen: clock.isOpen, session, message }, "Fetched market status");

		return c.json({
			isOpen: clock.isOpen,
			session,
			nextOpen: clock.nextOpen.toISOString(),
			nextClose: clock.nextClose.toISOString(),
			message,
		});
	} catch (error) {
		log.error(
			{ error: error instanceof Error ? error.message : String(error) },
			"Failed to fetch market status"
		);
		return c.json({ error: "SERVICE_UNAVAILABLE", message: "Calendar service unavailable" }, 503);
	}
});

export default app;
