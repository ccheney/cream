"use client";

/**
 * Charts Page - Market context with candle charts and indicators
 *
 * @see docs/plans/ui/40-streaming-data-integration.md
 */

import { useEffect, useState } from "react";
import type { ChartPageProps } from "./components/index.js";
import { ChartContent } from "./components/index.js";

function PageSkeleton() {
  return (
    <div className="flex flex-col h-full bg-cream-50 dark:bg-night-900">
      <div className="flex items-center justify-between px-4 py-3 border-b border-cream-200 dark:border-night-700 bg-white dark:bg-night-800">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 bg-cream-200 dark:bg-night-600 rounded animate-pulse" />
          <div className="h-6 w-24 bg-cream-200 dark:bg-night-600 rounded animate-pulse" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-8 w-28 bg-cream-200 dark:bg-night-600 rounded animate-pulse" />
          <div className="h-8 w-20 bg-cream-200 dark:bg-night-600 rounded animate-pulse" />
        </div>
      </div>
      <div className="flex-1 p-4 space-y-4">
        <div className="h-24 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
        <div className="h-96 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
      </div>
    </div>
  );
}

export default function ChartPage({ params }: ChartPageProps) {
  const [symbol, setSymbol] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  useEffect(() => {
    params.then((p) => {
      setSymbol(p.symbol);
      setIsInitialLoad(false);
    });
  }, [params]);

  if (!symbol && isInitialLoad) {
    return <PageSkeleton />;
  }

  if (!symbol) {
    return null;
  }

  return <ChartContent symbol={symbol} />;
}
