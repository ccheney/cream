#!/usr/bin/env bun

/**
 * Backfill Historical Theses into HelixDB
 *
 * Ingests all closed theses from PostgreSQL into HelixDB as ThesisMemory nodes.
 * This enables agents to learn from past thesis outcomes.
 *
 * Usage:
 *   bun apps/api/scripts/backfill-thesis-memory.ts [options]
 *
 * Options:
 *   --dry-run       Show what would be ingested without actually ingesting
 *   --environment   Filter by environment (BACKTEST, PAPER, LIVE)
 *   --limit         Maximum number of theses to process
 *   --since         Only process theses closed after this date (ISO 8601)
 */

import { createHelixClientFromEnv, type HelixClient } from "@cream/helix";
import { createEmbeddingClient, type EmbeddingClient } from "@cream/helix-schema";
import { createNodeLogger, type LifecycleLogger } from "@cream/logger";
import { type Database, getDb, ThesisStateRepository } from "@cream/storage";
import { sql } from "drizzle-orm";
import {
	batchIngestClosedTheses,
	type ThesisIngestionInput,
} from "../workflows/steps/thesisMemoryIngestion.js";

const log: LifecycleLogger = createNodeLogger({
	service: "backfill-thesis-memory",
	level: "info",
	environment: Bun.env.CREAM_ENV ?? "BACKTEST",
	pretty: true,
});

// ============================================
// CLI Arguments
// ============================================

interface BackfillOptions {
	dryRun: boolean;
	environment?: string;
	limit?: number;
	since?: string;
}

function parseArgs(): BackfillOptions {
	const args = process.argv.slice(2);
	const options: BackfillOptions = {
		dryRun: false,
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		const nextArg = args[i + 1];
		if (arg === "--dry-run") {
			options.dryRun = true;
		} else if (arg === "--environment" && nextArg) {
			options.environment = nextArg;
			i++;
		} else if (arg === "--limit" && nextArg) {
			options.limit = parseInt(nextArg, 10);
			i++;
		} else if (arg === "--since" && nextArg) {
			options.since = nextArg;
			i++;
		}
	}

	return options;
}

// ============================================
// Regime Lookup
// ============================================

/**
 * Get the market regime for a specific date.
 * Falls back to "UNKNOWN" if no regime data is available.
 */
async function getRegimeForDate(db: Database, date: string): Promise<string> {
	try {
		// Look for the closest regime label before or at the given date
		const result = await db.execute(sql`
			SELECT regime FROM regime_labels
			WHERE symbol = '_MARKET' AND timeframe = '1d'
			AND timestamp <= ${date}
			ORDER BY timestamp DESC
			LIMIT 1
		`);

		const row = result.rows[0] as { regime: string } | undefined;
		if (row?.regime) {
			return String(row.regime).toUpperCase();
		}
	} catch {
		// Ignore errors - just return UNKNOWN
	}

	return "UNKNOWN";
}

// ============================================
// Main Backfill Logic
// ============================================

async function backfillThesisMemory(options: BackfillOptions): Promise<void> {
	log.info({}, "Starting thesis memory backfill");

	if (options.dryRun) {
		log.info({}, "DRY RUN MODE - No data will be ingested");
	}

	// Create database client
	const databaseUrl = Bun.env.DATABASE_URL;

	if (!databaseUrl) {
		log.error({}, "DATABASE_URL environment variable not set");
		process.exit(1);
	}

	const db = getDb();
	const thesisRepo = new ThesisStateRepository(db);

	// Build filters
	const environment = options.environment ?? "BACKTEST";

	log.info({ environment, since: options.since, limit: options.limit }, "Fetching closed theses");

	// Get closed theses
	const result = await thesisRepo.findMany(
		{
			state: "CLOSED",
			environment: environment as "BACKTEST" | "PAPER" | "LIVE",
			closedAfter: options.since,
		},
		options.limit ? { page: 1, pageSize: options.limit } : undefined
	);

	const closedTheses = result.data;

	if (closedTheses.length === 0) {
		log.info({}, "No closed theses found to backfill");
		return;
	}

	log.info({ count: closedTheses.length }, "Found closed theses to process");

	// Prepare ingestion inputs
	const inputs: ThesisIngestionInput[] = [];

	for (const thesis of closedTheses) {
		// Get regime at entry and exit
		const entryDate = thesis.entryDate ?? thesis.createdAt;
		const exitDate = thesis.closedAt ?? new Date().toISOString();

		const entryRegime = await getRegimeForDate(db, entryDate);
		const exitRegime = await getRegimeForDate(db, exitDate);

		inputs.push({
			thesis,
			entryRegime,
			exitRegime,
		});

		if (options.dryRun) {
			log.info(
				{
					thesisId: thesis.thesisId,
					instrumentId: thesis.instrumentId,
					entryDate,
					entryRegime,
					exitDate,
					exitRegime,
					realizedPnlPct: thesis.realizedPnlPct,
					closeReason: thesis.closeReason,
				},
				"Would ingest thesis"
			);
		}
	}

	if (options.dryRun) {
		log.info({ count: inputs.length }, "Dry run complete");
		return;
	}

	// Create HelixDB and embedding clients
	let helixClient: HelixClient | null = null;
	let embeddingClient: EmbeddingClient | null = null;

	try {
		helixClient = createHelixClientFromEnv();
		embeddingClient = createEmbeddingClient();
	} catch (error) {
		log.error(
			{ error: error instanceof Error ? error.message : String(error) },
			"Failed to create HelixDB or embedding client - ensure HELIX_HOST and GOOGLE_GENAI_API_KEY are set"
		);
		return;
	}

	// Batch ingest
	log.info({}, "Starting batch ingestion");

	const batchResult = await batchIngestClosedTheses(inputs, helixClient, embeddingClient);

	// Report results
	log.info(
		{
			successful: batchResult.successful.length,
			skipped: batchResult.skipped.length,
			failed: batchResult.failed.length,
			totalTimeSeconds: (batchResult.totalExecutionTimeMs / 1000).toFixed(2),
		},
		"Backfill results"
	);

	if (batchResult.failed.length > 0) {
		for (const failure of batchResult.failed) {
			log.warn({ thesisId: failure.thesisId, error: failure.error }, "Failed to ingest thesis");
		}
	}

	if (batchResult.skipped.length > 0) {
		for (const skip of batchResult.skipped) {
			log.info({ thesisId: skip.thesisId, reason: skip.reason }, "Skipped thesis");
		}
	}

	// Cleanup
	helixClient.close();

	log.info({}, "Backfill complete");
}

// ============================================
// Entry Point
// ============================================

const options = parseArgs();

backfillThesisMemory(options).catch((error) => {
	log.error({ error: error instanceof Error ? error.message : String(error) }, "Backfill failed");
	process.exit(1);
});
