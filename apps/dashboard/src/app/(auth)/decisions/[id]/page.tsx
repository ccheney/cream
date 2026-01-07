// biome-ignore-all lint/suspicious/noArrayIndexKey: Factor lists and timeline use stable indices
"use client";

/**
 * Decision Detail Page
 *
 * Shows complete decision information including:
 * - Decision header with symbol, action, status
 * - Agent votes grid with confidence scores
 * - Citations list with expandable sources
 * - Execution timeline
 * - Related thesis link
 */

import { format, formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useDecisionDetail } from "@/hooks/queries";
import type { AgentOutput, Citation, ExecutionDetail } from "@/lib/api/types";

export default function DecisionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data: decision, isLoading, error } = useDecisionDetail(id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-32 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
        <div className="h-48 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
        <div className="h-64 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
      </div>
    );
  }

  if (error || !decision) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 p-6 rounded-lg border border-red-200 dark:border-red-800">
        <h2 className="text-lg font-semibold text-red-800 dark:text-red-200">Decision not found</h2>
        <p className="mt-2 text-sm text-red-600 dark:text-red-300">
          The decision you&apos;re looking for doesn&apos;t exist or has been removed.
        </p>
        <button
          type="button"
          onClick={() => router.push("/decisions")}
          className="mt-4 px-4 py-2 text-sm font-medium text-red-700 dark:text-red-200 bg-red-100 dark:bg-red-900/30 rounded-md hover:bg-red-200 dark:hover:bg-red-900/50"
        >
          Back to Decisions
        </button>
      </div>
    );
  }

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="p-2 text-cream-500 hover:text-cream-700 dark:text-cream-400 dark:hover:text-cream-200"
            aria-label="Go back"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
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
        <span
          className={`px-3 py-1.5 text-sm font-medium rounded ${statusColors[decision.status]}`}
        >
          {decision.status}
        </span>
      </div>

      {/* Decision Details Card */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
        <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-4">
          Decision Details
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div>
            <span className="text-sm text-cream-500 dark:text-cream-400">Size</span>
            <div className="text-lg font-medium text-cream-900 dark:text-cream-100">
              {decision.size} {decision.sizeUnit.toLowerCase()}
            </div>
          </div>
          <div>
            <span className="text-sm text-cream-500 dark:text-cream-400">Entry Price</span>
            <div className="text-lg font-medium text-cream-900 dark:text-cream-100">
              {formatPrice(decision.entry)}
            </div>
          </div>
          <div>
            <span className="text-sm text-cream-500 dark:text-cream-400">Stop Loss</span>
            <div className="text-lg font-medium text-red-600">{formatPrice(decision.stop)}</div>
          </div>
          <div>
            <span className="text-sm text-cream-500 dark:text-cream-400">Target</span>
            <div className="text-lg font-medium text-green-600">{formatPrice(decision.target)}</div>
          </div>
          <div>
            <span className="text-sm text-cream-500 dark:text-cream-400">Strategy</span>
            <div className="text-lg font-medium text-cream-900 dark:text-cream-100">
              {decision.strategyFamily}
            </div>
          </div>
          <div>
            <span className="text-sm text-cream-500 dark:text-cream-400">Time Horizon</span>
            <div className="text-lg font-medium text-cream-900 dark:text-cream-100">
              {decision.timeHorizon}
            </div>
          </div>
          <div>
            <span className="text-sm text-cream-500 dark:text-cream-400">Consensus</span>
            <div className="text-lg font-medium text-cream-900 dark:text-cream-100">
              {decision.consensusCount}/8 agents
            </div>
          </div>
          <div>
            <span className="text-sm text-cream-500 dark:text-cream-400">Created</span>
            <div className="text-lg font-medium text-cream-900 dark:text-cream-100">
              {formatDistanceToNow(new Date(decision.createdAt), { addSuffix: true })}
            </div>
          </div>
        </div>

        {/* Rationale */}
        {decision.rationale && (
          <div className="mt-6 pt-6 border-t border-cream-100 dark:border-night-700">
            <h3 className="text-sm font-medium text-cream-900 dark:text-cream-100 mb-3">
              Rationale
            </h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs font-medium text-green-600 mb-2">Bullish Factors</h4>
                <ul className="space-y-1">
                  {decision.rationale.bullishFactors.map((factor, i) => (
                    <li
                      key={`bull-${i}`}
                      className="text-sm text-cream-700 dark:text-cream-300 flex items-start gap-2"
                    >
                      <span className="text-green-500 mt-0.5">+</span>
                      {factor}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-xs font-medium text-red-600 mb-2">Bearish Factors</h4>
                <ul className="space-y-1">
                  {decision.rationale.bearishFactors.map((factor, i) => (
                    <li
                      key={`bear-${i}`}
                      className="text-sm text-cream-700 dark:text-cream-300 flex items-start gap-2"
                    >
                      <span className="text-red-500 mt-0.5">-</span>
                      {factor}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Related Thesis */}
        {decision.thesis && (
          <div className="mt-6 pt-6 border-t border-cream-100 dark:border-night-700">
            <h3 className="text-sm font-medium text-cream-900 dark:text-cream-100 mb-2">
              Related Thesis
            </h3>
            <Link
              href={`/theses/${decision.thesis.id}`}
              className="inline-flex items-center gap-2 px-3 py-2 bg-cream-50 dark:bg-night-700 rounded-md text-sm text-cream-700 dark:text-cream-300 hover:bg-cream-100 dark:hover:bg-night-600"
            >
              <span className="font-medium">{decision.thesis.symbol}</span>
              <span>&ndash;</span>
              <span>{decision.thesis.title}</span>
            </Link>
          </div>
        )}
      </div>

      {/* Agent Votes Grid */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
        <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-4">Agent Votes</h2>
        {decision.agentOutputs.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {decision.agentOutputs.map((output) => (
              <AgentVoteCard key={output.agentType} output={output} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-cream-500 dark:text-cream-400">No agent votes recorded</p>
        )}
      </div>

      {/* Citations */}
      {decision.citations.length > 0 && (
        <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
          <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-4">
            Citations ({decision.citations.length})
          </h2>
          <div className="space-y-3">
            {decision.citations.map((citation) => (
              <CitationCard key={citation.id} citation={citation} />
            ))}
          </div>
        </div>
      )}

      {/* Execution Timeline */}
      {decision.execution && (
        <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
          <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100 mb-4">
            Execution Timeline
          </h2>
          <ExecutionTimeline execution={decision.execution} />
        </div>
      )}
    </div>
  );
}

function AgentVoteCard({ output }: { output: AgentOutput }) {
  const voteColors = {
    APPROVE: "text-green-600 bg-green-50 dark:bg-green-900/20",
    REJECT: "text-red-600 bg-red-50 dark:bg-red-900/20",
  };

  const formatAgentName = (type: string) => {
    return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <div className="p-4 bg-cream-50 dark:bg-night-700 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-cream-900 dark:text-cream-100">
          {formatAgentName(output.agentType)}
        </span>
        <span className={`px-2 py-0.5 text-xs font-medium rounded ${voteColors[output.vote]}`}>
          {output.vote}
        </span>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 h-1.5 bg-cream-200 dark:bg-night-600 rounded-full overflow-hidden">
          <div
            className="h-full bg-cream-600 dark:bg-cream-400 rounded-full"
            style={{ width: `${output.confidence * 100}%` }}
          />
        </div>
        <span className="text-xs text-cream-500 dark:text-cream-400">
          {Math.round(output.confidence * 100)}%
        </span>
      </div>
      <p className="text-xs text-cream-600 dark:text-cream-400 line-clamp-3">{output.reasoning}</p>
      <div className="mt-2 text-xs text-cream-400 dark:text-cream-500">
        {output.processingTimeMs}ms
      </div>
    </div>
  );
}

function CitationCard({ citation }: { citation: Citation }) {
  return (
    <div className="p-3 bg-cream-50 dark:bg-night-700 rounded-lg">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <a
            href={citation.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-cream-900 dark:text-cream-100 hover:text-cream-600 dark:hover:text-cream-300"
          >
            {citation.title}
          </a>
          <div className="text-xs text-cream-500 dark:text-cream-400 mt-0.5">
            {citation.source} &bull; {format(new Date(citation.fetchedAt), "MMM d, yyyy")}
          </div>
        </div>
        <div className="text-xs text-cream-400 dark:text-cream-500">
          {Math.round(citation.relevanceScore * 100)}% relevant
        </div>
      </div>
      {citation.snippet && (
        <p className="mt-2 text-xs text-cream-600 dark:text-cream-400 line-clamp-2">
          &ldquo;{citation.snippet}&rdquo;
        </p>
      )}
    </div>
  );
}

function ExecutionTimeline({ execution }: { execution: ExecutionDetail }) {
  const orderStatusColors: Record<string, string> = {
    NEW: "bg-cream-100 text-cream-800 dark:bg-night-700 dark:text-cream-300",
    ACCEPTED: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    PARTIALLY_FILLED: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    FILLED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    CANCELED: "bg-cream-100 text-cream-800 dark:bg-night-700 dark:text-cream-300",
    REJECTED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(price);

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
      {/* Timeline */}
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

      {/* Execution Details */}
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
    </div>
  );
}
