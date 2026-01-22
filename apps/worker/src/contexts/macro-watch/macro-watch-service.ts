/**
 * MacroWatch Service
 *
 * Runs lightweight overnight market scans during market close.
 * Accumulates entries to database for morning newspaper compilation.
 * Ingests news items to HelixDB for vector search.
 */

import { type MacroWatchEntry, runMacroWatch } from "@cream/api";
import { createNewsIngestionService, type HelixClient, type NewsItemInput } from "@cream/helix";
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

/**
 * Convert MacroWatchEntry to NewsItemInput for HelixDB ingestion
 */
function toNewsItemInput(entry: MacroWatchEntry): NewsItemInput {
	const metadata = entry.metadata as {
		articleId?: string;
		summary?: string;
	} | null;

	return {
		itemId: metadata?.articleId ?? entry.id ?? crypto.randomUUID(),
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

	/**
	 * Run a macro watch scan for the given symbols.
	 * Scans for news, prediction market changes, economic calendar, and movers.
	 * Saves entries to database for newspaper compilation.
	 */
	async run(symbols: string[]): Promise<MacroWatchResult> {
		if (this.running) {
			log.info({}, "Skipping macro watch - previous run still in progress");
			return { entries: [], saved: 0, helixIngested: 0 };
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

			// Ingest news entries to HelixDB for vector search
			let helixIngested = 0;
			const newsEntries = limitedEntries.filter((e) => e.category === "NEWS");
			if (this.getHelix && newsEntries.length > 0) {
				const helixClient = this.getHelix();
				if (helixClient) {
					try {
						const newsInputs = newsEntries.map(toNewsItemInput);
						const newsService = createNewsIngestionService(helixClient);
						const ingestionResult = await newsService.ingestNews(newsInputs, {
							deduplicateByHeadline: true,
							createCompanyEdges: true,
						});
						helixIngested = ingestionResult.itemsIngested;

						if (ingestionResult.errors.length > 0) {
							log.warn(
								{ errors: ingestionResult.errors.slice(0, 5) },
								"Some news items failed to ingest to HelixDB",
							);
						}

						log.info(
							{
								newsCount: newsEntries.length,
								ingested: helixIngested,
								duplicatesSkipped: ingestionResult.duplicatesSkipped,
								edgesCreated: ingestionResult.edgesCreated,
							},
							"News items ingested to HelixDB",
						);
					} catch (error) {
						log.error(
							{ error: error instanceof Error ? error.message : String(error) },
							"HelixDB news ingestion failed",
						);
					}
				}
			}

			log.info(
				{
					entryCount: limitedEntries.length,
					savedCount: saved,
					helixIngested,
					totalCount: result.totalCount,
				},
				"Macro watch cycle complete",
			);

			return { entries: limitedEntries, saved, helixIngested };
		} catch (error) {
			log.error(
				{ error: error instanceof Error ? error.message : String(error) },
				"Macro watch failed",
			);
			return { entries: [], saved: 0, helixIngested: 0 };
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
