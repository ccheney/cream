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
	};
	startedAt: Date;

	// Domain services
	cycleTrigger: CycleTriggerService;
	predictionMarkets: PredictionMarketsService;
	filingsSync: FilingsSyncService | null;

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
		},
		startedAt: new Date(),

		cycleTrigger: createCycleTriggerServiceFromEnv(),
		predictionMarkets: createPredictionMarketsService(),
		filingsSync: createFilingsSyncService(db),

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
		}),
		getIndicatorJobStatus,
		getSynthesisScheduler: () => state.synthesisScheduler,
		getStartedAt: () => state.startedAt,
		onReload: handleReloadConfig,
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
