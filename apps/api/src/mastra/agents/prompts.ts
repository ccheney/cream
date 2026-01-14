/**
 * Prompt building functions for Mastra agents.
 *
 * Contains utilities for building context sections injected into agent prompts.
 */

import type { IndicatorSnapshot } from "@cream/indicators";

import type { AgentContext } from "./types.js";

// ============================================
// Datetime Context (prepended to ALL prompts)
// ============================================

/**
 * Build datetime context for LLM prompts.
 * Includes current date/time in both UTC (ISO 8601) and US Eastern timezone.
 *
 * This should be prepended to ALL agent prompts to ensure the LLM
 * has accurate temporal awareness for time-sensitive trading decisions.
 */
export function buildDatetimeContext(): string {
	const now = new Date();
	const utc = now.toISOString();

	// Format in US Eastern timezone
	const eastern = now.toLocaleString("en-US", {
		timeZone: "America/New_York",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});

	return `Current Date/Time (UTC): ${utc}
Current Date/Time (US Eastern): ${eastern}
`;
}

// ============================================
// Signal Interpretation Helpers
// ============================================

/**
 * Interpret RSI value with standard thresholds.
 */
export function interpretRSI(rsi: number | null): string | null {
	if (rsi === null) {
		return null;
	}
	if (rsi >= 70) {
		return "OVERBOUGHT";
	}
	if (rsi <= 30) {
		return "OVERSOLD";
	}
	if (rsi >= 60) {
		return "BULLISH";
	}
	if (rsi <= 40) {
		return "BEARISH";
	}
	return "NEUTRAL";
}

/**
 * Interpret MACD histogram for trend direction.
 */
export function interpretMACD(histogram: number | null): string | null {
	if (histogram === null) {
		return null;
	}
	if (histogram > 0.5) {
		return "STRONG BULLISH";
	}
	if (histogram > 0) {
		return "BULLISH";
	}
	if (histogram < -0.5) {
		return "STRONG BEARISH";
	}
	return "BEARISH";
}

/**
 * Interpret Stochastic %K for momentum.
 */
export function interpretStochastic(stochasticK: number | null): string | null {
	if (stochasticK === null) {
		return null;
	}
	if (stochasticK >= 80) {
		return "OVERBOUGHT";
	}
	if (stochasticK <= 20) {
		return "OVERSOLD";
	}
	return "NEUTRAL";
}

/**
 * Interpret price relative to SMA trend.
 * Returns bullish/bearish based on price above/below SMAs.
 */
export function interpretSMATrend(
	sma20: number | null,
	sma50: number | null,
	sma200: number | null
): string | null {
	if (sma20 === null || sma50 === null) {
		return null;
	}

	// Golden cross / death cross
	if (sma20 > sma50) {
		if (sma200 !== null && sma50 > sma200) {
			return "STRONG UPTREND";
		}
		return "UPTREND";
	} else {
		if (sma200 !== null && sma50 < sma200) {
			return "STRONG DOWNTREND";
		}
		return "DOWNTREND";
	}
}

/**
 * Interpret Bollinger Bands percent B.
 */
export function interpretBollingerPercentB(percentB: number | null): string | null {
	if (percentB === null) {
		return null;
	}
	if (percentB > 1) {
		return "ABOVE UPPER BAND";
	}
	if (percentB < 0) {
		return "BELOW LOWER BAND";
	}
	if (percentB > 0.8) {
		return "NEAR UPPER BAND";
	}
	if (percentB < 0.2) {
		return "NEAR LOWER BAND";
	}
	return "WITHIN BANDS";
}

/**
 * Interpret put/call ratio for sentiment.
 */
export function interpretPutCallRatio(ratio: number | null): string | null {
	if (ratio === null) {
		return null;
	}
	if (ratio > 1.2) {
		return "BEARISH SENTIMENT";
	}
	if (ratio > 0.9) {
		return "SLIGHTLY BEARISH";
	}
	if (ratio < 0.7) {
		return "BULLISH SENTIMENT";
	}
	if (ratio < 0.9) {
		return "SLIGHTLY BULLISH";
	}
	return "NEUTRAL";
}

/**
 * Interpret implied volatility level.
 */
export function interpretIV(iv: number | null, _historicalVol?: number | null): string | null {
	if (iv === null) {
		return null;
	}
	// IV rank interpretation
	if (iv > 0.5) {
		return "HIGH VOLATILITY";
	}
	if (iv > 0.3) {
		return "MODERATE VOLATILITY";
	}
	return "LOW VOLATILITY";
}

