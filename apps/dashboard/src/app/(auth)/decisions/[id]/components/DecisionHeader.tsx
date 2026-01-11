"use client";

import type { DecisionDetail } from "@/lib/api/types";
import { BackButton } from "./BackButton";
import { actionColors, statusColors } from "./utils";

export interface DecisionHeaderProps {
  decision: DecisionDetail;
  onBack: () => void;
}

export function DecisionHeader({ decision, onBack }: DecisionHeaderProps): React.ReactElement {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <BackButton onClick={onBack} />
        <div className="flex items-center gap-3">
          <span
            className={`px-3 py-1.5 text-sm font-medium rounded ${actionColors[decision.action]}`}
          >
            {decision.action}
          </span>
          <h1 className="text-2xl font-semibold text-cream-900 dark:text-cream-100">
            {decision.symbol}
          </h1>
          <span className="text-lg text-cream-500 dark:text-cream-400">{decision.direction}</span>
        </div>
      </div>
      <span className={`px-3 py-1.5 text-sm font-medium rounded ${statusColors[decision.status]}`}>
        {decision.status}
      </span>
    </div>
  );
}
