/**
 * Prediction Markets Scanner
 *
 * Creates a comprehensive prediction markets summary for the newspaper.
 * Includes all signals with explanations so agents understand market context.
 *
 * @see docs/plans/42-overnight-macro-watch.md
 */

import { createNodeLogger } from "@cream/logger";

import type { MacroWatchEntry, MacroWatchSession } from "../schemas.js";

const log = createNodeLogger({ service: "macro-watch-prediction", level: "info" });

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
 * Signal configuration with display names, formatting, and context explanations.
 */
const SIGNAL_CONFIG: Record<
	string,
	{
		displayName: string;
		shortName: string;
		format: (value: number) => string;
		symbols: string[];
		/** Explanation of what this signal means for trading decisions */
		context: (value: number) => string;
		/** Order in which to display (lower = first) */
		order: number;
	}
> = {
	fed_cut_probability: {
		displayName: "Fed Rate Cut Probability",
		shortName: "Fed Cut",
		format: (v) => `${(v * 100).toFixed(1)}%`,
		symbols: ["SPY", "TLT", "GLD"],
		context: (v) => {
			if (v >= 0.8) {
				return "Markets strongly expect rate cuts — bullish for equities and bonds";
			}
			if (v >= 0.5) {
				return "Rate cuts likely — generally supportive of risk assets";
			}
			if (v >= 0.3) {
				return "Rate cuts possible but uncertain — mixed signal";
			}
			return "Rate cuts unlikely — hawkish environment";
		},
		order: 1,
	},
	fed_hike_probability: {
		displayName: "Fed Rate Hike Probability",
		shortName: "Fed Hike",
		format: (v) => `${(v * 100).toFixed(1)}%`,
		symbols: ["SPY", "TLT", "GLD"],
		context: (v) => {
			if (v >= 0.5) {
				return "Rate hikes expected — bearish for duration, watch growth stocks";
			}
			if (v >= 0.2) {
				return "Some hike risk — may pressure rate-sensitive sectors";
			}
			return "Hikes unlikely — dovish environment";
		},
		order: 2,
	},
	recession_12m: {
		displayName: "12-Month Recession Probability",
		shortName: "Recession",
		format: (v) => `${(v * 100).toFixed(1)}%`,
		symbols: ["SPY", "IWM", "HYG"],
		context: (v) => {
			if (v >= 0.5) {
				return "High recession risk — favor defensive sectors, quality over growth";
			}
			if (v >= 0.3) {
				return "Elevated recession concerns — consider reducing cyclical exposure";
			}
			if (v >= 0.15) {
				return "Moderate recession risk — normal late-cycle positioning";
			}
			return "Low recession probability — constructive for risk assets";
		},
		order: 3,
	},
	macro_uncertainty: {
		displayName: "Macro Uncertainty Index",
		shortName: "Uncertainty",
		format: (v) => `${(v * 100).toFixed(1)}%`,
		symbols: ["VIX", "SPY"],
		context: (v) => {
			if (v >= 0.5) {
				return "High uncertainty — expect elevated volatility, size positions conservatively";
			}
			if (v >= 0.3) {
				return "Moderate uncertainty — normal risk management applies";
			}
			return "Low uncertainty — markets have high conviction in current trends";
		},
		order: 4,
	},
	policy_event_risk: {
		displayName: "Policy Event Risk",
		shortName: "Policy Risk",
		format: (v) => `${(v * 100).toFixed(1)}%`,
		symbols: ["SPY", "QQQ"],
		context: (v) => {
			if (v >= 0.5) {
				return "High policy uncertainty — binary event risk elevated";
			}
			if (v >= 0.3) {
				return "Moderate policy risk — monitor upcoming Fed/regulatory events";
			}
			return "Low policy risk — outcomes largely priced in";
		},
		order: 5,
	},
	shutdown_probability: {
		displayName: "Government Shutdown Probability",
		shortName: "Shutdown",
		format: (v) => `${(v * 100).toFixed(1)}%`,
		symbols: ["SPY", "TLT"],
		context: (v) => {
			if (v >= 0.5) {
				return "Shutdown likely — short-term volatility risk, typically buying opportunity";
			}
			if (v >= 0.2) {
				return "Shutdown possible — watch for resolution headlines";
			}
			return "Shutdown unlikely — political risk contained";
		},
		order: 6,
	},
	tariff_escalation: {
		displayName: "Tariff Escalation Risk",
		shortName: "Tariff Risk",
		format: (v) => `${(v * 100).toFixed(1)}%`,
		symbols: ["EEM", "FXI", "SPY"],
		context: (v) => {
			if (v >= 0.5) {
				return "High tariff risk — negative for EM, importers, and global supply chains";
			}
			if (v >= 0.3) {
				return "Elevated trade tensions — monitor China-exposed names";
			}
			return "Trade risk contained — globalization headwinds manageable";
		},
		order: 7,
	},
	cpi_surprise: {
		displayName: "CPI Surprise Expectation",
		shortName: "CPI Surprise",
		format: (v) => `${(v * 100).toFixed(1)}%`,
		symbols: ["TLT", "TIPS", "SPY"],
		context: (v) => {
			if (v >= 0.6) {
				return "Markets expect hot CPI — hawkish repricing risk";
			}
			if (v >= 0.4) {
				return "Slight upside CPI risk — inflation concerns persist";
			}
			if (v <= 0.4) {
				return "CPI may come in soft — supportive of rate cut narrative";
			}
			return "CPI expectations balanced";
		},
		order: 8,
	},
	gdp_surprise: {
		displayName: "GDP Surprise Expectation",
		shortName: "GDP Surprise",
		format: (v) => `${(v * 100).toFixed(1)}%`,
		symbols: ["SPY", "IWM"],
		context: (v) => {
			if (v >= 0.6) {
				return "Strong GDP expected — cyclicals may outperform";
			}
			if (v <= 0.4) {
				return "Weak GDP risk — defensive positioning warranted";
			}
			return "GDP expectations in line with consensus";
		},
		order: 9,
	},
};

