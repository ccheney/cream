/**
 * Situation Brief Generation
 *
 * Generates deterministic 'situation briefs' from market snapshots for:
 * - Retrieval query generation (vector embedding)
 * - Agent context for Orient phase
 *
 * @see docs/plans/04-memory-helixdb.md:274-287
 */

// ============================================
// Types
// ============================================

/**
 * Asset type classification
 */
export type AssetType = "EQUITY" | "OPTION";

/**
 * Instrument information for the situation brief
 */
export interface SituationBriefInstrument {
	/** Symbol being traded (e.g., "AAPL", "AAPL240119C150") */
	symbol: string;
	/** Underlying symbol for options (e.g., "AAPL") */
	underlying?: string;
	/** Asset type */
	assetType: AssetType;
}

/**
 * Market regime information
 */
export interface SituationBriefRegime {
	/** Regime label (e.g., "BULLISH_TREND", "VOLATILE_SIDEWAYS") */
	label: string;
	/** Confidence score of regime classification (0-1) */
	confidence: number;
}

/**
 * Technical indicator with interpretation
 */
export interface SituationBriefIndicator {
	/** Indicator name (e.g., "RSI_14", "ATR_14") */
	name: string;
	/** Indicator value */
	value: number;
	/** Human-readable interpretation */
	interpretation: string;
}

/**
 * Position direction
 */
export type PositionDirection = "LONG" | "SHORT" | "FLAT";

/**
 * Current position context
 */
export interface SituationBriefPosition {
	/** Position direction */
	direction: PositionDirection;
	/** Position size (number of shares/contracts) */
	size: number;
	/** Unrealized P&L in dollars */
	unrealizedPnL: number;
	/** Days position has been held */
	holdingDays: number;
}

/**
 * Recent external event summary
 */
export interface SituationBriefEvent {
	/** Event type (e.g., "EARNINGS", "NEWS", "MACRO") */
	type: string;
	/** Brief summary of the event */
	summary: string;
	/** Event timestamp (epoch ms) */
	timestamp: number;
}

/**
 * Complete situation brief for retrieval and agent context.
 *
 * Per plan spec (lines 274-287):
 * - Instrument context (symbol, underlying, asset type)
 * - Regime label and confidence
 * - Key indicators (config-selected subset)
 * - Position context (if any)
 * - External event summaries
 * - Text summary for embedding
 */
export interface SituationBrief {
	/** Instrument being traded */
	instrument: SituationBriefInstrument;
	/** Current market regime */
	regime: SituationBriefRegime;
	/** Key technical indicators (config-driven selection) */
	indicators: SituationBriefIndicator[];
	/** Current position (if any) */
	position?: SituationBriefPosition;
	/** Recent relevant events */
	recentEvents: SituationBriefEvent[];
	/** Text summary for vector embedding */
	textSummary: string;
}

/**
 * Configuration for situation brief generation.
 * Allows selecting which indicators to include.
 */
export interface SituationBriefConfig {
	/** Indicators to include in the brief (e.g., ["RSI_14", "ATR_14", "SMA_50"]) */
	indicators: string[];
	/** Maximum number of recent events to include (default: 5) */
	maxEvents?: number;
	/** Hours to look back for events (default: 24) */
	eventLookbackHours?: number;
}

/**
 * Default situation brief configuration
 */
export const DEFAULT_SITUATION_BRIEF_CONFIG: Required<SituationBriefConfig> = {
	indicators: ["RSI_14", "ATR_14", "SMA_50", "SMA_200"],
	maxEvents: 5,
	eventLookbackHours: 24,
};

// ============================================
// Retrieval Statistics
// ============================================

/**
 * Return distribution percentiles
 */
export interface ReturnDistribution {
	/** 10th percentile */
	p10: number;
	/** 25th percentile */
	p25: number;
	/** 50th percentile (median) */
	p50: number;
	/** 75th percentile */
	p75: number;
	/** 90th percentile */
	p90: number;
}

/**
 * Statistics for retrieved similar cases.
 *
 * Per plan spec (lines 281-287):
 * - Win rate, average return, average holding time
 * - Distribution summary
 */
export interface RetrievalStatistics {
	/** Total number of cases retrieved */
	totalCases: number;
	/** Win rate (0-1) */
	winRate: number;
	/** Average return percentage */
	avgReturn: number;
	/** Average holding period in days */
	avgHoldingDays: number;
	/** Return distribution by percentiles */
	returnDistribution: ReturnDistribution;
}

// ============================================
// Input Types
// ============================================