/**
 * Build regime context section for prompts.
 */
export function buildRegimeContext(regimeLabels?: AgentContext["regimeLabels"]): string {
	if (!regimeLabels || Object.keys(regimeLabels).length === 0) {
		return "";
	}

	const lines = Object.entries(regimeLabels).map(([symbol, data]) => {
		const confidence = (data.confidence * 100).toFixed(0);
		return `- ${symbol}: ${data.regime} (${confidence}% confidence)${data.reasoning ? ` - ${data.reasoning}` : ""}`;
	});

	return `\nMarket Regime Classifications:
${lines.join("\n")}
`;
}

/**
 * Build Factor Zoo context section for prompts.
 * Includes Mega-Alpha signal, active factors with weights, and decay alerts.
 */
export function buildFactorZooContext(factorZoo?: AgentContext["factorZoo"]): string {
	if (!factorZoo) {
		return "";
	}

	const megaAlphaSignal = factorZoo.megaAlpha >= 0 ? "BULLISH" : "BEARISH";
	const megaAlphaStrength = Math.abs(factorZoo.megaAlpha);

	const factorLines = factorZoo.activeFactors
		.filter((f) => f.weight > 0.01)
		.sort((a, b) => b.weight - a.weight)
		.slice(0, 10)
		.map((f) => {
			const decayFlag = f.isDecaying ? " [DECAYING]" : "";
			return `  - ${f.name}: ${(f.weight * 100).toFixed(1)}% weight, IC=${f.recentIC.toFixed(3)}${decayFlag}`;
		});

	const alertLines = factorZoo.decayAlerts
		.filter((a) => a.severity === "CRITICAL")
		.slice(0, 5)
		.map((a) => `  - ${a.factorId}: ${a.alertType} (${a.recommendation})`);

	let output = `
Factor Zoo Quantitative Signals:
- Mega-Alpha: ${factorZoo.megaAlpha.toFixed(3)} (${megaAlphaSignal}, strength: ${(megaAlphaStrength * 100).toFixed(0)}%)
- Active Factors: ${factorZoo.stats.activeCount}/${factorZoo.stats.totalFactors} (avg IC: ${factorZoo.stats.averageIC.toFixed(3)})
- Decaying Factors: ${factorZoo.stats.decayingCount}

Top Weighted Factors:
${factorLines.join("\n")}`;

	if (alertLines.length > 0) {
		output += `

Critical Decay Alerts:
${alertLines.join("\n")}`;
	}

	return output;
}

/**
 * Build prediction market context section for prompts.
 * Includes Fed rate probabilities, recession risk, and policy event risk.
 */
export function buildPredictionMarketContext(
	predictionMarketSignals?: AgentContext["predictionMarketSignals"]
): string {
	if (!predictionMarketSignals) {
		return "";
	}

	const lines: string[] = [];

	if (
		predictionMarketSignals.fedCutProbability !== undefined ||
		predictionMarketSignals.fedHikeProbability !== undefined
	) {
		const cutProb = predictionMarketSignals.fedCutProbability;
		const hikeProb = predictionMarketSignals.fedHikeProbability;
		if (cutProb !== undefined) {
			lines.push(`- Fed Rate Cut Probability: ${(cutProb * 100).toFixed(1)}%`);
		}
		if (hikeProb !== undefined) {
			lines.push(`- Fed Rate Hike Probability: ${(hikeProb * 100).toFixed(1)}%`);
		}
	}

	if (predictionMarketSignals.recessionProbability12m !== undefined) {
		lines.push(
			`- 12-Month Recession Probability: ${(predictionMarketSignals.recessionProbability12m * 100).toFixed(1)}%`
		);
	}

	if (predictionMarketSignals.macroUncertaintyIndex !== undefined) {
		const uncertainty = predictionMarketSignals.macroUncertaintyIndex;
		let level: string;
		if (uncertainty > 0.7) {
			level = "HIGH";
		} else if (uncertainty > 0.4) {
			level = "MODERATE";
		} else {
			level = "LOW";
		}
		lines.push(`- Macro Uncertainty Index: ${(uncertainty * 100).toFixed(1)}% (${level})`);
	}

	if (predictionMarketSignals.policyEventRisk !== undefined) {
		lines.push(
			`- Policy Event Risk: ${(predictionMarketSignals.policyEventRisk * 100).toFixed(1)}%`
		);
	}

	if (predictionMarketSignals.cpiSurpriseDirection !== undefined) {
		const cpiDir = predictionMarketSignals.cpiSurpriseDirection > 0 ? "HIGHER" : "LOWER";
		lines.push(
			`- CPI Surprise Direction: ${cpiDir} (${Math.abs(predictionMarketSignals.cpiSurpriseDirection * 100).toFixed(1)}%)`
		);
	}

	if (predictionMarketSignals.gdpSurpriseDirection !== undefined) {
		const gdpDir = predictionMarketSignals.gdpSurpriseDirection > 0 ? "HIGHER" : "LOWER";
		lines.push(
			`- GDP Surprise Direction: ${gdpDir} (${Math.abs(predictionMarketSignals.gdpSurpriseDirection * 100).toFixed(1)}%)`
		);
	}

	if (predictionMarketSignals.marketConfidence !== undefined) {
		lines.push(
			`- Market Confidence: ${(predictionMarketSignals.marketConfidence * 100).toFixed(1)}%`
		);
	}

	if (lines.length === 0) {
		return "";
	}

	const platforms = predictionMarketSignals.platforms?.join(", ") || "Unknown";
	const timestamp = predictionMarketSignals.timestamp || "Unknown";

	return `
Prediction Market Signals (from ${platforms}, updated ${timestamp}):
${lines.join("\n")}
`;
}

