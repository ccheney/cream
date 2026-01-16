/**
 * @cream/worker - Hourly Scheduler
 *
 * Triggers the trading cycle workflow every hour via dashboard-api.
 * Also runs: prediction markets (15 min), filings sync (daily), indicator batch jobs.
 *
 * Configuration is loaded from the database via RuntimeConfigService.
 * Run 'bun run db:seed' to initialize configuration before starting.
 */

import type { FullRuntimeConfig, RuntimeEnvironment } from "@cream/config";
import {
	type CreamEnvironment,
	createContext,
	initCalendarService,
	isBacktest,
	requireEnv,
	validateEnvironmentOrExit,
} from "@cream/domain";

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
	createIndicatorSynthesisScheduler,
	type IndicatorSynthesisScheduler,
} from "./contexts/synthesis/index.js";
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
	loadConfig,
	log,
	reloadConfig,
	type TriggerResult,
	validateHelixDBOrExit,
} from "./shared/index.js";

// ============================================
// Worker State
// ============================================

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
	};
	startedAt: Date;

	// Domain services
	cycleTrigger: CycleTriggerService;
	predictionMarkets: PredictionMarketsService;
	filingsSync: FilingsSyncService | null;
	macroWatch: MacroWatchService;
	newspaper: NewspaperService;

	// Schedulers
	schedulerManager: SchedulerManager | null;
	indicatorScheduler: IndicatorBatchScheduler | null;
	synthesisScheduler: IndicatorSynthesisScheduler | null;
}

let state: WorkerState;

// ============================================
// Config Accessors
// ============================================

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

// ============================================
// Workflow Execution Handlers
// ============================================

async function runTradingCycle(): Promise<void> {
	state.lastRun.tradingCycle = new Date();
	await state.cycleTrigger.trigger(state.environment, getInstruments());
}

async function runPredictionMarkets(): Promise<void> {
	state.lastRun.predictionMarkets = new Date();
	await state.predictionMarkets.run();
}

async function runFilingsSync(): Promise<void> {
	state.lastRun.filingsSync = new Date();
	await state.filingsSync?.sync(getInstruments(), state.environment);
}

async function runMacroWatch(): Promise<void> {
	state.lastRun.macroWatch = new Date();
	await state.macroWatch.run(getInstruments());
}

async function compileNewspaper(): Promise<void> {
	state.lastRun.newspaper = new Date();
	await state.newspaper.compile(getInstruments());
}

// ============================================
// Service Trigger Handlers (for HTTP API)
// ============================================

async function triggerMacroWatch(): Promise<TriggerResult> {
	const startTime = Date.now();
	try {
		state.lastRun.macroWatch = new Date();
		const entries = await state.macroWatch.run(getInstruments());
		return {
			success: true,
			message: `MacroWatch completed with ${entries.length} entries`,
			processed: entries.length,
			failed: 0,
			durationMs: Date.now() - startTime,
		};
	} catch (error) {
		return {
			success: false,
			message: "MacroWatch failed",
			error: error instanceof Error ? error.message : "Unknown error",
			durationMs: Date.now() - startTime,
		};
	}
}

async function triggerNewspaper(): Promise<TriggerResult> {
	const startTime = Date.now();
	try {
		state.lastRun.newspaper = new Date();
		await state.newspaper.compile(getInstruments());
		return {
			success: true,
			message: "Newspaper compilation completed",
			durationMs: Date.now() - startTime,
		};
	} catch (error) {
		return {
			success: false,
			message: "Newspaper compilation failed",
			error: error instanceof Error ? error.message : "Unknown error",
			durationMs: Date.now() - startTime,
		};
	}
}

async function triggerFilingsSync(): Promise<TriggerResult> {
	const startTime = Date.now();
	try {
		state.lastRun.filingsSync = new Date();
		const result = await state.filingsSync?.sync(getInstruments(), state.environment);
		if (result) {
			return {
				success: true,
				message: `Filings sync completed: ${result.filingsIngested} filings, ${result.chunksCreated} chunks`,
				processed: result.filingsIngested,
				durationMs: result.durationMs,
			};
		}
		return {
			success: true,
			message: "Filings sync completed (no result)",
			durationMs: Date.now() - startTime,
		};
	} catch (error) {
		return {
			success: false,
			message: "Filings sync failed",
			error: error instanceof Error ? error.message : "Unknown error",
			durationMs: Date.now() - startTime,
		};
	}
}

async function triggerIndicatorJob(
	jobName: "shortInterest" | "sentiment" | "corporateActions"
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
		return {
			success: false,
			message: `${jobName} job failed`,
			error: error instanceof Error ? error.message : "Unknown error",
			durationMs: Date.now() - startTime,
		};
	}
}

