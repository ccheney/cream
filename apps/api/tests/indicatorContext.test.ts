/**
 * Indicator Context Builder Tests
 *
 * Tests for the indicator formatting and context building functions
 * used to prepare indicator data for LLM agent prompts.
 */

import { describe, expect, it } from "bun:test";
import type { IndicatorSnapshot } from "@cream/indicators";

import {
	buildIndicatorContext,
	buildIndicatorSummary,
	buildSymbolIndicatorContext,
	formatLiquidityIndicators,
	formatOptionsIndicators,
	formatPriceIndicators,
	formatSentimentIndicators,
	formatShortInterestIndicators,
	formatValueIndicators,
	interpretBollingerPercentB,
	interpretIV,
	interpretMACD,
	interpretPutCallRatio,
	interpretRSI,
	interpretSMATrend,
	interpretStochastic,
} from "../src/agents/prompts.js";

// ============================================
// Test Fixtures
// ============================================

function createMockSnapshot(overrides: Partial<IndicatorSnapshot> = {}): IndicatorSnapshot {
	return {
		symbol: "AAPL",
		timestamp: Date.now(),
		price: {
			rsi_14: 55,
			atr_14: 2.5,
			sma_20: 150,
			sma_50: 148,
			sma_200: 140,
			ema_9: 151,
			ema_12: 150.5,
			ema_21: 149,
			ema_26: 148,
			macd_line: 2.5,
			macd_signal: 2.0,
			macd_histogram: 0.5,
			bollinger_upper: 160,
			bollinger_middle: 150,
			bollinger_lower: 140,
			bollinger_bandwidth: 0.13,
			bollinger_percentb: 0.6,
			stochastic_k: 65,
			stochastic_d: 60,
			momentum_1m: 0.05,
			momentum_3m: 0.12,
			momentum_6m: 0.18,
			momentum_12m: 0.25,
			realized_vol_20d: 0.22,
			parkinson_vol_20d: 0.2,
		},
		liquidity: {
			bid_ask_spread: 0.02,
			bid_ask_spread_pct: 0.013,
			amihud_illiquidity: 0.0001,
			vwap: 152.5,
			turnover_ratio: 0.8,
			volume_ratio: 1.2,
		},
		options: {
			atm_iv: 0.35,
			iv_skew_25d: 0.02,
			iv_put_25d: 0.37,
			iv_call_25d: 0.33,
			put_call_ratio_volume: 0.85,
			put_call_ratio_oi: 0.9,
			term_structure_slope: 0.01,
			front_month_iv: 0.33,
			back_month_iv: 0.35,
			vrp: 0.03,
			realized_vol_20d: 0.22,
			net_delta: null,
			net_gamma: null,
			net_theta: null,
			net_vega: null,
		},
		value: {
			pe_ratio_ttm: 25.5,
			pe_ratio_forward: 22.0,
			pb_ratio: 8.5,
			ev_ebitda: 18.0,
			earnings_yield: 0.039,
			dividend_yield: 0.005,
			cape_10yr: null,
		},
		quality: {
			gross_profitability: 0.42,
			roe: 0.15,
			roa: 0.08,
			asset_growth: 0.12,
			accruals_ratio: 0.02,
			cash_flow_quality: "HIGH",
			beneish_m_score: -2.5,
		},
		short_interest: {
			short_interest: 15000000,
			short_interest_ratio: 0.8,
			days_to_cover: 1.5,
			short_pct_float: 0.02,
			short_interest_change: -0.05,
		},
		sentiment: {
			overall_score: 0.65,
			sentiment_strength: 0.7,
			news_volume: 45,
			sentiment_momentum: 0.1,
			event_risk: false,
			classification: "BULLISH",
		},
		corporate: {
			trailing_dividend_yield: 0.005,
			ex_dividend_days: 45,
			upcoming_earnings_days: 30,
			recent_split: false,
		},
		market: {
			sector: "Technology",
			industry: "Consumer Electronics",
			market_cap: 2800000000000,
			market_cap_category: "MEGA",
		},
		metadata: {
			price_updated_at: Date.now() - 60000,
			fundamentals_date: "2024-03-15",
			short_interest_date: "2024-03-10",
			sentiment_date: "2024-03-25",
			data_quality: "COMPLETE",
			missing_fields: [],
		},
		...overrides,
	};
}

// ============================================
// Signal Interpretation Tests
// ============================================