// ============================================
// Indicator Context Builders
// ============================================

/**
 * Format price indicators for a single symbol.
 * Includes momentum, trend, and volatility signals with interpretations.
 */
export function formatPriceIndicators(price: IndicatorSnapshot["price"]): string[] {
	const lines: string[] = [];

	// Momentum
	if (price.rsi_14 !== null) {
		const rsiSignal = interpretRSI(price.rsi_14);
		lines.push(`  - RSI(14): ${price.rsi_14.toFixed(1)} [${rsiSignal}]`);
	}

	if (price.stochastic_k !== null) {
		const stochSignal = interpretStochastic(price.stochastic_k);
		const stochD = price.stochastic_d !== null ? `/${price.stochastic_d.toFixed(1)}` : "";
		lines.push(`  - Stochastic: %K=${price.stochastic_k.toFixed(1)}${stochD} [${stochSignal}]`);
	}

	// MACD
	if (price.macd_histogram !== null) {
		const macdSignal = interpretMACD(price.macd_histogram);
		lines.push(`  - MACD Histogram: ${price.macd_histogram.toFixed(3)} [${macdSignal}]`);
	}

	// Trend - SMA
	if (price.sma_20 !== null || price.sma_50 !== null || price.sma_200 !== null) {
		const smaLines: string[] = [];
		if (price.sma_20 !== null) {
			smaLines.push(`SMA20=${price.sma_20.toFixed(2)}`);
		}
		if (price.sma_50 !== null) {
			smaLines.push(`SMA50=${price.sma_50.toFixed(2)}`);
		}
		if (price.sma_200 !== null) {
			smaLines.push(`SMA200=${price.sma_200.toFixed(2)}`);
		}
		const trend = interpretSMATrend(price.sma_20, price.sma_50, price.sma_200);
		lines.push(`  - Moving Averages: ${smaLines.join(", ")}${trend ? ` [${trend}]` : ""}`);
	}

	// Bollinger Bands
	if (price.bollinger_percentb !== null) {
		const bbSignal = interpretBollingerPercentB(price.bollinger_percentb);
		lines.push(`  - Bollinger %B: ${price.bollinger_percentb.toFixed(2)} [${bbSignal}]`);
		if (price.bollinger_bandwidth !== null) {
			lines.push(`  - Bollinger Bandwidth: ${price.bollinger_bandwidth.toFixed(3)}`);
		}
	}

	// Volatility
	if (price.atr_14 !== null) {
		lines.push(`  - ATR(14): ${price.atr_14.toFixed(2)}`);
	}
	if (price.realized_vol_20d !== null) {
		lines.push(`  - Realized Volatility (20d): ${(price.realized_vol_20d * 100).toFixed(1)}%`);
	}

	// Momentum returns
	const momentumParts: string[] = [];
	if (price.momentum_1m !== null) {
		momentumParts.push(`1M: ${(price.momentum_1m * 100).toFixed(1)}%`);
	}
	if (price.momentum_3m !== null) {
		momentumParts.push(`3M: ${(price.momentum_3m * 100).toFixed(1)}%`);
	}
	if (price.momentum_6m !== null) {
		momentumParts.push(`6M: ${(price.momentum_6m * 100).toFixed(1)}%`);
	}
	if (momentumParts.length > 0) {
		lines.push(`  - Price Momentum: ${momentumParts.join(", ")}`);
	}

	return lines;
}

