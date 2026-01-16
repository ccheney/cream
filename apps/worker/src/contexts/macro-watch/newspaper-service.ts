/**
 * Newspaper Service
 *
 * Compiles overnight MacroWatch entries into a morning newspaper digest.
 * Runs near market open (9:00-9:30 AM ET) before the first RTH OODA cycle.
 */

import { compileMorningNewspaper, getMacroWatchRepo } from "@cream/api";
import { getCalendarService } from "@cream/domain";

import { log } from "../../shared/logger.js";

export interface NewspaperServiceConfig {
	maxBulletsPerSection?: number;
}

export class NewspaperService {
	private running = false;
	private lastCompile: Date | null = null;
	private readonly config: NewspaperServiceConfig;

	constructor(config: NewspaperServiceConfig = {}) {
		this.config = config;
	}

	/**
	 * Compile the morning newspaper from overnight MacroWatch entries.
	 * Fetches all entries since previous market close and summarizes them.
	 */
	async compile(symbols: string[]): Promise<void> {
		if (this.running) {
			log.info({}, "Skipping newspaper compilation - already running");
			return;
		}

		this.running = true;

		try {
			const calendar = getCalendarService();
			if (!calendar) {
				log.warn({}, "CalendarService not available, cannot compile newspaper");
				return;
			}

			const prevClose = await calendar.getPreviousTradingDay(new Date());
			const prevCloseTime = new Date(prevClose);
			// Set to 4:00 PM ET (market close)
			prevCloseTime.setUTCHours(21, 0, 0, 0); // 4 PM ET = 21:00 UTC

			// Fetch all entries since previous close
			const repo = await getMacroWatchRepo();
			const entries = await repo.getEntriesSinceClose(prevCloseTime.toISOString());

			if (entries.length === 0) {
				log.info({}, "No overnight entries to compile");
				return;
			}

			// Compile the newspaper
			const { content, storageInput } = compileMorningNewspaper(entries, symbols);

			// Save to database
			await repo.saveNewspaper(storageInput);

			this.lastCompile = new Date();

			log.info(
				{
					date: content.date,
					entryCount: content.entryCount,
					macroCount: content.sections.macro.length,
					universeCount: content.sections.universe.length,
				},
				"Morning newspaper compiled"
			);
		} catch (error) {
			log.error(
				{ error: error instanceof Error ? error.message : String(error) },
				"Newspaper compilation failed"
			);
		} finally {
			this.running = false;
		}
	}

	isRunning(): boolean {
		return this.running;
	}

	getLastCompile(): Date | null {
		return this.lastCompile;
	}
}

export function createNewspaperService(config: NewspaperServiceConfig = {}): NewspaperService {
	return new NewspaperService(config);
}