describe("Signal Interpretation Functions", () => {
	describe("interpretRSI", () => {
		it("should return null for null input", () => {
			expect(interpretRSI(null)).toBeNull();
		});

		it("should identify overbought conditions (RSI >= 70)", () => {
			expect(interpretRSI(70)).toBe("OVERBOUGHT");
			expect(interpretRSI(85)).toBe("OVERBOUGHT");
		});

		it("should identify oversold conditions (RSI <= 30)", () => {
			expect(interpretRSI(30)).toBe("OVERSOLD");
			expect(interpretRSI(15)).toBe("OVERSOLD");
		});

		it("should identify bullish conditions (RSI >= 60)", () => {
			expect(interpretRSI(60)).toBe("BULLISH");
			expect(interpretRSI(69)).toBe("BULLISH");
		});

		it("should identify bearish conditions (RSI <= 40)", () => {
			expect(interpretRSI(40)).toBe("BEARISH");
			expect(interpretRSI(31)).toBe("BEARISH");
		});

		it("should identify neutral conditions", () => {
			expect(interpretRSI(50)).toBe("NEUTRAL");
			expect(interpretRSI(55)).toBe("NEUTRAL");
		});
	});

	describe("interpretMACD", () => {
		it("should return null for null input", () => {
			expect(interpretMACD(null)).toBeNull();
		});

		it("should identify strong bullish (histogram > 0.5)", () => {
			expect(interpretMACD(0.6)).toBe("STRONG BULLISH");
			expect(interpretMACD(1.0)).toBe("STRONG BULLISH");
		});

		it("should identify bullish (histogram > 0)", () => {
			expect(interpretMACD(0.1)).toBe("BULLISH");
			expect(interpretMACD(0.5)).toBe("BULLISH");
		});

		it("should identify bearish (histogram > -0.5)", () => {
			expect(interpretMACD(-0.1)).toBe("BEARISH");
			expect(interpretMACD(-0.5)).toBe("BEARISH");
		});

		it("should identify strong bearish (histogram <= -0.5)", () => {
			expect(interpretMACD(-0.51)).toBe("STRONG BEARISH");
			expect(interpretMACD(-1.0)).toBe("STRONG BEARISH");
		});
	});

	describe("interpretStochastic", () => {
		it("should return null for null input", () => {
			expect(interpretStochastic(null)).toBeNull();
		});

		it("should identify overbought conditions (K >= 80)", () => {
			expect(interpretStochastic(80)).toBe("OVERBOUGHT");
			expect(interpretStochastic(95)).toBe("OVERBOUGHT");
		});

		it("should identify oversold conditions (K <= 20)", () => {
			expect(interpretStochastic(20)).toBe("OVERSOLD");
			expect(interpretStochastic(5)).toBe("OVERSOLD");
		});

		it("should identify neutral conditions", () => {
			expect(interpretStochastic(50)).toBe("NEUTRAL");
			expect(interpretStochastic(60)).toBe("NEUTRAL");
		});
	});

	describe("interpretSMATrend", () => {
		it("should return null when sma20 is null", () => {
			expect(interpretSMATrend(null, 140, 130)).toBeNull();
		});

		it("should return null when sma50 is null", () => {
			expect(interpretSMATrend(150, null, 130)).toBeNull();
		});

		it("should work when sma200 is null (based on sma20 vs sma50)", () => {
			// sma20 > sma50 => UPTREND
			expect(interpretSMATrend(160, 150, null)).toBe("UPTREND");
			// sma20 < sma50 => DOWNTREND
			expect(interpretSMATrend(140, 150, null)).toBe("DOWNTREND");
		});

		it("should identify strong uptrend (sma20 > sma50 > sma200)", () => {
			expect(interpretSMATrend(160, 150, 140)).toBe("STRONG UPTREND");
		});

		it("should identify uptrend (sma20 > sma50, but sma50 <= sma200)", () => {
			expect(interpretSMATrend(155, 150, 155)).toBe("UPTREND");
		});

		it("should identify strong downtrend (sma20 < sma50 < sma200)", () => {
			expect(interpretSMATrend(130, 140, 150)).toBe("STRONG DOWNTREND");
		});

		it("should identify downtrend (sma20 < sma50, but sma50 >= sma200)", () => {
			expect(interpretSMATrend(140, 150, 145)).toBe("DOWNTREND");
		});
	});

	describe("interpretBollingerPercentB", () => {
		it("should return null for null input", () => {
			expect(interpretBollingerPercentB(null)).toBeNull();
		});

		it("should identify above upper band (>1)", () => {
			expect(interpretBollingerPercentB(1.1)).toBe("ABOVE UPPER BAND");
		});

		it("should identify below lower band (<0)", () => {
			expect(interpretBollingerPercentB(-0.1)).toBe("BELOW LOWER BAND");
		});

		it("should identify near upper band (>0.8)", () => {
			expect(interpretBollingerPercentB(0.85)).toBe("NEAR UPPER BAND");
		});

		it("should identify near lower band (<0.2)", () => {
			expect(interpretBollingerPercentB(0.15)).toBe("NEAR LOWER BAND");
		});

		it("should identify within bands zone", () => {
			expect(interpretBollingerPercentB(0.5)).toBe("WITHIN BANDS");
		});
	});

	describe("interpretPutCallRatio", () => {
		it("should return null for null input", () => {
			expect(interpretPutCallRatio(null)).toBeNull();
		});

		it("should identify bearish sentiment (ratio > 1.2)", () => {
			expect(interpretPutCallRatio(1.3)).toBe("BEARISH SENTIMENT");
		});

		it("should identify slightly bearish (ratio > 0.9, <= 1.2)", () => {
			expect(interpretPutCallRatio(1.0)).toBe("SLIGHTLY BEARISH");
		});

		it("should identify bullish sentiment (ratio < 0.7)", () => {
			expect(interpretPutCallRatio(0.5)).toBe("BULLISH SENTIMENT");
		});

		it("should identify slightly bullish (ratio >= 0.7, < 0.9)", () => {
			expect(interpretPutCallRatio(0.8)).toBe("SLIGHTLY BULLISH");
		});
	});

	describe("interpretIV", () => {
		it("should return null for null input", () => {
			expect(interpretIV(null)).toBeNull();
		});

		it("should identify high volatility (IV > 0.5)", () => {
			expect(interpretIV(0.6)).toBe("HIGH VOLATILITY");
		});

		it("should identify moderate volatility (IV > 0.3)", () => {
			expect(interpretIV(0.4)).toBe("MODERATE VOLATILITY");
		});

		it("should identify low volatility", () => {
			expect(interpretIV(0.2)).toBe("LOW VOLATILITY");
		});
	});
});

