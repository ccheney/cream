import type {
	ActionForSession,
	Holiday,
	InstrumentTypeForSession,
	SessionValidationConfig,
	SessionValidationResult,
	TradingSession,
} from "../calendar";

const ENTRY_ACTIONS = new Set<ActionForSession>(["BUY", "SELL", "INCREASE"]);
const EXIT_ACTIONS = new Set<ActionForSession>(["CLOSE", "REDUCE"]);

export function isEntryAction(action: ActionForSession): boolean {
	return ENTRY_ACTIONS.has(action);
}

export function isExitAction(action: ActionForSession): boolean {
	return EXIT_ACTIONS.has(action);
}

export function isPassiveAction(action: ActionForSession): boolean {
	return action === "HOLD";
}

export function getAllowedSessions(
	instrumentType: InstrumentTypeForSession,
	action: ActionForSession,
	config: SessionValidationConfig = {},
): TradingSession[] {
	if (isPassiveAction(action)) {
		return ["PRE_MARKET", "RTH", "AFTER_HOURS", "CLOSED"];
	}
	if (isExitAction(action)) {
		if (instrumentType === "OPTION") {
			return ["RTH"];
		}
		if (config.allowExtendedHours) {
			return ["PRE_MARKET", "RTH", "AFTER_HOURS"];
		}
		return ["RTH"];
	}
	if (instrumentType === "OPTION") {
		return ["RTH"];
	}
	if (config.allowExtendedHours) {
		return ["PRE_MARKET", "RTH", "AFTER_HOURS"];
	}
	return ["RTH"];
}

interface SessionValidationDependencies {
	getTradingSession: (datetime: Date | string) => TradingSession;
	getHoliday: (date: Date | string) => Holiday | null;
	formatDateOnly: (date: Date) => string;
}

export function validateSessionForActionWithDeps(
	deps: SessionValidationDependencies,
	action: ActionForSession,
	instrumentType: InstrumentTypeForSession,
	datetime: Date | string,
	config: SessionValidationConfig = {},
): SessionValidationResult {
	if (config.alwaysOpen) {
		return {
			valid: true,
			session: "RTH",
		};
	}

	const session = deps.getTradingSession(datetime);
	const allowedSessions = getAllowedSessions(instrumentType, action, config);
	if (allowedSessions.includes(session)) {
		return {
			valid: true,
			session,
		};
	}

	const dateObj = typeof datetime === "string" ? new Date(datetime) : datetime;
	if (session === "CLOSED") {
		return buildClosedSessionResult(deps, session, dateObj);
	}
	if (isEntryAction(action)) {
		return buildEntryRejection(action, instrumentType, session);
	}
	if (isExitAction(action) && instrumentType === "OPTION") {
		return {
			valid: false,
			session,
			reason: `Option exits can only be executed during RTH (9:30 AM - 4:00 PM ET). Current session: ${session}`,
			suggestion: "Schedule exit for next RTH session",
		};
	}
	return {
		valid: false,
		session,
		reason: `Action ${action} not allowed during ${session}`,
		suggestion: "Re-plan with NO_TRADE",
	};
}

function buildClosedSessionResult(
	deps: SessionValidationDependencies,
	session: TradingSession,
	dateObj: Date,
): SessionValidationResult {
	const dateStr = deps.formatDateOnly(dateObj);
	const holiday = deps.getHoliday(dateStr);
	if (holiday) {
		return {
			valid: false,
			session,
			reason: `Market closed for ${holiday.name}`,
			suggestion: "Re-plan with NO_TRADE or schedule for next trading day",
		};
	}
	return {
		valid: false,
		session,
		reason: `Market closed at ${dateObj.toISOString()}`,
		suggestion: "Re-plan with NO_TRADE or schedule for next trading day",
	};
}

function buildEntryRejection(
	action: ActionForSession,
	instrumentType: InstrumentTypeForSession,
	session: TradingSession,
): SessionValidationResult {
	if (instrumentType === "OPTION") {
		return {
			valid: false,
			session,
			reason: `Options can only be traded during RTH (9:30 AM - 4:00 PM ET). Current session: ${session}`,
			suggestion: "Re-plan with NO_TRADE or wait for RTH",
		};
	}
	return {
		valid: false,
		session,
		reason: `Entry actions (${action}) require RTH (9:30 AM - 4:00 PM ET). Current session: ${session}`,
		suggestion: "Re-plan with NO_TRADE or wait for RTH",
	};
}

interface CycleDependencies {
	getTradingSession: (datetime: Date | string) => TradingSession;
	getMarketCloseTime: (date: Date | string) => string | null;
	getNextTradingDay: (date: Date | string) => Date;
	isMarketOpen: (date: Date | string) => boolean;
	formatDateOnly: (date: Date) => string;
	parseTimeToMinutes: (time: string) => number;
}

export function canStartCycleWithDeps(
	deps: CycleDependencies,
	datetime: Date | string,
	minMinutesBeforeClose: number,
): boolean {
	const dateObj = typeof datetime === "string" ? new Date(datetime) : datetime;
	const dateStr = deps.formatDateOnly(dateObj);
	if (!deps.isMarketOpen(dateStr) || deps.getTradingSession(datetime) !== "RTH") {
		return false;
	}

	const closeTime = deps.getMarketCloseTime(dateStr);
	if (!closeTime) {
		return false;
	}
	const hours = dateObj.getUTCHours() - 5;
	const currentMinutes = hours * 60 + dateObj.getUTCMinutes();
	const closeMinutes = deps.parseTimeToMinutes(closeTime);
	return closeMinutes - currentMinutes >= minMinutesBeforeClose;
}

export function isTradingPossibleFromSession(session: TradingSession): boolean {
	return session !== "CLOSED";
}

export function getNextRTHStartWithDeps(deps: CycleDependencies, datetime: Date | string): Date {
	const dateObj = typeof datetime === "string" ? new Date(datetime) : new Date(datetime.getTime());
	const session = deps.getTradingSession(dateObj);
	if (session === "RTH") {
		return dateObj;
	}
	if (session === "PRE_MARKET") {
		const dateStr = deps.formatDateOnly(dateObj);
		return new Date(`${dateStr}T14:30:00.000Z`);
	}
	const nextDay = deps.getNextTradingDay(dateObj);
	return new Date(`${deps.formatDateOnly(nextDay)}T14:30:00.000Z`);
}

export function getMinutesToCloseWithDeps(
	deps: Pick<
		CycleDependencies,
		"formatDateOnly" | "getMarketCloseTime" | "isMarketOpen" | "parseTimeToMinutes"
	>,
	datetime: Date | string,
): number | null {
	const dateObj = typeof datetime === "string" ? new Date(datetime) : datetime;
	const dateStr = deps.formatDateOnly(dateObj);
	if (!deps.isMarketOpen(dateStr)) {
		return null;
	}

	const closeTime = deps.getMarketCloseTime(dateStr);
	if (!closeTime) {
		return null;
	}
	const hours = dateObj.getUTCHours() - 5;
	const currentMinutes = (hours < 0 ? hours + 24 : hours) * 60 + dateObj.getUTCMinutes();
	const closeMinutes = deps.parseTimeToMinutes(closeTime);
	const diff = closeMinutes - currentMinutes;
	return diff > 0 ? diff : 0;
}
