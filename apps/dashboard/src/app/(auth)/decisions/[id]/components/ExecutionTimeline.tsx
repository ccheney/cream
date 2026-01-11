// biome-ignore-all lint/suspicious/noArrayIndexKey: Timeline uses stable indices
"use client";

import { format } from "date-fns";
import type { ExecutionDetail } from "@/lib/api/types";
import { formatPrice } from "./utils";

export interface ExecutionTimelineProps {
  execution: ExecutionDetail;
}

const orderStatusColors: Record<string, string> = {
  NEW: "bg-cream-100 text-cream-800 dark:bg-night-700 dark:text-cream-300",
  ACCEPTED: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  PARTIALLY_FILLED: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  FILLED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  CANCELED: "bg-cream-100 text-cream-800 dark:bg-night-700 dark:text-cream-300",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export function ExecutionTimeline({ execution }: ExecutionTimelineProps): React.ReactElement {
  const timelineEvents = [
    { label: "Submitted", time: execution.timestamps.submitted, status: "complete" },
    {
      label: "Accepted",
      time: execution.timestamps.accepted,
      status: execution.timestamps.accepted ? "complete" : "pending",
    },
    {
      label: "Filled",
      time: execution.timestamps.filled,
      status: execution.timestamps.filled ? "complete" : "pending",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="relative">
        <div className="absolute left-3.5 top-0 bottom-0 w-0.5 bg-cream-200 dark:bg-night-600" />
        <div className="space-y-4">
          {timelineEvents.map((event, i) => (
            <div key={`timeline-${i}`} className="relative flex items-start gap-4 pl-10">
              <div
                className={`absolute left-0 w-7 h-7 rounded-full flex items-center justify-center ${
                  event.status === "complete"
                    ? "bg-green-100 dark:bg-green-900/30"
                    : "bg-cream-100 dark:bg-night-700"
                }`}
              >
                {event.status === "complete" ? (
                  <svg
                    className="w-4 h-4 text-green-600"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  <div className="w-2 h-2 bg-cream-400 dark:bg-cream-500 rounded-full" />
                )}
              </div>
              <div>
                <span className="text-sm font-medium text-cream-900 dark:text-cream-100">
                  {event.label}
                </span>
                {event.time && (
                  <div className="text-xs text-cream-500 dark:text-cream-400">
                    {format(new Date(event.time), "MMM d, yyyy HH:mm:ss")}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <ExecutionDetailsGrid execution={execution} />
    </div>
  );
}

function ExecutionDetailsGrid({ execution }: ExecutionTimelineProps): React.ReactElement {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-cream-100 dark:border-night-700">
      <div>
        <span className="text-xs text-cream-500 dark:text-cream-400">Order Status</span>
        <div
          className={`inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded ${orderStatusColors[execution.status]}`}
        >
          {execution.status}
        </div>
      </div>
      <div>
        <span className="text-xs text-cream-500 dark:text-cream-400">Filled Qty</span>
        <div className="text-sm font-medium text-cream-900 dark:text-cream-100">
          {execution.filledQty}
        </div>
      </div>
      <div>
        <span className="text-xs text-cream-500 dark:text-cream-400">Avg Fill Price</span>
        <div className="text-sm font-medium text-cream-900 dark:text-cream-100">
          {formatPrice(execution.avgFillPrice)}
        </div>
      </div>
      <div>
        <span className="text-xs text-cream-500 dark:text-cream-400">Slippage</span>
        <div
          className={`text-sm font-medium ${
            execution.slippage > 0 ? "text-red-600" : "text-green-600"
          }`}
        >
          {execution.slippage > 0 ? "+" : ""}
          {formatPrice(execution.slippage)}
        </div>
      </div>
      <div>
        <span className="text-xs text-cream-500 dark:text-cream-400">Commissions</span>
        <div className="text-sm font-medium text-cream-900 dark:text-cream-100">
          {formatPrice(execution.commissions)}
        </div>
      </div>
      <div>
        <span className="text-xs text-cream-500 dark:text-cream-400">Broker</span>
        <div className="text-sm font-medium text-cream-900 dark:text-cream-100">
          {execution.broker}
        </div>
      </div>
      <div className="col-span-2">
        <span className="text-xs text-cream-500 dark:text-cream-400">Broker Order ID</span>
        <div className="text-sm font-mono text-cream-900 dark:text-cream-100 truncate">
          {execution.brokerOrderId}
        </div>
      </div>
    </div>
  );
}
