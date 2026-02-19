import { LineChart } from "lucide-react";
import type { ReactElement } from "react";
import type { PriceIndicators } from "@/lib/api/types";
import { IndicatorGrid } from "../IndicatorGrid";
import { type Freshness, IndicatorSection } from "../IndicatorSection";
import { IndicatorValue } from "../IndicatorValue";
import {
	getBollingerSignal,
	getMacdSignal,
	getMomentumSignal,
	getRsiSignal,
	getStochasticSignal,
} from "./panelUtils";

export interface PriceIndicatorsPanelProps {
	data: PriceIndicators | null | undefined;
	isLoading?: boolean;
	freshness?: Freshness;
}

type IndicatorFormat = "number" | "percent" | "currency" | "ratio" | "days";

type PriceIndicatorRow = {
	label: string;
	value: (data: PriceIndicators | null | undefined) => number | string | null | undefined;
	format?: IndicatorFormat;
	decimals?: number;
	signal?: (data: PriceIndicators | null | undefined) => number | undefined;
	tooltip: string;
};

const PRICE_INDICATORS: readonly PriceIndicatorRow[] = [
	{
		label: "RSI(14)",
		value: (data) => data?.rsi_14,
		signal: (data) => getRsiSignal(data?.rsi_14 ?? null),
		tooltip:
			"Momentum oscillator (0-100). >70 overbought (potential sell), <30 oversold (potential buy)",
	},
	{
		label: "ATR(14)",
		value: (data) => data?.atr_14,
		tooltip: "Average price range over 14 days. Higher = more volatile. Used for stop-loss sizing",
	},
	{
		label: "SMA(20)",
		value: (data) => data?.sma_20,
		tooltip: "20-day simple moving average. Short-term trend. Price above = bullish",
	},
	{
		label: "SMA(50)",
		value: (data) => data?.sma_50,
		tooltip: "50-day simple moving average. Medium-term trend. Key support/resistance level",
	},
	{
		label: "SMA(200)",
		value: (data) => data?.sma_200,
		tooltip: "200-day simple moving average. Long-term trend. Price above = bull market",
	},
	{
		label: "EMA(9)",
		value: (data) => data?.ema_9,
		tooltip: "9-day exponential MA. Fast-moving, reacts quickly to price changes",
	},
	{
		label: "EMA(12)",
		value: (data) => data?.ema_12,
		tooltip: "12-day exponential MA. Used in MACD calculation. Short-term trend",
	},
	{
		label: "EMA(21)",
		value: (data) => data?.ema_21,
		tooltip: "21-day exponential MA. Popular swing trading reference",
	},
	{
		label: "EMA(26)",
		value: (data) => data?.ema_26,
		tooltip: "26-day exponential MA. Used in MACD calculation. Medium-term trend",
	},
	{
		label: "MACD",
		value: (data) => data?.macd_line,
		signal: (data) => getMacdSignal(data?.macd_line ?? null),
		tooltip: "Trend/momentum indicator. Positive = bullish momentum, negative = bearish",
	},
	{
		label: "Signal",
		value: (data) => data?.macd_signal,
		signal: (data) => getMacdSignal(data?.macd_signal ?? null),
		tooltip: "9-day EMA of MACD. MACD crossing above = buy signal, below = sell signal",
	},
	{
		label: "Histogram",
		value: (data) => data?.macd_histogram,
		signal: (data) => getMacdSignal(data?.macd_histogram ?? null),
		tooltip: "MACD minus Signal. Growing = strengthening trend, shrinking = weakening",
	},
	{
		label: "BB Upper",
		value: (data) => data?.bollinger_upper,
		tooltip: "Upper band (SMA20 + 2 std dev). Price near upper = potentially overbought",
	},
	{
		label: "BB Middle",
		value: (data) => data?.bollinger_middle,
		tooltip: "Middle band (20-day SMA). Acts as dynamic support/resistance",
	},
	{
		label: "BB Lower",
		value: (data) => data?.bollinger_lower,
		tooltip: "Lower band (SMA20 - 2 std dev). Price near lower = potentially oversold",
	},
	{
		label: "BB %B",
		value: (data) => data?.bollinger_percentb,
		format: "percent",
		signal: (data) => getBollingerSignal(data?.bollinger_percentb ?? null),
		tooltip: "Price position in bands. >100% = above upper, <0% = below lower, 50% = at middle",
	},
	{
		label: "Stoch %K",
		value: (data) => data?.stochastic_k,
		signal: (data) => getStochasticSignal(data?.stochastic_k ?? null),
		tooltip: "Fast stochastic (0-100). >80 overbought, <20 oversold. Shows momentum",
	},
	{
		label: "Stoch %D",
		value: (data) => data?.stochastic_d,
		signal: (data) => getStochasticSignal(data?.stochastic_d ?? null),
		tooltip: "Slow stochastic (3-day avg of %K). %K crossing %D = trading signal",
	},
	{
		label: "Mom 1M",
		value: (data) => data?.momentum_1m,
		format: "percent",
		signal: (data) => getMomentumSignal(data?.momentum_1m ?? null),
		tooltip: "Price change over 1 month. Positive = uptrend, negative = downtrend",
	},
	{
		label: "Mom 3M",
		value: (data) => data?.momentum_3m,
		format: "percent",
		signal: (data) => getMomentumSignal(data?.momentum_3m ?? null),
		tooltip: "Price change over 3 months. Shows medium-term trend strength",
	},
	{
		label: "Vol 20D",
		value: (data) => data?.realized_vol_20d,
		format: "percent",
		tooltip: "Annualized price volatility over 20 days. Higher = more risk/opportunity",
	},
];

function buildPriceIndicators(data: PriceIndicators | null | undefined): ReactElement[] {
	return PRICE_INDICATORS.map((indicator) => (
		<IndicatorValue
			key={indicator.label}
			label={indicator.label}
			value={indicator.value(data)}
			format={indicator.format}
			decimals={indicator.decimals}
			signal={indicator.signal?.(data)}
			tooltip={indicator.tooltip}
		/>
	));
}

export function PriceIndicatorsPanel({
	data,
	isLoading,
	freshness = "recent",
}: PriceIndicatorsPanelProps) {
	return (
		<IndicatorSection
			title="Price Indicators"
			icon={<LineChart className="h-4 w-4" />}
			isLoading={isLoading}
			freshness={freshness}
		>
			<IndicatorGrid columns={4}>{buildPriceIndicators(data)}</IndicatorGrid>
		</IndicatorSection>
	);
}
