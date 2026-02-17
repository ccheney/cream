import { Shield } from "lucide-react";
import type { QualityIndicators } from "@/lib/api/types";
import { IndicatorGrid } from "../IndicatorGrid";
import { type Freshness, IndicatorSection } from "../IndicatorSection";
import { IndicatorValue } from "../IndicatorValue";
import { getMScoreStatus } from "./panelUtils";

export interface QualityIndicatorsPanelProps {
	data: QualityIndicators | null | undefined;
	isLoading?: boolean;
	freshness?: Freshness;
}

export function QualityIndicatorsPanel({
	data,
	isLoading,
	freshness = "stale",
}: QualityIndicatorsPanelProps) {
	return (
		<IndicatorSection
			title="Quality Factors"
			icon={<Shield className="h-4 w-4" />}
			isLoading={isLoading}
			freshness={freshness}
		>
			<IndicatorGrid columns={4}>
				<IndicatorValue
					label="Gross Prof"
					value={data?.gross_profitability}
					format="percent"
					tooltip="Gross profit / assets. Higher = more efficient. Strong quality signal"
				/>
				<IndicatorValue
					label="ROE"
					value={data?.roe}
					format="percent"
					tooltip="Net income / equity. How well company uses shareholder capital. >15% = good"
				/>
				<IndicatorValue
					label="ROA"
					value={data?.roa}
					format="percent"
					tooltip="Net income / assets. Efficiency regardless of financing. >5% = good"
				/>
				<IndicatorValue
					label="Asset Gr"
					value={data?.asset_growth}
					format="percent"
					tooltip="YoY asset growth. High growth can dilute returns. Moderate is often better"
				/>
				<IndicatorValue
					label="Accruals"
					value={data?.accruals_ratio}
					format="percent"
					tooltip="Non-cash earnings portion. High accruals = lower quality, potential manipulation"
				/>
				<IndicatorValue
					label="CF Quality"
					value={data?.cash_flow_quality}
					format="percent"
					tooltip="Operating cash flow / net income. >100% = high quality (cash backs earnings)"
				/>
				<IndicatorValue
					label="M-Score"
					value={data?.beneish_m_score}
					status={getMScoreStatus(data?.beneish_m_score ?? null)}
					tooltip="Earnings manipulation probability. >-2.22 = likely manipulator. Red flag"
				/>
				<IndicatorValue
					label="Earn Qual"
					value={data?.earnings_quality ?? "--"}
					tooltip="Overall earnings quality rating based on multiple factors"
				/>
			</IndicatorGrid>
		</IndicatorSection>
	);
}
