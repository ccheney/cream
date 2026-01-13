// biome-ignore-all lint/suspicious/noArrayIndexKey: Skeleton loaders and stream items use stable indices
"use client";

/**
 * Agents Page - Monitor 7-agent consensus network with real-time streaming
 *
 * Displays agent status cards with live tool calls and reasoning streams.
 *
 * @see docs/plans/ui/20-design-philosophy.md
 */

import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { AgentStreamingCard } from "@/components/agents/AgentStreamingCard";
import { AgentStreamingDetail } from "@/components/agents/AgentStreamingDetail";
import { useAgentOutputs } from "@/hooks/queries";
import { useAgentStatus } from "@/hooks/useAgentStatus";
import { type AgentType, useAgentStreaming } from "@/hooks/useAgentStreaming";

// ============================================
// Constants
// ============================================

const AGENT_TYPES: AgentType[] = [
  "news",
  "fundamentals",
  "bullish",
  "bearish",
  "trader",
  "risk",
  "critic",
];

const AGENT_NAMES: Record<string, string> = {
  news: "News & Sentiment",
  fundamentals: "Fundamentals & Macro",
  bullish: "Bullish Research",
  bearish: "Bearish Research",
  trader: "Trader",
  risk: "Risk Manager",
  critic: "Critic",
};

// ============================================
// Main Component
// ============================================

export default function AgentsPage() {
  const [selectedAgent, setSelectedAgent] = useState<AgentType | null>(null);
  const { data: outputs, isLoading: outputsLoading } = useAgentOutputs(selectedAgent ?? "", 20);

  // Real-time status via WebSocket (replaces HTTP polling)
  const { isSubscribed: statusSubscribed, hasData: hasStatusData } = useAgentStatus();

  // Real-time streaming state (tool calls, reasoning)
  const { agents: streamingAgents, currentCycleId, isSubscribed } = useAgentStreaming();

  const selectedState = selectedAgent ? streamingAgents.get(selectedAgent) : undefined;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-stone-900 dark:text-night-50">Agent Network</h1>
        <div className="flex items-center gap-4">
          {currentCycleId && (
            <span className="text-xs font-mono text-stone-400 dark:text-stone-500">
              Cycle: {currentCycleId.slice(0, 16)}...
            </span>
          )}
          {(isSubscribed || statusSubscribed) && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Live
            </span>
          )}
        </div>
      </div>

      {/* Main Layout: Cards + Detail Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agent Cards Grid */}
        <div className="lg:col-span-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {AGENT_TYPES.map((agentType) => (
              <AgentStreamingCard
                key={agentType}
                agentType={agentType}
                state={streamingAgents.get(agentType)}
                isSelected={selectedAgent === agentType}
                onClick={() => setSelectedAgent(agentType)}
              />
            ))}
          </div>

          {/* Fallback: Show loading skeleton while waiting for WebSocket data */}
          {!hasStatusData && streamingAgents.size === 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              {[...Array(7)].map((_, i) => (
                <div
                  key={`skeleton-${i}`}
                  className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4"
                >
                  <div className="h-4 w-24 bg-cream-100 dark:bg-night-700 rounded animate-pulse mb-2" />
                  <div className="h-4 w-16 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <div className="lg:col-span-1">
          {selectedAgent && selectedState ? (
            <AgentStreamingDetail
              agentType={selectedAgent}
              state={selectedState}
              cycleId={currentCycleId}
            />
          ) : selectedAgent ? (
            <div className="bg-white dark:bg-night-800 rounded-lg border border-stone-200 dark:border-night-700 p-6">
              <h3 className="text-lg font-medium text-stone-900 dark:text-stone-100 mb-2">
                {AGENT_NAMES[selectedAgent]}
              </h3>
              <p className="text-sm text-stone-500 dark:text-stone-400">
                Waiting for streaming data...
              </p>
              <p className="text-xs text-stone-400 dark:text-stone-500 mt-2">
                Trigger a trading cycle to see real-time tool calls and reasoning.
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-night-800 rounded-lg border border-stone-200 dark:border-night-700 p-6">
              <p className="text-sm text-stone-500 dark:text-stone-400">
                Select an agent to view streaming details
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Historical Outputs Section */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
        <div className="p-4 border-b border-cream-200 dark:border-night-700 flex items-center justify-between">
          <h2 className="text-lg font-medium text-stone-900 dark:text-night-50">
            Historical Outputs
          </h2>
          {selectedAgent && (
            <span className="text-sm text-stone-500 dark:text-night-300">
              Showing outputs for {AGENT_NAMES[selectedAgent] ?? selectedAgent}
            </span>
          )}
        </div>
        <div className="p-4 max-h-96 overflow-auto">
          {!selectedAgent ? (
            <p className="text-stone-500 dark:text-night-300">
              Select an agent to view their historical outputs
            </p>
          ) : outputsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-20 bg-cream-100 dark:bg-night-700 rounded animate-pulse"
                />
              ))}
            </div>
          ) : outputs && outputs.length > 0 ? (
            <div className="space-y-4">
              {outputs.map((output, i) => (
                <div key={`output-${i}`} className="p-3 bg-cream-50 dark:bg-night-750 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`px-2 py-0.5 text-xs font-medium rounded ${
                        output.vote === "APPROVE"
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                      }`}
                    >
                      {output.vote}
                    </span>
                    <span className="text-xs text-stone-500 dark:text-night-300">
                      {formatDistanceToNow(new Date(output.createdAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                  <p className="text-sm text-stone-700 dark:text-night-100 whitespace-pre-wrap">
                    {output.reasoning}
                  </p>
                  <div className="mt-2 flex items-center gap-4 text-xs text-stone-500 dark:text-night-300">
                    <span>Confidence: {(output.confidence * 100).toFixed(0)}%</span>
                    <span>Processing: {output.processingTimeMs}ms</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-stone-500 dark:text-night-300">No outputs for this agent yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
