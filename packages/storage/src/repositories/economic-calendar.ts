/**
 * Economic Calendar Repository (Drizzle ORM)
 *
 * Data access for cached FRED economic calendar events.
 * Provides methods for fetching, upserting, and managing cached data.
 */
import { and, eq, gte, lte, max, sql } from "drizzle-orm";
import { type Database, getDb } from "../db";
import { economicCalendarCache } from "../schema/external";

// ============================================
// Types
// ============================================

export type ImpactLevel = "high" | "medium" | "low";

export interface EconomicCalendarEvent {
	id: string;
	releaseId: number;
	releaseName: string;
	releaseDate: string;
	releaseTime: string;
	impact: ImpactLevel;
	country: string;
	actual: string | null;
	previous: string | null;
	forecast: string | null;
	unit: string | null;
	fetchedAt: string;
	createdAt: string;
	updatedAt: string;
}

export interface CreateEconomicCalendarEventInput {
	releaseId: number;
	releaseName: string;
	releaseDate: string;
	releaseTime: string;
	impact: ImpactLevel;
	country?: string;
	actual?: string | null;
	previous?: string | null;
	forecast?: string | null;
	unit?: string | null;
	fetchedAt: string;
}

export interface EconomicCalendarFilters {
	startDate?: string;
	endDate?: string;
	impact?: ImpactLevel[];
	country?: string;
}

// ============================================
// Row Mappers
// ============================================

type EconomicCalendarRow = typeof economicCalendarCache.$inferSelect;

function mapRow(row: EconomicCalendarRow): EconomicCalendarEvent {
	return {
		id: row.id,
		releaseId: row.releaseId,
		releaseName: row.releaseName,
		releaseDate: row.releaseDate,
		releaseTime: row.releaseTime,
		impact: row.impact as ImpactLevel,
		country: row.country,
		actual: row.actual,
		previous: row.previous,
		forecast: row.forecast,
		unit: row.unit,
		fetchedAt: row.fetchedAt.toISOString(),
		createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
		updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
	};
}

// ============================================
// Repository
// ============================================

