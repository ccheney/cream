import type {
	CorporateIndicators,
	LiquidityIndicators,
	OptionsIndicators,
	PriceIndicators,
	QualityIndicators,
	SentimentClassification,
	SentimentIndicators,
	ShortInterestIndicators,
	ValueIndicators,
} from "@/lib/api/types";
import type { IndicatorValueProps } from "../IndicatorValue";

// ============================================
// Signal Conversion Functions
// ============================================

/**
 * RSI signal: 30-70 is neutral zone
 * <30 = oversold (bullish), >70 = overbought (bearish)
 */
export function getRsiSignal(rsi: number | null): number | undefined {
	if (rsi === null) {
		return undefined;
	}
	if (rsi <= 30) {
		return (30 - rsi) / 30;
	}
	if (rsi >= 70) {
		return -((rsi - 70) / 30);
	}
	return ((50 - rsi) / 40) * 0.3;
}

/**
 * Stochastic signal: similar to RSI
 * <20 = oversold (bullish), >80 = overbought (bearish)
 */
export function getStochasticSignal(stoch: number | null): number | undefined {
	if (stoch === null) {
		return undefined;
	}
	if (stoch <= 20) {
		return (20 - stoch) / 20;
	}
	if (stoch >= 80) {
		return -((stoch - 80) / 20);
	}
	return ((50 - stoch) / 60) * 0.3;
}

/**
 * MACD histogram signal: positive = bullish, negative = bearish
 */
export function getMacdSignal(histogram: number | null): number | undefined {
	if (histogram === null) {
		return undefined;
	}
	return Math.max(-1, Math.min(1, histogram / 5));
}

/**
 * Momentum signal: positive = bullish, negative = bearish
 */
export function getMomentumSignal(momentum: number | null): number | undefined {
	if (momentum === null) {
		return undefined;
	}
	return Math.max(-1, Math.min(1, momentum / 0.5));
}

/**
 * Bollinger %B signal: >1 overbought (bearish), <0 oversold (bullish)
 */
export function getBollingerSignal(percentB: number | null): number | undefined {
	if (percentB === null) {
		return undefined;
	}
	return Math.max(-1, Math.min(1, (0.5 - percentB) * 2));
}

/**
 * Put/Call ratio signal: >1 = bearish sentiment, <1 = bullish
 */
export function getPutCallSignal(pcRatio: number | null): number | undefined {
	if (pcRatio === null) {
		return undefined;
	}
	return Math.max(-1, Math.min(1, (1 - pcRatio) * 2));
}

/**
 * IV Skew signal: positive skew (puts expensive) = bearish/fear
 */
export function getSkewSignal(skew: number | null): number | undefined {
	if (skew === null) {
		return undefined;
	}
	return Math.max(-1, Math.min(1, -skew / 0.2));
}

/**
 * Short interest signal: high short % = bearish pressure
 */
export function getShortInterestSignal(shortPct: number | null): number | undefined {
	if (shortPct === null) {
		return undefined;
	}
	return Math.max(-1, Math.min(0, -(shortPct / 0.3) * 2 + 0.3));
}

/**
 * Sentiment score is already -1 to +1, pass through
 */
export function getSentimentSignal(score: number | null): number | undefined {
	if (score === null) {
		return undefined;
	}
	return Math.max(-1, Math.min(1, score));
}

/**
 * Days to cover signal: more days = more squeeze risk
 */
export function getDaysToCoverSignal(days: number | null): number | undefined {
	if (days === null) {
		return undefined;
	}
	return Math.max(-1, Math.min(0, -(days / 10)));
}

// ============================================
// Legacy Status Helpers
// ============================================

export function getMScoreStatus(mScore: number | null): IndicatorValueProps["status"] {
	if (mScore === null) {
		return undefined;
	}
	if (mScore < -2.22) {
		return "critical";
	}
	if (mScore < -1.78) {
		return "warning";
	}
	return undefined;
}

export function getSentimentLabel(classification: SentimentClassification | null): string {
	if (!classification) {
		return "--";
	}
	switch (classification) {
		case "STRONG_BULLISH":
			return "Strong Bullish";
		case "BULLISH":
			return "Bullish";
		case "NEUTRAL":
			return "Neutral";
		case "BEARISH":
			return "Bearish";
		case "STRONG_BEARISH":
			return "Strong Bearish";
		default:
			return "--";
	}
}

export type {
	CorporateIndicators,
	LiquidityIndicators,
	OptionsIndicators,
	PriceIndicators,
	QualityIndicators,
	SentimentIndicators,
	ShortInterestIndicators,
	ValueIndicators,
};
