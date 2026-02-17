import { Droplets } from "lucide-react";
import type { LiquidityIndicators } from "@/lib/api/types";
import { IndicatorGrid } from "../IndicatorGrid";
import { type Freshness, IndicatorSection } from "../IndicatorSection";
import { IndicatorValue } from "../IndicatorValue";

export interface LiquidityIndicatorsPanelProps {
	data: LiquidityIndicators | null | undefined;
	isLoading?: boolean;
	freshness?: Freshness;
}

export function LiquidityIndicatorsPanel({
	data,
	isLoading,
	freshness = "recent",
}: LiquidityIndicatorsPanelProps) {
	return (
		<IndicatorSection
			title="Liquidity"
			icon={<Droplets className="h-4 w-4" />}
			isLoading={isLoading}
			freshness={freshness}
		>
			<IndicatorGrid columns={4}>
				<IndicatorValue
					label="Bid-Ask"
					value={data?.bid_ask_spread}
					format="currency"
					tooltip="Gap between buy and sell price. Smaller = more liquid, cheaper to trade"
				/>
				<IndicatorValue
					label="Spread %"
					value={data?.bid_ask_spread_pct}
					format="percent"
					decimals={3}
					tooltip="<0.1% = very liquid, >1% = illiquid"
				/>
				<IndicatorValue
					label="Amihud"
					value={data?.amihud_illiquidity}
					decimals={4}
					tooltip="Price impact per dollar traded. Higher = harder to trade large sizes"
				/>
				<IndicatorValue
					label="VWAP"
					value={data?.vwap}
					format="currency"
					tooltip="Volume-weighted average price today. Institutional benchmark for execution"
				/>
				<IndicatorValue
					label="Turnover"
					value={data?.turnover_ratio}
					format="percent"
					tooltip="Daily volume / shares outstanding. Higher = more active trading"
				/>
				<IndicatorValue
					label="Vol Ratio"
					value={data?.volume_ratio}
					format="ratio"
					tooltip="Today's volume vs 20-day avg. >1 = above average activity"
				/>
			</IndicatorGrid>
		</IndicatorSection>
	);
}