export class EconomicCalendarRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	/**
	 * Get cached events within a date range.
	 */
	async getEvents(
		startDate: string,
		endDate: string,
		filters?: Omit<EconomicCalendarFilters, "startDate" | "endDate">
	): Promise<EconomicCalendarEvent[]> {
		const conditions = [
			gte(economicCalendarCache.releaseDate, startDate),
			lte(economicCalendarCache.releaseDate, endDate),
		];

		if (filters?.impact && filters.impact.length > 0) {
			conditions.push(
				sql`${economicCalendarCache.impact} IN (${sql.join(
					filters.impact.map((i) => sql`${i}`),
					sql`, `
				)})`
			);
		}

		if (filters?.country) {
			conditions.push(eq(economicCalendarCache.country, filters.country));
		}

		const rows = await this.db
			.select()
			.from(economicCalendarCache)
			.where(and(...conditions))
			.orderBy(economicCalendarCache.releaseDate, economicCalendarCache.releaseTime);

		return rows.map(mapRow);
	}

	/**
	 * Bulk upsert events from FRED fetch.
	 * Uses release_id + release_date as unique key for upsert.
	 */
	async upsertEvents(events: CreateEconomicCalendarEventInput[]): Promise<number> {
		if (events.length === 0) {
			return 0;
		}

		const values = events.map((e) => ({
			releaseId: e.releaseId,
			releaseName: e.releaseName,
			releaseDate: e.releaseDate,
			releaseTime: e.releaseTime,
			impact: e.impact,
			country: e.country ?? "US",
			actual: e.actual ?? null,
			previous: e.previous ?? null,
			forecast: e.forecast ?? null,
			unit: e.unit ?? null,
			fetchedAt: new Date(e.fetchedAt),
			updatedAt: new Date(),
		}));

		const result = await this.db
			.insert(economicCalendarCache)
			.values(values)
			.onConflictDoUpdate({
				target: [economicCalendarCache.releaseId, economicCalendarCache.releaseDate],
				set: {
					releaseName: sql`EXCLUDED.release_name`,
					releaseTime: sql`EXCLUDED.release_time`,
					impact: sql`EXCLUDED.impact`,
					country: sql`EXCLUDED.country`,
					actual: sql`EXCLUDED.actual`,
					previous: sql`EXCLUDED.previous`,
					forecast: sql`EXCLUDED.forecast`,
					unit: sql`EXCLUDED.unit`,
					fetchedAt: sql`EXCLUDED.fetched_at`,
					updatedAt: sql`EXCLUDED.updated_at`,
				},
			})
			.returning({ id: economicCalendarCache.id });

		return result.length;
	}

	/**
	 * Get the most recent fetch timestamp.
	 */
	async getLastFetchTime(): Promise<Date | null> {
		const [result] = await this.db
			.select({ maxFetchedAt: max(economicCalendarCache.fetchedAt) })
			.from(economicCalendarCache);

		return result?.maxFetchedAt ?? null;
	}

	/**
	 * Check if cache is stale (older than specified hours).
	 */
	async isCacheStale(maxAgeHours: number): Promise<boolean> {
		const lastFetch = await this.getLastFetchTime();
		if (!lastFetch) {
			return true;
		}

		const ageMs = Date.now() - lastFetch.getTime();
		const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
		return ageMs > maxAgeMs;
	}

	/**
	 * Delete events older than a specified date.
	 */
	async clearOldEvents(beforeDate: string): Promise<number> {
		const result = await this.db
			.delete(economicCalendarCache)
			.where(lte(economicCalendarCache.releaseDate, beforeDate))
			.returning({ id: economicCalendarCache.id });

		return result.length;
	}

	/**
	 * Get upcoming high-impact events within the next N hours.
	 */
	async getUpcomingHighImpactEvents(hoursAhead = 24): Promise<EconomicCalendarEvent[]> {
		const now = new Date();
		const futureDate = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

		const todayStr = now.toISOString().split("T")[0] ?? "";
		const futureDateStr = futureDate.toISOString().split("T")[0] ?? "";

		const rows = await this.db
			.select()
			.from(economicCalendarCache)
			.where(
				and(
					gte(economicCalendarCache.releaseDate, todayStr),
					lte(economicCalendarCache.releaseDate, futureDateStr),
					eq(economicCalendarCache.impact, "high")
				)
			)
			.orderBy(economicCalendarCache.releaseDate, economicCalendarCache.releaseTime);

		return rows.map(mapRow);
	}

	/**
	 * Get cache statistics.
	 */
	async getStats(): Promise<{
		totalEvents: number;
		oldestEvent: string | null;
		newestEvent: string | null;
		lastFetchedAt: string | null;
		highImpactCount: number;
		mediumImpactCount: number;
		lowImpactCount: number;
	}> {
		const [countResult] = await this.db
			.select({ count: sql<number>`COUNT(*)` })
			.from(economicCalendarCache);

		const [dateRange] = await this.db
			.select({
				oldest: sql<string>`MIN(${economicCalendarCache.releaseDate})`,
				newest: sql<string>`MAX(${economicCalendarCache.releaseDate})`,
				lastFetch: max(economicCalendarCache.fetchedAt),
			})
			.from(economicCalendarCache);

		const impactCounts = await this.db
			.select({
				impact: economicCalendarCache.impact,
				count: sql<number>`COUNT(*)`,
			})
			.from(economicCalendarCache)
			.groupBy(economicCalendarCache.impact);

		const impactMap = new Map(impactCounts.map((r) => [r.impact, Number(r.count)]));

		return {
			totalEvents: Number(countResult?.count ?? 0),
			oldestEvent: dateRange?.oldest ?? null,
			newestEvent: dateRange?.newest ?? null,
			lastFetchedAt: dateRange?.lastFetch?.toISOString() ?? null,
			highImpactCount: impactMap.get("high") ?? 0,
			mediumImpactCount: impactMap.get("medium") ?? 0,
			lowImpactCount: impactMap.get("low") ?? 0,
		};
	}
}
