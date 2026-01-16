/**
 * SEC Filings Sync
 *
 * Domain service for syncing SEC filings from EDGAR.
 * Fetches filings, chunks them, and ingests into HelixDB.
 */

import type { RuntimeEnvironment } from "@cream/config";
import { createFilingsIngestionService } from "@cream/filings";
import type { Database } from "@cream/storage";
import { log } from "../../shared/logger.js";

// ============================================
// Types
// ============================================

export type FilingType = "10-K" | "10-Q" | "8-K";

export interface FilingsSyncConfig {
	filingTypes: FilingType[];
	limitPerSymbol: number;
}

export interface FilingsSyncResult {
	filingsIngested: number;
	chunksCreated: number;
	durationMs: number;
}

// ============================================
// Filings Sync Service
// ============================================

export class FilingsSyncService {
	private readonly db: Database;
	private readonly config: FilingsSyncConfig;
	private running = false;

	constructor(
		db: Database,
		config: FilingsSyncConfig = { filingTypes: ["10-K", "10-Q", "8-K"], limitPerSymbol: 5 }
	) {
		this.db = db;
		this.config = config;
	}

	isRunning(): boolean {
		return this.running;
	}

	async sync(
		symbols: string[],
		environment: RuntimeEnvironment
	): Promise<FilingsSyncResult | null> {
		if (this.running) {
			log.info({}, "Skipping filings sync - previous run still in progress");
			return null;
		}

		this.running = true;
		log.info({}, "Starting SEC filings sync");

		try {
			const service = createFilingsIngestionService(this.db);

			const result = await service.syncFilings({
				symbols,
				filingTypes: this.config.filingTypes,
				limitPerSymbol: this.config.limitPerSymbol,
				triggerSource: "scheduled",
				environment,
			});

			log.info(
				{
					filingsIngested: result.filingsIngested,
					chunksCreated: result.chunksCreated,
					durationMs: result.durationMs,
				},
				"Filings sync complete"
			);

			return result;
		} catch (error) {
			log.error(
				{ error: error instanceof Error ? error.message : "Unknown error" },
				"Filings sync failed"
			);
			return null;
		} finally {
			this.running = false;
		}
	}
}

export function createFilingsSyncService(
	db: Database,
	config?: FilingsSyncConfig
): FilingsSyncService {
	return new FilingsSyncService(db, config);
}
