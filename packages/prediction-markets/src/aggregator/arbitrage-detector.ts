/**
 * Arbitrage Detector
 *
 * Detects price divergences between equivalent markets on different platforms.
 * Used for data quality validation and potential trading opportunities.
 */

import type { MatchedMarket } from "./market-matcher";

/**
 * Configuration for arbitrage detection
 */
export interface ArbitrageDetectorConfig {
	/** Minimum price divergence to flag as arbitrage opportunity (0-1) */
	minDivergence: number;
	/** Maximum price divergence before flagging as data quality issue (0-1) */
	maxDivergence: number;
	/** Minimum liquidity score to consider market valid */
	minLiquidity: number;
}

export const DEFAULT_ARBITRAGE_CONFIG: ArbitrageDetectorConfig = {
	minDivergence: 0.05, // 5% price difference
	maxDivergence: 0.2, // 20% indicates possible data issue
	minLiquidity: 0.3,
};

/**
 * Represents an arbitrage opportunity or alert
 */
export interface ArbitrageAlert {
	type: "opportunity" | "data_quality_issue" | "resolution_risk";
	matchedMarket: MatchedMarket;
	divergence: number;
	highPlatform: string;
	lowPlatform: string;
	description: string;
}

/**
 * Arbitrage Detector for cross-platform price analysis
 */
export class ArbitrageDetector {
	private readonly config: ArbitrageDetectorConfig;

	constructor(config: Partial<ArbitrageDetectorConfig> = {}) {
		this.config = { ...DEFAULT_ARBITRAGE_CONFIG, ...config };
	}

	/**
	 * Analyze matched markets for arbitrage opportunities
	 */
	analyze(matchedMarkets: MatchedMarket[]): ArbitrageAlert[] {
		const alerts: ArbitrageAlert[] = [];

		for (const match of matchedMarkets) {
			// Check liquidity requirements
			const liquidityA = match.marketA.payload.liquidityScore ?? 0;
			const liquidityB = match.marketB.payload.liquidityScore ?? 0;

			if (liquidityA < this.config.minLiquidity || liquidityB < this.config.minLiquidity) {
				continue;
			}

			// Detect divergence
			if (match.priceDivergence >= this.config.minDivergence) {
				const alert = this.createAlert(match);
				if (alert) {
					alerts.push(alert);
				}
			}
		}

		// Sort by divergence descending
		return alerts.sort((a, b) => b.divergence - a.divergence);
	}

	/**
	 * Create an alert for a price divergence
	 */
	private createAlert(match: MatchedMarket): ArbitrageAlert | null {
		const yesA = match.marketA.payload.outcomes.find(
			(o) => o.outcome.toLowerCase() === "yes",
		)?.probability;
		const yesB = match.marketB.payload.outcomes.find(
			(o) => o.outcome.toLowerCase() === "yes",
		)?.probability;

		if (yesA === undefined || yesB === undefined) {
			return null;
		}

		const highPlatform =
			yesA > yesB ? match.marketA.payload.platform : match.marketB.payload.platform;
		const lowPlatform =
			yesA > yesB ? match.marketB.payload.platform : match.marketA.payload.platform;

		// Determine alert type
		let type: ArbitrageAlert["type"];
		let description: string;

		if (match.priceDivergence >= this.config.maxDivergence) {
			type = "data_quality_issue";
			description =
				`Large price divergence (${(match.priceDivergence * 100).toFixed(1)}%) ` +
				`may indicate data quality issues between ${highPlatform} and ${lowPlatform}`;
		} else if (match.similarity < 0.8) {
			type = "resolution_risk";
			description =
				`Price divergence (${(match.priceDivergence * 100).toFixed(1)}%) ` +
				`with low similarity (${(match.similarity * 100).toFixed(0)}%) - ` +
				`markets may have different resolution criteria`;
		} else {
			type = "opportunity";
			description =
				`Arbitrage opportunity: ${(match.priceDivergence * 100).toFixed(1)}% ` +
				`divergence - ${highPlatform} prices higher than ${lowPlatform}`;
		}

		return {
			type,
			matchedMarket: match,
			divergence: match.priceDivergence,
			highPlatform,
			lowPlatform,
			description,
		};
	}

	/**
	 * Get a summary of arbitrage analysis
	 */
	getSummary(alerts: ArbitrageAlert[]): ArbitrageSummary {
		const opportunities = alerts.filter((a) => a.type === "opportunity");
		const dataIssues = alerts.filter((a) => a.type === "data_quality_issue");
		const resolutionRisks = alerts.filter((a) => a.type === "resolution_risk");

		const avgDivergence =
			alerts.length > 0 ? alerts.reduce((sum, a) => sum + a.divergence, 0) / alerts.length : 0;

		return {
			totalAlerts: alerts.length,
			opportunities: opportunities.length,
			dataQualityIssues: dataIssues.length,
			resolutionRisks: resolutionRisks.length,
			averageDivergence: avgDivergence,
			maxDivergence: alerts.length > 0 ? Math.max(...alerts.map((a) => a.divergence)) : 0,
		};
	}
}

/**
 * Summary statistics for arbitrage analysis
 */
export interface ArbitrageSummary {
	totalAlerts: number;
	opportunities: number;
	dataQualityIssues: number;
	resolutionRisks: number;
	averageDivergence: number;
	maxDivergence: number;
}
