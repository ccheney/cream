import { TrendingDown } from "lucide-react";
import type { ShortInterestIndicators } from "@/lib/api/types";
import { IndicatorGrid } from "../IndicatorGrid";
import { type Freshness, IndicatorSection } from "../IndicatorSection";
import { IndicatorValue } from "../IndicatorValue";
import { getDaysToCoverSignal, getShortInterestSignal } from "./panelUtils";

export interface ShortInterestPanelProps {
	data: ShortInterestIndicators | null | undefined;
	isLoading?: boolean;
	freshness?: Freshness;
}

export function ShortInterestPanel({
	data,
	isLoading,
	freshness = "stale",
}: ShortInterestPanelProps) {
	return (
		<IndicatorSection
			title="Short Interest"
			icon={<TrendingDown className="h-4 w-4" />}
			isLoading={isLoading}
			freshness={freshness}
			lastUpdated={data?.settlement_date ?? undefined}
		>
			<IndicatorGrid columns={4}>
				<IndicatorValue
					label="Short %"
					value={data?.short_pct_float}
					format="percent"
					signal={getShortInterestSignal(data?.short_pct_float ?? null)}
					tooltip="Shares sold short / float. >10% = high, >20% = very high (squeeze potential)"
				/>
				<IndicatorValue
					label="Days Cover"
					value={data?.days_to_cover}
					format="days"
					signal={getDaysToCoverSignal(data?.days_to_cover ?? null)}
					tooltip="Days to close all shorts at avg volume. >5 days = potential squeeze risk"
				/>
				<IndicatorValue
					label="SI Ratio"
					value={data?.short_interest_ratio}
					format="ratio"
					tooltip="Short shares / avg daily volume. Higher = more crowded short"
				/>
				<IndicatorValue
					label="Change"
					value={data?.short_interest_change}
					format="percent"
					signal={
						data?.short_interest_change !== null && data?.short_interest_change !== undefined
							? -data.short_interest_change * 5
							: undefined
					}
					tooltip="Change vs prior report. Rising = more bearish bets, falling = covering"
				/>
			</IndicatorGrid>
		</IndicatorSection>
	);
}