/**
 * Format liquidity indicators for a single symbol.
 */
export function formatLiquidityIndicators(liquidity: IndicatorSnapshot["liquidity"]): string[] {
	const lines: string[] = [];

	if (liquidity.bid_ask_spread_pct !== null) {
		lines.push(`  - Bid-Ask Spread: ${(liquidity.bid_ask_spread_pct * 100).toFixed(2)}%`);
	}

	if (liquidity.vwap !== null) {
		lines.push(`  - VWAP: ${liquidity.vwap.toFixed(2)}`);
	}

	if (liquidity.volume_ratio !== null) {
		const volSignal =
			liquidity.volume_ratio > 1.5 ? " [HIGH]" : liquidity.volume_ratio < 0.5 ? " [LOW]" : "";
		lines.push(`  - Volume Ratio: ${liquidity.volume_ratio.toFixed(2)}x${volSignal}`);
	}

	if (liquidity.amihud_illiquidity !== null) {
		lines.push(`  - Amihud Illiquidity: ${liquidity.amihud_illiquidity.toExponential(2)}`);
	}

	return lines;
}

/**
 * Format options-derived indicators for a single symbol.
 */
export function formatOptionsIndicators(options: IndicatorSnapshot["options"]): string[] {
	const lines: string[] = [];

	if (options.atm_iv !== null) {
		const ivSignal = interpretIV(options.atm_iv);
		lines.push(`  - ATM Implied Volatility: ${(options.atm_iv * 100).toFixed(1)}% [${ivSignal}]`);
	}

	if (options.iv_skew_25d !== null) {
		const skewSign = options.iv_skew_25d > 0 ? "PUT PREMIUM" : "CALL PREMIUM";
		lines.push(`  - IV Skew (25D): ${(options.iv_skew_25d * 100).toFixed(1)}% [${skewSign}]`);
	}

	if (options.put_call_ratio_volume !== null) {
		const pcSignal = interpretPutCallRatio(options.put_call_ratio_volume);
		lines.push(
			`  - Put/Call Volume Ratio: ${options.put_call_ratio_volume.toFixed(2)} [${pcSignal}]`
		);
	}

	if (options.vrp !== null) {
		const vrpSignal = options.vrp > 0 ? "IV > RV" : "IV < RV";
		lines.push(`  - Volatility Risk Premium: ${(options.vrp * 100).toFixed(1)}% [${vrpSignal}]`);
	}

	// Greeks exposure (if present)
	const greeksParts: string[] = [];
	if (options.net_delta !== null) {
		greeksParts.push(`Δ=${options.net_delta.toFixed(2)}`);
	}
	if (options.net_gamma !== null) {
		greeksParts.push(`Γ=${options.net_gamma.toFixed(4)}`);
	}
	if (options.net_theta !== null) {
		greeksParts.push(`Θ=${options.net_theta.toFixed(2)}`);
	}
	if (greeksParts.length > 0) {
		lines.push(`  - Greeks Exposure: ${greeksParts.join(", ")}`);
	}

	return lines;
}

/**
 * Format value (fundamental) indicators for a single symbol.
 */
export function formatValueIndicators(value: IndicatorSnapshot["value"]): string[] {
	const lines: string[] = [];

	if (value.pe_ratio_ttm !== null) {
		lines.push(`  - P/E Ratio (TTM): ${value.pe_ratio_ttm.toFixed(1)}`);
	}
	if (value.pe_ratio_forward !== null) {
		lines.push(`  - P/E Ratio (Forward): ${value.pe_ratio_forward.toFixed(1)}`);
	}
	if (value.pb_ratio !== null) {
		lines.push(`  - P/B Ratio: ${value.pb_ratio.toFixed(2)}`);
	}
	if (value.ev_ebitda !== null) {
		lines.push(`  - EV/EBITDA: ${value.ev_ebitda.toFixed(1)}`);
	}
	if (value.dividend_yield !== null) {
		lines.push(`  - Dividend Yield: ${(value.dividend_yield * 100).toFixed(2)}%`);
	}

	return lines;
}

/**
 * Format short interest indicators for a single symbol.
 */
