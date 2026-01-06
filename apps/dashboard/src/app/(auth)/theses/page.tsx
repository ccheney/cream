"use client";

/**
 * Theses Page - Investment thesis tracker
 */

import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { useTheses } from "@/hooks/queries";

export default function ThesesPage() {
  const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "INVALIDATED" | "REALIZED" | "all">(
    "ACTIVE"
  );

  const { data: theses, isLoading } = useTheses({
    state: statusFilter === "all" ? undefined : statusFilter,
  });

  const formatPct = (value: number | null) =>
    value !== null ? `${value >= 0 ? "+" : ""}${value.toFixed(1)}%` : "--";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-cream-900 dark:text-cream-100">
          Investment Theses
        </h1>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="text-sm border border-cream-200 dark:border-night-700 rounded-md px-3 py-1.5 bg-white dark:bg-night-800 text-cream-900 dark:text-cream-100"
          >
            <option value="ACTIVE">Active</option>
            <option value="REALIZED">Realized</option>
            <option value="INVALIDATED">Invalidated</option>
            <option value="all">All</option>
          </select>
        </div>
      </div>

      {/* Theses List */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
        <div className="p-4 border-b border-cream-200 dark:border-night-700">
          <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100">
            {statusFilter === "all" ? "All" : statusFilter} Theses
            {theses && ` (${theses.length})`}
          </h2>
        </div>
        {isLoading ? (
          <div className="p-4 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
            ))}
          </div>
        ) : theses && theses.length > 0 ? (
          <div className="divide-y divide-cream-100 dark:divide-night-700">
            {theses.map((thesis) => (
              <div key={thesis.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-mono font-semibold text-cream-900 dark:text-cream-100">
                      {thesis.symbol}
                    </span>
                    <span
                      className={`px-2 py-0.5 text-xs font-medium rounded ${
                        thesis.direction === "BULLISH"
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                          : thesis.direction === "BEARISH"
                            ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                            : "bg-cream-100 text-cream-800 dark:bg-night-700 dark:text-cream-400"
                      }`}
                    >
                      {thesis.direction}
                    </span>
                    <span
                      className={`px-2 py-0.5 text-xs font-medium rounded ${
                        thesis.status === "ACTIVE"
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                          : thesis.status === "REALIZED"
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                            : thesis.status === "INVALIDATED"
                              ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                              : "bg-cream-100 text-cream-800 dark:bg-night-700 dark:text-cream-400"
                      }`}
                    >
                      {thesis.status}
                    </span>
                  </div>
                  <div className="text-right">
                    {thesis.pnlPct !== null && (
                      <span
                        className={`text-lg font-semibold ${
                          thesis.pnlPct >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {formatPct(thesis.pnlPct)}
                      </span>
                    )}
                  </div>
                </div>

                <p className="mt-2 text-sm text-cream-700 dark:text-cream-300">{thesis.thesis}</p>

                <div className="mt-3 grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-cream-500 dark:text-cream-400">Time Horizon</span>
                    <div className="font-medium text-cream-900 dark:text-cream-100">
                      {thesis.timeHorizon}
                    </div>
                  </div>
                  <div>
                    <span className="text-cream-500 dark:text-cream-400">Confidence</span>
                    <div className="font-medium text-cream-900 dark:text-cream-100">
                      {(thesis.confidence * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div>
                    <span className="text-cream-500 dark:text-cream-400">Target</span>
                    <div className="font-medium text-green-600">
                      {thesis.targetPrice ? `$${thesis.targetPrice.toFixed(2)}` : "--"}
                    </div>
                  </div>
                  <div>
                    <span className="text-cream-500 dark:text-cream-400">Stop</span>
                    <div className="font-medium text-red-600">
                      {thesis.stopPrice ? `$${thesis.stopPrice.toFixed(2)}` : "--"}
                    </div>
                  </div>
                </div>

                {thesis.catalysts && thesis.catalysts.length > 0 && (
                  <div className="mt-3">
                    <span className="text-xs text-cream-500 dark:text-cream-400">Catalysts:</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {thesis.catalysts.map((catalyst, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 text-xs bg-cream-100 dark:bg-night-700 text-cream-700 dark:text-cream-300 rounded"
                        >
                          {catalyst}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between text-xs text-cream-400">
                  <span>Source: {thesis.agentSource}</span>
                  <span>
                    Updated {formatDistanceToNow(new Date(thesis.updatedAt), { addSuffix: true })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-cream-400">No theses found</div>
        )}
      </div>

      {/* Thesis Structure Guide */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
        <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-4">
          Thesis Structure
        </h2>
        <div className="text-sm text-cream-600 dark:text-cream-400 space-y-2">
          <p>
            <strong>Core Thesis:</strong> What is the investment thesis?
          </p>
          <p>
            <strong>Catalysts:</strong> What events will drive the price movement?
          </p>
          <p>
            <strong>Time Horizon:</strong> When do we expect the thesis to play out?
          </p>
          <p>
            <strong>Invalidation:</strong> What conditions would invalidate the thesis?
          </p>
          <p>
            <strong>Conviction:</strong> How confident are we in the thesis?
          </p>
        </div>
      </div>
    </div>
  );
}
