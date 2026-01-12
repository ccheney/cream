/**
 * Economic Calendar Service
 *
 * Service for fetching economic calendar events from FMP API.
 * Provides filtering by country, impact level, and category.
 *
 * @see docs/plans/41-economic-calendar-page.md
 */

import { createFmpClientFromEnv, type EconomicCalendarEvent } from "@cream/marketdata";
import log from "../logger.js";

// ============================================
// Types
// ============================================

export type ImpactLevel = "high" | "medium" | "low";

export interface EconomicCalendarFilters {
  start: string;
  end: string;
  country?: string;
  impact?: ImpactLevel[];
}

export interface EconomicCalendarResult {
  events: TransformedEvent[];
  meta: {
    start: string;
    end: string;
    count: number;
    lastUpdated: string;
  };
}

export interface TransformedEvent {
  id: string;
  name: string;
  date: string;
  time: string;
  country: string;
  impact: ImpactLevel;
  actual: string | null;
  previous: string | null;
  forecast: string | null;
  unit: string | null;
}

// ============================================
// Service
// ============================================

export class EconomicCalendarService {
  private static instance: EconomicCalendarService;

  static getInstance(): EconomicCalendarService {
    if (!EconomicCalendarService.instance) {
      EconomicCalendarService.instance = new EconomicCalendarService();
    }
    return EconomicCalendarService.instance;
  }

  /**
   * Fetch economic calendar events with filters.
   */
  async getEvents(filters: EconomicCalendarFilters): Promise<EconomicCalendarResult> {
    const { start, end, country, impact } = filters;

    try {
      const client = createFmpClientFromEnv();
      const events = await client.getEconomicCalendar({
        from: start,
        to: end,
        country: country ?? "US",
      });

      // Transform and filter events
      let transformed = events.map(this.transformEvent);

      // Filter by impact if specified
      if (impact && impact.length > 0) {
        const impactSet = new Set(impact);
        transformed = transformed.filter((e) => impactSet.has(e.impact));
      }

      // Sort by date/time
      transformed.sort((a, b) => {
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) {
          return dateCompare;
        }
        return a.time.localeCompare(b.time);
      });

      return {
        events: transformed,
        meta: {
          start,
          end,
          count: transformed.length,
          lastUpdated: new Date().toISOString(),
        },
      };
    } catch (error) {
      log.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Failed to fetch economic calendar"
      );
      throw error;
    }
  }

  /**
   * Get a single event by ID.
   */
  async getEvent(id: string): Promise<TransformedEvent | null> {
    // Parse ID to extract date info: format is "YYYY-MM-DD-event-name"
    const dateMatch = id.match(/^(\d{4}-\d{2}-\d{2})-/);
    if (!dateMatch) {
      return null;
    }

    const date = dateMatch[1]!;
    const events = await this.getEvents({ start: date, end: date });

    return events.events.find((e) => e.id === id) ?? null;
  }

  /**
   * Transform FMP event to our format.
   */
  private transformEvent(event: EconomicCalendarEvent): TransformedEvent {
    // Extract time from date if present (format: "YYYY-MM-DD HH:MM:SS")
    const [datePart, timePart] = event.date.includes(" ")
      ? event.date.split(" ")
      : [event.date, "00:00:00"];

    // Generate stable ID from date and event name
    const id = `${datePart}-${event.event.toLowerCase().replace(/\s+/g, "-")}`;

    // Map FMP impact to our format
    const impactMap: Record<string, ImpactLevel> = {
      High: "high",
      Medium: "medium",
      Low: "low",
    };

    return {
      id,
      name: event.event,
      date: datePart ?? event.date,
      time: timePart ?? "00:00:00",
      country: event.country,
      impact: impactMap[event.impact ?? "Medium"] ?? "medium",
      actual: event.actual != null ? String(event.actual) : null,
      previous: event.previous != null ? String(event.previous) : null,
      forecast: event.estimate != null ? String(event.estimate) : null,
      unit: event.unit ?? null,
    };
  }
}

/**
 * Get the economic calendar service instance.
 */
export function getEconomicCalendarService(): EconomicCalendarService {
  return EconomicCalendarService.getInstance();
}