/**
 * Scan prediction markets and create a comprehensive summary.
 *
 * Creates a single entry with all signals and their trading implications.
 * This gives agents full context for decision-making.
 *
 * @returns Array with a single comprehensive MacroWatchEntry
 */
export async function scanPredictionDeltas(): Promise<MacroWatchEntry[]> {
	const session = getCurrentSession();
	const now = new Date();

	try {
		// Dynamic import to avoid circular dependencies
		const { PredictionMarketsRepository, MacroWatchRepository, getDb } = await import(
			"@cream/storage"
		);

		const db = getDb();
		const repo = new PredictionMarketsRepository(db);
		const macroWatchRepo = new MacroWatchRepository(db);

		// Get latest signals
		const latestSignals = await repo.getLatestSignals();

		if (latestSignals.length === 0) {
			return [];
		}

		// Check for recent prediction summary to avoid duplicates
		// Use 4-hour window for deduplication
		const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);
		const recentPredictionEntries = await macroWatchRepo.findEntries(
			{ category: "PREDICTION", fromTime: fourHoursAgo.toISOString() },
			5,
		);

		// Skip if we already have a recent comprehensive summary
		const hasRecentSummary = recentPredictionEntries.some(
			(e) => e.metadata && (e.metadata as Record<string, unknown>).isComprehensive === true,
		);

		if (hasRecentSummary) {
			return [];
		}

		// Build signal map for easy lookup
		const signalMap = new Map<string, number>();
		for (const signal of latestSignals) {
			signalMap.set(signal.signalType, signal.signalValue);
		}

		// Sort signals by configured order
		const sortedSignalTypes = Object.entries(SIGNAL_CONFIG)
			.filter(([type]) => signalMap.has(type))
			.sort(([, a], [, b]) => a.order - b.order)
			.map(([type]) => type);

		// Build comprehensive headline with key metrics
		const keyMetrics: string[] = [];
		const fedCut = signalMap.get("fed_cut_probability");
		const recession = signalMap.get("recession_12m");
		const uncertainty = signalMap.get("macro_uncertainty");

		if (fedCut !== undefined && SIGNAL_CONFIG.fed_cut_probability) {
			keyMetrics.push(`Fed Cut: ${SIGNAL_CONFIG.fed_cut_probability.format(fedCut)}`);
		}
		if (recession !== undefined && SIGNAL_CONFIG.recession_12m) {
			keyMetrics.push(`Recession: ${SIGNAL_CONFIG.recession_12m.format(recession)}`);
		}
		if (uncertainty !== undefined && SIGNAL_CONFIG.macro_uncertainty) {
			keyMetrics.push(`Uncertainty: ${SIGNAL_CONFIG.macro_uncertainty.format(uncertainty)}`);
		}

		const headline = `Prediction Markets Summary: ${keyMetrics.join(" | ")}`;

		// Build detailed breakdown with context
		const details: string[] = [];
		for (const signalType of sortedSignalTypes) {
			const config = SIGNAL_CONFIG[signalType];
			const value = signalMap.get(signalType);
			if (config && value !== undefined) {
				details.push(`• ${config.displayName}: ${config.format(value)} — ${config.context(value)}`);
			}
		}

		// Collect all affected symbols
		const allSymbols = new Set<string>();
		for (const signalType of sortedSignalTypes) {
			const config = SIGNAL_CONFIG[signalType];
			if (config) {
				for (const symbol of config.symbols) {
					allSymbols.add(symbol);
				}
			}
		}

		// Build metadata with all signal values
		const signalValues: Record<string, number> = {};
		for (const [type, value] of signalMap) {
			signalValues[type] = value;
		}

		return [
			{
				timestamp: now.toISOString(),
				session,
				category: "PREDICTION",
				headline,
				symbols: [...allSymbols].slice(0, 10), // Limit to top 10 symbols
				source: "Prediction Markets (Kalshi + Polymarket)",
				metadata: {
					isComprehensive: true,
					signalCount: latestSignals.length,
					signals: signalValues,
					details: details.join("\n"),
				},
			},
		];
	} catch (error) {
		log.error(
			{ error: error instanceof Error ? error.message : String(error) },
			"Prediction scan failed",
		);
	}

	return [];
}
