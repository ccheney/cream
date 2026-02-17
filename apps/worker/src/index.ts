/**
 * @cream/worker - Hourly Scheduler
 */

import { initTracing, shutdownTracing } from "./tracing.js";

initTracing();

import type { FullRuntimeConfig, RuntimeEnvironment } from "@cream/config";
import { requireEnv } from "@cream/domain";

import {
	createEconomicCalendarService,
	type EconomicCalendarService,
} from "./contexts/economic-calendar/index.js";
import {
	type IndicatorBatchScheduler,
	type JobState,
	startIndicatorScheduler,
} from "./contexts/indicators/index.js";
import {
	createMacroWatchService,
	createNewspaperService,
	type MacroWatchService,
	type NewspaperService,
} from "./contexts/macro-watch/index.js";
import { createSchedulerManager, type SchedulerManager } from "./contexts/scheduling/index.js";
import {
	type CycleTriggerService,
	createCycleTriggerServiceFromEnv,
	createFilingsSyncService,
	createPredictionMarketsService,
	type FilingsSyncService,
	type PredictionMarketsService,
} from "./contexts/trading-cycle/index.js";
import {
	createHealthServer,
	getDbClient,
	getHelixClient,
	loadConfig,
	log,
	recordRunComplete,
	recordRunStart,
	reloadConfig,
	type TriggerResult,
} from "./shared/index.js";
import { initializeCalendar, validateStartup } from "./startup.js";
import { failedTriggerResult, successTriggerResult, toErrorMessage } from "./worker-utils.js";

interface WorkerState {
	config: FullRuntimeConfig;
	environment: RuntimeEnvironment;
	runOnStartup: boolean;
	schedulerDisabled: boolean;
	lastRun: {
		tradingCycle: Date | null;
		predictionMarkets: Date | null;
		filingsSync: Date | null;
		macroWatch: Date | null;
		newspaper: Date | null;
		economicCalendar: Date | null;
	};
	startedAt: Date;
	cycleTrigger: CycleTriggerService;
	predictionMarkets: PredictionMarketsService;
	filingsSync: FilingsSyncService | null;
	macroWatch: MacroWatchService;
	newspaper: NewspaperService;
	economicCalendar: EconomicCalendarService;
	schedulerManager: SchedulerManager | null;
	indicatorScheduler: IndicatorBatchScheduler | null;
}

let state: WorkerState;
type WorkerDb = Awaited<ReturnType<typeof getDbClient>>;

type TrackedServiceName = "filings_sync" | "macro_watch" | "newspaper" | "economic_calendar";

function getIntervals() {
	return {
		tradingCycleIntervalMs: state.config.trading.tradingCycleIntervalMs,
		predictionMarketsIntervalMs: state.config.trading.predictionMarketsIntervalMs,
	};
}

function getInstruments(): string[] {
	const symbols = state.config.universe.staticSymbols;
	if (!symbols || symbols.length === 0) {
		throw new Error("No instruments configured in universe.staticSymbols");
	}
	return symbols;
}

function getIndicatorJobStatus(): Record<string, JobState> | null {
	return state.indicatorScheduler?.getJobStatus() ?? null;
}

async function runWithTracking(
	service: TrackedServiceName,
	setLastRun: () => void,
	execute: () => Promise<{ success: boolean; message: string; processed?: number }>,
): Promise<void> {
	setLastRun();
	const db = await getDbClient();
	const { runId } = await recordRunStart({ db, service, environment: state.environment });

	try {
		const result = await execute();
		await recordRunComplete({
			db,
			runId,
			success: result.success,
			message: result.message,
			processed: result.processed,
		});
	} catch (error) {
		await recordRunComplete({
			db,
			runId,
			success: false,
			message: toErrorMessage(error),
		});
		throw error;
	}
}

async function runTradingCycle(): Promise<void> {
	state.lastRun.tradingCycle = new Date();
	await state.cycleTrigger.trigger(state.environment, getInstruments());
}

async function runPredictionMarkets(): Promise<void> {
	state.lastRun.predictionMarkets = new Date();
	await state.predictionMarkets.run();
}

async function runFilingsSync(): Promise<void> {
	await runWithTracking(
		"filings_sync",
		() => {
			state.lastRun.filingsSync = new Date();
		},
		async () => {
			const result = await state.filingsSync?.sync(getInstruments(), state.environment);
			return {
				success: true,
				message: result
					? `${result.filingsIngested} filings, ${result.chunksCreated} chunks`
					: "Completed",
				processed: result?.filingsIngested ?? 0,
			};
		},
	);
}

