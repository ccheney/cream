import { Building2 } from "lucide-react";
import type { CorporateIndicators } from "@/lib/api/types";
import { IndicatorGrid } from "../IndicatorGrid";
import { type Freshness, IndicatorSection } from "../IndicatorSection";
import { IndicatorValue } from "../IndicatorValue";

export interface CorporatePanelProps {
	data: CorporateIndicators | null | undefined;
	isLoading?: boolean;
	freshness?: Freshness;
}

export function CorporatePanel({ data, isLoading, freshness = "stale" }: CorporatePanelProps) {
	return (
		<IndicatorSection
			title="Corporate"
			icon={<Building2 className="h-4 w-4" />}
			isLoading={isLoading}
			freshness={freshness}
		>
			<IndicatorGrid columns={4}>
				<IndicatorValue
					label="Div Yield"
					value={data?.trailing_dividend_yield}
					format="percent"
					tooltip="Annual dividend / price. Must own before ex-div date to receive"
				/>
				<IndicatorValue
					label="Ex-Div"
					value={data?.ex_dividend_days}
					format="days"
					tooltip="Days until ex-dividend. Buy before to receive dividend, expect price drop after"
				/>
				<IndicatorValue
					label="Earnings"
					value={data?.upcoming_earnings_days}
					format="days"
					tooltip="Days until earnings report. Expect high IV and potential gap"
				/>
				<IndicatorValue
					label="Split"
					value={data?.recent_split ? "Recent" : "None"}
					status={data?.recent_split ? "neutral" : undefined}
					tooltip="Stock split status. Recent splits may affect historical chart comparisons"
				/>
			</IndicatorGrid>
		</IndicatorSection>
	);
}