export function formatShortInterestIndicators(
	shortInterest: IndicatorSnapshot["short_interest"]
): string[] {
	const lines: string[] = [];

	if (shortInterest.short_pct_float !== null) {
		const shortSignal = shortInterest.short_pct_float > 0.2 ? " [HIGH]" : "";
		lines.push(
			`  - Short Interest (% Float): ${(shortInterest.short_pct_float * 100).toFixed(1)}%${shortSignal}`
		);
	}
	if (shortInterest.days_to_cover !== null) {
		lines.push(`  - Days to Cover: ${shortInterest.days_to_cover.toFixed(1)}`);
	}

	return lines;
}

/**
 * Format sentiment indicators for a single symbol.
 */
export function formatSentimentIndicators(sentiment: IndicatorSnapshot["sentiment"]): string[] {
	const lines: string[] = [];

	if (sentiment.overall_score !== null) {
		const classification = sentiment.classification ?? "NEUTRAL";
		lines.push(`  - Sentiment Score: ${sentiment.overall_score.toFixed(2)} [${classification}]`);
	}
	if (sentiment.sentiment_strength !== null) {
		lines.push(`  - Sentiment Strength: ${sentiment.sentiment_strength.toFixed(2)}`);
	}
	if (sentiment.news_volume !== null) {
		lines.push(`  - News Volume: ${sentiment.news_volume}`);
	}
	if (sentiment.event_risk !== null && sentiment.event_risk) {
		lines.push(`  - Event Risk: HIGH`);
	}

	return lines;
}

/**
 * Build complete indicator context for a single symbol.
 */
export function buildSymbolIndicatorContext(symbol: string, snapshot: IndicatorSnapshot): string {
	const sections: string[] = [];

	// Price indicators
	const priceLines = formatPriceIndicators(snapshot.price);
	if (priceLines.length > 0) {
		sections.push(`  Momentum & Trend:\n${priceLines.join("\n")}`);
	}

	// Liquidity indicators
	const liquidityLines = formatLiquidityIndicators(snapshot.liquidity);
	if (liquidityLines.length > 0) {
		sections.push(`  Liquidity:\n${liquidityLines.join("\n")}`);
	}

	// Options indicators
	const optionsLines = formatOptionsIndicators(snapshot.options);
	if (optionsLines.length > 0) {
		sections.push(`  Options-Derived:\n${optionsLines.join("\n")}`);
	}

	// Value indicators
	const valueLines = formatValueIndicators(snapshot.value);
	if (valueLines.length > 0) {
		sections.push(`  Fundamentals:\n${valueLines.join("\n")}`);
	}

	// Short interest
	const shortLines = formatShortInterestIndicators(snapshot.short_interest);
	if (shortLines.length > 0) {
		sections.push(`  Short Interest:\n${shortLines.join("\n")}`);
	}

	// Sentiment
	const sentimentLines = formatSentimentIndicators(snapshot.sentiment);
	if (sentimentLines.length > 0) {
		sections.push(`  Sentiment:\n${sentimentLines.join("\n")}`);
	}

	// Add data quality note if not complete
	if (snapshot.metadata.data_quality !== "COMPLETE") {
		const missing = snapshot.metadata.missing_fields.join(", ");
		sections.push(
			`  Data Quality: ${snapshot.metadata.data_quality}${missing ? ` (missing: ${missing})` : ""}`
		);
	}

	return sections.length > 0
		? `${symbol}:\n${sections.join("\n\n")}`
		: `${symbol}: No indicator data available`;
}

/**
 * Build indicator context section for all symbols in agent context.
 * This is the main entry point for formatting indicators into prompts.
 */
export function buildIndicatorContext(indicators?: AgentContext["indicators"]): string {
	if (!indicators || Object.keys(indicators).length === 0) {
		return "";
	}

	const symbolSections = Object.entries(indicators).map(([symbol, snapshot]) =>
		buildSymbolIndicatorContext(symbol, snapshot)
	);

	return `
Technical Indicators:

${symbolSections.join("\n\n")}
`;
}

/**
 * Build a compact summary of key indicators for quick reference.
 * Useful for system prompts with token limits.
 */
