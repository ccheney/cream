import { afterEach, beforeEach } from "bun:test";
import { setCalendarServiceForTests } from "./factory";
import {
	EARLY_CLOSE,
	generateCalendarRange,
	getNextTradingDay as getNextTradingDayHardcoded,
	getPreviousTradingDay as getPreviousTradingDayHardcoded,
	isEarlyClose,
	isTradingDay as isTradingDayHardcoded,
	REGULAR_CLOSE,
} from "./hardcoded";
import type { CalendarService, MarketClock, TradingSession } from "./types";

const PRE_MARKET_START_MINUTES = 4 * 60;
const RTH_START_MINUTES = 9 * 60 + 30;
const REGULAR_CLOSE_MINUTES = 16 * 60;
const EARLY_CLOSE_MINUTES = 13 * 60;
const AFTER_HOURS_END_MINUTES = 20 * 60;

export function formatDateStr(date: Date | string): string {
	if (typeof date === "string") {
		return date.slice(0, 10);
	}
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	const day = String(date.getUTCDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function getETMinutes(date: Date): number {
	const hours = date.getUTCHours() - 5;
	const minutes = date.getUTCMinutes();
	const totalMinutes = hours * 60 + minutes;
	return totalMinutes < 0 ? totalMinutes + 24 * 60 : totalMinutes;
}

function toDate(date: Date | string): Date {
	if (typeof date === "string") {
		if (date.length === 10) {
			return new Date(`${date}T12:00:00Z`);
		}
		return new Date(date);
	}
	return date;
}

function getTradingSessionFromHardcoded(datetime: Date | string): TradingSession {
	const dateObj = toDate(datetime);
	const dateStr = formatDateStr(dateObj);
	if (!isTradingDayHardcoded(dateStr)) {
		return "CLOSED";
	}
	const etMinutes = getETMinutes(dateObj);
	const closeMinutes = isEarlyClose(dateStr) ? EARLY_CLOSE_MINUTES : REGULAR_CLOSE_MINUTES;
	if (etMinutes < PRE_MARKET_START_MINUTES || etMinutes >= AFTER_HOURS_END_MINUTES) {
		return "CLOSED";
	}
	if (etMinutes < RTH_START_MINUTES) {
		return "PRE_MARKET";
	}
	if (etMinutes < closeMinutes) {
		return "RTH";
	}
	if (isEarlyClose(dateStr)) {
		return "CLOSED";
	}
	return "AFTER_HOURS";
}

function getMarketCloseTimeFromHardcoded(date: Date | string): string | null {
	const dateStr = formatDateStr(date);
	if (!isTradingDayHardcoded(dateStr)) {
		return null;
	}
	return isEarlyClose(dateStr) ? EARLY_CLOSE : REGULAR_CLOSE;
}

const mockCalendarService: CalendarService = {
	isMarketOpen: async () => true,
	isTradingDay: async (date) => isTradingDayHardcoded(formatDateStr(date)),
	getMarketCloseTime: async (date) => getMarketCloseTimeFromHardcoded(date),
	getTradingSession: async (datetime) => getTradingSessionFromHardcoded(datetime),
	isRTH: async (datetime) => getTradingSessionFromHardcoded(datetime ?? new Date()) === "RTH",
	getNextTradingDay: async (date) => {
		const dateStr = formatDateStr(date);
		const nextStr = getNextTradingDayHardcoded(dateStr);
		return new Date(`${nextStr}T12:00:00Z`);
	},
	getPreviousTradingDay: async (date) => {
		const dateStr = formatDateStr(date);
		const prevStr = getPreviousTradingDayHardcoded(dateStr);
		return new Date(`${prevStr}T12:00:00Z`);
	},
	getClock: async (): Promise<MarketClock> => ({
		isOpen: true,
		timestamp: new Date(),
		nextOpen: new Date(),
		nextClose: new Date(),
	}),
	getCalendarRange: async (start, end) =>
		generateCalendarRange(formatDateStr(start), formatDateStr(end)),
	isTradingDaySync: (date) => isTradingDayHardcoded(formatDateStr(date)),
	getTradingSessionSync: (datetime) => getTradingSessionFromHardcoded(datetime),
	getMarketCloseTimeSync: (date) => getMarketCloseTimeFromHardcoded(date),
};

export function useHardcodedCalendarService(): void {
	beforeEach(() => {
		setCalendarServiceForTests(mockCalendarService);
	});

	afterEach(() => {
		setCalendarServiceForTests(null);
	});
}
