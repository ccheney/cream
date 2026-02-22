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
import type { MacroWatchEntry } from "@cream/mastra";

import { startIndicatorScheduler } from "../contexts/indicators/index.js";
import { createMacroWatchService, createNewspaperService } from "../contexts/macro-watch/index.js";
import { createFilingsSyncService } from "../contexts/trading-cycle/index.js";
import { getDbClient, loadConfig, log, validateHelixDBOrExit } from "../shared/index.js";

interface CliOptions {
	service: string;
	symbols: string[];
	dryRun: boolean;
}

const VALID_SERVICES = [
	"macro-watch",
	"newspaper",
	"filings-sync",
	"short-interest",
	"sentiment",
	"corporate-actions",
] as const;

type ServiceName = (typeof VALID_SERVICES)[number];

type IndicatorJobName = "shortInterest" | "sentiment" | "corporateActions";

const USAGE_TEXT = `
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
`.trim();

function writeStdout(message = ""): void {
	process.stdout.write(`${message}\n`);
}

function writeStderr(message: string): void {
	process.stderr.write(`${message}\n`);
}

function parseArgs(): CliOptions {
	const args = process.argv.slice(2);
	const service = args[0] ?? "";

	let symbols: string[] = [];
	let dryRun = false;

	for (const arg of args.slice(1)) {
		if (arg.startsWith("--symbols=")) {
			symbols = arg
				.replace("--symbols=", "")
				.split(",")
				.map((symbol) => symbol.trim())
				.filter(Boolean);
		} else if (arg === "--dry-run") {
			dryRun = true;
		}
	}

	return { service, symbols, dryRun };
}

function isServiceName(value: string): value is ServiceName {
	return VALID_SERVICES.includes(value as ServiceName);
}

function resolveRequestedService(options: CliOptions): ServiceName {
	if (!options.service || options.service === "--help" || options.service === "-h") {
		writeStdout(USAGE_TEXT);
		process.exit(0);
	}

	if (!isServiceName(options.service)) {
		writeStderr(`Unknown service: ${options.service}`);
		writeStderr(`Valid services: ${VALID_SERVICES.join(", ")}`);
		process.exit(1);
	}

	return options.service;
}

async function initializeRuntime(environment: RuntimeEnvironment): Promise<void> {
	const ctx = createContext(environment, "manual");

	if (!isTest(ctx)) {
		await validateHelixDBOrExit(ctx);
	}

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
}

async function loadRuntimeConfig(environment: RuntimeEnvironment): Promise<FullRuntimeConfig> {
	try {
		return await loadConfig(environment);
	} catch (error) {
		log.error(
			{ error: error instanceof Error ? error.message : "Unknown error" },
			"Failed to load config. Run 'bun run db:seed' first.",
		);
		process.exit(1);
	}
}

function resolveSymbols(options: CliOptions, _config: FullRuntimeConfig): string[] {
	return options.symbols;
}

function ensureSymbols(symbols: string[]): void {
	if (symbols.length > 0) {
		return;
	}

	writeStderr("No symbols provided. Use --symbols=AAPL,MSFT.");
	process.exit(1);
}

function printExecutionSummary(
	service: ServiceName,
	environment: RuntimeEnvironment,
	symbols: string[],
	dryRun: boolean,
): void {
	writeStdout(`\nService: ${service}`);
	writeStdout(`Environment: ${environment}`);
	writeStdout(`Symbols: ${symbols.join(", ")}`);
	writeStdout(`Dry run: ${dryRun}`);
	writeStdout();
}

function printHeader(title: string): void {
	writeStdout(`\n--- ${title} ---`);
}

function printMacroWatchResults(entries: MacroWatchEntry[]): void {
	if (entries.length === 0) {
		return;
	}

	printHeader("MacroWatch Results");
	for (const entry of entries.slice(0, 10)) {
		writeStdout(`  [${entry.category}] ${entry.symbols.join(",") || "MACRO"}: ${entry.headline}`);
	}
	if (entries.length > 10) {
		writeStdout(`  ... and ${entries.length - 10} more entries`);
	}
}

