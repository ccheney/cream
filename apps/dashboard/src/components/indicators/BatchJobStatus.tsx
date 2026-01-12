/**
 * Batch Job Status Component
 *
 * Displays recent sync runs, success/failure status, and next scheduled run.
 * Uses status dots, Cream Glow for running jobs, and Geist Mono for timestamps.
 *
 * @see docs/plans/ui/24-components.md Status Indicators section
 * @see docs/plans/ui/20-design-philosophy.md Trust Through Transparency
 */

"use client";

import { AlertCircle, CheckCircle2, Clock, Loader2, RefreshCw, XCircle } from "lucide-react";
import { memo, useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  type BatchStatusFilters,
  type SyncRun,
  type SyncRunStatus,
  type SyncRunType,
  useBatchStatus,
  useTriggerBatchSync,
} from "@/hooks/queries/useBatchStatus";

// ============================================
// Types
// ============================================

export interface BatchJobStatusProps {
  /** Number of recent jobs to display */
  limit?: number;
  /** Filter by run type */
  type?: SyncRunType;
  /** Filter by status */
  statusFilter?: SyncRunStatus;
  /** Show manual trigger button (admin only) */
  showTriggerButton?: boolean;
  /** Additional CSS class */
  className?: string;
}

// ============================================
// Constants
// ============================================

const RUN_TYPE_LABELS: Record<SyncRunType, string> = {
  fundamentals: "Fundamentals",
  short_interest: "Short Interest",
  sentiment: "Sentiment",
  corporate_actions: "Corporate Actions",
};

// ============================================
// Helper Functions
// ============================================

function getStatusVariant(status: SyncRunStatus): "success" | "warning" | "error" {
  switch (status) {
    case "completed":
      return "success";
    case "running":
      return "warning";
    case "failed":
      return "error";
  }
}

function getStatusIcon(status: SyncRunStatus) {
  switch (status) {
    case "completed":
      return CheckCircle2;
    case "running":
      return Loader2;
    case "failed":
      return XCircle;
  }
}

