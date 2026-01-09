/**
 * AgentStreamingOutput Component
 *
 * Displays real-time OODA cycle outputs with blinking cursor,
 * status badge transitions, and typewriter effect.
 *
 * @see docs/plans/ui/31-realtime-patterns.md lines 69-87
 */

"use client";

import { memo, useEffect, useState } from "react";
import type { StreamingStatus } from "./use-streaming-text";

export interface AgentStreamingOutputProps {
  /** Name of the agent (displayed in header) */
  agentName: string;
  /** Streaming text content */
  streamingText: string;
  /** Current status */
  status: StreamingStatus;
  /** Error message (when status is 'error') */
  error?: string;
  /** Custom CSS class */
  className?: string;
  /** Test ID for testing */
  "data-testid"?: string;
}

interface StatusBadgeProps {
  status: StreamingStatus;
}

const StatusBadge = memo(function StatusBadge({ status }: StatusBadgeProps) {
  const badges: Record<StreamingStatus, { label: string; color: string; icon?: string }> = {
    idle: {
      label: "Idle",
      color: "var(--text-muted, #78716c)",
    },
    processing: {
      label: "Processing",
      color: "var(--neutral, #eab308)",
    },
    complete: {
      label: "Complete",
      color: "var(--profit, #22c55e)",
      icon: "✓",
    },
    error: {
      label: "Error",
      color: "var(--loss, #ef4444)",
      icon: "✕",
    },
  };

  const badge = badges[status];

  return (
    <output
      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full transition-all duration-300"
      style={{
        backgroundColor: `${badge.color}20`,
        color: badge.color,
      }}
      aria-label={`Status: ${badge.label}`}
    >
      {badge.icon && (
        <span className="text-xs" aria-hidden="true">
          {badge.icon}
        </span>
      )}
      {badge.label}
    </output>
  );
});

interface BlinkingCursorProps {
  visible: boolean;
}

const BlinkingCursor = memo(function BlinkingCursor({ visible }: BlinkingCursorProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mediaQuery.matches) {
      setIsVisible(true);
      return;
    }

    // 530ms matches standard terminal cursor blink rate
    const interval = setInterval(() => {
      setIsVisible((prev) => !prev);
    }, 530);

    return () => clearInterval(interval);
  }, [visible]);

  if (!visible) {
    return null;
  }

  return (
    <span
      className="inline-block text-current select-none cursor-blink"
      style={{ opacity: isVisible ? 1 : 0 }}
      aria-hidden="true"
    >
      ▌
    </span>
  );
});

export const AgentStreamingOutput = memo(function AgentStreamingOutput({
  agentName,
  streamingText,
  status,
  error,
  className = "",
  "data-testid": testId,
}: AgentStreamingOutputProps) {
  const isStreaming = status === "processing";
  const hasError = status === "error";

  return (
    <div
      className={`rounded-lg border overflow-hidden ${className}`}
      style={{
        borderColor: hasError ? "var(--loss, #ef4444)" : "var(--border-default, #d6d3d1)",
        backgroundColor: "var(--bg-card, #ffffff)",
      }}
      data-testid={testId}
    >
      <div
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{
          borderColor: "var(--border-default, #d6d3d1)",
          backgroundColor: "var(--bg-elevated, #fafaf9)",
        }}
      >
        <span className="text-sm font-medium" style={{ color: "var(--text-heading, #1c1917)" }}>
          {agentName}
        </span>
        <StatusBadge status={status} />
      </div>

      <div
        className="p-4 min-h-[100px] max-h-[400px] overflow-y-auto font-mono text-sm whitespace-pre-wrap"
        style={{ color: "var(--text-primary, #44403c)" }}
        role="log"
        aria-live="polite"
        aria-atomic="false"
        aria-label={`${agentName} output`}
      >
        {streamingText}
        <BlinkingCursor visible={isStreaming} />

        {hasError && error && (
          <div
            className="mt-2 p-2 rounded text-sm"
            style={{
              backgroundColor: "var(--loss-bg, #fef2f2)",
              color: "var(--loss, #ef4444)",
            }}
            role="alert"
          >
            {error}
          </div>
        )}

        {status === "idle" && !streamingText && (
          <span className="text-sm italic" style={{ color: "var(--text-muted, #78716c)" }}>
            Waiting for input...
          </span>
        )}
      </div>
    </div>
  );
});

export type { StatusBadgeProps, BlinkingCursorProps };
export default AgentStreamingOutput;
