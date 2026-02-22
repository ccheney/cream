import type { FullRuntimeConfig, RuntimeEnvironment } from "@cream/config";
import {
	createEconomicCalendarService,
	type EconomicCalendarService,
} from "./contexts/economic-calendar/index.js";
import type { IndicatorBatchScheduler, JobState } from "./contexts/indicators/index.js";
import {
	createMacroWatchService,
	createNewspaperService,
	type MacroWatchService,
	type NewspaperService,
} from "./contexts/macro-watch/index.js";
import {
	createScannerTriggerService,
	type ScannerTriggerService,
} from "./contexts/scanner/index.js";
import type { SchedulerManager } from "./contexts/scheduling/index.js";
import {
	type CycleTriggerService,
	createCycleTriggerServiceFromEnv,
	createFilingsSyncService,
	createPredictionMarketsService,
	type FilingsSyncService,
	type PredictionMarketsService,
} from "./contexts/trading-cycle/index.js";
import { getDbClient, getHelixClient } from "./shared/index.js";

export interface WorkerState {
	config: FullRuntimeConfig;
	environment: RuntimeEnvironment;
	runOnStartup: boolean;
	schedulerDisabled: boolean;
	lastRun: {
		predictionMarkets: Date | null;
		filingsSync: Date | null;
		macroWatch: Date | null;
		newspaper: Date | null;
		economicCalendar: Date | null;
	};
	startedAt: Date;
	cycleTrigger: CycleTriggerService;
	scannerTrigger: ScannerTriggerService;
	predictionMarkets: PredictionMarketsService;
	filingsSync: FilingsSyncService | null;
	macroWatch: MacroWatchService;
	newspaper: NewspaperService;
	economicCalendar: EconomicCalendarService;
	schedulerManager: SchedulerManager | null;
	indicatorScheduler: IndicatorBatchScheduler | null;
}

export type WorkerDb = Awaited<ReturnType<typeof getDbClient>>;

export function createInitialState(
	environment: RuntimeEnvironment,
	config: FullRuntimeConfig,
	db: WorkerDb,
): WorkerState {
	const cycleTrigger = createCycleTriggerServiceFromEnv();
	const scannerTrigger = createScannerTriggerService(
		{
			environment,
			streamProxyUrl: Bun.env.STREAM_PROXY_URL,
			batchQuietWindowMs: 60_000,
			batchMaxWindowMs: 5 * 60_000,
			maxCandidates: config.scanner.maxCandidates,
		},
		{ cycleTrigger },
	);

	return {
		config,
		environment,
		runOnStartup: Bun.env.RUN_ON_STARTUP === "true",
		schedulerDisabled: Bun.env.SCHEDULER_DISABLED === "true",
		lastRun: {
			predictionMarkets: null,
			filingsSync: null,
			macroWatch: null,
			newspaper: null,
			economicCalendar: null,
		},
		startedAt: new Date(),
		cycleTrigger,
		scannerTrigger,
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

export type { JobState };