function formatDuration(startedAt: string, completedAt: string | null): string {
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const durationMs = end - start;

  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  const seconds = Math.floor(durationMs / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) {
    return "just now";
  }
  if (diffMins < 60) {
    return `${diffMins}m ago`;
  }

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatRelativeTime(timestamp: string | null): string {
  if (!timestamp) {
    return "Never";
  }
  return formatTimestamp(timestamp);
}

// ============================================
// Sub-components
// ============================================

interface JobRowProps {
  run: SyncRun;
}

const JobRow = memo(function JobRow({ run }: JobRowProps) {
  const StatusIcon = getStatusIcon(run.status);
  const isRunning = run.status === "running";

  return (
    <tr className="border-b border-cream-200 dark:border-night-700 hover:bg-cream-50 dark:hover:bg-night-800/50 transition-colors">
      {/* Job Type */}
      <td className="px-4 py-3">
        <span className="text-sm font-medium text-stone-900 dark:text-night-50">
          {RUN_TYPE_LABELS[run.run_type]}
        </span>
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <Badge
          variant={getStatusVariant(run.status)}
          dot
          size="sm"
          className={isRunning ? "animate-pulse" : ""}
        >
          <StatusIcon
            className={`w-3 h-3 mr-1 ${isRunning ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
        </Badge>
      </td>

      {/* Started */}
      <td className="px-4 py-3">
        <span className="text-sm font-mono text-stone-600 dark:text-night-200 dark:text-night-400">
          {formatTimestamp(run.started_at)}
        </span>
      </td>

      {/* Duration */}
      <td className="px-4 py-3">
        <span className="text-sm font-mono text-stone-600 dark:text-night-200 dark:text-night-400">
          {formatDuration(run.started_at, run.completed_at)}
        </span>
      </td>

      {/* Processed/Failed */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-green-600 dark:text-green-400 font-mono">
            {run.symbols_processed}
          </span>
          <span className="text-stone-400 dark:text-night-400">/</span>
          <span
            className={`font-mono ${run.symbols_failed > 0 ? "text-red-600 dark:text-red-400" : "text-stone-400 dark:text-night-400"}`}
          >
            {run.symbols_failed}
          </span>
        </div>
      </td>

      {/* Error */}
      <td className="px-4 py-3">
        {run.error_message ? (
          <div className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate max-w-[200px]" title={run.error_message}>
              {run.error_message}
            </span>
          </div>
        ) : (
          <span className="text-sm text-stone-400 dark:text-night-400">—</span>
        )}
      </td>
    </tr>
  );
});

interface SummaryCardsProps {
  summary: {
    total_runs: number;
    running: number;
    completed: number;
    failed: number;
    last_completed: Record<SyncRunType, string | null>;
  };
}

const SummaryCards = memo(function SummaryCards({ summary }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      <div className="bg-cream-50 dark:bg-night-800 rounded-lg p-3">
        <div className="text-xs text-stone-500 dark:text-night-300 mb-1">Total Runs</div>
        <div className="text-xl font-semibold text-stone-900 dark:text-night-50 font-mono">
          {summary.total_runs}
        </div>
      </div>

      <div className="bg-cream-50 dark:bg-night-800 rounded-lg p-3">
        <div className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-night-300 mb-1">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
          Running
        </div>
        <div className="text-xl font-semibold text-amber-600 dark:text-amber-400 font-mono">
          {summary.running}
        </div>
      </div>

      <div className="bg-cream-50 dark:bg-night-800 rounded-lg p-3">
        <div className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-night-300 mb-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          Completed
        </div>
        <div className="text-xl font-semibold text-green-600 dark:text-green-400 font-mono">
          {summary.completed}
        </div>
      </div>

      <div className="bg-cream-50 dark:bg-night-800 rounded-lg p-3">
        <div className="flex items-center gap-1.5 text-xs text-stone-500 dark:text-night-300 mb-1">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          Failed
        </div>
        <div className="text-xl font-semibold text-red-600 dark:text-red-400 font-mono">
          {summary.failed}
        </div>
      </div>
    </div>
  );
});

interface LastCompletedProps {
  lastCompleted: Record<SyncRunType, string | null>;
}

const LastCompletedSection = memo(function LastCompletedSection({
  lastCompleted,
}: LastCompletedProps) {
  return (
    <div className="border-t border-cream-200 dark:border-night-700 pt-4 mt-4">
      <h4 className="text-sm font-medium text-stone-700 dark:text-night-100 mb-3 flex items-center gap-2">
        <Clock className="w-4 h-4" aria-hidden="true" />
        Last Completed by Type
      </h4>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(Object.entries(RUN_TYPE_LABELS) as [SyncRunType, string][]).map(([type, label]) => (
          <div key={type} className="text-sm">
            <div className="text-stone-500 dark:text-night-300 text-xs mb-0.5">{label}</div>
            <div className="font-mono text-stone-700 dark:text-night-100">
              {formatRelativeTime(lastCompleted[type])}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

// ============================================
// Main Component
// ============================================

function BatchJobStatusComponent({
  limit = 20,
  type,
  statusFilter,
  showTriggerButton = false,
  className = "",
}: BatchJobStatusProps) {
  const [triggerType, setTriggerType] = useState<SyncRunType | null>(null);

  const filters: BatchStatusFilters = {
    limit,
    ...(type && { type }),
    ...(statusFilter && { status: statusFilter }),
  };

  const { data, isLoading, error, refetch, isFetching } = useBatchStatus(filters);
  const triggerMutation = useTriggerBatchSync();

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleTrigger = useCallback(
    async (runType: SyncRunType) => {
      setTriggerType(runType);
      try {
        await triggerMutation.mutateAsync(runType);
      } finally {
        setTriggerType(null);
      }
    },
    [triggerMutation]
  );

  // Loading state
  if (isLoading) {
    return (
      <div
        className={`bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 ${className}`}
      >
        <div className="p-4 border-b border-cream-200 dark:border-night-700">
          <div className="h-6 w-40 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
        </div>
        <div className="p-4">
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
            ))}
          </div>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        className={`bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4 ${className}`}
      >
        <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
          <AlertCircle className="w-5 h-5" aria-hidden="true" />
          <div>
            <h3 className="font-medium">Failed to load batch status</h3>
            <p className="text-sm text-stone-600 dark:text-night-200 dark:text-night-400 mt-1">
              {error instanceof Error ? error.message : "An error occurred"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          className="mt-3 px-3 py-1.5 text-sm font-medium bg-cream-100 dark:bg-night-700 text-stone-700 dark:text-night-100 rounded-md hover:bg-cream-200 dark:hover:bg-night-600 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // Empty state
  if (!data || data.runs.length === 0) {
    return (
      <div
        className={`bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 ${className}`}
      >
        <div className="p-4 border-b border-cream-200 dark:border-night-700 flex items-center justify-between">
          <h3 className="text-lg font-medium text-stone-900 dark:text-night-50">
            Batch Job Status
          </h3>
        </div>
        <div className="p-8 text-center">
          <Clock
            className="w-12 h-12 mx-auto text-stone-400 dark:text-night-400 mb-3"
            aria-hidden="true"
          />
          <h4 className="text-stone-700 dark:text-night-100 font-medium mb-1">No batch jobs yet</h4>
          <p className="text-sm text-stone-500 dark:text-night-300">
            Batch jobs will appear here once the system starts syncing data.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 ${className}`}
    >
      {/* Header */}
      <div className="p-4 border-b border-cream-200 dark:border-night-700 flex items-center justify-between">
        <h3 className="text-lg font-medium text-stone-900 dark:text-night-50">Batch Job Status</h3>
        <div className="flex items-center gap-2">
          {showTriggerButton && (
            <div className="flex items-center gap-1">
              {(Object.entries(RUN_TYPE_LABELS) as [SyncRunType, string][]).map(
                ([runType, label]) => (
                  <button
                    key={runType}
                    type="button"
                    onClick={() => handleTrigger(runType)}
                    disabled={triggerMutation.isPending}
                    className="px-2 py-1 text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 rounded hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors disabled:opacity-50"
                    title={`Trigger ${label} sync`}
                  >
                    {triggerType === runType ? (
                      <Loader2 className="w-3 h-3 animate-spin" aria-label="Triggering" />
                    ) : (
                      label.split(" ")[0]
                    )}
                  </button>
                )
              )}
            </div>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isFetching}
            className="p-1.5 text-stone-500 dark:text-night-300 hover:text-stone-700 dark:hover:text-night-100 transition-colors disabled:opacity-50"
            aria-label="Refresh batch status"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Summary Cards */}
        <SummaryCards summary={data.summary} />

        {/* Jobs Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-cream-200 dark:border-night-700">
                <th className="px-4 py-2 text-left text-xs font-medium text-stone-500 dark:text-night-300 uppercase tracking-wider">
                  Job Type
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-stone-500 dark:text-night-300 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-stone-500 dark:text-night-300 uppercase tracking-wider">
                  Started
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-stone-500 dark:text-night-300 uppercase tracking-wider">
                  Duration
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-stone-500 dark:text-night-300 uppercase tracking-wider">
                  Processed/Failed
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-stone-500 dark:text-night-300 uppercase tracking-wider">
                  Error
                </th>
              </tr>
            </thead>
            <tbody>
              {data.runs.map((run) => (
                <JobRow key={run.id} run={run} />
              ))}
            </tbody>
          </table>
        </div>

        {/* Last Completed Section */}
        <LastCompletedSection lastCompleted={data.summary.last_completed} />
      </div>
    </div>
  );
}

export const BatchJobStatus = memo(BatchJobStatusComponent);

export default BatchJobStatus;
