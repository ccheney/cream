import { Activity } from "lucide-react";
import type { OptionsIndicators } from "@/lib/api/types";
import { IndicatorGrid } from "../IndicatorGrid";
import { type Freshness, IndicatorSection } from "../IndicatorSection";
import { IndicatorValue } from "../IndicatorValue";
import { getPutCallSignal, getSkewSignal } from "./panelUtils";

export interface OptionsIndicatorsPanelProps {
	data: OptionsIndicators | null | undefined;
	isLoading?: boolean;
	freshness?: Freshness;
	isMarketClosed?: boolean;
}

type OptionsIndicatorRow = {
	label: string;
	value: (data: OptionsIndicators | null | undefined) => number | string | null | undefined;
	format?: "number" | "percent" | "currency" | "ratio" | "days";
	decimals?: number;
	signal?: (data: OptionsIndicators | null | undefined) => number | undefined;
	tooltip: string;
};

const OPTIONS_INDICATORS: readonly OptionsIndicatorRow[] = [
	{
		label: "ATM IV",
		value: (data) => data?.atm_iv,
		format: "percent",
		tooltip: "Expected annualized move priced into options. Higher = more expensive options",
	},
	{
		label: "IV Skew",
		value: (data) => data?.iv_skew_25d,
		format: "percent",
		signal: (data) => getSkewSignal(data?.iv_skew_25d ?? null),
		tooltip: "Put vs call IV difference. Positive = puts more expensive (fear/hedging)",
	},
	{
		label: "P/C Vol",
		value: (data) => data?.put_call_ratio_volume,
		format: "ratio",
		signal: (data) => getPutCallSignal(data?.put_call_ratio_volume ?? null),
		tooltip: "Put volume / call volume. >1 = more bearish bets, <1 = more bullish",
	},
	{
		label: "P/C OI",
		value: (data) => data?.put_call_ratio_oi,
		format: "ratio",
		signal: (data) => getPutCallSignal(data?.put_call_ratio_oi ?? null),
		tooltip: "Put / call open interest. Shows accumulated positioning, not just today",
	},
	{
		label: "Term Slope",
		value: (data) => data?.term_structure_slope,
		format: "percent",
		tooltip: "IV curve slope. Positive = normal (contango), negative = fear (backwardation)",
	},
	{
		label: "VRP",
		value: (data) => data?.vrp,
		format: "percent",
		tooltip: "Implied minus realized vol. Positive = options overpriced, favor selling",
	},
	{
		label: "Net Delta",
		value: (data) => data?.net_delta,
		decimals: 0,
		tooltip: "Directional exposure in shares. Positive = long, negative = short equivalent",
	},
	{
		label: "Net Gamma",
		value: (data) => data?.net_gamma,
		decimals: 0,
		tooltip: "Delta sensitivity to price. Positive = gains accelerate on moves either way",
	},
	{
		label: "Net Theta",
		value: (data) => data?.net_theta,
		format: "currency",
		tooltip: "Daily time decay. Negative = losing value daily, positive = earning",
	},
	{
		label: "Net Vega",
		value: (data) => data?.net_vega,
		format: "currency",
		tooltip: "IV sensitivity. Positive = profits if IV rises, negative = profits if IV falls",
	},
];

function buildOptionsIndicators(data: OptionsIndicators | null | undefined): JSX.Element[] {
	return OPTIONS_INDICATORS.map((indicator) => (
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

export function OptionsIndicatorsPanel({
	data,
	isLoading,
	freshness = "recent",
	isMarketClosed = false,
}: OptionsIndicatorsPanelProps) {
	const effectiveFreshness = isMarketClosed ? "stale" : freshness;

	return (
		<IndicatorSection
			title="Options"
			icon={<Activity className="h-4 w-4" />}
			isLoading={isLoading}
			freshness={effectiveFreshness}
			subtitle={isMarketClosed ? "Market Closed" : undefined}
		>
			<IndicatorGrid columns={4}>{buildOptionsIndicators(data)}</IndicatorGrid>
		</IndicatorSection>
	);
}
