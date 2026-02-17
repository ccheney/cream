import { BarChart3 } from "lucide-react";
import type { ValueIndicators } from "@/lib/api/types";
import { IndicatorGrid } from "../IndicatorGrid";
import { type Freshness, IndicatorSection } from "../IndicatorSection";
import { IndicatorValue } from "../IndicatorValue";

export interface ValueIndicatorsPanelProps {
	data: ValueIndicators | null | undefined;
	isLoading?: boolean;
	freshness?: Freshness;
}

export function ValueIndicatorsPanel({
	data,
	isLoading,
	freshness = "stale",
}: ValueIndicatorsPanelProps) {
	return (
		<IndicatorSection
			title="Value Factors"
			icon={<BarChart3 className="h-4 w-4" />}
			isLoading={isLoading}
			freshness={freshness}
		>
			<IndicatorGrid columns={4}>
				<IndicatorValue
					label="P/E (TTM)"
					value={data?.pe_ratio_ttm}
					format="ratio"
					tooltip="Price / last 12 months earnings. Lower = cheaper. Compare to sector avg"
				/>
				<IndicatorValue
					label="P/E (Fwd)"
					value={data?.pe_ratio_forward}
					format="ratio"
					tooltip="Price / expected earnings. Lower than TTM = growth expected"
				/>
				<IndicatorValue
					label="P/B"
					value={data?.pb_ratio}
					format="ratio"
					tooltip="Price / book value. <1 = trading below asset value (potentially undervalued)"
				/>
				<IndicatorValue
					label="EV/EBITDA"
					value={data?.ev_ebitda}
					format="ratio"
					tooltip="Enterprise value / operating profit. Debt-adjusted valuation. Lower = cheaper"
				/>
				<IndicatorValue
					label="Earn Yield"
					value={data?.earnings_yield}
					format="percent"
					tooltip="Earnings / price (inverse P/E). Compare to bond yields for relative value"
				/>
				<IndicatorValue
					label="Div Yield"
					value={data?.dividend_yield}
					format="percent"
					tooltip="Annual dividends / price. Income return. Higher = more income"
				/>
				<IndicatorValue
					label="CAPE"
					value={data?.cape_10yr}
					format="ratio"
					tooltip="Price / 10-year avg earnings (inflation-adjusted). Smooths cycle effects"
				/>
			</IndicatorGrid>
		</IndicatorSection>
	);
}
