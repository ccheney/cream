/**
 * Forward-Looking Plan Scoring
 *
 * Evaluates proposed decisions before execution to assess:
 * - Risk/reward profile
 * - Stop loss placement quality
 * - Position sizing appropriateness
 * - Market context alignment
 *
 * Provides a standardized quality score to inform the decision process.
 *
 * @see docs/plans/01-architecture.md lines 107-118
 */

import type { Decision, DecisionPlan } from "./types.js";

export interface DecisionQualityScore {
	/** Decision ID */
	decisionId: string;

	/** Overall quality score (0-100) */
	overall: number;

	/** Individual component scores (0-100) */
	components: {
		/** Risk/reward ratio quality */
		riskReward: number;
		/** Stop loss placement quality */
		stopLoss: number;
		/** Position sizing quality */
		sizing: number;
		/** Entry timing quality */
		entryTiming: number;
		/** Rationale completeness */
		rationaleQuality: number;
	};

	/** Aggregated risk level */
	riskLevel: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";

	/** Expected value estimate */
	expectedValue: ExpectedValue;

	/** Quality flags */
	flags: DecisionQualityFlag[];

	/** Recommendations for improvement */
	recommendations: string[];

	/** Confidence in the assessment (0-1) */
	confidence: number;
}

/**
 * Plan quality assessment (aggregate of decisions).
 */
export interface PlanQualityScore {
	/** Cycle ID */
	cycleId: string;

	/** Overall plan score (average of decisions) */
	overall: number;

	/** Individual decision scores */
	decisionScores: DecisionQualityScore[];

	/** Aggregate risk level */
	riskLevel: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";

	/** Summary statistics */
	stats: {
		decisionCount: number;
		averageScore: number;
		minScore: number;
		maxScore: number;
		positiveEVCount: number;
		flagCounts: Record<string, number>;
	};
}

/**
 * Expected value calculation.
 */
export interface ExpectedValue {
	/** Win probability estimate */
	winProbability: number;

	/** Expected gain if successful */
	expectedGain: number;

	/** Expected loss if failed */
	expectedLoss: number;

	/** Net expected value */
	netExpectedValue: number;

	/** Kelly criterion suggested size (fraction) */
	kellyFraction: number;
}

/**
 * Quality flag indicating specific concerns.
 */
export interface DecisionQualityFlag {
	type: "WARNING" | "ERROR" | "INFO";
	code: string;
	message: string;
}

/**
 * Market context for scoring.
 */
export interface MarketContext {
	/** Current volatility (e.g., VIX) */
	volatility: number;

	/** Trend direction */
	trend: "UPTREND" | "DOWNTREND" | "SIDEWAYS";

	/** Market regime */
	regime: string;

	/** Average daily volume */
	avgDailyVolume?: number;

	/** Current bid-ask spread percentage */
	spreadPct?: number;

	/** Current price (for sizing calculations) */
	currentPrice?: number;
}

/**
 * Scoring configuration.
 */
export interface DecisionScoringConfig {
	/** Minimum acceptable risk/reward ratio */
	minRiskRewardRatio: number;

	/** Maximum acceptable position as % of portfolio */
	maxPositionPct: number;

	/** Maximum acceptable stop loss distance % */
	maxStopLossDistancePct: number;

	/** Minimum win probability for positive EV */
	minWinProbability: number;

	/** Component weights for overall score */
	weights: {
		riskReward: number;
		stopLoss: number;
		sizing: number;
		entryTiming: number;
		rationaleQuality: number;
	};
}

const DEFAULT_CONFIG: DecisionScoringConfig = {
	minRiskRewardRatio: 2.0,
	maxPositionPct: 5.0,
	maxStopLossDistancePct: 10.0,
	minWinProbability: 0.4,
	weights: {
		riskReward: 0.3,
		stopLoss: 0.2,
		sizing: 0.2,
		entryTiming: 0.15,
		rationaleQuality: 0.15,
	},
};

export class DecisionScorer {
	private readonly config: DecisionScoringConfig;

