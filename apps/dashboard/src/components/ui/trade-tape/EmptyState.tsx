/**
 * EmptyState Component
 *
 * Displayed when no trades are available.
 */

"use client";

import { memo } from "react";

interface EmptyStateProps {
  symbol: string;
}

export const EmptyState = memo(function EmptyState({
  symbol,
}: EmptyStateProps): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center h-full text-stone-500 dark:text-night-300">
      <span className="text-2xl mb-2" aria-hidden="true">
        📊
      </span>
      <span className="text-sm">Waiting for {symbol} trades...</span>
    </div>
  );
});

export default EmptyState;
