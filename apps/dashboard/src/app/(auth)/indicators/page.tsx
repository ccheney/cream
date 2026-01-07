"use client";

/**
 * Indicator Lab Page
 *
 * Main dashboard view for managing the indicator synthesis system.
 *
 * @see docs/plans/19-dynamic-indicator-synthesis.md (lines 1249-1305)
 */

import {
  ActiveIndicatorsTable,
  ActivityFeed,
  PaperTradingSection,
  TriggerStatusCard,
} from "@/components/indicators";
import {
  useForceTriggerCheck,
  useIndicatorActivity,
  useIndicatorList,
  usePaperTradingIndicators,
  useTriggerStatus,
} from "@/hooks/queries";

export default function IndicatorLabPage() {
  // Fetch all data
  const { data: indicators, isLoading: indicatorsLoading } = useIndicatorList();
  const { data: triggerStatus, isLoading: triggerLoading } = useTriggerStatus();
  const { data: paperTrading, isLoading: paperLoading } = usePaperTradingIndicators();
  const { data: activities, isLoading: activityLoading } = useIndicatorActivity(10);

  // Mutation for manual trigger check
  const { mutate: forceTriggerCheck, isPending: triggerCheckPending } = useForceTriggerCheck();

  // Calculate stats
  const stats = {
    production: indicators?.filter((i) => i.status === "production").length ?? 0,
    paper: indicators?.filter((i) => i.status === "paper").length ?? 0,
    staging: indicators?.filter((i) => i.status === "staging").length ?? 0,
    retired: indicators?.filter((i) => i.status === "retired").length ?? 0,
  };

  const totalActive = stats.production + stats.paper;
  const maxCapacity = triggerStatus?.conditions.maxIndicatorCapacity ?? 20;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-cream-900 dark:text-cream-100">
            Indicator Lab
          </h1>
          <div className="mt-1 flex items-center gap-4 text-sm text-cream-500 dark:text-cream-400">
            <span>
              Active: {totalActive}/{maxCapacity}
            </span>
            <span className="text-cream-300 dark:text-night-600">|</span>
            <span>Paper: {stats.paper}</span>
            <span className="text-cream-300 dark:text-night-600">|</span>
            <span>Staging: {stats.staging}</span>
            <span className="text-cream-300 dark:text-night-600">|</span>
            <span>Retired: {stats.retired}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => forceTriggerCheck()}
          disabled={triggerCheckPending}
          className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {triggerCheckPending ? "Checking..." : "+ Trigger Check"}
        </button>
      </div>

      {/* Trigger Status */}
      <TriggerStatusCard
        status={triggerStatus}
        isLoading={triggerLoading}
        onTriggerCheck={() => forceTriggerCheck()}
      />

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Indicators Table - Full width on mobile, half on desktop */}
        <div className="lg:col-span-2">
          <ActiveIndicatorsTable indicators={indicators} isLoading={indicatorsLoading} />
        </div>

        {/* Paper Trading Section */}
        <PaperTradingSection indicators={paperTrading} isLoading={paperLoading} />

        {/* Activity Feed */}
        <ActivityFeed activities={activities} isLoading={activityLoading} />
      </div>
    </div>
  );
}
