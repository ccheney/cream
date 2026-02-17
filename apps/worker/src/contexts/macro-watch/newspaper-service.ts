/**
 * Newspaper Service
 *
 * Compiles overnight MacroWatch entries into a morning newspaper digest.
 * Runs near market open (9:00-9:30 AM ET) before the first RTH OODA cycle.
 */

import { getCalendarService } from "@cream/domain";
import { compileMorningNewspaper, formatNewspaperForLLM } from "@cream/mastra";
import { MacroWatchRepository } from "@cream/storage";

import { log } from "../../shared/logger.js";

export interface NewspaperServiceConfig {
	maxBulletsPerSection?: number;
}

export interface NewspaperCompileResult {
	compiled: boolean;
	entryCount: number;
	message: string;
}

export class NewspaperService {
	private running = false;
	private lastCompile: Date | null = null;
	private config: NewspaperServiceConfig;

	constructor(config: NewspaperServiceConfig = {}) {
		this.config = config;
	}

	private createSkippedResult(message: string): NewspaperCompileResult {
		return { compiled: false, entryCount: 0, message };
	}

	private async getEntriesSincePreviousClose(
		repo: MacroWatchRepository,
	): Promise<Awaited<ReturnType<MacroWatchRepository["getEntriesSinceClose"]>>> {
		const calendar = getCalendarService();
		if (!calendar) {
			throw new Error("CalendarService not available");
		}

		const prevClose = await calendar.getPreviousTradingDay(new Date());
		const prevCloseTime = new Date(prevClose);
		prevCloseTime.setUTCHours(21, 0, 0, 0);
		return repo.getEntriesSinceClose(prevCloseTime.toISOString());
	}

	private applySectionLimit(compiled: ReturnType<typeof compileMorningNewspaper>): void {
		const maxBulletsPerSection = this.config.maxBulletsPerSection;
		if (!maxBulletsPerSection || maxBulletsPerSection <= 0) {
			return;
		}

		const limitedSections = {
			macro: compiled.storageInput.sections.macro.slice(0, maxBulletsPerSection),
			universe: compiled.storageInput.sections.universe.slice(0, maxBulletsPerSection),
			predictionMarkets: compiled.storageInput.sections.predictionMarkets.slice(
				0,
				maxBulletsPerSection,
			),
			economicCalendar: compiled.storageInput.sections.economicCalendar.slice(
				0,
				maxBulletsPerSection,
			),
		};

		compiled.storageInput.sections = limitedSections;
		compiled.content.sections = {
			macro: limitedSections.macro.join("\n"),
			universe: limitedSections.universe.join("\n"),
			predictionMarkets: limitedSections.predictionMarkets.join("\n"),
			economicCalendar: limitedSections.economicCalendar.join("\n"),
		};
		compiled.content.summary = formatNewspaperForLLM(limitedSections);
	}

	private buildSuccessResult(content: {
		entryCount: number;
		sections: { macro: string; universe: string };
	}): NewspaperCompileResult {
		return {
			compiled: true,
			entryCount: content.entryCount,
			message: `Compiled ${content.entryCount} entries (${content.sections.macro.length} macro, ${content.sections.universe.length} universe)`,
		};
	}

	/**
	 * Compile the morning newspaper from overnight MacroWatch entries.
	 * Fetches all entries since previous market close and summarizes them.
	 *
	 * @returns Result indicating what happened during compilation
	 * @throws Error if compilation fails
	 */
	async compile(symbols: string[]): Promise<NewspaperCompileResult> {
		if (this.running) {
			log.info({}, "Skipping newspaper compilation - already running");
			return this.createSkippedResult("Already running");
		}

		this.running = true;

		try {
			const repo = new MacroWatchRepository();
			const entries = await this.getEntriesSincePreviousClose(repo);

			if (entries.length === 0) {
				log.info({}, "No overnight entries to compile");
				return this.createSkippedResult("No overnight entries to compile");
			}

			const compiled = compileMorningNewspaper(entries, symbols);
			this.applySectionLimit(compiled);

			await repo.upsertNewspaper(compiled.storageInput);

			this.lastCompile = new Date();

			log.info(
				{
					date: compiled.content.date,
					entryCount: compiled.content.entryCount,
					macroCount: compiled.content.sections.macro.length,
					universeCount: compiled.content.sections.universe.length,
				},
				"Morning newspaper compiled",
			);

			return this.buildSuccessResult(compiled.content);
		} catch (error) {
			if (error instanceof Error && error.message === "CalendarService not available") {
				log.warn({}, "CalendarService not available, cannot compile newspaper");
				return this.createSkippedResult("CalendarService not available");
			}

			log.error(
				{ error: error instanceof Error ? error.message : String(error) },
				"Newspaper compilation failed",
			);
			return {
				compiled: false,
				entryCount: 0,
				message: `Compilation failed: ${error instanceof Error ? error.message : String(error)}`,
			};
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
