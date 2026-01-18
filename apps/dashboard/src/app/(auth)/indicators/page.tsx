"use client";

/**
 * Indicator Lab Page
 *
 * Dashboard view for managing and monitoring indicators.
 * Includes active indicators and paper trading progress.
 */

import { ActiveIndicatorsTable, PaperTradingSection } from "@/components/indicators";
import { QueryErrorBoundary } from "@/components/QueryErrorBoundary";
import { useIndicatorList, usePaperTradingIndicators } from "@/hooks/queries";

export default function IndicatorLabPage() {
	const { data: indicators, isLoading: indicatorsLoading } = useIndicatorList();
	const { data: paperTrading, isLoading: paperLoading } = usePaperTradingIndicators();

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-semibold text-stone-900 dark:text-night-50">Indicator Lab</h1>
			</div>

			{/* Active Indicators */}
			<QueryErrorBoundary title="Failed to load active indicators">
				<ActiveIndicatorsTable indicators={indicators} isLoading={indicatorsLoading} />
			</QueryErrorBoundary>

			{/* Paper Trading Section */}
			<QueryErrorBoundary title="Failed to load paper trading indicators">
				<PaperTradingSection indicators={paperTrading} isLoading={paperLoading} />
			</QueryErrorBoundary>
		</div>
	);
}
