// biome-ignore-all lint/suspicious/noArrayIndexKey: Skeleton loaders use stable indices
"use client";

/**
 * Agents Page - Interactive OODA workflow visualization with real-time streaming
 *
 * Displays 8-agent consensus network as vertical flow diagram with
 * animated connections showing data flow between phases.
 *
 * @see docs/plans/43-agent-network-visualization.md
 */

import { formatDistanceToNow } from "date-fns";
import { useCallback, useState } from "react";
import {
  AGENT_METADATA,
  AgentNetwork,
  type NetworkAgentType,
} from "@/components/agents/AgentNetwork";
import { AgentStreamingDetail } from "@/components/agents/AgentStreamingDetail";
import { useAgentOutputs } from "@/hooks/queries";
import { useAgentStatus } from "@/hooks/useAgentStatus";
import { type AgentType, useAgentStreaming } from "@/hooks/useAgentStreaming";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";

// ============================================
// Type Mapping
// ============================================

/** Map NetworkAgentType to AgentType for store compatibility */
function toStoreAgentType(networkType: NetworkAgentType): AgentType {
  return networkType as AgentType;
}

/** Map NetworkAgentType to display name */
function getAgentDisplayName(agentType: NetworkAgentType | null): string {
  if (!agentType) {
    return "";
  }
  return AGENT_METADATA[agentType]?.displayName ?? agentType;
}

// ============================================
// Main Component
// ============================================

export default function AgentsPage() {
  const [selectedAgent, setSelectedAgent] = useState<NetworkAgentType | null>(null);
  const { data: outputs, isLoading: outputsLoading } = useAgentOutputs(selectedAgent ?? "", 20);

  // Responsive breakpoint detection
  const { isMobile, isTablet } = useMediaQuery();
  const isCompact = isMobile || isTablet;

  // Real-time status via WebSocket (replaces HTTP polling)
  const { isSubscribed: statusSubscribed, hasData: hasStatusData } = useAgentStatus();

  // Real-time streaming state (tool calls, reasoning)
  const { agents: streamingAgents, currentCycleId, isSubscribed } = useAgentStreaming();

  // Convert store Map to NetworkAgentType Map
  const networkAgents = streamingAgents as Map<
    NetworkAgentType,
    typeof streamingAgents extends Map<unknown, infer V> ? V : never
  >;

  const selectedState = selectedAgent
    ? streamingAgents.get(toStoreAgentType(selectedAgent))
    : undefined;

  // Handle agent selection from network
  const handleAgentSelect = useCallback((agentType: NetworkAgentType | null) => {
    setSelectedAgent(agentType);
  }, []);

  return (
    <div className="space-y-6">
      {/* Main Layout: Network + Detail Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agent Network Visualization */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-night-800 rounded-xl border border-cream-200 dark:border-night-700 p-4">
            <AgentNetwork
              agents={networkAgents}
              cycleId={currentCycleId}
              selectedAgent={selectedAgent}
              onAgentSelect={handleAgentSelect}
              isLive={isSubscribed || statusSubscribed}
              compact={isCompact}
            />
          </div>

          {/* Fallback: Show loading skeleton while waiting for WebSocket data */}
          {!hasStatusData && streamingAgents.size === 0 && (
            <div className="mt-4 p-4 bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full bg-amber-400 animate-pulse" />
                <p className="text-sm text-stone-500 dark:text-stone-400">
                  Waiting for streaming data...
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <div className="lg:col-span-1">
          {selectedAgent && selectedState ? (
            <AgentStreamingDetail
              agentType={toStoreAgentType(selectedAgent)}
              state={selectedState}
              cycleId={currentCycleId}
            />
          ) : selectedAgent ? (
            <div className="bg-white dark:bg-night-800 rounded-lg border border-stone-200 dark:border-night-700 p-6">
              <h3 className="text-lg font-medium text-stone-900 dark:text-stone-100 mb-2">
                {getAgentDisplayName(selectedAgent)}
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
                Click an agent in the network to view streaming details
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
              Showing outputs for {getAgentDisplayName(selectedAgent)}
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
