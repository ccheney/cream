"use client";

/**
 * AgentNode - Individual agent visualization in the network
 *
 * Compact node with signature color, status indicator, and live data.
 *
 * @see docs/plans/43-agent-network-visualization.md
 */

import { motion } from "framer-motion";
import { memo } from "react";
import type { AgentStreamingState } from "@/stores/agent-streaming-store";
import { AGENT_METADATA, type NetworkAgentType } from "./types";

// ============================================
// Animation Variants
// ============================================

const nodeVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  hover: { y: -2, transition: { duration: 0.15 } },
};

const shimmerVariants = {
  initial: { backgroundPosition: "200% 0" },
  animate: {
    backgroundPosition: "-200% 0",
    transition: { duration: 2, ease: "easeInOut" as const, repeat: Number.POSITIVE_INFINITY },
  },
};

// ============================================
// Subcomponents
// ============================================

const StatusIndicator = memo(function StatusIndicator({
  status,
  color,
}: {
  status: AgentStreamingState["status"];
  color: string;
}) {
  if (status === "idle") {
    return (
      <span
        role="img"
        className="inline-block w-2 h-2 rounded-full bg-stone-300 dark:bg-stone-600"
        aria-label="Idle"
      />
    );
  }

  if (status === "processing") {
    return (
      <span role="img" className="relative flex h-2 w-2" aria-label="Processing">
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
    return (
      <span
        role="img"
        className="inline-block w-2 h-2 rounded-full bg-emerald-500"
        aria-label="Complete"
      />
    );
  }

  return (
    <span role="img" className="inline-block w-2 h-2 rounded-full bg-red-500" aria-label="Error" />
  );
});

const ToolCallCount = memo(function ToolCallCount({
  count,
  pending,
}: {
  count: number;
  pending: number;
}) {
  if (count === 0) {
    return null;
  }

  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-stone-500 dark:text-stone-400">
      {pending > 0 ? (
        <>
          <span className="text-amber-600 dark:text-amber-400">{pending}</span>
          <span>/</span>
        </>
      ) : null}
      <span>{count} tools</span>
    </span>
  );
});

// ============================================
// Main Component
// ============================================

export interface AgentNodeProps {
  agentType: NetworkAgentType;
  state?: AgentStreamingState;
  isSelected?: boolean;
  onClick?: () => void;
  compact?: boolean;
}

export const AgentNode = memo(function AgentNode({
  agentType,
  state,
  isSelected = false,
  onClick,
  compact = false,
}: AgentNodeProps) {
  const metadata = AGENT_METADATA[agentType];
  const status = state?.status ?? "idle";
  const toolCalls = state?.toolCalls ?? [];
  const pendingTools = toolCalls.filter((tc) => tc.status === "pending").length;
  const activeToolName = toolCalls.find((tc) => tc.status === "pending")?.toolName;

  const isProcessing = status === "processing";

  return (
    <motion.button
      type="button"
      onClick={onClick}
      variants={nodeVariants}
      initial="initial"
      animate="animate"
      whileHover="hover"
      className={`
        relative text-left rounded-lg border transition-all duration-200
        focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50
        ${compact ? "p-2 min-w-[140px]" : "p-3 min-w-[180px]"}
        ${
          isSelected
            ? "border-amber-500 ring-2 ring-amber-500/20"
            : "border-stone-200 dark:border-night-700 hover:border-stone-300 dark:hover:border-night-600"
        }
        ${
          isProcessing
            ? "bg-gradient-to-r from-cream-50 via-[var(--agent-bg)] to-cream-50 dark:from-night-800 dark:via-[var(--agent-bg-dark)] dark:to-night-800"
            : status === "complete"
              ? "bg-emerald-50/50 dark:bg-emerald-900/10"
              : status === "error"
                ? "bg-red-50/50 dark:bg-red-900/10"
                : "bg-white dark:bg-night-800"
        }
      `}
      style={
        {
          borderLeftWidth: "4px",
          borderLeftColor: metadata.color,
          "--agent-bg": `${metadata.color}10`,
          "--agent-bg-dark": `${metadata.color}15`,
        } as React.CSSProperties
      }
      aria-selected={isSelected}
      aria-label={`${metadata.displayName}, ${status}`}
    >
      {/* Processing shimmer overlay */}
      {isProcessing && (
        <motion.div
          variants={shimmerVariants}
          initial="initial"
          animate="animate"
          className="absolute inset-0 rounded-lg pointer-events-none"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${metadata.color}15 50%, transparent 100%)`,
            backgroundSize: "200% 100%",
          }}
        />
      )}

      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            <span className="text-sm" aria-hidden="true">
              {metadata.icon}
            </span>
            <StatusIndicator status={status} color={metadata.color} />
          </div>
          <ToolCallCount count={toolCalls.length} pending={pendingTools} />
        </div>

        {/* Agent name */}
        <p
          className={`font-medium text-stone-900 dark:text-stone-100 ${
            compact ? "text-xs" : "text-sm"
          }`}
        >
          {compact ? metadata.shortName : metadata.displayName}
        </p>

        {/* Status text */}
        {!compact && (
          <div className="mt-1">
            {status === "idle" && (
              <p className="text-[11px] text-stone-400 dark:text-stone-500">Waiting</p>
            )}
            {status === "processing" && activeToolName && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 font-mono truncate">
                {activeToolName}
              </p>
            )}
            {status === "processing" && !activeToolName && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">Processing...</p>
            )}
            {status === "complete" && (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400">Complete</p>
            )}
            {status === "error" && (
              <p className="text-[11px] text-red-600 dark:text-red-400 truncate">
                {state?.error ?? "Error"}
              </p>
            )}
          </div>
        )}
      </div>
    </motion.button>
  );
});

export default AgentNode;