async function runMacroWatch(symbols: string[]): Promise<void> {
	log.info({ symbols }, "Starting MacroWatch scan");

	const service = createMacroWatchService();
	const { entries, saved } = await service.run(symbols);

	log.info({ entryCount: entries.length, savedCount: saved }, "MacroWatch scan complete");
	printMacroWatchResults(entries);
}

async function runNewspaper(symbols: string[]): Promise<void> {
	log.info({ symbols }, "Starting Newspaper compilation");

	const service = createNewspaperService();
	await service.compile(symbols);

	log.info({}, "Newspaper compilation complete");
}

function printFilingsSyncResults(result: {
	filingsIngested: number;
	chunksCreated: number;
	durationMs: number;
}): void {
	printHeader("Filings Sync Results");
	writeStdout(`  Filings ingested: ${result.filingsIngested}`);
	writeStdout(`  Chunks created: ${result.chunksCreated}`);
	writeStdout(`  Duration: ${(result.durationMs / 1000).toFixed(1)}s`);
}

async function runFilingsSync(symbols: string[], environment: RuntimeEnvironment): Promise<void> {
	log.info({ symbols }, "Starting SEC Filings sync");

	const db = await getDbClient();
	const service = createFilingsSyncService(db);
	const result = await service.sync(symbols, environment);

	if (!result) {
		log.warn({}, "Filings sync returned no result");
		return;
	}

	log.info(
		{
			filingsIngested: result.filingsIngested,
			chunksCreated: result.chunksCreated,
			durationMs: result.durationMs,
		},
		"Filings sync complete",
	);
	printFilingsSyncResults(result);
}

function printIndicatorJobResults(
	jobName: IndicatorJobName,
	result: {
		processed: number;
		failed: number;
		durationMs: number;
		errors?: Array<{ symbol: string; error: string }>;
	},
): void {
	printHeader(`${jobName} Results`);
	writeStdout(`  Processed: ${result.processed}`);
	writeStdout(`  Failed: ${result.failed}`);
	writeStdout(`  Duration: ${(result.durationMs / 1000).toFixed(1)}s`);

	if (!result.errors || result.errors.length === 0) {
		return;
	}

	writeStdout("  Errors:");
	for (const errorResult of result.errors.slice(0, 5)) {
		writeStdout(`    - ${errorResult.symbol}: ${errorResult.error}`);
	}
}

async function runIndicatorJob(jobName: IndicatorJobName, symbols: string[]): Promise<void> {
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

		printIndicatorJobResults(jobName, result);
	} finally {
		scheduler.stop();
	}
}

async function dispatchService(
	service: ServiceName,
	symbols: string[],
	environment: RuntimeEnvironment,
): Promise<void> {
	switch (service) {
		case "macro-watch":
			await runMacroWatch(symbols);
			return;
		case "newspaper":
			await runNewspaper(symbols);
			return;
		case "filings-sync":
			await runFilingsSync(symbols, environment);
			return;
		case "short-interest":
			await runIndicatorJob("shortInterest", symbols);
			return;
		case "sentiment":
			await runIndicatorJob("sentiment", symbols);
			return;
		case "corporate-actions":
			await runIndicatorJob("corporateActions", symbols);
			return;
	}
}

async function main(): Promise<void> {
	const options = parseArgs();
	const service = resolveRequestedService(options);
	const environment = requireEnv();

	await initializeRuntime(environment);

	const config = await loadRuntimeConfig(environment);
	const symbols = resolveSymbols(options, config);
	ensureSymbols(symbols);

	printExecutionSummary(service, environment, symbols, options.dryRun);
	if (options.dryRun) {
		writeStdout("Dry run mode - no actual execution");
		return;
	}

	const startTime = Date.now();
	await dispatchService(service, symbols, environment);

	const elapsed = Date.now() - startTime;
	writeStdout(`\nCompleted in ${(elapsed / 1000).toFixed(1)}s`);
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	log.error({ error: message }, "Fatal error");
	process.exit(1);
});
