/**
 * Economic Calendar Service
 *
 * Service for fetching economic calendar events from FRED API.
 * Provides filtering by country, impact level, and category.
 * Includes in-memory caching to reduce API calls.
 *
 * @see docs/plans/41-economic-calendar-page.md
 */

import { createContext, requireEnv } from "@cream/domain";
import { type EconomicEvent, getFredEconomicCalendar } from "@cream/mastra-kit";
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
// Cache Configuration
// ============================================

/** Cache TTL: 24 hours (economic events don't change frequently) */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Maximum cache entries to prevent unbounded memory growth */
const MAX_CACHE_ENTRIES = 100;

interface CacheEntry {
  data: TransformedEvent[];
  timestamp: number;
  country: string;
}

// ============================================
// Service
// ============================================

export class EconomicCalendarService {
  private static instance: EconomicCalendarService;

  /** In-memory cache: key = "country:start:end" */
  private cache = new Map<string, CacheEntry>();

  static getInstance(): EconomicCalendarService {
    if (!EconomicCalendarService.instance) {
      EconomicCalendarService.instance = new EconomicCalendarService();
    }
    return EconomicCalendarService.instance;
  }

  /**
   * Fetch economic calendar events with filters.
   * Uses in-memory cache with 24-hour TTL to reduce API calls.
   */
  async getEvents(filters: EconomicCalendarFilters): Promise<EconomicCalendarResult> {
    const { start, end, country = "US", impact } = filters;
    const cacheKey = this.getCacheKey(country, start, end);

    // Check cache first
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      log.debug({ cacheKey, count: cached.length }, "Economic calendar cache hit");
      return this.buildResult(cached, start, end, impact);
    }

    try {
      // Create execution context for FRED API call
      const ctx = createContext(requireEnv(), "scheduled");

      // Fetch from FRED (US economic data only)
      const events = await getFredEconomicCalendar(ctx, start, end);

      // Transform events
      const transformed = events.map((e) => this.transformEvent(e, country));

      // Store in cache (before filtering by impact)
      this.setInCache(cacheKey, transformed, country);

      log.debug({ cacheKey, count: transformed.length }, "Economic calendar cached");

      return this.buildResult(transformed, start, end, impact);
    } catch (error) {
      log.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Failed to fetch economic calendar"
      );
      throw error;
    }
  }

  /**
   * Build the result with filtering and sorting applied.
   */
  private buildResult(
    events: TransformedEvent[],
    start: string,
    end: string,
    impact?: ImpactLevel[]
  ): EconomicCalendarResult {
    let filtered = events;

    // Filter by impact if specified
    if (impact && impact.length > 0) {
      const impactSet = new Set(impact);
      filtered = events.filter((e) => impactSet.has(e.impact));
    }

    // Sort by date/time
    const sorted = filtered.toSorted((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) {
        return dateCompare;
      }
      return a.time.localeCompare(b.time);
    });

    return {
      events: sorted,
      meta: {
        start,
        end,
        count: sorted.length,
        lastUpdated: new Date().toISOString(),
      },
    };
  }

  /**
   * Generate cache key from country and date range.
   */
  private getCacheKey(country: string, start: string, end: string): string {
    return `${country}:${start}:${end}`;
  }

  /**
   * Get data from cache if not expired.
   */
  private getFromCache(key: string): TransformedEvent[] | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Store data in cache with LRU eviction.
   */
  private setInCache(key: string, data: TransformedEvent[], country: string): void {
    // Evict oldest entries if at capacity
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      country,
    });
  }

  /**
   * Clear the cache (for testing or manual refresh).
   */
  clearCache(): void {
    this.cache.clear();
    log.info("Economic calendar cache cleared");
  }

  /**
   * Get cache statistics (for monitoring).
   */
  getCacheStats(): { size: number; maxSize: number; ttlMs: number } {
    return {
      size: this.cache.size,
      maxSize: MAX_CACHE_ENTRIES,
      ttlMs: CACHE_TTL_MS,
    };
  }

  /**
   * Get a single event by ID.
   */
  async getEvent(id: string): Promise<TransformedEvent | null> {
    // Parse ID to extract date info: format is "YYYY-MM-DD-event-name"
    const dateMatch = id.match(/^(\d{4}-\d{2}-\d{2})-/);
    const date = dateMatch?.[1];
    if (!date) {
      return null;
    }

    const events = await this.getEvents({ start: date, end: date });

    return events.events.find((e) => e.id === id) ?? null;
  }

  /**
   * Transform FRED event to our format.
   */
  private transformEvent(event: EconomicEvent, country: string): TransformedEvent {
    // FRED events already have the correct format
    return {
      id: event.id,
      name: event.name,
      date: event.date,
      time: event.time,
      country, // FRED is US-only, but allow override for consistency
      impact: event.impact,
      actual: event.actual,
      previous: event.previous,
      forecast: event.forecast,
      unit: null, // FRED doesn't provide unit info
    };
  }
}

/**
 * Get the economic calendar service instance.
 */
export function getEconomicCalendarService(): EconomicCalendarService {
  return EconomicCalendarService.getInstance();
}
