import { MessageSquare } from "lucide-react";
import type { SentimentIndicators } from "@/lib/api/types";
import { IndicatorGrid } from "../IndicatorGrid";
import { type Freshness, IndicatorSection } from "../IndicatorSection";
import { IndicatorValue } from "../IndicatorValue";
import { getSentimentLabel, getSentimentSignal } from "./panelUtils";

export interface SentimentPanelProps {
	data: SentimentIndicators | null | undefined;
	isLoading?: boolean;
	freshness?: Freshness;
}

export function SentimentPanel({ data, isLoading, freshness = "recent" }: SentimentPanelProps) {
	return (
		<IndicatorSection
			title="Sentiment"
			icon={<MessageSquare className="h-4 w-4" />}
			isLoading={isLoading}
			freshness={freshness}
		>
			<IndicatorGrid columns={4}>
				<IndicatorValue
					label="Score"
					value={data?.overall_score}
					signal={getSentimentSignal(data?.overall_score ?? null)}
					tooltip="Aggregate sentiment (-1 to 1). >0.2 bullish, <-0.2 bearish"
				/>
				<IndicatorValue
					label="Class"
					value={getSentimentLabel(data?.classification ?? null)}
					signal={getSentimentSignal(data?.overall_score ?? null)}
					tooltip="Sentiment category based on score. Combines news, social, and analyst data"
				/>
				<IndicatorValue
					label="Strength"
					value={data?.sentiment_strength}
					format="percent"
					tooltip="Confidence in sentiment reading. Higher = more reliable signal"
				/>
				<IndicatorValue
					label="News Vol"
					value={data?.news_volume}
					decimals={0}
					tooltip="Recent article count. High volume = more attention, potential catalyst"
				/>
				<IndicatorValue
					label="Momentum"
					value={data?.sentiment_momentum}
					signal={getSentimentSignal(data?.sentiment_momentum ?? null)}
					tooltip="Sentiment change direction. Rising = improving outlook, falling = deteriorating"
				/>
				<IndicatorValue
					label="Event Risk"
					value={data?.event_risk ? "Yes" : "No"}
					status={data?.event_risk ? "warning" : undefined}
					tooltip="Upcoming catalyst (earnings, FDA, etc.). Yes = expect volatility"
				/>
			</IndicatorGrid>
		</IndicatorSection>
	);
}
