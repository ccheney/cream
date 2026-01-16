/**
 * MacroWatch Service
 *
 * Runs lightweight overnight market scans during market close.
 * Accumulates entries to database for morning newspaper compilation.
 */

import { type MacroWatchEntry, runMacroWatch } from "@cream/api";

import { log } from "../../shared/logger.js";

export interface MacroWatchServiceConfig {
	maxEntriesPerHour?: number;
}

export class MacroWatchService {
	private running = false;
	private lastRun: Date | null = null;
	private readonly config: MacroWatchServiceConfig;

	constructor(config: MacroWatchServiceConfig = {}) {
		this.config = config;
	}

	/**
	 * Run a macro watch scan for the given symbols.
	 * Scans for news, prediction market changes, economic calendar, and movers.
	 */
	async run(symbols: string[]): Promise<MacroWatchEntry[]> {
		if (this.running) {
			log.info({}, "Skipping macro watch - previous run still in progress");
			return [];
		}

		this.running = true;
		const since = this.lastRun ?? new Date(Date.now() - 60 * 60 * 1000);
		this.lastRun = new Date();

		try {
			const result = await runMacroWatch(symbols, since.toISOString());

			log.info(
				{
					entryCount: result.entries.length,
					totalCount: result.totalCount,
				},
				"Macro watch cycle complete"
			);

			return result.entries;
		} catch (error) {
			log.error(
				{ error: error instanceof Error ? error.message : String(error) },
				"Macro watch failed"
			);
			return [];
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
