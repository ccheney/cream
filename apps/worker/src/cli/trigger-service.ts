#!/usr/bin/env bun
/**
 * Manual Service Trigger CLI
 *
 * Allows triggering individual external context ingestion services for testing.
 *
 * Usage:
 *   bun apps/worker/src/cli/trigger-service.ts <service> [options]
 *
 * Services:
 *   macro-watch     - Run overnight market scan
 *   newspaper       - Compile morning newspaper
 *   filings-sync    - Sync SEC filings from EDGAR
 *   short-interest  - Fetch short interest from FINRA
 *   sentiment       - Fetch sentiment data
 *   corporate-actions - Fetch corporate actions
 *
 * Options:
 *   --symbols=AAPL,MSFT  - Override default symbols
 *   --dry-run            - Show what would be done without executing
 */

import type { FullRuntimeConfig, RuntimeEnvironment } from "@cream/config";
import {
	type CreamEnvironment,
	createContext,
	initCalendarService,
	isTest,
	requireEnv,
} from "@cream/domain";

import { startIndicatorScheduler } from "../contexts/indicators/index.js";
import { createMacroWatchService, createNewspaperService } from "../contexts/macro-watch/index.js";
import { createFilingsSyncService } from "../contexts/trading-cycle/index.js";
import { getDbClient, loadConfig, log, validateHelixDBOrExit } from "../shared/index.js";

// ============================================
// CLI Parsing
// ============================================

interface CliOptions {
	service: string;
	symbols: string[];
	dryRun: boolean;
}

function parseArgs(): CliOptions {
	const args = process.argv.slice(2);
	const service = args[0] ?? "";

	let symbols: string[] = [];
	let dryRun = false;

	for (const arg of args.slice(1)) {
		if (arg.startsWith("--symbols=")) {
			symbols = arg.replace("--symbols=", "").split(",");
		} else if (arg === "--dry-run") {
			dryRun = true;
		}
	}

	return { service, symbols, dryRun };
}

function printUsage(): void {
	console.log(`
Manual Service Trigger CLI

Usage:
  bun apps/worker/src/cli/trigger-service.ts <service> [options]

Services:
  macro-watch        Run overnight market scan
  newspaper          Compile morning newspaper
  filings-sync       Sync SEC filings from EDGAR
  short-interest     Fetch short interest from FINRA
  sentiment          Fetch sentiment data
  corporate-actions  Fetch corporate actions

Options:
  --symbols=AAPL,MSFT  Override default symbols (comma-separated)
  --dry-run            Show what would be done without executing

Examples:
  bun apps/worker/src/cli/trigger-service.ts macro-watch
  bun apps/worker/src/cli/trigger-service.ts filings-sync --symbols=AAPL,TSLA
  bun apps/worker/src/cli/trigger-service.ts short-interest --dry-run
`);
}

// ============================================
// Service Runners
// ============================================

async function runMacroWatch(symbols: string[]): Promise<void> {
	log.info({ symbols }, "Starting MacroWatch scan");

	const service = createMacroWatchService();
	const { entries, saved } = await service.run(symbols);

	log.info({ entryCount: entries.length, savedCount: saved }, "MacroWatch scan complete");

	if (entries.length > 0) {
		console.log("\n--- MacroWatch Results ---");
		for (const entry of entries.slice(0, 10)) {
			console.log(`  [${entry.category}] ${entry.symbols.join(",") || "MACRO"}: ${entry.headline}`);
		}
		if (entries.length > 10) {
			console.log(`  ... and ${entries.length - 10} more entries`);
		}
	}
}

async function runNewspaper(symbols: string[]): Promise<void> {
	log.info({ symbols }, "Starting Newspaper compilation");

	const service = createNewspaperService();
	await service.compile(symbols);

	log.info({}, "Newspaper compilation complete");
}

async function runFilingsSync(symbols: string[], environment: RuntimeEnvironment): Promise<void> {
	log.info({ symbols }, "Starting SEC Filings sync");

	const db = await getDbClient();
	const service = createFilingsSyncService(db);
	const result = await service.sync(symbols, environment);

	if (result) {
		log.info(
			{
				filingsIngested: result.filingsIngested,
				chunksCreated: result.chunksCreated,
				durationMs: result.durationMs,
			},
			"Filings sync complete",
		);

		console.log("\n--- Filings Sync Results ---");
		console.log(`  Filings ingested: ${result.filingsIngested}`);
		console.log(`  Chunks created: ${result.chunksCreated}`);
		console.log(`  Duration: ${(result.durationMs / 1000).toFixed(1)}s`);
	} else {
		log.warn({}, "Filings sync returned no result");
	}
}