async function triggerShortInterest(): Promise<TriggerResult> {
	return triggerIndicatorJob("shortInterest");
}

async function triggerSentiment(): Promise<TriggerResult> {
	return triggerIndicatorJob("sentiment");
}

async function triggerCorporateActions(): Promise<TriggerResult> {
	return triggerIndicatorJob("corporateActions");
}

// ============================================
// Configuration Reload
// ============================================

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

// ============================================
// Main
// ============================================

async function main() {
	const environment = requireEnv();

	const startupCtx = createContext(environment, "scheduled");
	if (!isBacktest(startupCtx)) {
		validateEnvironmentOrExit(startupCtx, "worker", []);

		if (!Bun.env.GOOGLE_GENERATIVE_AI_API_KEY) {
			log.warn(
				{},
				"GOOGLE_GENERATIVE_AI_API_KEY not configured. Agent execution will use stub agents."
			);
		}
	}

	await validateHelixDBOrExit(startupCtx);

	initCalendarService({
		mode: environment as CreamEnvironment,
		alpacaKey: Bun.env.ALPACA_KEY,
		alpacaSecret: Bun.env.ALPACA_SECRET,
	})
		.then(() => log.info({ mode: environment }, "CalendarService initialized"))
		.catch((error: unknown) => {
			log.warn(
				{ error: error instanceof Error ? error.message : String(error), mode: environment },
				"CalendarService initialization failed, using fallback"
			);
		});

	let config: FullRuntimeConfig;
	try {
		config = await loadConfig(environment);
	} catch (error) {
		log.error(
			{ error: error instanceof Error ? error.message : "Unknown error" },
			"Failed to load config from database. Run 'bun run db:seed' to initialize."
		);
		process.exit(1);
	}

	const db = await getDbClient();

	state = {
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
		},
		startedAt: new Date(),

		cycleTrigger: createCycleTriggerServiceFromEnv(),
		predictionMarkets: createPredictionMarketsService(),
		filingsSync: createFilingsSyncService(db),
		macroWatch: createMacroWatchService(),
		newspaper: createNewspaperService(),

		schedulerManager: null,
		indicatorScheduler: null,
		synthesisScheduler: null,
	};

	const intervals = getIntervals();
	log.info({ environment, configId: config.trading.id }, "Worker starting");
	log.info(
		{
			tradingCycleIntervalMs: intervals.tradingCycleIntervalMs,
			predictionMarketsIntervalMs: intervals.predictionMarketsIntervalMs,
		},
		"Intervals configured"
	);
	log.info({ instruments: getInstruments() }, "Instruments configured");

	const healthServer = createHealthServer({
		getEnvironment: () => state.environment,
		getConfigId: () => state.config.trading.id,
		getIntervals,
		getInstruments,
		getLastRun: () => state.lastRun,
		getRunningStatus: () => ({
			tradingCycle: state.cycleTrigger.isRunning(),
			predictionMarkets: state.predictionMarkets.isRunning(),
			filingsSync: state.filingsSync?.isRunning() ?? false,
			macroWatch: state.macroWatch.isRunning(),
			newspaper: state.newspaper.isRunning(),
		}),
		getIndicatorJobStatus,
		getSynthesisScheduler: () => state.synthesisScheduler,
		getStartedAt: () => state.startedAt,
		onReload: handleReloadConfig,
		triggers: {
			triggerMacroWatch,
			triggerNewspaper,
			triggerFilingsSync,
			triggerShortInterest,
			triggerSentiment,
			triggerCorporateActions,
		},
	});
	healthServer.start();

	if (state.schedulerDisabled) {
		log.info({}, "Scheduler disabled (SCHEDULER_DISABLED=true). Health endpoint only.");
	} else {
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
			},
			getIntervals
		);
		state.schedulerManager.start();

		state.indicatorScheduler = startIndicatorScheduler({
			db,
			getSymbols: getInstruments,
		});

		if (!isBacktest(startupCtx)) {
			state.synthesisScheduler = createIndicatorSynthesisScheduler({ db });
			state.synthesisScheduler.start();
			log.info({}, "Indicator synthesis scheduler started");
		}
	}

	process.on("SIGHUP", () => {
		handleReloadConfig().catch((error) => {
			log.error(
				{ error: error instanceof Error ? error.message : String(error) },
				"Config reload failed"
			);
		});
	});

	const shutdown = (): void => {
		state.schedulerManager?.stop();
		state.indicatorScheduler?.stop();
		state.synthesisScheduler?.stop();
		process.exit(0);
	};

	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
}

main().catch((_error) => {
	process.exit(1);
});
