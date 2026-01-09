"use client";

/**
 * AgentVotes - Real-time agent voting display
 *
 * Displays agent votes from the active OODA cycle using the cycle-store.
 * Follows the design philosophy: Layered Revelation (glanceable → detailed).
 *
 * @see docs/plans/ui/20-design-philosophy.md
 */

import { useState } from "react";
import { type AgentOutput, useActiveCycle, useAgentOutputs } from "@/stores/cycle-store";

// ============================================
// Types
// ============================================

interface AgentDisplayInfo {
  type: string;
  displayName: string;
  shortName: string;
}

const AGENT_DISPLAY_MAP: Record<string, AgentDisplayInfo> = {
  technical: { type: "technical", displayName: "Technical Analyst", shortName: "Tech" },
  news: { type: "news", displayName: "News & Sentiment", shortName: "News" },
  fundamentals: { type: "fundamentals", displayName: "Fundamentals", shortName: "Fund" },
  bullish: { type: "bullish", displayName: "Bullish Research", shortName: "Bull" },
  bearish: { type: "bearish", displayName: "Bearish Research", shortName: "Bear" },
  trader: { type: "trader", displayName: "Trader", shortName: "Trade" },
  risk: { type: "risk", displayName: "Risk Manager", shortName: "Risk" },
  critic: { type: "critic", displayName: "Critic", shortName: "Critic" },
};

function getAgentDisplayName(agentType: string): string {
  return AGENT_DISPLAY_MAP[agentType]?.displayName ?? agentType;
}

// ============================================
// Subcomponents
// ============================================

function VoteBadge({ vote }: { vote: AgentOutput["vote"] }) {
  const colors = {
    APPROVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    REJECT: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    ABSTAIN: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400",
  };

  const labels = {
    APPROVE: "Bullish",
    REJECT: "Bearish",
    ABSTAIN: "Neutral",
  };

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[vote]}`}>
      {labels[vote]}
    </span>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const percentage = Math.round(value * 100);
  const color =
    percentage >= 80
      ? "bg-emerald-500"
      : percentage >= 60
        ? "bg-amber-500"
        : percentage >= 40
          ? "bg-stone-400"
          : "bg-red-400";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-stone-200 dark:bg-night-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs font-mono text-stone-500 dark:text-stone-400 w-8 text-right">
        {percentage}%
      </span>
    </div>
  );
}

interface AgentCardProps {
  agentType: string;
  output: AgentOutput;
  expanded: boolean;
  onToggle: () => void;
}

function AgentCard({ agentType, output, expanded, onToggle }: AgentCardProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="text-left w-full bg-white dark:bg-night-800 rounded-lg border border-stone-200 dark:border-night-700 p-4 hover:border-stone-300 dark:hover:border-night-600 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500/50"
    >
      {/* Glanceable summary */}
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-stone-900 dark:text-stone-100">
          {getAgentDisplayName(agentType)}
        </span>
        <VoteBadge vote={output.vote} />
      </div>
      <ConfidenceBar value={output.confidence} />

      {/* Expanded reasoning - Layered Revelation */}
      {expanded && output.reasoningSummary && (
        <div className="mt-3 pt-3 border-t border-stone-100 dark:border-night-700">
          <p className="text-sm text-stone-600 dark:text-stone-400">{output.reasoningSummary}</p>
          {output.latencyMs && (
            <p className="text-xs text-stone-400 dark:text-stone-500 mt-2 font-mono">
              {output.latencyMs}ms
            </p>
          )}
        </div>
      )}
    </button>
  );
}

// ============================================
// Main Component
// ============================================

export interface AgentVotesProps {
  /** Number of columns in the grid */
  columns?: 2 | 3 | 4;
  /** Show empty state when no cycle is active */
  showEmpty?: boolean;
}

export function AgentVotes({ columns = 4, showEmpty = true }: AgentVotesProps) {
  const { cycle, isRunning } = useActiveCycle();
  const { outputs, count } = useAgentOutputs();
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  const gridCols = {
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-4",
  };

  // No active cycle
  if (!cycle && showEmpty) {
    return (
      <div className="text-center py-8 text-stone-500 dark:text-stone-400">
        <p className="text-sm">No active trading cycle</p>
        <p className="text-xs mt-1">Agent votes will appear during OODA cycles</p>
      </div>
    );
  }

  // Cycle running but no outputs yet
  if (isRunning && count === 0) {
    return (
      <div className="text-center py-8">
        <div className="flex items-center justify-center gap-2 text-amber-600 dark:text-amber-400">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
          </span>
          <span className="text-sm font-medium">Agents deliberating...</span>
        </div>
      </div>
    );
  }

  // Render agent cards
  const agentEntries = Array.from(outputs.entries());

  return (
    <div className={`grid ${gridCols[columns]} gap-4`}>
      {agentEntries.map(([agentType, output]) => (
        <AgentCard
          key={agentType}
          agentType={agentType}
          output={output}
          expanded={expandedAgent === agentType}
          onToggle={() => setExpandedAgent(expandedAgent === agentType ? null : agentType)}
        />
      ))}
    </div>
  );
}

// ============================================
// Summary Component
// ============================================

export function AgentVotesSummary() {
  const { outputs, count } = useAgentOutputs();
  const { isRunning } = useActiveCycle();

  if (count === 0) {
    return null;
  }

  const votes = Array.from(outputs.values());
  const approveCount = votes.filter((v) => v.vote === "APPROVE").length;
  const rejectCount = votes.filter((v) => v.vote === "REJECT").length;
  const abstainCount = votes.filter((v) => v.vote === "ABSTAIN").length;
  const avgConfidence = votes.reduce((sum, v) => sum + v.confidence, 0) / votes.length;

  return (
    <div className="flex items-center gap-4 text-sm">
      {isRunning && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
        </span>
      )}
      <span className="text-emerald-600 dark:text-emerald-400">{approveCount} Bullish</span>
      <span className="text-red-600 dark:text-red-400">{rejectCount} Bearish</span>
      {abstainCount > 0 && (
        <span className="text-stone-500 dark:text-stone-400">{abstainCount} Neutral</span>
      )}
      <span className="text-stone-400 dark:text-stone-500">|</span>
      <span className="font-mono text-stone-500 dark:text-stone-400">
        Avg: {Math.round(avgConfidence * 100)}%
      </span>
    </div>
  );
}

export default AgentVotes;