/**
 * Market snapshot input for situation brief generation.
 * This is the raw input that gets transformed into a structured SituationBrief.
 */
export interface SituationBriefInput {
	/** Instrument symbol */
	symbol: string;
	/** Underlying symbol (for options) */
	underlying?: string;
	/** Asset type (defaults to EQUITY if not specified) */
	assetType?: AssetType;
	/** Regime label */
	regimeLabel: string;
	/** Regime confidence (defaults to 1.0) */
	regimeConfidence?: number;
	/** Raw indicators as name-value pairs */
	indicators?: Record<string, number>;
	/** Current position */
	position?: {
		direction: PositionDirection;
		size: number;
		unrealizedPnL: number;
		holdingDays: number;
	};
	/** Recent events */
	events?: Array<{
		type: string;
		summary: string;
		timestamp: number;
	}>;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Interpret an indicator value in human-readable terms.
 */
function interpretIndicator(name: string, value: number): string {
	const upperName = name.toUpperCase();

	if (upperName.includes("RSI")) {
		if (value > 70) {
			return "overbought";
		}
		if (value < 30) {
			return "oversold";
		}
		return "neutral";
	}

	if (upperName.includes("ATR")) {
		// ATR interpretation depends on the price, but we can give a relative sense
		return value > 5 ? "high volatility" : value > 2 ? "moderate volatility" : "low volatility";
	}

	if (upperName.includes("SMA")) {
		// SMA doesn't have an interpretation without price context
		return `${value.toFixed(2)}`;
	}

	if (upperName.includes("VOLUME_RATIO") || upperName.includes("VOLUME")) {
		return value > 2 ? "high volume" : value > 1 ? "above average" : "below average";
	}

	// Default: just the value
	return value.toFixed(2);
}

/**
 * Calculate percentile from sorted array
 */
function percentile(sorted: number[], p: number): number {
	if (sorted.length === 0) {
		return 0;
	}
	const index = (p / 100) * (sorted.length - 1);
	const lower = Math.floor(index);
	const upper = Math.ceil(index);
	if (lower === upper) {
		return sorted[lower] ?? 0;
	}
	const fraction = index - lower;
	return (sorted[lower] ?? 0) * (1 - fraction) + (sorted[upper] ?? 0) * fraction;
}

// ============================================
// Main Functions
// ============================================

/**
 * Generate a structured situation brief from market snapshot input.
 *
 * @param input - Market snapshot data
 * @param config - Configuration for indicator selection (defaults applied)
 * @returns Structured situation brief with text summary
 *
 * @example
 * ```typescript
 * const brief = generateSituationBrief({
 *   symbol: "AAPL",
 *   regimeLabel: "BULLISH_TREND",
 *   indicators: { RSI_14: 65, ATR_14: 3.2, SMA_50: 180.5 },
 * });
 *
 * // Use textSummary for embedding
 * const embedding = await embedder.generateEmbedding(brief.textSummary);
 * ```
 */
export function generateSituationBrief(
	input: SituationBriefInput,
	config: SituationBriefConfig = DEFAULT_SITUATION_BRIEF_CONFIG
): SituationBrief {
	const mergedConfig = { ...DEFAULT_SITUATION_BRIEF_CONFIG, ...config };

	// Build instrument
	const instrument: SituationBriefInstrument = {
		symbol: input.symbol,
		underlying: input.underlying,
		assetType: input.assetType ?? (input.underlying ? "OPTION" : "EQUITY"),
	};

	// Build regime
	const regime: SituationBriefRegime = {
		label: input.regimeLabel,
		confidence: input.regimeConfidence ?? 1.0,
	};

	// Build indicators (filtered by config)
	const indicators: SituationBriefIndicator[] = [];
	if (input.indicators) {
		for (const name of mergedConfig.indicators) {
			const value = input.indicators[name];
			if (value !== undefined) {
				indicators.push({
					name,
					value,
					interpretation: interpretIndicator(name, value),
				});
			}
		}
	}

	// Build position
	const position = input.position
		? {
				direction: input.position.direction,
				size: input.position.size,
				unrealizedPnL: input.position.unrealizedPnL,
				holdingDays: input.position.holdingDays,
			}
		: undefined;

	// Build events (limited by config)
	const cutoffTime = Date.now() - mergedConfig.eventLookbackHours * 60 * 60 * 1000;
	const recentEvents: SituationBriefEvent[] = (input.events ?? [])
		.filter((e) => e.timestamp >= cutoffTime)
		.slice(0, mergedConfig.maxEvents)
		.map((e) => ({
			type: e.type,
			summary: e.summary,
			timestamp: e.timestamp,
		}));

	// Generate text summary for embedding
	const textSummary = formatTextSummary(instrument, regime, indicators, position, recentEvents);

	return {
		instrument,
		regime,
		indicators,
		position,
		recentEvents,
		textSummary,
	};
}

/**
 * Format the text summary for vector embedding.
 */
function formatTextSummary(
	instrument: SituationBriefInstrument,
	regime: SituationBriefRegime,
	indicators: SituationBriefIndicator[],
	position: SituationBriefPosition | undefined,
	events: SituationBriefEvent[]
): string {
	const parts: string[] = [];

	// Instrument context
	parts.push(`Trading ${instrument.symbol}`);
	if (instrument.underlying) {
		parts.push(`(underlying: ${instrument.underlying})`);
	}
	parts.push(`in ${regime.label} market regime.`);

	// Indicators
	if (indicators.length > 0) {
		const indicatorText = indicators
			.map((i) => `${i.name}: ${i.value.toFixed(2)} (${i.interpretation})`)
			.join(", ");
		parts.push(`Indicators: ${indicatorText}.`);
	}

	// Position context
	if (position && position.direction !== "FLAT") {
		const pnlSign = position.unrealizedPnL >= 0 ? "+" : "";
		parts.push(
			`Position: ${position.direction} ${position.size} shares, ` +
				`${pnlSign}$${position.unrealizedPnL.toFixed(2)} P&L, ` +
				`held ${position.holdingDays} days.`
		);
	}

	// Recent events
	if (events.length > 0) {
		parts.push(`Recent events: ${events.map((e) => `${e.type}: ${e.summary}`).join("; ")}.`);
	}

	return parts.join(" ");
}

/**
 * Calculate retrieval statistics from case returns.
 *
 * @param returns - Array of return percentages from retrieved cases
 * @param holdingDays - Array of holding periods in days
 * @returns Statistics including win rate, averages, and distribution
 *
 * @example
 * ```typescript
 * const stats = calculateRetrievalStatistics(
 *   [0.05, -0.02, 0.03, 0.08, -0.01],
 *   [3, 5, 2, 7, 1]
 * );
 * console.log(`Win rate: ${stats.winRate}`); // 0.6
 * ```
 */
export function calculateRetrievalStatistics(
	returns: number[],
	holdingDays: number[]
): RetrievalStatistics {
	const totalCases = returns.length;

	if (totalCases === 0) {
		return {
			totalCases: 0,
			winRate: 0,
			avgReturn: 0,
			avgHoldingDays: 0,
			returnDistribution: { p10: 0, p25: 0, p50: 0, p75: 0, p90: 0 },
		};
	}

	// Win rate
	const wins = returns.filter((r) => r > 0).length;
	const winRate = wins / totalCases;

	// Average return
	const avgReturn = returns.reduce((sum, r) => sum + r, 0) / totalCases;

	// Average holding days
	const avgHoldingDays =
		holdingDays.length > 0 ? holdingDays.reduce((sum, d) => sum + d, 0) / holdingDays.length : 0;

	// Return distribution
	const sortedReturns = returns.toSorted((a, b) => a - b);
	const returnDistribution: ReturnDistribution = {
		p10: percentile(sortedReturns, 10),
		p25: percentile(sortedReturns, 25),
		p50: percentile(sortedReturns, 50),
		p75: percentile(sortedReturns, 75),
		p90: percentile(sortedReturns, 90),
	};

	return {
		totalCases,
		winRate,
		avgReturn,
		avgHoldingDays,
		returnDistribution,
	};
}

/**
 * Format retrieval statistics as a human-readable summary.
 *
 * @param stats - Retrieval statistics
 * @returns Formatted summary string
 */
export function formatRetrievalStatistics(stats: RetrievalStatistics): string {
	if (stats.totalCases === 0) {
		return "No similar cases found.";
	}

	return (
		`Found ${stats.totalCases} similar cases: ` +
		`${(stats.winRate * 100).toFixed(0)}% win rate, ` +
		`${(stats.avgReturn * 100).toFixed(1)}% avg return, ` +
		`${stats.avgHoldingDays.toFixed(1)} days avg hold. ` +
		`Returns range: ${(stats.returnDistribution.p10 * 100).toFixed(1)}% (P10) to ` +
		`${(stats.returnDistribution.p90 * 100).toFixed(1)}% (P90).`
	);
}
