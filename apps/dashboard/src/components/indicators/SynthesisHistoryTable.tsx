/**
 * Synthesis History Table
 *
 * Displays synthesis attempt history with sortable columns.
 *
 * @see docs/plans/36-dynamic-indicator-synthesis-workflow.md
 */

import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { useState } from "react";
import { useSynthesisHistory } from "@/hooks/queries";
import { cn } from "@/lib/utils";

// ============================================
// Status Badge Component
// ============================================

const statusColors: Record<string, string> = {
  paper: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
  production: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
  staging: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
  retired: "bg-stone-100 dark:bg-night-700 text-stone-600 dark:text-night-300",
  validation_failed: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
};

function StatusBadge({ status }: { status: string }) {
  const colorClass = statusColors[status] ?? statusColors.retired;

  return (
    <span className={cn("px-2 py-0.5 rounded text-xs font-medium", colorClass)}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ============================================
// Trigger Badge Component
// ============================================

function TriggerBadge({ trigger }: { trigger: string }) {
  return (
    <span className="px-2 py-0.5 rounded text-xs font-medium border border-cream-200 dark:border-night-600 text-stone-600 dark:text-night-300">
      {trigger.replace(/_/g, " ")}
    </span>
  );
}

// ============================================
// Loading Skeleton
// ============================================

function SynthesisHistoryTableSkeleton() {
  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
      <div className="p-4 border-b border-cream-200 dark:border-night-700">
        <div className="h-6 w-40 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
      </div>
      <div className="p-4 space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
        ))}
      </div>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

type SortField = "name" | "triggerReason" | "status" | "generatedAt" | "ic";
type SortDirection = "asc" | "desc";

export function SynthesisHistoryTable() {
  const { data: history, isLoading, error } = useSynthesisHistory();
  const [sortField, setSortField] = useState<SortField>("generatedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection(field === "generatedAt" ? "desc" : "asc");
    }
  };

  const sortedHistory = [...(history ?? [])].sort((a, b) => {
    const multiplier = sortDirection === "asc" ? 1 : -1;

    switch (sortField) {
      case "name":
      case "triggerReason":
      case "status":
        return a[sortField].localeCompare(b[sortField]) * multiplier;
      case "generatedAt":
        return (new Date(a.generatedAt).getTime() - new Date(b.generatedAt).getTime()) * multiplier;
      case "ic": {
        const aIc = a.ic ?? -Infinity;
        const bIc = b.ic ?? -Infinity;
        return (aIc - bIc) * multiplier;
      }
      default:
        return 0;
    }
  });

  const SortHeader = ({
    field,
    children,
    align = "left",
  }: {
    field: SortField;
    children: React.ReactNode;
    align?: "left" | "right";
  }) => (
    <th
      className={cn(
        "px-4 py-3 text-xs font-medium text-stone-500 dark:text-night-300 uppercase tracking-wider cursor-pointer hover:text-stone-700 dark:hover:text-night-100",
        align === "right" ? "text-right" : "text-left"
      )}
      onClick={() => handleSort(field)}
    >
      <span className={cn("inline-flex items-center gap-1", align === "right" && "justify-end")}>
        {children}
        {sortField === field && (
          <span className="text-xs">{sortDirection === "asc" ? "↑" : "↓"}</span>
        )}
      </span>
    </th>
  );

  if (isLoading) {
    return <SynthesisHistoryTableSkeleton />;
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-8">
        <p className="text-center text-red-600 dark:text-red-400">
          Failed to load synthesis history
        </p>
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
        <div className="p-4 border-b border-cream-200 dark:border-night-700">
          <h3 className="text-lg font-medium text-stone-900 dark:text-night-50">
            Synthesis History
          </h3>
        </div>
        <div className="flex h-32 items-center justify-center text-stone-500 dark:text-night-400">
          No synthesis history
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
      <div className="p-4 border-b border-cream-200 dark:border-night-700 flex items-center justify-between">
        <h3 className="text-lg font-medium text-stone-900 dark:text-night-50">Synthesis History</h3>
        <span className="text-sm text-stone-500 dark:text-night-300">
          {history.length} indicator{history.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-cream-200 dark:divide-night-700">
          <thead className="bg-cream-50 dark:bg-night-750 sticky top-0">
            <tr>
              <SortHeader field="name">Indicator</SortHeader>
              <SortHeader field="triggerReason">Trigger</SortHeader>
              <SortHeader field="status">Status</SortHeader>
              <SortHeader field="generatedAt">Generated</SortHeader>
              <SortHeader field="ic" align="right">
                IC
              </SortHeader>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-100 dark:divide-night-700">
            {sortedHistory.map((item) => (
              <tr
                key={item.id}
                className="hover:bg-cream-50 dark:hover:bg-night-750 transition-colors"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/indicators/${item.id}`}
                    className="text-stone-900 dark:text-night-50 font-medium hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    {item.name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <TriggerBadge trigger={item.triggerReason} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={item.status} />
                </td>
                <td className="px-4 py-3 text-sm text-stone-500 dark:text-night-300">
                  {formatDistanceToNow(new Date(item.generatedAt), { addSuffix: true })}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="font-mono text-sm text-stone-700 dark:text-night-200">
                    {item.ic !== null ? item.ic.toFixed(3) : "—"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
