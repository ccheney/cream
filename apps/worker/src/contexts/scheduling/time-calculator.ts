/**
 * Time Calculator
 *
 * Domain service for calculating scheduling boundaries and time intervals.
 * All times are handled in America/New_York timezone unless specified.
 */

export const TIMEZONE = "America/New_York";

export function calculateNextHourMs(): number {
	const now = new Date();
	const nextHour = new Date(now);
	nextHour.setHours(nextHour.getHours() + 1);
	nextHour.setMinutes(0);
	nextHour.setSeconds(0);
	nextHour.setMilliseconds(0);
	return nextHour.getTime() - now.getTime();
}

export function calculateNext15MinMs(): number {
	const now = new Date();
	const next15Min = new Date(now);
	const minutes = now.getMinutes();
	const nextQuarter = Math.ceil((minutes + 1) / 15) * 15;
	next15Min.setMinutes(nextQuarter % 60);
	if (nextQuarter >= 60) {
		next15Min.setHours(next15Min.getHours() + 1);
	}
	next15Min.setSeconds(0);
	next15Min.setMilliseconds(0);
	return next15Min.getTime() - now.getTime();
}

/**
 * Calculate milliseconds until next 6 AM EST.
 * Used for SEC filings sync which runs once per day at 6 AM Eastern.
 */
export function calculateNext6AMESTMs(): number {
	const now = new Date();

	const estOptions: Intl.DateTimeFormatOptions = {
		timeZone: TIMEZONE,
		hour: "numeric",
		hour12: false,
	};
	const estHour = parseInt(new Intl.DateTimeFormat("en-US", estOptions).format(now), 10);

	const next6AM = new Date(now);
	if (estHour >= 6) {
		next6AM.setDate(next6AM.getDate() + 1);
	}

	// 6 AM EST = 11 AM UTC (approximate - production should use proper timezone library)
	next6AM.setUTCHours(11, 0, 0, 0);

	return next6AM.getTime() - now.getTime();
}

/**
 * Calculate the actual Date of the next hour boundary.
 */
export function getNextHourDate(): Date {
	const now = new Date();
	const nextHour = new Date(now);
	nextHour.setHours(nextHour.getHours() + 1);
	nextHour.setMinutes(0);
	nextHour.setSeconds(0);
	nextHour.setMilliseconds(0);
	return nextHour;
}

/**
 * Calculate the actual Date of the next 15-minute boundary.
 */
export function getNext15MinDate(): Date {
	const now = new Date();
	const next15Min = new Date(now);
	const minutes = now.getMinutes();
	const nextQuarter = Math.ceil((minutes + 1) / 15) * 15;
	next15Min.setMinutes(nextQuarter % 60);
	if (nextQuarter >= 60) {
		next15Min.setHours(next15Min.getHours() + 1);
	}
	next15Min.setSeconds(0);
	next15Min.setMilliseconds(0);
	return next15Min;
}

/**
 * Calculate the actual Date of the next 6 AM EST.
 */
export function getNext6AMESTDate(): Date {
	const now = new Date();

	const estOptions: Intl.DateTimeFormatOptions = {
		timeZone: TIMEZONE,
		hour: "numeric",
		hour12: false,
	};
	const estHour = parseInt(new Intl.DateTimeFormat("en-US", estOptions).format(now), 10);

	const next6AM = new Date(now);
	if (estHour >= 6) {
		next6AM.setDate(next6AM.getDate() + 1);
	}

	// 6 AM EST = 11 AM UTC (approximate - production should use proper timezone library)
	next6AM.setUTCHours(11, 0, 0, 0);

	return next6AM;
}