export function buildIndicatorSummary(indicators?: AgentContext["indicators"]): string {
	if (!indicators || Object.keys(indicators).length === 0) {
		return "";
	}

	const lines: string[] = ["Key Indicators:"];

	for (const [symbol, snapshot] of Object.entries(indicators)) {
		const parts: string[] = [];

		// RSI
		if (snapshot.price.rsi_14 !== null) {
			const rsiSignal = interpretRSI(snapshot.price.rsi_14);
			parts.push(`RSI=${snapshot.price.rsi_14.toFixed(0)}[${rsiSignal}]`);
		}

		// MACD
		if (snapshot.price.macd_histogram !== null) {
			const macdSignal = interpretMACD(snapshot.price.macd_histogram);
			parts.push(`MACD[${macdSignal}]`);
		}

		// IV
		if (snapshot.options.atm_iv !== null) {
			parts.push(`IV=${(snapshot.options.atm_iv * 100).toFixed(0)}%`);
		}

		// Put/Call
		if (snapshot.options.put_call_ratio_volume !== null) {
			const pcSignal = interpretPutCallRatio(snapshot.options.put_call_ratio_volume);
			parts.push(`P/C=${snapshot.options.put_call_ratio_volume.toFixed(2)}[${pcSignal}]`);
		}

		// Short interest
		if (
			snapshot.short_interest.short_pct_float !== null &&
			snapshot.short_interest.short_pct_float > 0.1
		) {
			parts.push(`SI=${(snapshot.short_interest.short_pct_float * 100).toFixed(0)}%`);
		}

		if (parts.length > 0) {
			lines.push(`- ${symbol}: ${parts.join(", ")}`);
		}
	}

	return lines.length > 1 ? lines.join("\n") : "";
}

// ============================================
// Grounding Context Builder
// ============================================

import type { GroundingOutput } from "./schemas.js";

/**
 * Build grounding context section for agent prompts.
 *
 * Takes the output from the Grounding Agent and formats it for injection
 * into downstream agent prompts. Optionally filters to a specific symbol.
 *
 * @param groundingOutput - Output from the Grounding Agent
 * @param symbol - Optional symbol to filter per-symbol context
 */
export function buildGroundingContext(
	groundingOutput?: GroundingOutput | null,
	symbol?: string
): string {
	if (!groundingOutput) {
		return `
## Web Grounding Context
No grounding data available for this cycle.

IMPORTANT: You do not have access to google_search. If you need current information that is not provided, note this as uncertainty in your analysis.
`;
	}

	const sections: string[] = [];

	// Global context (always included)
	const globalMacro = groundingOutput.global?.macro ?? [];
	const globalEvents = groundingOutput.global?.events ?? [];

	if (globalMacro.length > 0 || globalEvents.length > 0) {
		sections.push("### Market-Wide Context");
		if (globalMacro.length > 0) {
			sections.push("Macro Themes:");
			for (const item of globalMacro) {
				sections.push(`- ${item}`);
			}
		}
		if (globalEvents.length > 0) {
			sections.push("Upcoming Events:");
			for (const item of globalEvents) {
				sections.push(`- ${item}`);
			}
		}
	}

	// Per-symbol context
	const perSymbol = groundingOutput.perSymbol ?? {};
	const symbolsToInclude = symbol ? [symbol] : Object.keys(perSymbol);

	for (const sym of symbolsToInclude) {
		const symbolData = perSymbol[sym];
		if (!symbolData) {
			continue;
		}

		const symbolSections: string[] = [`### ${sym}`];

		if (symbolData.news && symbolData.news.length > 0) {
			symbolSections.push("News & Developments:");
			for (const item of symbolData.news) {
				symbolSections.push(`- ${item}`);
			}
		}

		if (symbolData.fundamentals && symbolData.fundamentals.length > 0) {
			symbolSections.push("Fundamentals Context:");
			for (const item of symbolData.fundamentals) {
				symbolSections.push(`- ${item}`);
			}
		}

		if (symbolData.bullCase && symbolData.bullCase.length > 0) {
			symbolSections.push("Bullish Catalysts:");
			for (const item of symbolData.bullCase) {
				symbolSections.push(`- ${item}`);
			}
		}

		if (symbolData.bearCase && symbolData.bearCase.length > 0) {
			symbolSections.push("Bearish Risks:");
			for (const item of symbolData.bearCase) {
				symbolSections.push(`- ${item}`);
			}
		}

		if (symbolSections.length > 1) {
			sections.push(symbolSections.join("\n"));
		}
	}

	// Sources
	const sources = groundingOutput.sources ?? [];
	if (sources.length > 0) {
		sections.push("### Sources");
		for (const src of sources.slice(0, 5)) {
			sections.push(`- [${src.title}](${src.url}) - ${src.relevance}`);
		}
	}

	const content =
		sections.length > 0
			? sections.join("\n\n")
			: "No grounded information available for the requested symbols.";

	return `
## Web Grounding Context
${content}

IMPORTANT: Use this grounded context for real-time information.
You do not have access to google_search - it is not available to you.
If critical information is missing from the grounding context, note this as uncertainty in your analysis.
`;
}
