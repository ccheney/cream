/**
 * Economic Calendar Service
 *
 * Service for fetching economic calendar events from the database cache.
 * Falls back to FRED API if cache is stale or empty.
 *
 * @see docs/plans/41-economic-calendar-page.md
 */

import { type EconomicEvent, getFredEconomicCalendar } from "@cream/agents";
import { createContext, requireEnv } from "@cream/domain";
import {
	type CreateEconomicCalendarEventInput,
	type EconomicCalendarEvent,
	EconomicCalendarRepository,
} from "@cream/storage";
import { createFREDClientFromEnv, getReleaseById } from "@cream/universe";
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

export interface HistoricalObservation {
	date: string;
	value: number;
}

export interface EventHistoryResult {
	seriesId: string;
	seriesName: string;
	unit: string;
	observations: HistoricalObservation[];
}

// ============================================
// Cache Configuration
// ============================================

/** Cache is considered stale after 12 hours */
const CACHE_STALE_HOURS = 12;

// ============================================
// Service
// ============================================

export class EconomicCalendarService {
	private static instance: EconomicCalendarService;
	private repo: EconomicCalendarRepository;
	private refreshing = false;

	constructor() {
		this.repo = new EconomicCalendarRepository();
	}

	static getInstance(): EconomicCalendarService {
		if (!EconomicCalendarService.instance) {
			EconomicCalendarService.instance = new EconomicCalendarService();
		}
		return EconomicCalendarService.instance;
	}

	/**
	 * Fetch economic calendar events with filters.
	 * Uses database cache, refreshing if stale or empty.
	 */
	async getEvents(filters: EconomicCalendarFilters): Promise<EconomicCalendarResult> {
		const { start, end, country = "US", impact } = filters;

		const isStale = await this.repo.isCacheStale(CACHE_STALE_HOURS);

		if (isStale && !this.refreshing) {
			this.triggerRefresh(start, end).catch((error) => {
				log.error(
					{ error: error instanceof Error ? error.message : String(error) },
					"Background cache refresh failed"
				);
			});
		}

		try {
			const events = await this.repo.getEvents(start, end, {
				impact,
				country,
			});

			if (events.length === 0 && isStale) {
				log.debug({}, "Cache empty, fetching from FRED directly");
				const freshEvents = await this.fetchAndCacheEvents(start, end);
				return this.buildResult(freshEvents, start, end, country, impact);
			}

			const transformed = events.map((e) => this.transformCachedEvent(e));
			return this.buildResult(transformed, start, end, country, impact);
		} catch (error) {
			log.error(
				{ error: error instanceof Error ? error.message : String(error) },
				"Failed to fetch economic calendar from cache"
			);
			throw error;
		}
	}

	/**
	 * Trigger a background refresh of the cache.
	 */
	private async triggerRefresh(start: string, end: string): Promise<void> {
		if (this.refreshing) {
			return;
		}

		this.refreshing = true;
		log.info({}, "Triggering economic calendar cache refresh");

		try {
			await this.fetchAndCacheEvents(start, end);
			log.info({}, "Economic calendar cache refresh complete");
		} finally {
			this.refreshing = false;
		}
	}

	/**
	 * Fetch events from FRED and store in cache.
	 */
	private async fetchAndCacheEvents(start: string, end: string): Promise<TransformedEvent[]> {
		const ctx = createContext(requireEnv(), "manual");
		const events = await getFredEconomicCalendar(ctx, start, end);

		const eventsToUpsert: CreateEconomicCalendarEventInput[] = events.map(
			(event: EconomicEvent) => {
				const match = event.id.match(/^fred-(\d+)-/);
				const releaseId = match?.[1] ? Number.parseInt(match[1], 10) : 0;

				return {
					releaseId,
					releaseName: event.name,
					releaseDate: event.date,
					releaseTime: event.time,
					impact: event.impact,
					country: "US",
					actual: event.actual,
					previous: event.previous,
					forecast: event.forecast,
					unit: null,
					fetchedAt: new Date().toISOString(),
				};
			}
		);

		if (eventsToUpsert.length > 0) {
			await this.repo.upsertEvents(eventsToUpsert);
		}

		return events.map((e: EconomicEvent) => this.transformFredEvent(e, "US"));
	}

