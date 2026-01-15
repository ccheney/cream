/**
 * Scheduler Manager
 *
 * Manages timer-based scheduling for recurring jobs.
 * Provides lifecycle methods for starting, stopping, and rescheduling timers.
 *
 * Session-aware scheduling:
 * - RTH/PRE_MARKET: Full OODA trading cycle
 * - AFTER_HOURS/CLOSED: Lightweight macro watch scan
 * - Near open (9:00-9:30 AM ET): Compile morning newspaper before first RTH cycle
 */

import { getCalendarService, type TradingSession } from "@cream/domain";

import { log } from "../../shared/logger.js";
import {
	calculateNext6AMESTMs,
	calculateNext15MinMs,
	calculateNextHourMs,
} from "./time-calculator.js";

// ============================================
// Types
// ============================================

export type JobName =
	| "tradingCycle"
	| "predictionMarkets"
	| "filingsSync"
	| "macroWatch"
	| "newspaper";

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
	runMacroWatch?: () => Promise<void>;
	compileNewspaper?: () => Promise<void>;
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

	/**
	 * Check if current time is in the near-open window (9:00-9:30 AM ET).
	 * This is when we compile the morning newspaper before RTH.
	 */
	private isNearOpen(): boolean {
		const now = new Date();
		// Convert to ET (approximated as UTC-5 for EST, UTC-4 for EDT)
		// Using UTC-5 as conservative estimate
		const etHour = (now.getUTCHours() - 5 + 24) % 24;
		const etMinute = now.getUTCMinutes();
		return etHour === 9 && etMinute < 30;
	}

	/**
	 * Get the current trading session, falling back to CLOSED if calendar unavailable.
	 */
	private async getCurrentSession(): Promise<TradingSession> {
		const calendar = getCalendarService();
		if (!calendar) {
			log.warn({}, "CalendarService not available, assuming CLOSED");
			return "CLOSED";
		}
		return calendar.getTradingSession(new Date());
	}

	/**
	 * Session-aware trading cycle handler.
	 *
	 * - RTH: Run full OODA trading cycle
	 * - PRE_MARKET (near open): Compile newspaper, then run trading cycle
	 * - PRE_MARKET (early): Run macro watch scan
	 * - AFTER_HOURS/CLOSED: Run macro watch scan instead of trading cycle
	 */
	private async runTradingCycleWithGating(): Promise<void> {
		const session = await this.getCurrentSession();

		log.info({ session }, "Trading cycle triggered");

		if (session === "CLOSED" || session === "AFTER_HOURS") {
			// Market closed - run lightweight macro watch instead
			if (this.handlers.runMacroWatch) {
				log.info({ session }, "Market closed, running macro watch instead of trading cycle");
				await this.handlers.runMacroWatch();
			} else {
				log.info({ session }, "Market closed, skipping trading cycle (macro watch not configured)");
			}
			return;
		}

		if (session === "PRE_MARKET") {
			if (this.isNearOpen()) {
				// Near market open - compile overnight digest before first RTH cycle
				if (this.handlers.compileNewspaper) {
					log.info({}, "Near market open, compiling morning newspaper");
					await this.handlers.compileNewspaper();
				}
				// Then run the trading cycle
				await this.handlers.runTradingCycle();
			} else {
				// Early pre-market - run macro watch
				if (this.handlers.runMacroWatch) {
					log.info({ session }, "Early pre-market, running macro watch");
					await this.handlers.runMacroWatch();
				} else {
					log.info({ session }, "Early pre-market, skipping (macro watch not configured)");
				}
			}
			return;
		}

		// RTH - run full OODA trading cycle
		await this.handlers.runTradingCycle();
	}

	private scheduleTradingCycle(): void {
		const intervals = this.intervalProvider();
		const msUntilNextHour = calculateNextHourMs();

		this.timers.tradingCycle = setTimeout(() => {
			this.runTradingCycleWithGating().catch((error) => {
				log.error(
					{ error: error instanceof Error ? error.message : String(error) },
					"Trading cycle with gating failed"
				);
			});
			this.timers.tradingCycle = setInterval(() => {
				this.runTradingCycleWithGating().catch((error) => {
					log.error(
						{ error: error instanceof Error ? error.message : String(error) },
						"Trading cycle with gating failed"
					);
				});
			}, intervals.tradingCycleIntervalMs);
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
