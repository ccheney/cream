/**
 * Synthesis Status Card
 *
 * Displays the current synthesis pipeline status including trigger conditions,
 * active synthesis workflow, and recent activity.
 *
 * @see docs/plans/36-dynamic-indicator-synthesis-workflow.md
 */

import { formatDistanceToNow } from "date-fns";
import { useSynthesisStatus, useTriggerSynthesis } from "@/hooks/queries";
import { cn } from "@/lib/utils";

// ============================================
// Status Dot Component
// ============================================

type StatusDotStatus = "active" | "processing" | "idle" | "error";

function StatusDot({ status }: { status: StatusDotStatus }) {
  return (
    <span
      className={cn(
        "h-2 w-2 rounded-full inline-block",
        status === "active" && "bg-green-500 animate-pulse",
        status === "processing" && "bg-amber-500 animate-pulse",
        status === "idle" && "bg-stone-400 dark:bg-night-500",
        status === "error" && "bg-red-500"
      )}
    />
  );
}

// ============================================
// Loading State
// ============================================

function SynthesisStatusCardSkeleton() {
  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
      <div className="p-4 border-b border-cream-200 dark:border-night-700">
        <div className="h-6 w-40 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
      </div>
      <div className="p-4 space-y-4">
        <div className="space-y-2">
          <div className="h-4 w-48 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
          <div className="h-4 w-40 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
          <div className="h-4 w-44 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
        </div>
        <div className="h-16 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
      </div>
    </div>
  );
}

// ============================================
// Condition Badge
// ============================================

interface ConditionBadgeProps {
  label: string;
  met: boolean;
  value?: string;
}

function ConditionBadge({ label, met, value }: ConditionBadgeProps) {
  return (
    <div
      className={cn(
        "px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1.5",
        met
          ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
          : "bg-stone-100 dark:bg-night-700 text-stone-600 dark:text-night-300"
      )}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          met ? "bg-green-500" : "bg-stone-400 dark:bg-night-500"
        )}
      />
      {label}
      {value && <span className="opacity-75">({value})</span>}
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function SynthesisStatusCard() {
  const { data, isLoading, error, refetch } = useSynthesisStatus();
  const triggerMutation = useTriggerSynthesis();

  if (isLoading) {
    return <SynthesisStatusCardSkeleton />;
  }

  if (error || !data) {
    return (
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
        <h3 className="text-lg font-medium text-stone-900 dark:text-night-50">Synthesis Status</h3>
        <p className="text-stone-500 dark:text-night-300 mt-2">Unable to load synthesis status</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-3 px-3 py-1.5 text-sm font-medium bg-cream-100 dark:bg-night-700 text-stone-700 dark:text-night-100 rounded-md hover:bg-cream-200 dark:hover:bg-night-600 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const { triggerStatus, activeSynthesis, recentActivity, lastEvaluatedAt } = data;

  // Determine overall status
  const getOverallStatus = (): StatusDotStatus => {
    if (activeSynthesis) {
      return "processing";
    }
    if (triggerStatus?.shouldTrigger) {
      return "active";
    }
    return "idle";
  };

  const overallStatus = getOverallStatus();

  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
      {/* Header */}
      <div className="p-4 border-b border-cream-200 dark:border-night-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusDot status={overallStatus} />
          <h3 className="text-lg font-medium text-stone-900 dark:text-night-50">
            Synthesis Pipeline
          </h3>
        </div>
        <button
          type="button"
          onClick={() => triggerMutation.mutate({})}
          disabled={triggerMutation.isPending || !!activeSynthesis}
          className={cn(
            "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
            triggerMutation.isPending || activeSynthesis
              ? "bg-stone-100 dark:bg-night-700 text-stone-400 dark:text-night-500 cursor-not-allowed"
              : "bg-cream-100 dark:bg-night-700 text-stone-700 dark:text-night-100 hover:bg-cream-200 dark:hover:bg-night-600"
          )}
        >
          {triggerMutation.isPending ? "Triggering..." : "Manual Trigger"}
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Trigger Status Section */}
        {triggerStatus && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-stone-600 dark:text-night-300">Trigger Status</span>
              <span
                className={cn(
                  "text-sm font-medium",
                  triggerStatus.shouldTrigger
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-green-600 dark:text-green-400"
                )}
              >
                {triggerStatus.shouldTrigger ? "Conditions Met" : "No Trigger Warranted"}
              </span>
            </div>

            {/* Condition Badges */}
            <div className="flex flex-wrap gap-2">
              <ConditionBadge
                label="Regime Gap"
                met={triggerStatus.conditions.regimeGapDetected}
                value={triggerStatus.conditions.currentRegime}
              />
              <ConditionBadge
                label="IC Decay"
                met={triggerStatus.conditions.existingIndicatorsUnderperforming}
                value={`${triggerStatus.conditions.icDecayDays}d`}
              />
              <ConditionBadge label="Cooldown" met={triggerStatus.conditions.cooldownMet} />
              <ConditionBadge
                label="Capacity"
                met={triggerStatus.conditions.capacityAvailable}
                value={`${triggerStatus.conditions.activeIndicatorCount}/${triggerStatus.conditions.maxIndicatorCapacity}`}
              />
            </div>
          </div>
        )}

        {/* Active Synthesis Section */}
        {activeSynthesis && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Synthesis in Progress
              </span>
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-amber-700 dark:text-amber-400">Name:</span>
                <span className="text-amber-900 dark:text-amber-200 font-medium">
                  {activeSynthesis.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-amber-700 dark:text-amber-400">Phase:</span>
                <span className="text-amber-900 dark:text-amber-200 font-mono text-xs">
                  {activeSynthesis.currentPhase.replace(/_/g, " ")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-amber-700 dark:text-amber-400">Started:</span>
                <span className="text-amber-900 dark:text-amber-200">
                  {formatDistanceToNow(new Date(activeSynthesis.startedAt), { addSuffix: true })}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Recent Activity Section */}
        {recentActivity && recentActivity.length > 0 && (
          <div className="space-y-2">
            <span className="text-sm text-stone-600 dark:text-night-300">Recent Activity</span>
            <div className="space-y-2">
              {recentActivity.slice(0, 3).map((activity, index) => (
                <div
                  key={`${activity.indicatorName}-${index}`}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-stone-700 dark:text-night-200 truncate max-w-[180px]">
                    {activity.indicatorName}
                  </span>
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded text-xs font-medium",
                      activity.success
                        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                        : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                    )}
                  >
                    {activity.status.replace(/_/g, " ")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Last Evaluated */}
        {lastEvaluatedAt && (
          <div className="text-xs text-stone-500 dark:text-night-400 pt-2 border-t border-cream-100 dark:border-night-700">
            Last evaluated: {formatDistanceToNow(new Date(lastEvaluatedAt), { addSuffix: true })}
          </div>
        )}
      </div>
    </div>
  );
}
