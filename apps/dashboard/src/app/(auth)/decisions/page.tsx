"use client";

/**
 * Decisions Page - Timeline of trading decisions
 */

import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { useDecisions } from "@/hooks/queries";
import type { DecisionAction, DecisionStatus } from "@/lib/api/types";

export default function DecisionsPage() {
  const [actionFilter, setActionFilter] = useState<DecisionAction | "all">("all");
  const [statusFilter, setStatusFilter] = useState<DecisionStatus | "all">("all");

  const { data: decisions, isLoading } = useDecisions({
    action: actionFilter === "all" ? undefined : actionFilter,
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: 50,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-cream-900 dark:text-cream-100">Decisions</h1>
        <div className="flex items-center gap-2">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value as DecisionAction | "all")}
            className="text-sm border border-cream-200 dark:border-night-700 rounded-md px-3 py-1.5 bg-white dark:bg-night-800 text-cream-900 dark:text-cream-100"
          >
            <option value="all">All Actions</option>
            <option value="BUY">BUY</option>
            <option value="SELL">SELL</option>
            <option value="HOLD">HOLD</option>
            <option value="CLOSE">CLOSE</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as DecisionStatus | "all")}
            className="text-sm border border-cream-200 dark:border-night-700 rounded-md px-3 py-1.5 bg-white dark:bg-night-800 text-cream-900 dark:text-cream-100"
          >
            <option value="all">All Status</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="EXECUTED">Executed</option>
            <option value="REJECTED">Rejected</option>
            <option value="FAILED">Failed</option>
          </select>
        </div>
      </div>

      {/* Decision Timeline */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
        <div className="p-4 border-b border-cream-200 dark:border-night-700">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100">
              Decision Timeline
            </h2>
            {decisions && (
              <span className="text-sm text-cream-500 dark:text-cream-400">
                {decisions.total} total decisions
              </span>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="p-4 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-24 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
            ))}
          </div>
        ) : decisions?.items && decisions.items.length > 0 ? (
          <div className="divide-y divide-cream-100 dark:divide-night-700">
            {decisions.items.map((decision) => (
              <DecisionCard key={decision.id} decision={decision} />
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-cream-400">No decisions to display</div>
        )}
      </div>
    </div>
  );
}

function DecisionCard({
  decision,
}: {
  decision: {
    id: string;
    cycleId: string;
    symbol: string;
    action: DecisionAction;
    direction: string;
    size: number;
    sizeUnit: string;
    entry: number | null;
    stop: number | null;
    target: number | null;
    status: DecisionStatus;
    consensusCount: number;
    pnl: number | null;
    createdAt: string;
  };
}) {
  const actionColors = {
    BUY: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    SELL: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    HOLD: "bg-cream-100 text-cream-800 dark:bg-night-700 dark:text-cream-400",
    CLOSE: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  };

  const statusColors = {
    PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    APPROVED: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    EXECUTED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    REJECTED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    FAILED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };

  const formatPrice = (price: number | null) =>
    price
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(price)
      : "--";

  return (
    <div className="p-4 hover:bg-cream-50 dark:hover:bg-night-750 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span
            className={`px-2.5 py-1 text-sm font-medium rounded ${actionColors[decision.action]}`}
          >
            {decision.action}
          </span>
          <div>
            <span className="text-lg font-semibold text-cream-900 dark:text-cream-100">
              {decision.symbol}
            </span>
            <span className="ml-2 text-sm text-cream-500 dark:text-cream-400">
              {decision.direction}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-0.5 text-xs font-medium rounded ${statusColors[decision.status]}`}
          >
            {decision.status}
          </span>
          <span className="text-sm text-cream-500 dark:text-cream-400">
            {formatDistanceToNow(new Date(decision.createdAt), { addSuffix: true })}
          </span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-5 gap-4 text-sm">
        <div>
          <span className="text-cream-500 dark:text-cream-400">Size</span>
          <div className="font-medium text-cream-900 dark:text-cream-100">
            {decision.size} {decision.sizeUnit.toLowerCase()}
          </div>
        </div>
        <div>
          <span className="text-cream-500 dark:text-cream-400">Entry</span>
          <div className="font-medium text-cream-900 dark:text-cream-100">
            {formatPrice(decision.entry)}
          </div>
        </div>
        <div>
          <span className="text-cream-500 dark:text-cream-400">Stop</span>
          <div className="font-medium text-red-600">{formatPrice(decision.stop)}</div>
        </div>
        <div>
          <span className="text-cream-500 dark:text-cream-400">Target</span>
          <div className="font-medium text-green-600">{formatPrice(decision.target)}</div>
        </div>
        <div>
          <span className="text-cream-500 dark:text-cream-400">Consensus</span>
          <div className="font-medium text-cream-900 dark:text-cream-100">
            {decision.consensusCount}/8 agents
          </div>
        </div>
      </div>

      {decision.pnl !== null && (
        <div className="mt-2 text-sm">
          <span className="text-cream-500 dark:text-cream-400">P&L: </span>
          <span className={`font-medium ${decision.pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
            {decision.pnl >= 0 ? "+" : ""}
            {formatPrice(decision.pnl)}
          </span>
        </div>
      )}
    </div>
  );
}