	/**
	 * Build the result with filtering and sorting applied.
	 */
	private buildResult(
		events: TransformedEvent[],
		start: string,
		end: string,
		_country: string,
		impact?: ImpactLevel[]
	): EconomicCalendarResult {
		let filtered = events;

		if (impact && impact.length > 0) {
			const impactSet = new Set(impact);
			filtered = events.filter((e) => impactSet.has(e.impact));
		}

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
	 * Transform cached event to API format.
	 */
	private transformCachedEvent(event: EconomicCalendarEvent): TransformedEvent {
		return {
			id: `fred-${event.releaseId}-${event.releaseDate}`,
			name: event.releaseName,
			date: event.releaseDate,
			time: event.releaseTime,
			country: event.country,
			impact: event.impact,
			actual: event.actual,
			previous: event.previous,
			forecast: event.forecast,
			unit: event.unit,
		};
	}

	/**
	 * Transform FRED event to API format.
	 */
	private transformFredEvent(event: EconomicEvent, country: string): TransformedEvent {
		return {
			id: event.id,
			name: event.name,
			date: event.date,
			time: event.time,
			country,
			impact: event.impact,
			actual: event.actual,
			previous: event.previous,
			forecast: event.forecast,
			unit: null,
		};
	}

	/**
	 * Get a single event by ID.
	 */
	async getEvent(id: string): Promise<TransformedEvent | null> {
		const dateMatch = id.match(/^fred-\d+-(\d{4}-\d{2}-\d{2})$/);
		const date = dateMatch?.[1];
		if (!date) {
			return null;
		}

		const events = await this.getEvents({ start: date, end: date });

		return events.events.find((e) => e.id === id) ?? null;
	}

	/**
	 * Get cache statistics.
	 */
	async getCacheStats(): Promise<{
		totalEvents: number;
		lastFetchedAt: string | null;
		isStale: boolean;
	}> {
		const stats = await this.repo.getStats();
		const isStale = await this.repo.isCacheStale(CACHE_STALE_HOURS);
		return {
			totalEvents: stats.totalEvents,
			lastFetchedAt: stats.lastFetchedAt,
			isStale,
		};
	}

	/**
	 * Get historical observations for an event's primary series.
	 * Returns the last 12 observations for the release's primary series.
	 */
	async getEventHistory(eventId: string): Promise<EventHistoryResult | null> {
		const match = eventId.match(/^fred-(\d+)-/);
		if (!match) {
			log.warn({ eventId }, "Invalid event ID format for history lookup");
			return null;
		}

		const releaseId = Number.parseInt(match[1] ?? "0", 10);
		const releaseMeta = getReleaseById(releaseId);

		if (!releaseMeta) {
			log.warn({ releaseId }, "Unknown release ID");
			return null;
		}

		const primarySeriesId = releaseMeta.series[0];
		if (!primarySeriesId) {
			log.warn({ releaseId }, "No series defined for release");
			return null;
		}

		try {
			const client = createFREDClientFromEnv();
			const response = await client.getObservations(primarySeriesId, {
				sort_order: "desc",
				limit: 12,
			});

			const observations: HistoricalObservation[] = [];
			for (const obs of response.observations) {
				if (obs.value !== null) {
					const value = Number.parseFloat(obs.value);
					if (!Number.isNaN(value)) {
						observations.push({
							date: obs.date,
							value,
						});
					}
				}
			}

			observations.reverse();

			const SERIES_UNITS: Record<string, string> = {
				CPIAUCSL: "index",
				CPILFESL: "index",
				PAYEMS: "thousands",
				UNRATE: "%",
				GDPC1: "billions",
				FEDFUNDS: "%",
				RSAFS: "millions",
				INDPRO: "index",
				PCE: "billions",
				DGS10: "%",
				HOUST: "thousands",
				DGORDER: "millions",
				PPIACO: "index",
				JTSJOL: "thousands",
				UMCSENT: "index",
			};

			return {
				seriesId: primarySeriesId,
				seriesName: releaseMeta.name,
				unit: SERIES_UNITS[primarySeriesId] ?? "",
				observations,
			};
		} catch (error) {
			log.error(
				{ error: error instanceof Error ? error.message : String(error), eventId },
				"Failed to fetch event history"
			);
			return null;
		}
	}
}

/**
 * Get the economic calendar service instance.
 */
export function getEconomicCalendarService(): EconomicCalendarService {
	return EconomicCalendarService.getInstance();
}
