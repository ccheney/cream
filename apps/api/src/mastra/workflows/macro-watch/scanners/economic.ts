/**
 * Economic Calendar Scanner
 *
 * Checks Alpha Vantage for upcoming economic releases.
 *
 * @see docs/plans/42-overnight-macro-watch.md
 */

import type { MacroWatchEntry, MacroWatchSession } from "../schemas.js";

/**
 * Determine the macro watch session based on current time.
 */
function getCurrentSession(): MacroWatchSession {
	const now = new Date();
	const etHour = (now.getUTCHours() - 5 + 24) % 24;

	if (etHour >= 4 && etHour < 10) {
		return "PRE_MARKET";
	}
	if (etHour >= 16 && etHour < 20) {
		return "AFTER_HOURS";
	}
	return "OVERNIGHT";
}

/**
 * Key economic indicators and their release patterns.
 */
const ECONOMIC_INDICATORS = [
	{
		name: "CPI",
		description: "Consumer Price Index",
		releaseDay: "2nd Tuesday",
		releaseTime: "8:30 AM ET",
		marketImpact: "HIGH",
	},
	{
		name: "NFP",
		description: "Non-Farm Payrolls",
		releaseDay: "1st Friday",
		releaseTime: "8:30 AM ET",
		marketImpact: "HIGH",
	},
	{
		name: "FOMC",
		description: "Federal Reserve Rate Decision",
		releaseDay: "Wednesday after meeting",
		releaseTime: "2:00 PM ET",
		marketImpact: "HIGH",
	},
	{
		name: "GDP",
		description: "Gross Domestic Product",
		releaseDay: "4th week",
		releaseTime: "8:30 AM ET",
		marketImpact: "MEDIUM",
	},
	{
		name: "ISM",
		description: "ISM Manufacturing PMI",
		releaseDay: "1st business day",
		releaseTime: "10:00 AM ET",
		marketImpact: "MEDIUM",
	},
] as const;

/**
 * Scan for upcoming economic releases.
 *
 * Note: This is a simplified implementation using static calendar.
 * Full implementation would:
 * 1. Fetch economic calendar from Alpha Vantage or other provider
 * 2. Check for releases within next 24 hours
 * 3. Generate entries for high-impact releases
 *
 * @returns Array of MacroWatchEntry for upcoming economic releases
 */
export async function scanEconomicCalendar(): Promise<MacroWatchEntry[]> {
	const entries: MacroWatchEntry[] = [];
	const session = getCurrentSession();
	const now = new Date();
	const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

	try {
		// Dynamic import to avoid circular dependencies
		const { createAlphaVantageClientFromEnv, isAlphaVantageConfigured } = await import(
			"@cream/marketdata"
		);

		// Only attempt API calls if Alpha Vantage is configured
		if (isAlphaVantageConfigured()) {
			try {
				const avClient = createAlphaVantageClientFromEnv();

				// Fetch latest economic data to check for recent releases
				const fedFundsRate = await avClient.getFederalFundsRate();
				const treasuryYield = await avClient.getTreasuryYield("10year");

				// Check if there was a recent Fed rate change
				if (fedFundsRate.data.length >= 2) {
					const latest = fedFundsRate.data[0];
					const previous = fedFundsRate.data[1];

					if (latest && previous && latest.value !== previous.value) {
						entries.push({
							timestamp: now.toISOString(),
							session,
							category: "ECONOMIC",
							headline: `Fed Funds Rate: ${latest.value}% (prev: ${previous.value}%)`,
							symbols: ["SPY", "QQQ", "TLT"],
							source: "Alpha Vantage",
							metadata: {
								indicator: "FEDERAL_FUNDS_RATE",
								current: latest.value,
								previous: previous.value,
								date: latest.date,
							},
						});
					}
				}

				// Check for treasury yield changes
				if (treasuryYield.data.length >= 2) {
					const latest = treasuryYield.data[0];
					const previous = treasuryYield.data[1];

					if (latest && previous) {
						const delta = Number(latest.value) - Number(previous.value);
						// Report significant yield changes (>5bps)
						if (Math.abs(delta) > 0.05) {
							entries.push({
								timestamp: now.toISOString(),
								session,
								category: "ECONOMIC",
								headline: `10Y Treasury: ${latest.value}% (${delta > 0 ? "+" : ""}${(delta * 100).toFixed(1)}bps)`,
								symbols: ["TLT", "IEF", "BND"],
								source: "Alpha Vantage",
								metadata: {
									indicator: "TREASURY_YIELD_10Y",
									current: latest.value,
									previous: previous.value,
									delta,
									date: latest.date,
								},
							});
						}
					}
				}
			} catch {
				// Alpha Vantage API error (rate limited, invalid key, etc.) - use static calendar check
			}
		}

		// Static calendar check for high-impact releases
		const dayOfWeek = now.getDay();
		const dayOfMonth = now.getDate();
		const tomorrowDayOfWeek = tomorrow.getDay();

		// Check for known release patterns
		for (const indicator of ECONOMIC_INDICATORS) {
			let releasesSoon = false;

			// Friday = NFP release (first Friday of month)
			if (indicator.name === "NFP" && tomorrowDayOfWeek === 5 && dayOfMonth <= 7) {
				releasesSoon = true;
			}

			// Tuesday = CPI release (around 10th-14th of month)
			if (
				indicator.name === "CPI" &&
				tomorrowDayOfWeek === 2 &&
				dayOfMonth >= 10 &&
				dayOfMonth <= 14
			) {
				releasesSoon = true;
			}

			// Wednesday = FOMC (check meeting schedule)
			// ISM = First business day (Monday or Tuesday if Monday is holiday)
			if (indicator.name === "ISM" && dayOfMonth <= 3 && (dayOfWeek === 1 || dayOfWeek === 2)) {
				releasesSoon = true;
			}

			if (releasesSoon) {
				entries.push({
					timestamp: now.toISOString(),
					session,
					category: "ECONOMIC",
					headline: `Upcoming: ${indicator.description} release tomorrow (${indicator.marketImpact} impact)`,
					symbols: ["SPY", "QQQ"],
					source: "Economic Calendar",
					metadata: {
						indicator: indicator.name,
						description: indicator.description,
						expectedTime: indicator.releaseTime,
						marketImpact: indicator.marketImpact,
					},
				});
			}
		}
	} catch {
		// Return empty on error - economic scan is best-effort
	}

	return entries;
}