// ============================================
// Format Function Tests
// ============================================

describe("Format Functions", () => {
	describe("formatPriceIndicators", () => {
		it("should format all price indicator sections", () => {
			const snapshot = createMockSnapshot();
			const lines = formatPriceIndicators(snapshot.price);

			expect(lines.some((l) => l.includes("RSI"))).toBe(true);
			expect(lines.some((l) => l.includes("MACD"))).toBe(true);
			expect(lines.some((l) => l.includes("Moving Averages"))).toBe(true);
			expect(lines.some((l) => l.includes("SMA"))).toBe(true);
			expect(lines.some((l) => l.includes("Bollinger"))).toBe(true);
			expect(lines.some((l) => l.includes("ATR"))).toBe(true);
		});

		it("should return empty array when all values are null", () => {
			const lines = formatPriceIndicators({
				rsi_14: null,
				atr_14: null,
				sma_20: null,
				sma_50: null,
				sma_200: null,
				ema_9: null,
				ema_12: null,
				ema_21: null,
				ema_26: null,
				macd_line: null,
				macd_signal: null,
				macd_histogram: null,
				bollinger_upper: null,
				bollinger_middle: null,
				bollinger_lower: null,
				bollinger_bandwidth: null,
				bollinger_percentb: null,
				stochastic_k: null,
				stochastic_d: null,
				momentum_1m: null,
				momentum_3m: null,
				momentum_6m: null,
				momentum_12m: null,
				realized_vol_20d: null,
				parkinson_vol_20d: null,
			});

			// When all values are null, should return empty array
			expect(lines.length).toBe(0);
		});
	});

	describe("formatLiquidityIndicators", () => {
		it("should format liquidity data", () => {
			const snapshot = createMockSnapshot();
			const lines = formatLiquidityIndicators(snapshot.liquidity);

			expect(lines.some((l) => l.includes("Spread"))).toBe(true);
			expect(lines.some((l) => l.includes("VWAP"))).toBe(true);
		});

		it("should handle null liquidity values", () => {
			const lines = formatLiquidityIndicators({
				bid_ask_spread: null,
				bid_ask_spread_pct: null,
				amihud_illiquidity: null,
				vwap: null,
				turnover_ratio: null,
				volume_ratio: null,
			});

			// Should return empty or minimal output
			expect(Array.isArray(lines)).toBe(true);
		});
	});

	describe("formatOptionsIndicators", () => {
		it("should format options data with IV and skew", () => {
			const snapshot = createMockSnapshot();
			const lines = formatOptionsIndicators(snapshot.options);

			expect(lines.some((l) => l.includes("Implied Volatility"))).toBe(true);
			expect(lines.some((l) => l.includes("Put/Call"))).toBe(true);
		});

		it("should handle null options values", () => {
			const lines = formatOptionsIndicators({
				atm_iv: null,
				iv_skew_25d: null,
				iv_put_25d: null,
				iv_call_25d: null,
				put_call_ratio_volume: null,
				put_call_ratio_oi: null,
				term_structure_slope: null,
				front_month_iv: null,
				back_month_iv: null,
				vrp: null,
				realized_vol_20d: null,
				net_delta: null,
				net_gamma: null,
				net_theta: null,
				net_vega: null,
			});

			expect(Array.isArray(lines)).toBe(true);
		});
	});

	describe("formatValueIndicators", () => {
		it("should format valuation ratios", () => {
			const snapshot = createMockSnapshot();
			const lines = formatValueIndicators(snapshot.value);

			expect(lines.some((l) => l.includes("P/E"))).toBe(true);
			expect(lines.some((l) => l.includes("P/B"))).toBe(true);
		});
	});

	describe("formatShortInterestIndicators", () => {
		it("should format short interest data", () => {
			const snapshot = createMockSnapshot();
			const lines = formatShortInterestIndicators(snapshot.short_interest);

			expect(lines.some((l) => l.includes("Short"))).toBe(true);
			expect(lines.some((l) => l.includes("Days to Cover"))).toBe(true);
		});
	});

	describe("formatSentimentIndicators", () => {
		it("should format sentiment data", () => {
			const snapshot = createMockSnapshot();
			const lines = formatSentimentIndicators(snapshot.sentiment);

			expect(lines.some((l) => l.includes("Sentiment"))).toBe(true);
		});
	});
});

