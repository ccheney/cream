"use client";

import type { ExecutionDetail } from "@/lib/api/types";
import { ExecutionTimeline } from "./ExecutionTimeline";

export interface ExecutionSectionProps {
  execution: ExecutionDetail | null;
}

export function ExecutionSection({ execution }: ExecutionSectionProps): React.ReactElement | null {
  if (!execution) {
    return null;
  }

  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
      <h2 className="text-lg font-medium text-stone-900 dark:text-night-50 mb-4">
        Execution Timeline
      </h2>
      <ExecutionTimeline execution={execution} />
    </div>
  );
}
