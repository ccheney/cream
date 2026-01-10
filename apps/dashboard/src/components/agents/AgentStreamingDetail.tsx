"use client";

/**
 * AgentStreamingDetail - Full streaming view for selected agent
 *
 * Shows complete tool call timeline, expandable args/results, and streaming reasoning.
 * Follows design philosophy: Layered Revelation, Trust Through Transparency.
 *
 * @see docs/plans/ui/20-design-philosophy.md
 */

import { formatDistanceToNow } from "date-fns";
import { useEffect, useRef, useState } from "react";
import type { AgentStreamingState, AgentType, ToolCall } from "@/hooks/useAgentStreaming";

// ============================================
// Constants
// ============================================

const AGENT_COLORS: Record<AgentType, string> = {
  technical: "#8B5CF6",
  news: "#EC4899",
  fundamentals: "#14B8A6",
  bullish: "#22C55E",
  bearish: "#EF4444",
  trader: "#F59E0B",
  risk: "#F97316",
  critic: "#6366F1",
};

const AGENT_DISPLAY_NAMES: Record<AgentType, string> = {
  technical: "Technical Analyst",
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

function CollapsibleSection({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-stone-200 dark:border-night-700 last:border-b-0">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-3 px-4 text-left hover:bg-stone-50 dark:hover:bg-night-750 transition-colors"
      >
        <span className="text-sm font-medium text-stone-900 dark:text-stone-100">
          {title}
          {count !== undefined && (
            <span className="ml-2 text-xs text-stone-400 dark:text-stone-500">({count})</span>
          )}
        </span>
        <svg
          className={`w-4 h-4 text-stone-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function ToolCallItem({ toolCall }: { toolCall: ToolCall }) {
  const [expanded, setExpanded] = useState(false);

  const statusStyles = {
    pending: {
      bg: "bg-amber-100 dark:bg-amber-900/30",
      text: "text-amber-700 dark:text-amber-400",
      icon: <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />,
    },
    complete: {
      bg: "bg-emerald-100 dark:bg-emerald-900/30",
      text: "text-emerald-700 dark:text-emerald-400",
      icon: (
        <svg
          className="w-3 h-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ),
    },
    error: {
      bg: "bg-red-100 dark:bg-red-900/30",
      text: "text-red-700 dark:text-red-400",
      icon: (
        <svg
          className="w-3 h-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      ),
    },
  };

  const style = statusStyles[toolCall.status];

  return (
    <div className={`rounded-lg ${style.bg} p-3 mb-2 last:mb-0`}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <span className={style.text}>{style.icon}</span>
          <span className={`font-mono text-sm font-medium ${style.text}`}>{toolCall.toolName}</span>
        </div>
        <div className="flex items-center gap-2">
          {toolCall.durationMs && (
            <span className="text-xs text-stone-400 dark:text-stone-500 font-mono">
              {toolCall.durationMs}ms
            </span>
          )}
          <span className="text-[10px] text-stone-400 dark:text-stone-500">
            {formatDistanceToNow(new Date(toolCall.timestamp), { addSuffix: true })}
          </span>
          <svg
            className={`w-3 h-3 text-stone-400 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          {/* Tool Arguments */}
          <div>
            <span className="text-[10px] uppercase tracking-wider text-stone-400 dark:text-stone-500">
              Arguments
            </span>
            <pre className="mt-1 text-xs font-mono bg-white/50 dark:bg-night-800/50 rounded p-2 overflow-x-auto text-stone-600 dark:text-stone-400">
              {formatJson(toolCall.toolArgs)}
            </pre>
          </div>

          {/* Tool Result */}
          {toolCall.resultSummary && (
            <div>
              <span className="text-[10px] uppercase tracking-wider text-stone-400 dark:text-stone-500">
                Result
              </span>
              <pre className="mt-1 text-xs font-mono bg-white/50 dark:bg-night-800/50 rounded p-2 overflow-x-auto text-stone-600 dark:text-stone-400 whitespace-pre-wrap">
                {toolCall.resultSummary}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StreamingReasoning({ text }: { text: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom as new text streams in
  // biome-ignore lint/correctness/useExhaustiveDependencies: text changes trigger scroll
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [text]);

  return (
    <div
      ref={containerRef}
      className="max-h-64 overflow-y-auto rounded-lg bg-stone-50 dark:bg-night-750 p-4"
    >
      <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed whitespace-pre-wrap">
        {text || <span className="text-stone-400 italic">No reasoning output yet...</span>}
        {text && (
          <span className="inline-block w-0.5 h-4 bg-amber-500 ml-0.5 animate-blink align-text-bottom" />
        )}
      </p>
    </div>
  );
}

function formatJson(jsonString: string): string {
  try {
    const parsed = JSON.parse(jsonString);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return jsonString;
  }
}

// ============================================
// Main Component
// ============================================

export interface AgentStreamingDetailProps {
  agentType: AgentType;
  state: AgentStreamingState;
  cycleId?: string | null;
}

export function AgentStreamingDetail({ agentType, state, cycleId }: AgentStreamingDetailProps) {
  const color = AGENT_COLORS[agentType];
  const displayName = AGENT_DISPLAY_NAMES[agentType];

  const statusLabel =
    state.status === "idle"
      ? "Idle"
      : state.status === "processing"
        ? "Processing"
        : state.status === "complete"
          ? "Complete"
          : "Error";

  const statusColor =
    state.status === "idle"
      ? "text-stone-500 dark:text-stone-400"
      : state.status === "processing"
        ? "text-amber-600 dark:text-amber-400"
        : state.status === "complete"
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-red-600 dark:text-red-400";

  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-stone-200 dark:border-night-700 overflow-hidden">
      {/* Header */}
      <div
        className="px-4 py-3 border-b border-stone-200 dark:border-night-700"
        style={{ borderLeftWidth: "4px", borderLeftColor: color }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-stone-900 dark:text-stone-100">{displayName}</h3>
          <span className={`text-sm font-medium uppercase tracking-wider ${statusColor}`}>
            {statusLabel}
          </span>
        </div>
        {cycleId && (
          <p className="text-xs text-stone-400 dark:text-stone-500 mt-1 font-mono">
            Cycle: {cycleId}
          </p>
        )}
      </div>

      {/* Content */}
      <div>
        {/* Tool Calls Section */}
        <CollapsibleSection title="Tool Calls" count={state.toolCalls.length} defaultOpen>
          {state.toolCalls.length > 0 ? (
            <div>
              {state.toolCalls.map((tc) => (
                <ToolCallItem key={tc.toolCallId} toolCall={tc} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-stone-400 dark:text-stone-500 italic">
              No tool calls yet...
            </p>
          )}
        </CollapsibleSection>

        {/* Reasoning Section */}
        <CollapsibleSection title="Reasoning" defaultOpen>
          <StreamingReasoning text={state.reasoningText} />
        </CollapsibleSection>

        {/* Text Output Section (if different from reasoning) */}
        {state.textOutput && state.textOutput !== state.reasoningText && (
          <CollapsibleSection title="Output" defaultOpen={false}>
            <div className="max-h-48 overflow-y-auto rounded-lg bg-stone-50 dark:bg-night-750 p-4">
              <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed whitespace-pre-wrap">
                {state.textOutput}
              </p>
            </div>
          </CollapsibleSection>
        )}

        {/* Error Section */}
        {state.error && (
          <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-900/50">
            <p className="text-sm text-red-700 dark:text-red-400">{state.error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default AgentStreamingDetail;