async function runMacroWatch(): Promise<void> {
	await runWithTracking(
		"macro_watch",
		() => {
			state.lastRun.macroWatch = new Date();
		},
		async () => {
			const { entries, saved } = await state.macroWatch.run(getInstruments());
			return {
				success: true,
				message: `${entries.length} entries, ${saved} saved`,
				processed: entries.length,
			};
		},
	);
}

async function compileNewspaper(): Promise<void> {
	await runWithTracking(
		"newspaper",
		() => {
			state.lastRun.newspaper = new Date();
		},
		async () => {
			const result = await state.newspaper.compile(getInstruments());
			return {
				success: result.compiled,
				message: result.message,
				processed: result.entryCount,
			};
		},
	);
}

async function runEconomicCalendarSync(): Promise<void> {
	await runWithTracking(
		"economic_calendar",
		() => {
			state.lastRun.economicCalendar = new Date();
		},
		async () => {
			const result = await state.economicCalendar.refresh();
			return {
				success: true,
				message: `${result.eventsUpserted} events cached, ${result.eventsOldDeleted} old events deleted`,
				processed: result.eventsUpserted,
			};
		},
	);
}

async function triggerMacroWatch(): Promise<TriggerResult> {
	const startTime = Date.now();
	try {
		await handleReloadConfig();
		state.lastRun.macroWatch = new Date();
		const { entries, saved } = await state.macroWatch.run(getInstruments());
		return successTriggerResult(
			startTime,
			`MacroWatch completed with ${entries.length} entries, ${saved} saved`,
			{
				processed: entries.length,
				failed: 0,
			},
		);
	} catch (error) {
		return failedTriggerResult(startTime, "MacroWatch failed", error);
	}
}

async function triggerNewspaper(): Promise<TriggerResult> {
	const startTime = Date.now();
	try {
		state.lastRun.newspaper = new Date();
		const result = await state.newspaper.compile(getInstruments());
		return successTriggerResult(startTime, result.message, { processed: result.entryCount });
	} catch (error) {
		return failedTriggerResult(startTime, "Newspaper compilation failed", error);
	}
}

async function triggerFilingsSync(): Promise<TriggerResult> {
	const startTime = Date.now();
	try {
		state.lastRun.filingsSync = new Date();
		const result = await state.filingsSync?.sync(getInstruments(), state.environment);
		if (!result) {
			return successTriggerResult(startTime, "Filings sync completed (no result)");
		}
		return successTriggerResult(
			startTime,
			`Filings sync completed: ${result.filingsIngested} filings, ${result.chunksCreated} chunks`,
			{ processed: result.filingsIngested, durationMs: result.durationMs },
		);
	} catch (error) {
		return failedTriggerResult(startTime, "Filings sync failed", error);
	}
}

async function triggerIndicatorJob(
	jobName: "shortInterest" | "sentiment" | "corporateActions",
): Promise<TriggerResult> {
	const startTime = Date.now();
	try {
		if (!state.indicatorScheduler) {
			return {
				success: false,
				message: "Indicator scheduler not initialized",
				durationMs: Date.now() - startTime,
			};
		}
		const result = await state.indicatorScheduler.triggerJob(jobName);
		return {
			success: result.failed === 0,
			message: `${jobName} job completed: ${result.processed} processed, ${result.failed} failed`,
			processed: result.processed,
			failed: result.failed,
			durationMs: result.durationMs,
			error: result.errors?.length ? result.errors[0]?.error : undefined,
		};
	} catch (error) {
		return failedTriggerResult(startTime, `${jobName} job failed`, error);
	}
}

async function handleReloadConfig(): Promise<void> {
	await reloadConfig({
		environment: state.environment,
		getOldIntervals: getIntervals,
		setConfig: (config) => {
			state.config = config;
		},
		getNewIntervals: getIntervals,
		onIntervalsChanged: () => state.schedulerManager?.restart(),
	});
}

async function loadRuntimeConfigOrExit(
	environment: RuntimeEnvironment,
): Promise<FullRuntimeConfig> {
	try {
		return await loadConfig(environment);
	} catch (error) {
		log.error(
			{ error: toErrorMessage(error) },
			"Failed to load config from database. Run 'bun run db:seed' to initialize.",
		);
		process.exit(1);
	}
}

