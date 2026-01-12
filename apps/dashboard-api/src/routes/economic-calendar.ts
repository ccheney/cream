/**
 * Economic Calendar Routes
 *
 * REST endpoints for economic calendar events (FOMC, CPI, employment reports, etc.).
 * Uses FMP API as the data source.
 *
 * @see docs/plans/41-economic-calendar-page.md
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import log from "../logger.js";
import { getEconomicCalendarService, type ImpactLevel } from "../services/economic-calendar.js";

// ============================================
// Schemas
// ============================================

const ImpactLevelSchema = z.enum(["high", "medium", "low"]);

const EconomicEventSchema = z.object({
  id: z.string(),
  name: z.string(),
  date: z.string(),
  time: z.string(),
  country: z.string(),
  impact: ImpactLevelSchema,
  actual: z.string().nullable(),
  previous: z.string().nullable(),
  forecast: z.string().nullable(),
  unit: z.string().nullable(),
});

const EventsQuerySchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be in YYYY-MM-DD format"),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be in YYYY-MM-DD format"),
  country: z.string().optional().default("US"),
  impact: z
    .string()
    .optional()
    .transform((val) =>
      val
        ? (val.split(",").filter((v) => ["high", "medium", "low"].includes(v)) as ImpactLevel[])
        : undefined
    ),
});

const EventsResponseSchema = z.object({
  events: z.array(EconomicEventSchema),
  meta: z.object({
    start: z.string(),
    end: z.string(),
    count: z.number(),
    lastUpdated: z.string(),
  }),
});

const EventDetailSchema = z.object({
  event: EconomicEventSchema,
});

const HistoricalObservationSchema = z.object({
  date: z.string(),
  value: z.number(),
});

const EventHistorySchema = z.object({
  seriesId: z.string(),
  seriesName: z.string(),
  unit: z.string(),
  observations: z.array(HistoricalObservationSchema),
});

const ErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
});

// ============================================
// Routes
// ============================================

const app = new OpenAPIHono();

// GET /api/economic-calendar - List events
const listEventsRoute = createRoute({
  method: "get",
  path: "/",
  request: {
    query: EventsQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: EventsResponseSchema } },
      description: "Economic calendar events",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Invalid request parameters",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Service unavailable",
    },
  },
  tags: ["Economic Calendar"],
});

// @ts-expect-error - Hono OpenAPI multi-response type inference limitation
app.openapi(listEventsRoute, async (c) => {
  const { start, end, country, impact } = c.req.valid("query");

  // Validate date range (max 90 days)
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays > 90) {
    return c.json({ error: "INVALID_RANGE", message: "Date range cannot exceed 90 days" }, 400);
  }

  if (diffDays < 0) {
    return c.json({ error: "INVALID_RANGE", message: "End date must be after start date" }, 400);
  }

  try {
    const service = getEconomicCalendarService();
    const result = await service.getEvents({ start, end, country, impact });

    log.debug({ start, end, count: result.events.length }, "Fetched economic calendar events");

    return c.json(result);
  } catch (error) {
    log.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to fetch economic calendar"
    );
    return c.json(
      { error: "SERVICE_UNAVAILABLE", message: "Economic calendar service unavailable" },
      503
    );
  }
});

// GET /api/economic-calendar/:id - Get single event
const getEventRoute = createRoute({
  method: "get",
  path: "/:id",
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: EventDetailSchema } },
      description: "Economic calendar event detail",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Event not found",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Service unavailable",
    },
  },
  tags: ["Economic Calendar"],
});

// @ts-expect-error - Hono OpenAPI multi-response type inference limitation
app.openapi(getEventRoute, async (c) => {
  const { id } = c.req.valid("param");

  try {
    const service = getEconomicCalendarService();
    const event = await service.getEvent(id);

    if (!event) {
      return c.json({ error: "NOT_FOUND", message: `Event ${id} not found` }, 404);
    }

    log.debug({ id }, "Fetched economic calendar event");

    return c.json({ event });
  } catch (error) {
    log.error(
      { error: error instanceof Error ? error.message : String(error), id },
      "Failed to fetch economic calendar event"
    );
    return c.json(
      { error: "SERVICE_UNAVAILABLE", message: "Economic calendar service unavailable" },
      503
    );
  }
});

// GET /api/economic-calendar/:id/history - Get event historical data
const getEventHistoryRoute = createRoute({
  method: "get",
  path: "/:id/history",
  request: {
    params: z.object({
      id: z.string(),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: EventHistorySchema } },
      description: "Historical observations for the event's primary series",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Event or history not found",
    },
    503: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "Service unavailable",
    },
  },
  tags: ["Economic Calendar"],
});

// @ts-expect-error - Hono OpenAPI multi-response type inference limitation
app.openapi(getEventHistoryRoute, async (c) => {
  const { id } = c.req.valid("param");

  try {
    const service = getEconomicCalendarService();
    const history = await service.getEventHistory(id);

    if (!history) {
      return c.json({ error: "NOT_FOUND", message: `History for event ${id} not found` }, 404);
    }

    log.debug({ id, seriesId: history.seriesId }, "Fetched event history");

    return c.json(history);
  } catch (error) {
    log.error(
      { error: error instanceof Error ? error.message : String(error), id },
      "Failed to fetch event history"
    );
    return c.json(
      { error: "SERVICE_UNAVAILABLE", message: "Economic calendar service unavailable" },
      503
    );
  }
});

export default app;
