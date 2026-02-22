/**
 * Scheduler Manager
 *
 * Manages timer-based scheduling for recurring jobs.
 * Provides lifecycle methods for starting, stopping, and rescheduling timers.
 *
 * Session-aware scheduling:
 * - Runs macro watch hourly across all sessions
 * - Near open (9:00-9:30 AM ET): Compile morning newspaper before macro watch
 */

import { getCalendarService, type TradingSession } from "@cream/domain";

import { log } from "../../shared/logger.js";
import {
	calculateNext6AMESTMs,
	calculateNext15MinMs,
	calculateNextEconCalendarSyncMs,
	calculateNextHourMs,
	getNext6AMESTDate,
	getNext15MinDate,
	getNextEconCalendarSyncDate,
	getNextHourDate,
} from "./time-calculator.js";

// ============================================
// Types
// ============================================

export type JobName =
	| "macroWatch"
	| "predictionMarkets"
	| "filingsSync"
	| "newspaper"
	| "economicCalendar";

export interface SchedulerTimers {
	macroWatch: ReturnType<typeof setTimeout> | null;
	predictionMarkets: ReturnType<typeof setTimeout> | null;
	filingsSync: ReturnType<typeof setTimeout> | null;
	economicCalendar: ReturnType<typeof setTimeout> | null;
}

export interface SchedulerIntervals {
	predictionMarketsIntervalMs: number;
}

export interface NextRunTimes {
	macroWatch: Date | null;
	predictionMarkets: Date | null;
	filingsSync: Date | null;
	economicCalendar: Date | null;
}

export interface SchedulerHandlers {
	runPredictionMarkets: () => Promise<void>;
	runFilingsSync: () => Promise<void>;
	runMacroWatch: () => Promise<void>;
	compileNewspaper: () => Promise<void>;
	runEconomicCalendarSync?: () => Promise<void>;
}

// ============================================
// Scheduler Manager
// ============================================

/** 24 hours in milliseconds */
const FILINGS_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

export class SchedulerManager {
	private readonly timers: SchedulerTimers = {
		macroWatch: null,
		predictionMarkets: null,
		filingsSync: null,
		economicCalendar: null,
	};

	private nextRun: NextRunTimes = {
		macroWatch: null,
		predictionMarkets: null,
		filingsSync: null,
		economicCalendar: null,
	};

	private readonly handlers: SchedulerHandlers;
	private intervalProvider: () => SchedulerIntervals;

	constructor(handlers: SchedulerHandlers, intervalProvider: () => SchedulerIntervals) {
		this.handlers = handlers;
		this.intervalProvider = intervalProvider;
	}

	getNextRunTimes(): NextRunTimes {
		return { ...this.nextRun };
	}

	start(): void {
		const msUntilHour = calculateNextHourMs();
		const msUntil15Min = calculateNext15MinMs();
		const msUntil6AM = calculateNext6AMESTMs();
		const msUntilEconCal = calculateNextEconCalendarSyncMs();

		log.info(
			{
				macroWatchMinutes: Math.round(msUntilHour / 60000),
				predictionsMinutes: Math.round(msUntil15Min / 60000),
				filingsHours: Math.round(msUntil6AM / 3600000),
				econCalendarHours: Math.round(msUntilEconCal / 3600000),
			},
			"Scheduler started",
		);

		this.scheduleMacroWatch();
		this.schedulePredictionMarkets();
		this.scheduleFilingsSync();
		this.scheduleEconomicCalendarSync();
	}