function createInitialState(
	environment: RuntimeEnvironment,
	config: FullRuntimeConfig,
	db: WorkerDb,
): WorkerState {
	return {
		config,
		environment,
		runOnStartup: Bun.env.RUN_ON_STARTUP === "true",
		schedulerDisabled: Bun.env.SCHEDULER_DISABLED === "true",
		lastRun: {
			tradingCycle: null,
			predictionMarkets: null,
			filingsSync: null,
			macroWatch: null,
			newspaper: null,
			economicCalendar: null,
		},
		startedAt: new Date(),
		cycleTrigger: createCycleTriggerServiceFromEnv(),
		predictionMarkets: createPredictionMarketsService(),
		filingsSync: createFilingsSyncService(db),
		macroWatch: (() => {
			const service = createMacroWatchService();
			service.setDbProvider(getDbClient);
			service.setHelixProvider(getHelixClient);
			return service;
		})(),
		newspaper: createNewspaperService(),
		economicCalendar: (() => {
			const service = createEconomicCalendarService();
			service.setDbProvider(getDbClient);
			return service;
		})(),
		schedulerManager: null,
		indicatorScheduler: null,
	};
}

function logStartup(config: FullRuntimeConfig, environment: RuntimeEnvironment): void {
	const intervals = getIntervals();
	log.info({ environment, configId: config.trading.id }, "Worker starting");
	log.info(
		{
			tradingCycleIntervalMs: intervals.tradingCycleIntervalMs,
			predictionMarketsIntervalMs: intervals.predictionMarketsIntervalMs,
		},
		"Intervals configured",
	);
	log.info({ instruments: getInstruments() }, "Instruments configured");
}

function startHealthServer() {
	const healthServer = createHealthServer({
		getEnvironment: () => state.environment,
		getConfigId: () => state.config.trading.id,
		getIntervals,
		getInstruments,
		getLastRun: () => state.lastRun,
		getNextRun: () => state.schedulerManager?.getNextRunTimes() ?? null,
		getRunningStatus: () => ({
			tradingCycle: state.cycleTrigger.isRunning(),
			predictionMarkets: state.predictionMarkets.isRunning(),
			filingsSync: state.filingsSync?.isRunning() ?? false,
			macroWatch: state.macroWatch.isRunning(),
			newspaper: state.newspaper.isRunning(),
		}),
		getIndicatorJobStatus,
		getStartedAt: () => state.startedAt,
		onReload: handleReloadConfig,
		triggers: {
			triggerMacroWatch,
			triggerNewspaper,
			triggerFilingsSync,
			triggerShortInterest: () => triggerIndicatorJob("shortInterest"),
			triggerSentiment: () => triggerIndicatorJob("sentiment"),
			triggerCorporateActions: () => triggerIndicatorJob("corporateActions"),
			triggerPredictionMarkets: async () => {
				const startTime = Date.now();
				try {
					state.lastRun.predictionMarkets = new Date();
					await state.predictionMarkets.run();
					return successTriggerResult(startTime, "Prediction markets fetch completed");
				} catch (error) {
					return failedTriggerResult(startTime, "Prediction markets fetch failed", error);
				}
			},
		},
	});
	healthServer.start();
	return healthServer;
}

async function startSchedulers(db: WorkerDb): Promise<void> {
	if (state.schedulerDisabled) {
		log.info({}, "Scheduler disabled (SCHEDULER_DISABLED=true). Health endpoint only.");
		return;
	}

	if (state.runOnStartup) {
		log.info({}, "Running cycles on startup");
		await Promise.all([runTradingCycle(), runPredictionMarkets()]);
	}

	state.schedulerManager = createSchedulerManager(
		{
			runTradingCycle,
			runPredictionMarkets,
			runFilingsSync,
			runMacroWatch,
			compileNewspaper,
			runEconomicCalendarSync,
		},
		getIntervals,
	);
	state.schedulerManager.start();

	state.indicatorScheduler = startIndicatorScheduler({
		db,
		getSymbols: getInstruments,
	});
}

function registerSignalHandlers(healthServer: ReturnType<typeof startHealthServer>): void {
	process.on("SIGHUP", () => {
		handleReloadConfig().catch((error) => {
			log.error({ error: toErrorMessage(error) }, "Config reload failed");
		});
	});

	const shutdown = async (): Promise<void> => {
		healthServer.stop();
		state.schedulerManager?.stop();
		state.indicatorScheduler?.stop();
		await shutdownTracing();
		process.exit(0);
	};

	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
}

async function main(): Promise<void> {
	const environment = requireEnv();
	await validateStartup(environment);
	initializeCalendar(environment);

	const config = await loadRuntimeConfigOrExit(environment);
	const db = await getDbClient();
	state = createInitialState(environment, config, db);

	logStartup(config, environment);
	const healthServer = startHealthServer();
	await startSchedulers(db);
	registerSignalHandlers(healthServer);
}

main().catch((error) => {
	log.error(
		{ error: toErrorMessage(error), stack: error instanceof Error ? error.stack : undefined },
		"Worker crashed",
	);
	process.exit(1);
});