	constructor(config: Partial<DecisionScoringConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	scoreDecision(
		decision: Decision,
		portfolioValue: number,
		context?: MarketContext
	): DecisionQualityScore {
		const flags: DecisionQualityFlag[] = [];
		const recommendations: string[] = [];

		if (decision.action === "HOLD") {
			return this.createHoldScore(decision.decisionId);
		}

		const currentPrice = context?.currentPrice ?? 100;

		const riskReward = this.scoreRiskReward(decision, currentPrice, flags, recommendations);
		const stopLoss = this.scoreStopLoss(decision, currentPrice, flags, recommendations);
		const sizing = this.scoreSizing(decision, portfolioValue, currentPrice, flags, recommendations);
		const entryTiming = this.scoreEntryTiming(decision, context, flags, recommendations);
		const rationaleQuality = this.scoreRationale(decision, flags, recommendations);

		const overall = Math.round(
			riskReward * this.config.weights.riskReward +
				stopLoss * this.config.weights.stopLoss +
				sizing * this.config.weights.sizing +
				entryTiming * this.config.weights.entryTiming +
				rationaleQuality * this.config.weights.rationaleQuality
		);

		const expectedValue = this.calculateExpectedValue(decision, currentPrice, context);
		const riskLevel = this.determineRiskLevel(overall, flags, expectedValue);
		const confidence = this.calculateConfidence(decision, context);

		return {
			decisionId: decision.decisionId,
			overall,
			components: {
				riskReward,
				stopLoss,
				sizing,
				entryTiming,
				rationaleQuality,
			},
			riskLevel,
			expectedValue,
			flags,
			recommendations,
			confidence,
		};
	}

	scorePlan(plan: DecisionPlan, portfolioValue: number, context?: MarketContext): PlanQualityScore {
		const decisionScores = plan.decisions.map((d) =>
			this.scoreDecision(d, portfolioValue, context)
		);

		const overallScores = decisionScores.map((s) => s.overall);
		const average =
			overallScores.length > 0
				? overallScores.reduce((a, b) => a + b, 0) / overallScores.length
				: 0;

		const flagCounts: Record<string, number> = { ERROR: 0, WARNING: 0, INFO: 0 };
		for (const score of decisionScores) {
			for (const flag of score.flags) {
				flagCounts[flag.type] = (flagCounts[flag.type] ?? 0) + 1;
			}
		}

		const riskLevel = this.determineOverallRiskLevel(decisionScores, flagCounts);

		const positiveEVCount = decisionScores.filter(
			(s) => s.expectedValue.netExpectedValue > 0
		).length;

		return {
			cycleId: plan.cycleId,
			overall: Math.round(average),
			decisionScores,
			riskLevel,
			stats: {
				decisionCount: decisionScores.length,
				averageScore: average,
				minScore: overallScores.length > 0 ? Math.min(...overallScores) : 0,
				maxScore: overallScores.length > 0 ? Math.max(...overallScores) : 0,
				positiveEVCount,
				flagCounts,
			},
		};
	}

	private scoreRiskReward(
		decision: Decision,
		currentPrice: number,
		flags: DecisionQualityFlag[],
		recommendations: string[]
	): number {
		if (!decision.stopLoss || !decision.takeProfit) {
			flags.push({
				type: "WARNING",
				code: "MISSING_LEVELS",
				message: "Stop loss or take profit not specified",
			});
			return 50;
		}

		const entryPrice = currentPrice;
		const stopLossPrice = decision.stopLoss.price;
		const takeProfitPrice = decision.takeProfit.price;

		const risk = Math.abs(entryPrice - stopLossPrice);
		const reward = Math.abs(takeProfitPrice - entryPrice);

		if (risk === 0) {
			flags.push({
				type: "ERROR",
				code: "ZERO_RISK",
				message: "Stop loss is at entry price",
			});
			return 0;
		}

		const ratio = reward / risk;

		if (ratio < 1.0) {
			flags.push({
				type: "WARNING",
				code: "POOR_RR_RATIO",
				message: `Risk/reward ratio ${ratio.toFixed(2)} is below 1.0`,
			});
			recommendations.push("Increase take-profit or tighten stop-loss to improve R:R");
			return Math.max(0, ratio * 30);
		}

		if (ratio < this.config.minRiskRewardRatio) {
			flags.push({
				type: "INFO",
				code: "SUBOPTIMAL_RR_RATIO",
				message: `Risk/reward ratio ${ratio.toFixed(2)} is below target ${this.config.minRiskRewardRatio}`,
			});
			return 30 + (ratio - 1) * 30;
		}

		if (ratio >= 3.0) {
			return 100;
		}

		return 60 + ((ratio - 2) / 1) * 40;
	}

	private scoreStopLoss(
		decision: Decision,
		currentPrice: number,
		flags: DecisionQualityFlag[],
		recommendations: string[]
	): number {
		if (!decision.stopLoss) {
			flags.push({
				type: "WARNING",
				code: "NO_STOP_LOSS",
				message: "No stop loss specified",
			});
			recommendations.push("Always set a stop loss for risk management");
			return 30;
		}

		const entryPrice = currentPrice;
		const stopLossPrice = decision.stopLoss.price;
		const distancePct = (Math.abs(entryPrice - stopLossPrice) / entryPrice) * 100;

		if (distancePct < 1.0) {
			flags.push({
				type: "WARNING",
				code: "TIGHT_STOP",
				message: `Stop loss at ${distancePct.toFixed(2)}% may be too tight`,
			});
			recommendations.push("Consider widening stop loss to avoid noise exits");
			return 40;
		}

		if (distancePct > this.config.maxStopLossDistancePct) {
			flags.push({
				type: "WARNING",
				code: "WIDE_STOP",
				message: `Stop loss at ${distancePct.toFixed(2)}% exceeds ${this.config.maxStopLossDistancePct}% threshold`,
			});
			recommendations.push("Consider tightening stop loss or reducing position size");
			return 50;
		}

		const isLong = decision.direction === "LONG";
		const stopBelowEntry = stopLossPrice < entryPrice;

		if (isLong && !stopBelowEntry) {
			flags.push({
				type: "ERROR",
				code: "INVALID_STOP_DIRECTION",
				message: "Long position stop loss must be below entry",
			});
			return 0;
		}

		if (!isLong && decision.direction === "SHORT" && stopBelowEntry) {
			flags.push({
				type: "ERROR",
				code: "INVALID_STOP_DIRECTION",
				message: "Short position stop loss must be above entry",
			});
			return 0;
		}

		if (distancePct >= 2.0 && distancePct <= 5.0) {
			return 100;
		}

		if (distancePct > 5.0) {
			return 100 - ((distancePct - 5) / 5) * 50;
		}

		return 40 + ((distancePct - 1) / 1) * 60;
	}

	private scoreSizing(
		decision: Decision,
		portfolioValue: number,
		currentPrice: number,
		flags: DecisionQualityFlag[],
		recommendations: string[]
	): number {
		const size = decision.size;
		let positionValue: number;

		switch (size.unit) {
			case "SHARES":
				positionValue = size.value * currentPrice;
				break;
			case "DOLLARS":
				positionValue = size.value;
				break;
			case "PCT_EQUITY":
				positionValue = (size.value / 100) * portfolioValue;
				break;
			case "CONTRACTS":
				positionValue = size.value * 100 * currentPrice;
				break;
			default:
				flags.push({
					type: "ERROR",
					code: "UNKNOWN_SIZE_UNIT",
					message: `Unknown size unit: ${size.unit}`,
				});
				return 50;
		}

		const positionPct = (positionValue / portfolioValue) * 100;

		if (positionPct > this.config.maxPositionPct) {
			flags.push({
				type: "WARNING",
				code: "OVERSIZED_POSITION",
				message: `Position size ${positionPct.toFixed(1)}% exceeds ${this.config.maxPositionPct}% limit`,
			});
			recommendations.push(`Reduce position size to below ${this.config.maxPositionPct}%`);
			return Math.max(0, 100 - (positionPct - this.config.maxPositionPct) * 10);
		}

		if (positionPct < 0.5) {
			flags.push({
				type: "INFO",
				code: "SMALL_POSITION",
				message: `Position size ${positionPct.toFixed(2)}% is quite small`,
			});
			return 70;
		}

		if (positionPct >= 1.0 && positionPct <= 3.0) {
			return 100;
		}

		if (positionPct > 3.0 && positionPct <= this.config.maxPositionPct) {
			return 80;
		}

		return 60 + (positionPct / 1.0) * 40;
	}

	private scoreEntryTiming(
		decision: Decision,
		context: MarketContext | undefined,
		flags: DecisionQualityFlag[],
		recommendations: string[]
	): number {
		let score = 70;

		if (!context) {
			flags.push({
				type: "INFO",
				code: "NO_MARKET_CONTEXT",
				message: "Market context not provided for timing assessment",
			});
			return score;
		}

		const isLong = decision.direction === "LONG";
		const trendAligned =
			(isLong && context.trend === "UPTREND") ||
			(!isLong && decision.direction === "SHORT" && context.trend === "DOWNTREND");

		if (trendAligned) {
			score += 20;
		} else if (context.trend !== "SIDEWAYS") {
			flags.push({
				type: "WARNING",
				code: "COUNTER_TREND",
				message: `${decision.direction} position against ${context.trend}`,
			});
			score -= 20;
			recommendations.push("Consider waiting for trend confirmation");
		}

		if (context.volatility > 30) {
			flags.push({
				type: "WARNING",
				code: "HIGH_VOLATILITY",
				message: `Market volatility (${context.volatility.toFixed(1)}) is elevated`,
			});
			score -= 10;
			recommendations.push("Consider reducing position size during high volatility");
		}

		if (context.spreadPct && context.spreadPct > 0.5) {
			flags.push({
				type: "WARNING",
				code: "WIDE_SPREAD",
				message: `Bid-ask spread ${context.spreadPct.toFixed(2)}% is wide`,
			});
			score -= 10;
		}

		return Math.max(0, Math.min(100, score));
	}

	private scoreRationale(
		decision: Decision,
		flags: DecisionQualityFlag[],
		recommendations: string[]
	): number {
		let score = 0;
		const rationale = decision.rationale;

		if (rationale.summary && rationale.summary.length > 20) {
			score += 30;
		} else {
			flags.push({
				type: "WARNING",
				code: "WEAK_SUMMARY",
				message: "Rationale summary is missing or too brief",
			});
			recommendations.push("Provide a detailed summary of the trade thesis");
		}

		if (rationale.bullishFactors && rationale.bullishFactors.length > 0) {
			score += 20;
		}

		if (rationale.bearishFactors && rationale.bearishFactors.length > 0) {
			score += 20;
		} else {
			flags.push({
				type: "INFO",
				code: "NO_BEARISH_FACTORS",
				message: "No bearish factors documented",
			});
			recommendations.push("Document potential risks and bearish factors");
		}

		if (rationale.decisionLogic && rationale.decisionLogic.length > 10) {
			score += 15;
		}

		if (rationale.memoryReferences && rationale.memoryReferences.length > 0) {
			score += 15;
		}

		return Math.min(100, score);
	}

	private calculateExpectedValue(
		decision: Decision,
		currentPrice: number,
		context?: MarketContext
	): ExpectedValue {
		if (!decision.stopLoss || !decision.takeProfit) {
			return {
				winProbability: 0.5,
				expectedGain: 0,
				expectedLoss: 0,
				netExpectedValue: 0,
				kellyFraction: 0,
			};
		}

		const entryPrice = currentPrice;
		const stopLossPrice = decision.stopLoss.price;
		const takeProfitPrice = decision.takeProfit.price;

		const riskPct = Math.abs(entryPrice - stopLossPrice) / entryPrice;
		const rewardPct = Math.abs(takeProfitPrice - entryPrice) / entryPrice;
		const rrRatio = riskPct > 0 ? rewardPct / riskPct : 1;

		let winProbability = 0.45;

		if (rrRatio > 2) {
			winProbability += 0.05;
		} else if (rrRatio < 1) {
			winProbability -= 0.1;
		}

		if (context) {
			const isLong = decision.direction === "LONG";
			if ((isLong && context.trend === "UPTREND") || (!isLong && context.trend === "DOWNTREND")) {
				winProbability += 0.1;
			} else if (context.trend !== "SIDEWAYS") {
				winProbability -= 0.1;
			}
		}

		winProbability = Math.max(0.2, Math.min(0.8, winProbability));

		const expectedGain = rewardPct;
		const expectedLoss = riskPct;
		const netExpectedValue = winProbability * expectedGain - (1 - winProbability) * expectedLoss;

		// Kelly criterion
		const b = rrRatio;
		const p = winProbability;
		const q = 1 - p;
		const kellyFraction = b > 0 ? Math.max(0, (b * p - q) / b) : 0;

		return {
			winProbability,
			expectedGain,
			expectedLoss,
			netExpectedValue,
			kellyFraction: Math.min(0.25, kellyFraction),
		};
	}

	private determineRiskLevel(
		score: number,
		flags: DecisionQualityFlag[],
		ev: ExpectedValue
	): "LOW" | "MEDIUM" | "HIGH" | "EXTREME" {
		const errorCount = flags.filter((f) => f.type === "ERROR").length;
		const warningCount = flags.filter((f) => f.type === "WARNING").length;

		if (errorCount > 0 || score < 40) {
			return "EXTREME";
		}

		if (warningCount >= 3 || score < 55 || ev.netExpectedValue < 0) {
			return "HIGH";
		}

		if (warningCount >= 1 || score < 70) {
			return "MEDIUM";
		}

		return "LOW";
	}

	private determineOverallRiskLevel(
		scores: DecisionQualityScore[],
		flagCounts: Record<string, number>
	): "LOW" | "MEDIUM" | "HIGH" | "EXTREME" {
		if (scores.some((s) => s.riskLevel === "EXTREME") || (flagCounts.ERROR ?? 0) > 0) {
			return "EXTREME";
		}

		if (scores.some((s) => s.riskLevel === "HIGH") || (flagCounts.WARNING ?? 0) >= 3) {
			return "HIGH";
		}

		if (scores.some((s) => s.riskLevel === "MEDIUM") || (flagCounts.WARNING ?? 0) >= 1) {
			return "MEDIUM";
		}

		return "LOW";
	}

	private calculateConfidence(decision: Decision, context?: MarketContext): number {
		let confidence = 0.6;

		if (decision.rationale.summary) {
			confidence += 0.1;
		}
		if (decision.rationale.bullishFactors.length > 0) {
			confidence += 0.05;
		}
		if (decision.rationale.bearishFactors.length > 0) {
			confidence += 0.05;
		}
		if (decision.stopLoss) {
			confidence += 0.05;
		}
		if (decision.takeProfit) {
			confidence += 0.05;
		}
		if (context) {
			confidence += 0.1;
		}

		return Math.min(1.0, confidence);
	}

	private createHoldScore(decisionId: string): DecisionQualityScore {
		return {
			decisionId,
			overall: 50,
			components: {
				riskReward: 50,
				stopLoss: 50,
				sizing: 50,
				entryTiming: 50,
				rationaleQuality: 50,
			},
			riskLevel: "LOW",
			expectedValue: {
				winProbability: 0.5,
				expectedGain: 0,
				expectedLoss: 0,
				netExpectedValue: 0,
				kellyFraction: 0,
			},
			flags: [
				{
					type: "INFO",
					code: "HOLD_DECISION",
					message: "HOLD decisions maintain current positions",
				},
			],
			recommendations: [],
			confidence: 1.0,
		};
	}
}

export function scoreDecision(
	decision: Decision,
	portfolioValue: number,
	context?: MarketContext,
	config?: Partial<DecisionScoringConfig>
): DecisionQualityScore {
	const scorer = new DecisionScorer(config);
	return scorer.scoreDecision(decision, portfolioValue, context);
}

export function scorePlan(
	plan: DecisionPlan,
	portfolioValue: number,
	context?: MarketContext,
	config?: Partial<DecisionScoringConfig>
): PlanQualityScore {
	const scorer = new DecisionScorer(config);
	return scorer.scorePlan(plan, portfolioValue, context);
}

export default {
	DecisionScorer,
	scoreDecision,
	scorePlan,
};
