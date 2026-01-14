"use client";

/**
 * AgentStreamingCard - Glanceable agent streaming status card
 *
 * Shows real-time agent status with tool calls and reasoning snippets.
 * Follows design philosophy: Precision Over Decoration, Layered Revelation.
 *
 * @see docs/plans/ui/20-design-philosophy.md
 */

import { formatDistanceToNow } from "date-fns";
import type { AgentStreamingState, AgentType, ToolCall } from "@/hooks/useAgentStreaming";

// ============================================
// Constants
// ============================================

/** Agent signature colors from design philosophy */
const AGENT_COLORS: Record<AgentType, string> = {
  grounding: "#3B82F6", // Blue
  news: "#EC4899", // Pink
  fundamentals: "#14B8A6", // Teal
  bullish: "#22C55E", // Green
  bearish: "#EF4444", // Red
  trader: "#F59E0B", // Amber
  risk: "#F97316", // Orange
  critic: "#6366F1", // Indigo
};

const AGENT_DISPLAY_NAMES: Record<AgentType, string> = {
  grounding: "Grounding",
  news: "News & Sentiment",
  fundamentals: "Fundamentals",
  bullish: "Bullish Research",
  bearish: "Bearish Research",
  trader: "Trader",
  risk: "Risk Manager",
  critic: "Critic",
};

// ============================================
// Subcomponents
// ============================================

function StatusDot({ status, color }: { status: AgentStreamingState["status"]; color: string }) {
  if (status === "idle") {
    return <span className="inline-block w-2 h-2 rounded-full bg-stone-300 dark:bg-stone-600" />;
  }

  if (status === "processing") {
    return (
      <span className="relative flex h-2 w-2">
        <span
          className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
          style={{ backgroundColor: color }}
        />
        <span
          className="relative inline-flex rounded-full h-2 w-2"
          style={{ backgroundColor: color }}
        />
      </span>
    );
  }

  if (status === "complete") {
    return <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />;
  }

  // error
  return <span className="inline-block w-2 h-2 rounded-full bg-red-500" />;
}

function ToolCallBadge({ toolCall }: { toolCall: ToolCall }) {
  const statusStyles = {
    pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    complete: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    error: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono ${statusStyles[toolCall.status]}`}
    >
      {toolCall.toolName}
      {toolCall.status === "pending" && (
        <span className="inline-block w-1 h-1 rounded-full bg-current animate-pulse" />
      )}
      {toolCall.status === "complete" && toolCall.durationMs && (
        <span className="text-[10px] opacity-70">{toolCall.durationMs}ms</span>
      )}
    </span>
  );
}

function ReasoningSnippet({ text }: { text: string }) {
  // Show last ~100 chars with streaming cursor
  const displayText = text.length > 100 ? `...${text.slice(-100)}` : text;

  return (
    <p className="text-xs text-stone-600 dark:text-stone-400 line-clamp-2 font-normal leading-relaxed">
      {displayText}
      <span className="inline-block w-0.5 h-3 bg-amber-500 ml-0.5 animate-blink align-text-bottom" />
    </p>
  );
}

// ============================================
// Main Component
// ============================================

export interface AgentStreamingCardProps {
  agentType: AgentType;
  state?: AgentStreamingState;
  isSelected?: boolean;
  onClick?: () => void;
}

export function AgentStreamingCard({
  agentType,
  state,
  isSelected = false,
  onClick,
}: AgentStreamingCardProps) {
  const color = AGENT_COLORS[agentType];
  const displayName = AGENT_DISPLAY_NAMES[agentType];

  const status = state?.status ?? "idle";
  const toolCalls = state?.toolCalls ?? [];
  const reasoningText = state?.reasoningText ?? "";
  const lastUpdate = state?.lastUpdate;

  // Show last 2 tool calls
  const recentToolCalls = toolCalls.slice(-2);

  // Determine card background based on status
  const statusBgClass =
    status === "processing"
      ? "bg-amber-50/50 dark:bg-amber-900/10"
      : status === "complete"
        ? "bg-emerald-50/50 dark:bg-emerald-900/10"
        : status === "error"
          ? "bg-red-50/50 dark:bg-red-900/10"
          : "bg-white dark:bg-night-800";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left w-full rounded-lg border p-3 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50 ${
        isSelected
          ? "border-amber-500 ring-2 ring-amber-500/20"
          : "border-stone-200 dark:border-night-700 hover:border-stone-300 dark:hover:border-night-600"
      } ${statusBgClass}`}
      style={{
        borderLeftWidth: "4px",
        borderLeftColor: color,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <StatusDot status={status} color={color} />
          <span className="text-sm font-medium text-stone-900 dark:text-stone-100">
            {displayName}
          </span>
        </div>
        {lastUpdate && (
          <span className="text-[10px] text-stone-400 dark:text-stone-500">
            {formatDistanceToNow(new Date(lastUpdate), { addSuffix: true })}
          </span>
        )}
      </div>

      {/* Tool Calls (glanceable) */}
      {recentToolCalls.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {recentToolCalls.map((tc) => (
            <ToolCallBadge key={tc.toolCallId} toolCall={tc} />
          ))}
          {toolCalls.length > 2 && (
            <span className="text-[10px] text-stone-400 dark:text-stone-500">
              +{toolCalls.length - 2} more
            </span>
          )}
        </div>
      )}

      {/* Reasoning Snippet */}
      {status === "processing" && reasoningText && <ReasoningSnippet text={reasoningText} />}

      {/* Idle state */}
      {status === "idle" && toolCalls.length === 0 && (
        <p className="text-xs text-stone-400 dark:text-stone-500">Waiting...</p>
      )}

      {/* Complete state */}
      {status === "complete" && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">Complete</p>
      )}

      {/* Error state */}
      {status === "error" && state?.error && (
        <p className="text-xs text-red-600 dark:text-red-400 truncate">{state.error}</p>
      )}
    </button>
  );
}

export default AgentStreamingCard;
