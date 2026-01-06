"use client";

/**
 * Agents Page - Monitor 8-agent consensus network
 */

import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { useAgentOutputs, useAgentStatuses } from "@/hooks/queries";

const AGENT_COLORS: Record<string, string> = {
  technical_analyst: "#3B82F6",
  news_sentiment: "#10B981",
  fundamentals_macro: "#F59E0B",
  bullish_research: "#22C55E",
  bearish_research: "#EF4444",
  trader: "#8B5CF6",
  risk_manager: "#EC4899",
  critic: "#6366F1",
};

const AGENT_NAMES: Record<string, string> = {
  technical_analyst: "Technical Analyst",
  news_sentiment: "News & Sentiment",
  fundamentals_macro: "Fundamentals & Macro",
  bullish_research: "Bullish Research",
  bearish_research: "Bearish Research",
  trader: "Trader",
  risk_manager: "Risk Manager",
  critic: "Critic",
};

export default function AgentsPage() {
  const { data: statuses, isLoading: statusesLoading } = useAgentStatuses();
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const { data: outputs, isLoading: outputsLoading } = useAgentOutputs(selectedAgent ?? "", 20);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-cream-900 dark:text-cream-100">Agent Network</h1>
        <div className="text-sm text-cream-500 dark:text-cream-400">
          Consensus: APPROVE / REJECT requires Risk + Critic agreement
        </div>
      </div>

      {/* Agent Grid */}
      <div className="grid grid-cols-4 gap-4">
        {statusesLoading
          ? [...Array(8)].map((_, i) => (
              <div
                key={i}
                className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4"
              >
                <div className="h-4 w-24 bg-cream-100 dark:bg-night-700 rounded animate-pulse mb-2" />
                <div className="h-4 w-16 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
              </div>
            ))
          : statuses?.map((agent) => (
              <AgentCard
                key={agent.type}
                agent={agent}
                isSelected={selectedAgent === agent.type}
                onClick={() => setSelectedAgent(agent.type)}
              />
            ))}
      </div>

      {/* Agent Output Stream */}
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
        <div className="p-4 border-b border-cream-200 dark:border-night-700 flex items-center justify-between">
          <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100">
            Agent Output Stream
          </h2>
          {selectedAgent && (
            <span className="text-sm text-cream-500 dark:text-cream-400">
              Showing outputs for {AGENT_NAMES[selectedAgent] ?? selectedAgent}
            </span>
          )}
        </div>
        <div className="p-4 h-96 overflow-auto">
          {!selectedAgent ? (
            <p className="text-cream-500 dark:text-cream-400">
              Select an agent to view their outputs
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
                <div key={i} className="p-3 bg-cream-50 dark:bg-night-750 rounded-lg">
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
                    <span className="text-xs text-cream-500 dark:text-cream-400">
                      {formatDistanceToNow(new Date(output.createdAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                  <p className="text-sm text-cream-700 dark:text-cream-300 whitespace-pre-wrap">
                    {output.reasoning}
                  </p>
                  <div className="mt-2 flex items-center gap-4 text-xs text-cream-500 dark:text-cream-400">
                    <span>Confidence: {(output.confidence * 100).toFixed(0)}%</span>
                    <span>Processing: {output.processingTimeMs}ms</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-cream-500 dark:text-cream-400">No outputs for this agent yet</p>
          )}
        </div>
      </div>
    </div>
  );
}

function AgentCard({
  agent,
  isSelected,
  onClick,
}: {
  agent: {
    type: string;
    displayName: string;
    status: string;
    lastOutputAt: string | null;
    outputsToday: number;
    avgConfidence: number;
    approvalRate: number;
  };
  isSelected: boolean;
  onClick: () => void;
}) {
  const statusColors = {
    idle: "text-cream-500",
    processing: "text-blue-500 animate-pulse",
    error: "text-red-500",
  };

  return (
    <button
      onClick={onClick}
      className={`bg-white dark:bg-night-800 rounded-lg border p-4 text-left transition-all ${
        isSelected
          ? "border-blue-500 ring-2 ring-blue-500/20"
          : "border-cream-200 dark:border-night-700 hover:border-cream-300 dark:hover:border-night-600"
      }`}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: AGENT_COLORS[agent.type] ?? "#6B7280" }}
        />
        <span className="text-sm font-medium text-cream-900 dark:text-cream-100">
          {agent.displayName}
        </span>
      </div>
      <div
        className={`mt-2 text-sm capitalize ${
          statusColors[agent.status as keyof typeof statusColors] ?? statusColors.idle
        }`}
      >
        {agent.status}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-cream-500 dark:text-cream-400">
        <div>
          <span className="block">Today</span>
          <span className="font-medium text-cream-700 dark:text-cream-300">
            {agent.outputsToday} outputs
          </span>
        </div>
        <div>
          <span className="block">Approval</span>
          <span className="font-medium text-cream-700 dark:text-cream-300">
            {(agent.approvalRate * 100).toFixed(0)}%
          </span>
        </div>
      </div>
      {agent.lastOutputAt && (
        <div className="mt-2 text-xs text-cream-400">
          Last: {formatDistanceToNow(new Date(agent.lastOutputAt), { addSuffix: true })}
        </div>
      )}
    </button>
  );
}