// ============================================
// Context Builder Tests
// ============================================

describe("Context Builder Functions", () => {
	describe("buildSymbolIndicatorContext", () => {
		it("should build a complete context for a symbol", () => {
			const snapshot = createMockSnapshot();
			const context = buildSymbolIndicatorContext("AAPL", snapshot);

			expect(context).toContain("AAPL");
			expect(context).toContain("Momentum & Trend");
			expect(context).toContain("Liquidity");
			expect(context).toContain("Options-Derived");
			expect(context).toContain("Fundamentals");
		});

		it("should include sentiment and short interest", () => {
			const snapshot = createMockSnapshot();
			const context = buildSymbolIndicatorContext("AAPL", snapshot);

			expect(context).toContain("Sentiment");
			expect(context).toContain("Short Interest");
		});
	});

	describe("buildIndicatorContext", () => {
		it("should return empty string for undefined indicators", () => {
			expect(buildIndicatorContext(undefined)).toBe("");
		});

		it("should return empty string for empty indicators", () => {
			expect(buildIndicatorContext({})).toBe("");
		});

		it("should build context for multiple symbols", () => {
			const indicators = {
				AAPL: createMockSnapshot({ symbol: "AAPL" }),
				MSFT: createMockSnapshot({ symbol: "MSFT" }),
			};

			const context = buildIndicatorContext(indicators);

			expect(context).toContain("AAPL");
			expect(context).toContain("MSFT");
			expect(context).toContain("Technical Indicators");
		});
	});

	describe("buildIndicatorSummary", () => {
		it("should return empty string for undefined indicators", () => {
			expect(buildIndicatorSummary(undefined)).toBe("");
		});

		it("should return empty string for empty indicators", () => {
			expect(buildIndicatorSummary({})).toBe("");
		});

		it("should build compact summary for multiple symbols", () => {
			const indicators = {
				AAPL: createMockSnapshot({ symbol: "AAPL" }),
				MSFT: createMockSnapshot({ symbol: "MSFT" }),
			};

			const summary = buildIndicatorSummary(indicators);

			expect(summary).toContain("AAPL");
			expect(summary).toContain("MSFT");
			expect(summary).toContain("Key Indicators");
		});

		it("should be more compact than full context", () => {
			const indicators = {
				AAPL: createMockSnapshot({ symbol: "AAPL" }),
			};

			const fullContext = buildIndicatorContext(indicators);
			const summary = buildIndicatorSummary(indicators);

			expect(summary.length).toBeLessThan(fullContext.length);
		});
	});
});
