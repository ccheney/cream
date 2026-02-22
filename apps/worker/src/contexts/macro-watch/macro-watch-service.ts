/**
 * MacroWatch Service
 *
 * Runs lightweight overnight market scans during market close.
 * Accumulates entries to database for morning newspaper compilation.
 * Ingests news items to HelixDB for vector search.
 */

import { createNewsIngestionService, type HelixClient, type NewsItemInput } from "@cream/helix";
import { type MacroWatchEntry, runMacroWatch } from "@cream/mastra";
import { type Database, MacroWatchRepository } from "@cream/storage";

import { log } from "../../shared/logger.js";

export interface MacroWatchServiceConfig {
	maxEntriesPerHour?: number;
}

export interface MacroWatchResult {
	entries: MacroWatchEntry[];
	saved: number;
	helixIngested: number;
}

const EMPTY_RESULT: MacroWatchResult = { entries: [], saved: 0, helixIngested: 0 };

/**
 * Convert MacroWatchEntry to NewsItemInput for HelixDB ingestion
 */
function toNewsItemInput(entry: MacroWatchEntry): NewsItemInput {
	const metadata = entry.metadata as {
		articleId?: string;
		summary?: string;
	} | null;

	return {
		itemId: String(metadata?.articleId ?? entry.id ?? crypto.randomUUID()),
		headline: entry.headline,
		bodyText: metadata?.summary ?? "",
		publishedAt: new Date(entry.timestamp),
		source: entry.source,
		relatedSymbols: entry.symbols,
		sentimentScore: 0, // No sentiment in MacroWatch entries - HelixDB will handle
	};
}

export class MacroWatchService {
	private running = false;
	private lastRun: Date | null = null;
	private getDb: (() => Database) | null = null;
	private getHelix: (() => HelixClient | null) | null = null;
	private config: MacroWatchServiceConfig;

	constructor(config: MacroWatchServiceConfig = {}) {
		this.config = config;
	}

	setDbProvider(getDb: () => Database): void {
		this.getDb = getDb;
	}

	setHelixProvider(getHelix: () => HelixClient | null): void {
		this.getHelix = getHelix;
	}

	private getSinceTimestamp(): Date {
		return this.lastRun ?? new Date(Date.now() - 60 * 60 * 1000);
	}

	private limitEntries(entries: MacroWatchEntry[]): MacroWatchEntry[] {
		const maxEntries = this.config.maxEntriesPerHour;
		return maxEntries ? entries.slice(0, maxEntries) : entries;
	}

	private async saveEntries(entries: MacroWatchEntry[]): Promise<number> {
		if (!this.getDb || entries.length === 0) {
			return 0;
		}

		const repo = new MacroWatchRepository(this.getDb());
		return repo.saveEntries(entries);
	}

	private async ingestNewsToHelix(entries: MacroWatchEntry[]): Promise<number> {
		if (!this.getHelix) {
			return 0;
		}

		const helixClient = this.getHelix();
		if (!helixClient) {
			return 0;
		}

		const newsEntries = entries.filter((entry) => entry.category === "NEWS");
		if (newsEntries.length === 0) {
			return 0;
		}

		try {
			const newsInputs = newsEntries.map(toNewsItemInput);
			const newsService = createNewsIngestionService(helixClient);
			const ingestionResult = await newsService.ingestNews(newsInputs, {
				deduplicateByHeadline: true,
				createCompanyEdges: true,
			});

			if (ingestionResult.errors.length > 0) {
				log.warn(
					{ errors: ingestionResult.errors.slice(0, 5) },
					"Some news items failed to ingest to HelixDB",
				);
			}

			log.info(
				{
					newsCount: newsEntries.length,
					ingested: ingestionResult.itemsIngested,
					duplicatesSkipped: ingestionResult.duplicatesSkipped,
					edgesCreated: ingestionResult.edgesCreated,
				},
				"News items ingested to HelixDB",
			);

			return ingestionResult.itemsIngested;
		} catch (error) {
			log.error(
				{ error: error instanceof Error ? error.message : String(error) },
				"HelixDB news ingestion failed",
			);
			return 0;
		}
	}

	private logCycleSummary(
		entries: MacroWatchEntry[],
		saved: number,
		helixIngested: number,
		totalCount: number,
	): void {
		log.info(
			{
				entryCount: entries.length,
				savedCount: saved,
				helixIngested,
				totalCount,
			},
			"Macro watch cycle complete",
		);
	}

	/**
	 * Run a macro watch scan for the given symbols.
	 * Scans for news, prediction market changes, economic calendar, and movers.
	 * Saves entries to database for newspaper compilation.
	 */
	async run(symbols: string[]): Promise<MacroWatchResult> {
		if (this.running) {
			log.info({}, "Skipping macro watch - previous run still in progress");
			return EMPTY_RESULT;
		}

		this.running = true;
		const since = this.getSinceTimestamp();
		this.lastRun = new Date();

		try {
			const result = await runMacroWatch(symbols, since.toISOString());
			const limitedEntries = this.limitEntries(result.entries);
			const saved = await this.saveEntries(limitedEntries);
			const helixIngested = await this.ingestNewsToHelix(limitedEntries);
			this.logCycleSummary(limitedEntries, saved, helixIngested, result.totalCount);
			return { entries: limitedEntries, saved, helixIngested };
		} catch (error) {
			log.error(
				{ error: error instanceof Error ? error.message : String(error) },
				"Macro watch failed",
			);
			return EMPTY_RESULT;
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
