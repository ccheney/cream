/**
 * MacroWatch Service
 *
 * Runs lightweight overnight market scans during market close.
 * Accumulates entries to database for morning newspaper compilation.
 */

import { type MacroWatchEntry, runMacroWatch } from "@cream/api";
import { type Database, MacroWatchRepository } from "@cream/storage";

import { log } from "../../shared/logger.js";

export interface MacroWatchServiceConfig {
	maxEntriesPerHour?: number;
}

export interface MacroWatchResult {
	entries: MacroWatchEntry[];
	saved: number;
}

export class MacroWatchService {
	private running = false;
	private lastRun: Date | null = null;
	private getDb: (() => Database) | null = null;
	private config: MacroWatchServiceConfig;

	constructor(config: MacroWatchServiceConfig = {}) {
		this.config = config;
	}

	setDbProvider(getDb: () => Database): void {
		this.getDb = getDb;
	}

	/**
	 * Run a macro watch scan for the given symbols.
	 * Scans for news, prediction market changes, economic calendar, and movers.
	 * Saves entries to database for newspaper compilation.
	 */
	async run(symbols: string[]): Promise<MacroWatchResult> {
		if (this.running) {
			log.info({}, "Skipping macro watch - previous run still in progress");
			return { entries: [], saved: 0 };
		}

		this.running = true;
		const since = this.lastRun ?? new Date(Date.now() - 60 * 60 * 1000);
		this.lastRun = new Date();

		try {
			const result = await runMacroWatch(symbols, since.toISOString());
			const entries = result.entries;
			const maxEntries = this.config.maxEntriesPerHour;
			const limitedEntries = maxEntries ? entries.slice(0, maxEntries) : entries;

			let saved = 0;
			if (this.getDb && limitedEntries.length > 0) {
				const db = this.getDb();
				const repo = new MacroWatchRepository(db);
				saved = await repo.saveEntries(limitedEntries);
			}

			log.info(
				{
					entryCount: limitedEntries.length,
					savedCount: saved,
					totalCount: result.totalCount,
				},
				"Macro watch cycle complete"
			);

			return { entries: limitedEntries, saved };
		} catch (error) {
			log.error(
				{ error: error instanceof Error ? error.message : String(error) },
				"Macro watch failed"
			);
			return { entries: [], saved: 0 };
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

export function createMacroWatchService(config: MacroWatchServiceConfig = {}): MacroWatchService {
	return new MacroWatchService(config);
}