async function runIndicatorJob(
	jobName: "shortInterest" | "sentiment" | "corporateActions",
	symbols: string[],
): Promise<void> {
	log.info({ job: jobName, symbols }, `Starting ${jobName} job`);

	const db = await getDbClient();
	const scheduler = startIndicatorScheduler({
		db,
		getSymbols: () => symbols,
	});

	if (!scheduler) {
		throw new Error("Failed to initialize indicator scheduler");
	}

	try {
		const result = await scheduler.triggerJob(jobName);

		log.info(
			{
				job: jobName,
				processed: result.processed,
				failed: result.failed,
				durationMs: result.durationMs,
			},
			`${jobName} job complete`,
		);

		console.log(`\n--- ${jobName} Results ---`);
		console.log(`  Processed: ${result.processed}`);
		console.log(`  Failed: ${result.failed}`);
		console.log(`  Duration: ${(result.durationMs / 1000).toFixed(1)}s`);

		if (result.errors && result.errors.length > 0) {
			console.log("  Errors:");
			for (const err of result.errors.slice(0, 5)) {
				console.log(`    - ${err.symbol}: ${err.error}`);
			}
		}
	} finally {
		scheduler.stop();
	}
}

// ============================================
// Main
// ============================================

async function main(): Promise<void> {
	const options = parseArgs();

	if (!options.service || options.service === "--help" || options.service === "-h") {
		printUsage();
		process.exit(0);
	}

	const validServices = [
		"macro-watch",
		"newspaper",
		"filings-sync",
		"short-interest",
		"sentiment",
		"corporate-actions",
	];

	if (!validServices.includes(options.service)) {
		console.error(`Unknown service: ${options.service}`);
		console.error(`Valid services: ${validServices.join(", ")}`);
		process.exit(1);
	}

	// Initialize environment
	const environment = requireEnv();
	const ctx = createContext(environment, "manual");

	if (!isTest(ctx)) {
		await validateHelixDBOrExit(ctx);
	}

	// Initialize calendar service
	await initCalendarService({
		mode: environment as CreamEnvironment,
		alpacaKey: Bun.env.ALPACA_KEY,
		alpacaSecret: Bun.env.ALPACA_SECRET,
	}).catch((error: unknown) => {
		log.warn(
			{ error: error instanceof Error ? error.message : String(error) },
			"CalendarService initialization failed",
		);
	});

	// Load config to get default symbols
	let config: FullRuntimeConfig;
	try {
		config = await loadConfig(environment);
	} catch (error) {
		log.error(
			{ error: error instanceof Error ? error.message : "Unknown error" },
			"Failed to load config. Run 'bun run db:seed' first.",
		);
		process.exit(1);
	}

	const symbols =
		options.symbols.length > 0 ? options.symbols : (config.universe.staticSymbols ?? []);

	if (symbols.length === 0) {
		console.error("No symbols configured. Use --symbols=AAPL,MSFT or configure in database.");
		process.exit(1);
	}

	console.log(`\nService: ${options.service}`);
	console.log(`Environment: ${environment}`);
	console.log(`Symbols: ${symbols.join(", ")}`);
	console.log(`Dry run: ${options.dryRun}`);
	console.log("");

	if (options.dryRun) {
		console.log("Dry run mode - no actual execution");
		process.exit(0);
	}

	const startTime = Date.now();

	switch (options.service) {
		case "macro-watch":
			await runMacroWatch(symbols);
			break;
		case "newspaper":
			await runNewspaper(symbols);
			break;
		case "filings-sync":
			await runFilingsSync(symbols, environment);
			break;
		case "short-interest":
			await runIndicatorJob("shortInterest", symbols);
			break;
		case "sentiment":
			await runIndicatorJob("sentiment", symbols);
			break;
		case "corporate-actions":
			await runIndicatorJob("corporateActions", symbols);
			break;
	}

	const elapsed = Date.now() - startTime;
	console.log(`\nCompleted in ${(elapsed / 1000).toFixed(1)}s`);
}

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
