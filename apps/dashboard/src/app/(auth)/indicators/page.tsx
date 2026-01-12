"use client";

/**
 * Indicator Lab Page
 *
 * Dashboard view for managing and monitoring synthesized indicators.
 * Includes synthesis pipeline status, history, active indicators, and paper trading.
 *
 * @see docs/plans/36-dynamic-indicator-synthesis-workflow.md
 */

import {
  ActiveIndicatorsTable,
  PaperTradingSection,
  SynthesisHistoryTable,
  SynthesisStatusCard,
} from "@/components/indicators";
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

      {/* Synthesis Status & Active Indicators Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Synthesis Status - Takes 1 column */}
        <div className="lg:col-span-1">
          <QueryErrorBoundary title="Failed to load synthesis status">
            <SynthesisStatusCard />
          </QueryErrorBoundary>
        </div>

        {/* Active Indicators - Takes 2 columns */}
        <div className="lg:col-span-2">
          <QueryErrorBoundary title="Failed to load active indicators">
            <ActiveIndicatorsTable indicators={indicators} isLoading={indicatorsLoading} />
          </QueryErrorBoundary>
        </div>
      </div>

      {/* Paper Trading Section */}
      <QueryErrorBoundary title="Failed to load paper trading indicators">
        <PaperTradingSection indicators={paperTrading} isLoading={paperLoading} />
      </QueryErrorBoundary>

      {/* Synthesis History */}
      <QueryErrorBoundary title="Failed to load synthesis history">
        <SynthesisHistoryTable />
      </QueryErrorBoundary>
    </div>
  );
}
