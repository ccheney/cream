/**
 * Scheduler Manager
 *
 * Manages timer-based scheduling for recurring jobs.
 * Provides lifecycle methods for starting, stopping, and rescheduling timers.
 */

import { log } from "../../shared/logger.js";
import {
	calculateNext6AMESTMs,
	calculateNext15MinMs,
	calculateNextHourMs,
} from "./time-calculator.js";

// ============================================
// Types
// ============================================

export type JobName = "tradingCycle" | "predictionMarkets" | "filingsSync";

export interface SchedulerTimers {
	tradingCycle: ReturnType<typeof setTimeout> | null;
	predictionMarkets: ReturnType<typeof setTimeout> | null;
	filingsSync: ReturnType<typeof setTimeout> | null;
}

export interface SchedulerIntervals {
	tradingCycleIntervalMs: number;
	predictionMarketsIntervalMs: number;
}

export interface SchedulerHandlers {
	runTradingCycle: () => Promise<void>;
	runPredictionMarkets: () => Promise<void>;
	runFilingsSync: () => Promise<void>;
}

// ============================================
// Scheduler Manager
// ============================================

/** 24 hours in milliseconds */
const FILINGS_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

export class SchedulerManager {
	private readonly timers: SchedulerTimers = {
		tradingCycle: null,
		predictionMarkets: null,
		filingsSync: null,
	};

	private readonly handlers: SchedulerHandlers;
	private intervalProvider: () => SchedulerIntervals;

	constructor(handlers: SchedulerHandlers, intervalProvider: () => SchedulerIntervals) {
		this.handlers = handlers;
		this.intervalProvider = intervalProvider;
	}

	start(): void {
		const msUntilHour = calculateNextHourMs();
		const msUntil15Min = calculateNext15MinMs();
		const msUntil6AM = calculateNext6AMESTMs();

		log.info(
			{
				tradingCycleMinutes: Math.round(msUntilHour / 60000),
				predictionsMinutes: Math.round(msUntil15Min / 60000),
				filingsHours: Math.round(msUntil6AM / 3600000),
			},
			"Scheduler started"
		);

		this.scheduleTradingCycle();
		this.schedulePredictionMarkets();
		this.scheduleFilingsSync();
	}

	stop(): void {
		if (this.timers.tradingCycle) {
			clearTimeout(this.timers.tradingCycle);
			clearInterval(this.timers.tradingCycle);
			this.timers.tradingCycle = null;
		}
		if (this.timers.predictionMarkets) {
			clearTimeout(this.timers.predictionMarkets);
			clearInterval(this.timers.predictionMarkets);
			this.timers.predictionMarkets = null;
		}
		if (this.timers.filingsSync) {
			clearTimeout(this.timers.filingsSync);
			clearInterval(this.timers.filingsSync);
			this.timers.filingsSync = null;
		}
	}

	restart(): void {
		this.stop();
		this.start();
	}

	private scheduleTradingCycle(): void {
		const intervals = this.intervalProvider();
		const msUntilNextHour = calculateNextHourMs();

		this.timers.tradingCycle = setTimeout(() => {
			this.handlers.runTradingCycle();
			this.timers.tradingCycle = setInterval(
				this.handlers.runTradingCycle,
				intervals.tradingCycleIntervalMs
			);
		}, msUntilNextHour);
	}

	private schedulePredictionMarkets(): void {
		const intervals = this.intervalProvider();
		const msUntilNext15Min = calculateNext15MinMs();

		this.timers.predictionMarkets = setTimeout(() => {
			this.handlers.runPredictionMarkets();
			this.timers.predictionMarkets = setInterval(
				this.handlers.runPredictionMarkets,
				intervals.predictionMarketsIntervalMs
			);
		}, msUntilNext15Min);
	}

	private scheduleFilingsSync(): void {
		const msUntil6AM = calculateNext6AMESTMs();

		this.timers.filingsSync = setTimeout(() => {
			this.handlers.runFilingsSync();
			this.timers.filingsSync = setInterval(this.handlers.runFilingsSync, FILINGS_SYNC_INTERVAL_MS);
		}, msUntil6AM);
	}
}

export function createSchedulerManager(
	handlers: SchedulerHandlers,
	intervalProvider: () => SchedulerIntervals
): SchedulerManager {
	return new SchedulerManager(handlers, intervalProvider);
}