	stop(): void {
		if (this.timers.macroWatch) {
			clearTimeout(this.timers.macroWatch);
			clearInterval(this.timers.macroWatch);
			this.timers.macroWatch = null;
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
		if (this.timers.economicCalendar) {
			clearTimeout(this.timers.economicCalendar);
			clearInterval(this.timers.economicCalendar);
			this.timers.economicCalendar = null;
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

	private async runMacroWatchOrLog(session: TradingSession, message: string): Promise<void> {
		log.info({ session }, message);
		await this.handlers.runMacroWatch();
	}

	private async handleClosedSession(session: TradingSession): Promise<void> {
		await this.runMacroWatchOrLog(session, "Market closed, running macro watch");
	}

	private async handlePremarketSession(session: TradingSession): Promise<void> {
		if (this.isNearOpen()) {
			log.info({}, "Near market open, compiling morning newspaper");
			await this.handlers.compileNewspaper();
			await this.runMacroWatchOrLog(session, "Near open pre-market, running macro watch");
			return;
		}

		await this.runMacroWatchOrLog(session, "Early pre-market, running macro watch");
	}

	/**
	 * Session-aware macro watch handler.
	 */
	private async runMacroWatchWithSessionGating(): Promise<void> {
		const session = await this.getCurrentSession();

		log.info({ session }, "Macro watch cycle triggered");

		if (session === "CLOSED" || session === "AFTER_HOURS") {
			await this.handleClosedSession(session);
			return;
		}

		if (session === "PRE_MARKET") {
			await this.handlePremarketSession(session);
			return;
		}

		await this.runMacroWatchOrLog(session, "RTH session, running macro watch");
	}

	private scheduleMacroWatch(): void {
		const msUntilNextHour = calculateNextHourMs();
		const HOURLY_INTERVAL_MS = 60 * 60 * 1000;
		this.nextRun.macroWatch = getNextHourDate();

		this.timers.macroWatch = setTimeout(() => {
			this.runMacroWatchWithSessionGating().catch((error) => {
				log.error(
					{ error: error instanceof Error ? error.message : String(error) },
					"Macro watch cycle failed",
				);
			});
			// Update next run time after execution
			this.nextRun.macroWatch = new Date(Date.now() + HOURLY_INTERVAL_MS);
			this.timers.macroWatch = setInterval(() => {
				this.runMacroWatchWithSessionGating().catch((error) => {
					log.error(
						{ error: error instanceof Error ? error.message : String(error) },
						"Macro watch cycle failed",
					);
				});
				// Update next run time after each interval execution
				this.nextRun.macroWatch = new Date(Date.now() + HOURLY_INTERVAL_MS);
			}, HOURLY_INTERVAL_MS);
		}, msUntilNextHour);
	}

	private schedulePredictionMarkets(): void {
		const intervals = this.intervalProvider();
		const msUntilNext15Min = calculateNext15MinMs();
		this.nextRun.predictionMarkets = getNext15MinDate();

		this.timers.predictionMarkets = setTimeout(() => {
			this.handlers.runPredictionMarkets();
			// Update next run time after execution
			this.nextRun.predictionMarkets = new Date(Date.now() + intervals.predictionMarketsIntervalMs);
			this.timers.predictionMarkets = setInterval(() => {
				this.handlers.runPredictionMarkets();
				// Update next run time after each interval execution
				this.nextRun.predictionMarkets = new Date(
					Date.now() + intervals.predictionMarketsIntervalMs,
				);
			}, intervals.predictionMarketsIntervalMs);
		}, msUntilNext15Min);
	}

	private scheduleFilingsSync(): void {
		const msUntil6AM = calculateNext6AMESTMs();
		this.nextRun.filingsSync = getNext6AMESTDate();

		this.timers.filingsSync = setTimeout(() => {
			this.handlers.runFilingsSync();
			// Update next run time after execution
			this.nextRun.filingsSync = new Date(Date.now() + FILINGS_SYNC_INTERVAL_MS);
			this.timers.filingsSync = setInterval(() => {
				this.handlers.runFilingsSync();
				// Update next run time after each interval execution
				this.nextRun.filingsSync = new Date(Date.now() + FILINGS_SYNC_INTERVAL_MS);
			}, FILINGS_SYNC_INTERVAL_MS);
		}, msUntil6AM);
	}

	private scheduleEconomicCalendarSync(): void {
		if (!this.handlers.runEconomicCalendarSync) {
			return;
		}

		const ECON_CAL_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours
		const msUntilNext = calculateNextEconCalendarSyncMs();
		this.nextRun.economicCalendar = getNextEconCalendarSyncDate();

		this.timers.economicCalendar = setTimeout(() => {
			this.handlers.runEconomicCalendarSync?.().catch((error) => {
				log.error(
					{ error: error instanceof Error ? error.message : String(error) },
					"Economic calendar sync failed",
				);
			});
			// Update next run time after execution
			this.nextRun.economicCalendar = new Date(Date.now() + ECON_CAL_INTERVAL_MS);
			this.timers.economicCalendar = setInterval(() => {
				this.handlers.runEconomicCalendarSync?.().catch((error) => {
					log.error(
						{ error: error instanceof Error ? error.message : String(error) },
						"Economic calendar sync failed",
					);
				});
				// Update next run time after each interval execution
				this.nextRun.economicCalendar = new Date(Date.now() + ECON_CAL_INTERVAL_MS);
			}, ECON_CAL_INTERVAL_MS);
		}, msUntilNext);
	}
}

export function createSchedulerManager(
	handlers: SchedulerHandlers,
	intervalProvider: () => SchedulerIntervals,
): SchedulerManager {
	return new SchedulerManager(handlers, intervalProvider);
}
