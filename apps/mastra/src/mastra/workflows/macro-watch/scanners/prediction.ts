/**
 * Prediction Markets Scanner
 *
 * Creates a comprehensive prediction markets summary for the newspaper.
 * Includes all signals with explanations so agents understand market context.
 *
 * @see docs/plans/42-overnight-macro-watch.md
 */

import { createNodeLogger } from "@cream/logger";

import type { MacroWatchEntry, MacroWatchSession } from "../entry-schemas.js";

const log = createNodeLogger({ service: "macro-watch-prediction", level: "info" });

interface SignalDefinition {
	displayName: string;
	shortName: string;
	format: (value: number) => string;
	symbols: string[];
	context: (value: number) => string;
	order: number;
}

interface PredictionSignal {
	signalType: string;
	signalValue: number;
}

interface PredictionRepositories {
	repo: {
		getLatestSignals: () => Promise<PredictionSignal[]>;
	};
	macroWatchRepo: {
		findEntries: (
			filters: { category: string; fromTime: string },
			limit: number,
		) => Promise<Array<{ metadata?: unknown }>>;
	};
}

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
const SIGNAL_CONFIG: Record<string, SignalDefinition> = {
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

async function loadPredictionRepositories(): Promise<PredictionRepositories> {
	const { PredictionMarketsRepository, MacroWatchRepository, getDb } = await import(
		"@cream/storage"
	);
	const db = getDb();
	return {
		repo: new PredictionMarketsRepository(db),
		macroWatchRepo: new MacroWatchRepository(db),
	};
}

async function hasRecentComprehensiveSummary(
	macroWatchRepo: PredictionRepositories["macroWatchRepo"],
	now: Date,
): Promise<boolean> {
	const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);
	const recentPredictionEntries = await macroWatchRepo.findEntries(
		{ category: "PREDICTION", fromTime: fourHoursAgo.toISOString() },
		5,
	);
	return recentPredictionEntries.some((entry) => {
		const metadata = entry.metadata as Record<string, unknown> | undefined;
		return metadata?.isComprehensive === true;
	});
}

function createSignalMap(latestSignals: PredictionSignal[]): Map<string, number> {
	return new Map(latestSignals.map((signal) => [signal.signalType, signal.signalValue]));
}

function getSortedSignalTypes(signalMap: Map<string, number>): string[] {
	return Object.entries(SIGNAL_CONFIG)
		.filter(([signalType]) => signalMap.has(signalType))
		.sort(([, a], [, b]) => a.order - b.order)
		.map(([signalType]) => signalType);
}

function buildKeyMetric(
	label: string,
	signalType: "fed_cut_probability" | "recession_12m" | "macro_uncertainty",
	signalMap: Map<string, number>,
): string | null {
	const value = signalMap.get(signalType);
	const config = SIGNAL_CONFIG[signalType];
	if (value === undefined || !config) {
		return null;
	}
	return `${label}: ${config.format(value)}`;
}

function buildHeadline(signalMap: Map<string, number>): string {
	const metrics = [
		buildKeyMetric("Fed Cut", "fed_cut_probability", signalMap),
		buildKeyMetric("Recession", "recession_12m", signalMap),
		buildKeyMetric("Uncertainty", "macro_uncertainty", signalMap),
	].filter((metric): metric is string => metric !== null);
	return `Prediction Markets Summary: ${metrics.join(" | ")}`;
}

function buildDetails(sortedSignalTypes: string[], signalMap: Map<string, number>): string[] {
	const details: string[] = [];
	for (const signalType of sortedSignalTypes) {
		const config = SIGNAL_CONFIG[signalType];
		const value = signalMap.get(signalType);
		if (!config || value === undefined) {
			continue;
		}
		details.push(`• ${config.displayName}: ${config.format(value)} — ${config.context(value)}`);
	}
	return details;
}

function collectSymbols(sortedSignalTypes: string[]): string[] {
	const allSymbols = new Set<string>();
	for (const signalType of sortedSignalTypes) {
		const config = SIGNAL_CONFIG[signalType];
		if (!config) {
			continue;
		}
		for (const symbol of config.symbols) {
			allSymbols.add(symbol);
		}
	}
	return [...allSymbols].slice(0, 10);
}

function toSignalValueRecord(signalMap: Map<string, number>): Record<string, number> {
	return Object.fromEntries(signalMap.entries());
}

function buildComprehensiveEntry(
	now: Date,
	session: MacroWatchSession,
	latestSignals: PredictionSignal[],
	sortedSignalTypes: string[],
	signalMap: Map<string, number>,
): MacroWatchEntry {
	return {
		timestamp: now.toISOString(),
		session,
		category: "PREDICTION",
		headline: buildHeadline(signalMap),
		symbols: collectSymbols(sortedSignalTypes),
		source: "Prediction Markets (Kalshi + Polymarket)",
		metadata: {
			isComprehensive: true,
			signalCount: latestSignals.length,
			signals: toSignalValueRecord(signalMap),
			details: buildDetails(sortedSignalTypes, signalMap).join("\n"),
		},
	};
}

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
		const { repo, macroWatchRepo } = await loadPredictionRepositories();
		const latestSignals = await repo.getLatestSignals();
		if (latestSignals.length === 0) {
			return [];
		}

		if (await hasRecentComprehensiveSummary(macroWatchRepo, now)) {
			return [];
		}

		const signalMap = createSignalMap(latestSignals);
		const sortedSignalTypes = getSortedSignalTypes(signalMap);
		return [buildComprehensiveEntry(now, session, latestSignals, sortedSignalTypes, signalMap)];
	} catch (error) {
		log.error(
			{ error: error instanceof Error ? error.message : String(error) },
			"Prediction scan failed",
		);
		return [];
	}
}
