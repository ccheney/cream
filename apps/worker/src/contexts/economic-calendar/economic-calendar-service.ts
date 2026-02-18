/**
 * Economic Calendar Service
 *
 * Fetches economic calendar events from FRED and caches them in the database.
 * Runs twice daily to keep the cache fresh (6 AM and 6 PM ET).
 */

import { getFredEconomicCalendar } from "@cream/agents";
import { createContext, requireEnv } from "@cream/domain";
import {
	type CreateEconomicCalendarEventInput,
	type Database,
	EconomicCalendarRepository,
} from "@cream/storage";

import { log } from "../../shared/logger.js";

export interface EconomicCalendarServiceConfig {
	daysAhead?: number;
	daysBehind?: number;
}

export interface EconomicCalendarRefreshResult {
	eventsUpserted: number;
	eventsOldDeleted: number;
	durationMs: number;
}

export class EconomicCalendarService {
	private running = false;
	private lastRun: Date | null = null;
	private getDb: (() => Database) | null = null;
	private config: EconomicCalendarServiceConfig;

	constructor(config: EconomicCalendarServiceConfig = {}) {
		this.config = {
			daysAhead: config.daysAhead ?? 90,
			daysBehind: config.daysBehind ?? 7,
		} as Required<EconomicCalendarServiceConfig>;
	}

	setDbProvider(getDb: () => Database): void {
		this.getDb = getDb;
	}

	private createSkippedResult(): EconomicCalendarRefreshResult {
		return { eventsUpserted: 0, eventsOldDeleted: 0, durationMs: 0 };
	}

	private canRefresh(): boolean {
		if (this.running) {
			log.info({}, "Skipping economic calendar refresh - previous run still in progress");
			return false;
		}

		if (!this.getDb) {
			log.warn({}, "Economic calendar service has no DB provider configured");
			return false;
		}

		return true;
	}

	private resolveDateRange(now: Date): {
		startDateStr: string;
		endDateStr: string;
		deleteBeforeDateStr: string;
	} {
		const cfg = this.config as Required<EconomicCalendarServiceConfig>;
		const dayMs = 24 * 60 * 60 * 1000;

		const startDate = new Date(now.getTime() - cfg.daysBehind * dayMs);
		const endDate = new Date(now.getTime() + cfg.daysAhead * dayMs);
		const deleteBeforeDate = new Date(now.getTime() - (cfg.daysBehind + 30) * dayMs);

		return {
			startDateStr: startDate.toISOString().split("T")[0] ?? "",
			endDateStr: endDate.toISOString().split("T")[0] ?? "",
			deleteBeforeDateStr: deleteBeforeDate.toISOString().split("T")[0] ?? "",
		};
	}

	private toUpsertInput(event: {
		id: string;
		name: string;
		date: string;
		time: string;
		impact: string;
		actual: string | null;
		previous: string | null;
		forecast: string | null;
	}): CreateEconomicCalendarEventInput {
		const match = event.id.match(/^fred-(\d+)-/);
		const releaseId = match?.[1] ? Number.parseInt(match[1], 10) : 0;

		return {
			releaseId,
			releaseName: event.name,
			releaseDate: event.date,
			releaseTime: event.time,
			impact: event.impact as "high" | "medium" | "low",
			country: "US",
			actual: event.actual,
			previous: event.previous,
			forecast: event.forecast,
			unit: null,
			fetchedAt: new Date().toISOString(),
		};
	}

	private async performRefresh(startTime: number): Promise<EconomicCalendarRefreshResult> {
		const ctx = createContext(requireEnv(), "scheduled");
		const now = new Date();
		const { startDateStr, endDateStr, deleteBeforeDateStr } = this.resolveDateRange(now);

		log.info({ startDate: startDateStr, endDate: endDateStr }, "Fetching FRED calendar");
		const events = await getFredEconomicCalendar(ctx, startDateStr, endDateStr);
		const eventsToUpsert = events.map((event) => this.toUpsertInput(event));

		const db = this.getDb as () => Database;
		const repo = new EconomicCalendarRepository(db());

		const eventsUpserted = await repo.upsertEvents(eventsToUpsert);
		const eventsOldDeleted = await repo.clearOldEvents(deleteBeforeDateStr);
		const durationMs = Date.now() - startTime;

		log.info(
			{
				eventsUpserted,
				eventsOldDeleted,
				durationMs,
			},
			"Economic calendar refresh complete",
		);

		return { eventsUpserted, eventsOldDeleted, durationMs };
	}

	/**
	 * Refresh the economic calendar cache by fetching from FRED.
	 */
	async refresh(): Promise<EconomicCalendarRefreshResult> {
		if (!this.canRefresh()) {
			return this.createSkippedResult();
		}

		this.running = true;
		const startTime = Date.now();
		this.lastRun = new Date();

		try {
			return await this.performRefresh(startTime);
		} catch (error) {
			log.error(
				{ error: error instanceof Error ? error.message : String(error) },
				"Economic calendar refresh failed",
			);
			return { eventsUpserted: 0, eventsOldDeleted: 0, durationMs: Date.now() - startTime };
		} finally {
			this.running = false;
		}
	}

	isRunning(): boolean {
		return this.running;
	}

	getLastRun(): Date | null {
		return this.lastRun;
	}
}

export function createEconomicCalendarService(
	config: EconomicCalendarServiceConfig = {},
): EconomicCalendarService {
	return new EconomicCalendarService(config);
}
