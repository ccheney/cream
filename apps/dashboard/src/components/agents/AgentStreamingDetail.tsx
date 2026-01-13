"use client";

/**
 * AgentStreamingDetail - Full streaming view for selected agent
 *
 * Shows complete tool call timeline, expandable args/results, and streaming reasoning.
 * Follows design philosophy: Layered Revelation, Trust Through Transparency.
 *
 * Enhanced UX Features:
 * - Auto-open on streaming start, auto-close on completion
 * - Duration timer badge
 * - Smooth framer-motion animations
 * - Full keyboard navigation
 *
 * @see docs/plans/ui/20-design-philosophy.md
 * @see docs/plans/ui/41-reasoning-trace-ux.md
 */

import { formatDistanceToNow } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentStreamingState, AgentType, ToolCall } from "@/hooks/useAgentStreaming";
import { useStatusNarrative } from "@/hooks/useStatusNarrative";

// ============================================
// Constants
// ============================================

const AGENT_COLORS: Record<AgentType, string> = {
  news: "#EC4899",
  fundamentals: "#14B8A6",
  bullish: "#22C55E",
  bearish: "#EF4444",
  trader: "#F59E0B",
  risk: "#F97316",
  critic: "#6366F1",
};

const AGENT_DISPLAY_NAMES: Record<AgentType, string> = {
  news: "News & Sentiment",
  fundamentals: "Fundamentals",
  bullish: "Bullish Research",
  bearish: "Bearish Research",
  trader: "Trader",
  risk: "Risk Manager",
  critic: "Critic",
};

/** Animation duration in seconds (from design spec) */
const ANIMATION_DURATION = 0.25;
/** Delay before auto-closing after completion (ms) */
const AUTO_CLOSE_DELAY = 2000;

// ============================================
// Hooks
// ============================================

/**
 * Hook to check if user prefers reduced motion
 */
function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  return prefersReducedMotion;
}

/**
 * Hook to track streaming duration
 */
function useStreamingDuration(isStreaming: boolean): number {
  const [duration, setDuration] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isStreaming) {
      startTimeRef.current = Date.now();
      setDuration(0);

      intervalRef.current = setInterval(() => {
        if (startTimeRef.current) {
          setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isStreaming]);

  return duration;
}

// ============================================
// Subcomponents
// ============================================

// ============================================
// Types
// ============================================

/** Reasoning phases for step indicator */
type ReasoningPhase = "gathering" | "analyzing" | "synthesizing" | "complete";

// ============================================
// Phase Detection
// ============================================

/**
 * Detect the current reasoning phase based on content analysis.
 * Uses heuristics to identify what stage the agent is in.
 */
function detectReasoningPhase(
  reasoningText: string,
  toolCallCount: number,
  status: AgentStreamingState["status"]
): ReasoningPhase {
  if (status === "complete" || status === "error") {
    return "complete";
  }

  if (status === "idle" || !reasoningText) {
    return "gathering";
  }

  const text = reasoningText.toLowerCase();
  const length = reasoningText.length;

  // Synthesizing: near the end, contains conclusion words
  const synthesisPatterns = [
    /(?:therefore|thus|in conclusion|to summarize|overall|finally|recommendation)/i,
    /(?:my (?:assessment|recommendation|conclusion))/i,
    /(?:based on (?:this|the|my) analysis)/i,
  ];

  for (const pattern of synthesisPatterns) {
    if (pattern.test(text)) {
      return "synthesizing";
    }
  }

  // Analyzing: has some content and tool calls, working through data
  if (length > 200 || toolCallCount >= 1) {
    const analysisPatterns = [
      /(?:looking at|examining|considering|evaluating|analyzing)/i,
      /(?:the data (?:shows|indicates|suggests))/i,
      /(?:this (?:means|indicates|suggests))/i,
    ];

    for (const pattern of analysisPatterns) {
      if (pattern.test(text)) {
        return "analyzing";
      }
    }

    // Default to analyzing if we have enough content
    if (length > 300) {
      return "analyzing";
    }
  }

  return "gathering";
}

// ============================================
// Subcomponents
// ============================================

/**
 * Reasoning phases step indicator
 */
function ReasoningPhases({
  currentPhase,
  reducedMotion,
}: {
  currentPhase: ReasoningPhase;
  reducedMotion: boolean;
}) {
  const phases: { key: ReasoningPhase; label: string }[] = [
    { key: "gathering", label: "Gathering" },
    { key: "analyzing", label: "Analyzing" },
    { key: "synthesizing", label: "Synthesizing" },
  ];

  const phaseOrder: Record<ReasoningPhase, number> = {
    gathering: 0,
    analyzing: 1,
    synthesizing: 2,
    complete: 3,
  };

  const currentIndex = phaseOrder[currentPhase];

  return (
    <div className="flex items-center gap-4 px-4 py-2 border-b border-stone-200 dark:border-night-700 bg-stone-50/50 dark:bg-night-750/50">
      {phases.map((phase, index) => {
        const isComplete = index < currentIndex || currentPhase === "complete";
        const isActive = index === currentIndex && currentPhase !== "complete";

        return (
          <div key={phase.key} className="flex items-center gap-2">
            {/* Step indicator */}
            <motion.div
              className={`flex items-center justify-center w-5 h-5 rounded-full ${
                isComplete
                  ? "bg-emerald-500 text-white"
                  : isActive
                    ? "bg-amber-500 text-white"
                    : "bg-stone-200 dark:bg-night-600 text-stone-400"
              }`}
              animate={isActive && !reducedMotion ? { scale: [1, 1.1, 1] } : {}}
              transition={{
                duration: 1.5,
                ease: "easeInOut",
                repeat: isActive ? Number.POSITIVE_INFINITY : 0,
              }}
            >
              {isComplete ? (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              ) : (
                <span className="text-[10px] font-bold">{index + 1}</span>
              )}
            </motion.div>

            {/* Label */}
            <span
              className={`text-xs font-medium ${
                isComplete
                  ? "text-emerald-600 dark:text-emerald-400"
                  : isActive
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-stone-400 dark:text-stone-500"
              }`}
            >
              {phase.label}
            </span>

            {/* Connector line (except last) */}
            {index < phases.length - 1 && (
              <div
                className={`w-6 h-0.5 ${
                  index < currentIndex ? "bg-emerald-500" : "bg-stone-200 dark:bg-night-600"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Status narrative display with optional shimmer effect
 */
function StatusNarrative({ text, isGenerating }: { text: string; isGenerating: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="text-sm text-stone-600 dark:text-stone-400 italic"
        aria-live="polite"
        aria-atomic="true"
      >
        {text}
      </span>
      {isGenerating && (
        <span className="inline-block w-1 h-1 rounded-full bg-amber-500 animate-pulse" />
      )}
    </div>
  );
}

/**
 * Duration badge showing elapsed streaming time
 */
function DurationBadge({ seconds, isActive }: { seconds: number; isActive: boolean }) {
  const formatted = useMemo(() => {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  }, [seconds]);

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono transition-colors ${
        isActive
          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
          : "bg-stone-100 text-stone-500 dark:bg-night-700 dark:text-stone-400"
      }`}
    >
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
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      {formatted}
    </span>
  );
}

// ============================================
// Intelligent Summary Generation
// ============================================

/**
 * Generate an intelligent summary of reasoning text.
 * Extracts key points rather than simple truncation.
 */
function generateIntelligentSummary(text: string, maxLength = 120): string {
  if (!text || text.length <= maxLength) {
    return text || "No reasoning yet...";
  }

  // Try to extract the last complete sentence
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 10);
  const lastSentence = sentences.pop()?.trim();

  if (lastSentence && lastSentence.length <= maxLength) {
    return `${lastSentence}...`;
  }

  // Try to find a key phrase in the last portion
  const lastPortion = text.slice(-200);
  const keyPhrasePatterns = [
    /(?:therefore|thus|overall|finally)[,:]?\s*([^.!?]{10,80})/i,
    /(?:this (?:means|indicates|suggests))\s*([^.!?]{10,80})/i,
    /(?:I (?:think|believe|recommend))\s*([^.!?]{10,80})/i,
  ];

  for (const pattern of keyPhrasePatterns) {
    const match = lastPortion.match(pattern);
    if (match?.[1]) {
      const phrase = match[1].trim();
      return phrase.length <= maxLength ? `${phrase}...` : `${phrase.slice(0, maxLength - 3)}...`;
    }
  }

  // Fallback: smart truncation at word boundary
  const truncated = text.slice(-maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > maxLength * 0.5) {
    return `...${truncated.slice(truncated.indexOf(" ") + 1)}`;
  }

  return `...${truncated}`;
}

/**
 * Enhanced collapsible section with framer-motion animations and summary support
 */
function CollapsibleSection({
  title,
  count,
  isOpen,
  onToggle,
  reducedMotion,
  summary,
  children,
}: {
  title: string;
  count?: number;
  isOpen: boolean;
  onToggle: () => void;
  reducedMotion: boolean;
  summary?: string;
  children: React.ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <div className="border-b border-stone-200 dark:border-night-700 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        aria-expanded={isOpen}
        aria-controls={`section-${title.toLowerCase().replace(/\s+/g, "-")}`}
        className="w-full flex items-center justify-between py-3 px-4 text-left hover:bg-stone-50 dark:hover:bg-night-750 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-amber-500/50"
      >
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-stone-900 dark:text-stone-100">
            {title}
            {count !== undefined && (
              <span className="ml-2 text-xs text-stone-400 dark:text-stone-500">({count})</span>
            )}
          </span>

          {/* Summary preview when collapsed */}
          {!isOpen && summary && (
            <AnimatePresence>
              <motion.p
                initial={reducedMotion ? false : { opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reducedMotion ? undefined : { opacity: 0, y: -5 }}
                transition={{ duration: 0.2 }}
                className="text-xs text-stone-500 dark:text-stone-400 mt-1 truncate"
              >
                {summary}
              </motion.p>
            </AnimatePresence>
          )}
        </div>

        <motion.svg
          className="w-4 h-4 text-stone-400 flex-shrink-0 ml-2"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: reducedMotion ? 0 : ANIMATION_DURATION, ease: "easeOut" }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </motion.svg>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            id={`section-${title.toLowerCase().replace(/\s+/g, "-")}`}
            initial={reducedMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reducedMotion ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : ANIMATION_DURATION, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div ref={contentRef} className="px-4 pb-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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

// ============================================
// Semantic Block Types
// ============================================

type ThoughtBlockType = "normal" | "reflection" | "conclusion";

interface ThoughtBlock {
  type: ThoughtBlockType;
  content: string;
  key: string;
}

// ============================================
// Semantic Block Parsing
// ============================================

/**
 * Parse reasoning text into semantic thought blocks.
 * Identifies reflection patterns and conclusion blocks.
 */
function parseThoughtBlocks(text: string): ThoughtBlock[] {
  if (!text) {
    return [];
  }

  // Split on double newlines to get paragraphs
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());

  // If no paragraphs, treat as single block
  if (paragraphs.length === 0) {
    return [{ type: "normal", content: text, key: "0" }];
  }

  // Patterns that indicate self-reflection or reconsideration
  const reflectionPatterns = [
    /^(?:wait|actually|hmm|let me reconsider|on second thought|but wait)/i,
    /^(?:i should also consider|i need to reconsider|thinking about it more)/i,
    /^(?:however|although|that said|on the other hand)/i,
  ];

  // Patterns that indicate conclusion/synthesis
  const conclusionPatterns = [
    /^(?:therefore|thus|in conclusion|to summarize|overall|finally)/i,
    /^(?:my (?:assessment|recommendation|conclusion|verdict))/i,
    /^(?:based on (?:this|the|my) analysis)/i,
    /^(?:given (?:all|these) (?:factors|considerations))/i,
  ];

  return paragraphs.map((paragraph, index) => {
    const trimmed = paragraph.trim();

    // Check for reflection
    for (const pattern of reflectionPatterns) {
      if (pattern.test(trimmed)) {
        return {
          type: "reflection" as const,
          content: trimmed,
          key: `block-${index}`,
        };
      }
    }

    // Check for conclusion
    for (const pattern of conclusionPatterns) {
      if (pattern.test(trimmed)) {
        return {
          type: "conclusion" as const,
          content: trimmed,
          key: `block-${index}`,
        };
      }
    }

    return {
      type: "normal" as const,
      content: trimmed,
      key: `block-${index}`,
    };
  });
}

// ============================================
// Thought Block Component
// ============================================

function ThoughtBlockComponent({ block }: { block: ThoughtBlock }) {
  if (block.type === "reflection") {
    return (
      <div className="relative my-3 p-3 bg-amber-50 dark:bg-amber-900/20 border-l-3 border-amber-500 rounded-r-lg">
        <span className="absolute -top-2 left-2 text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-night-750 px-1">
          Reconsidering
        </span>
        <p className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed whitespace-pre-wrap mt-1">
          {block.content}
        </p>
      </div>
    );
  }

  if (block.type === "conclusion") {
    return (
      <div className="relative my-3 p-3 bg-emerald-50 dark:bg-emerald-900/20 border-l-3 border-emerald-500 rounded-r-lg">
        <span className="absolute -top-2 left-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-night-750 px-1">
          Synthesis
        </span>
        <p className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed whitespace-pre-wrap mt-1">
          {block.content}
        </p>
      </div>
    );
  }

  return (
    <p className="text-sm text-stone-600 dark:text-stone-400 leading-relaxed whitespace-pre-wrap my-2">
      {block.content}
    </p>
  );
}

// ============================================
// Streaming Reasoning Component
// ============================================

function StreamingReasoning({
  text,
  isStreaming = false,
  toolCalls = [],
}: {
  text: string;
  isStreaming?: boolean;
  toolCalls?: ToolCall[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse text into semantic blocks
  const blocks = useMemo(() => parseThoughtBlocks(text), [text]);

  // Get pending tool calls to show inline
  const pendingTools = useMemo(
    () => toolCalls.filter((tc) => tc.status === "pending"),
    [toolCalls]
  );

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
      className="max-h-80 overflow-y-auto rounded-lg bg-stone-50 dark:bg-night-750 p-4"
      aria-live="polite"
      aria-atomic="false"
      aria-relevant="additions"
    >
      {blocks.length > 0 ? (
        <>
          {blocks.map((block) => (
            <ThoughtBlockComponent key={block.key} block={block} />
          ))}

          {/* Show pending tool calls inline at the end */}
          {pendingTools.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {pendingTools.map((tool) => (
                <span
                  key={tool.toolCallId}
                  className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded text-xs font-mono"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  {tool.toolName}
                </span>
              ))}
            </div>
          )}

          {/* Streaming cursor */}
          {isStreaming && (
            <span className="inline-block w-0.5 h-4 bg-amber-500 ml-0.5 animate-blink align-text-bottom" />
          )}
        </>
      ) : (
        <span className="text-stone-400 italic">No reasoning output yet...</span>
      )}
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
  const reducedMotion = usePrefersReducedMotion();

  // Determine streaming state
  const isStreaming = state.status === "processing";
  const wasStreamingRef = useRef(false);

  // Status narrative (LLM-generated or extracted)
  const { narrative, isGenerating: isNarrativeGenerating } = useStatusNarrative(
    state.reasoningText,
    isStreaming
  );

  // Detect current reasoning phase
  const currentPhase = useMemo(
    () => detectReasoningPhase(state.reasoningText, state.toolCalls.length, state.status),
    [state.reasoningText, state.toolCalls.length, state.status]
  );

  // Track duration while streaming
  const duration = useStreamingDuration(isStreaming);

  // Section open states - controlled for auto-open/close behavior
  const [toolCallsOpen, setToolCallsOpen] = useState(true);
  const [reasoningOpen, setReasoningOpen] = useState(true);
  const [outputOpen, setOutputOpen] = useState(false);

  // Track if user has manually interacted with sections
  const userInteractedRef = useRef(false);

  // Auto-open reasoning when streaming starts
  useEffect(() => {
    if (isStreaming && !wasStreamingRef.current && !userInteractedRef.current) {
      setReasoningOpen(true);
      setToolCallsOpen(true);
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming]);

  // Auto-close after streaming completes (with delay)
  useEffect(() => {
    if (!isStreaming && wasStreamingRef.current && !userInteractedRef.current) {
      const timer = setTimeout(() => {
        setReasoningOpen(false);
      }, AUTO_CLOSE_DELAY);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isStreaming]);

  // Handlers that track user interaction
  const handleToolCallsToggle = useCallback(() => {
    userInteractedRef.current = true;
    setToolCallsOpen((prev) => !prev);
  }, []);

  const handleReasoningToggle = useCallback(() => {
    userInteractedRef.current = true;
    setReasoningOpen((prev) => !prev);
  }, []);

  const handleOutputToggle = useCallback(() => {
    userInteractedRef.current = true;
    setOutputOpen((prev) => !prev);
  }, []);

  // Reset user interaction when agent type changes
  useEffect(() => {
    userInteractedRef.current = false;
    setReasoningOpen(true);
    setToolCallsOpen(true);
    setOutputOpen(false);
  }, []);

  // Keyboard navigation for the entire panel
  const handlePanelKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape" && reasoningOpen) {
        userInteractedRef.current = true;
        setReasoningOpen(false);
      }
    },
    [reasoningOpen]
  );

  const statusLabel =
    state.status === "idle"
      ? "Idle"
      : state.status === "processing"
        ? "Thinking"
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
    <div
      className="bg-white dark:bg-night-800 rounded-lg border border-stone-200 dark:border-night-700 overflow-hidden"
      onKeyDown={handlePanelKeyDown}
      // biome-ignore lint/a11y/useSemanticElements: Panel is a container, not a form
      role="region"
      aria-label={`${displayName} streaming detail`}
    >
      {/* Header with shimmer effect when streaming */}
      <div
        className={`px-4 py-3 border-b border-stone-200 dark:border-night-700 relative ${
          isStreaming ? "overflow-hidden" : ""
        }`}
        style={{ borderLeftWidth: "4px", borderLeftColor: color }}
      >
        {/* Shimmer background when streaming */}
        {isStreaming && (
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-500/5 to-transparent"
            animate={{ x: ["-200%", "200%"] }}
            transition={{
              duration: 2,
              ease: "easeInOut",
              repeat: Number.POSITIVE_INFINITY,
            }}
            style={{ width: "200%" }}
          />
        )}

        <div className="flex items-center justify-between relative">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-medium text-stone-900 dark:text-stone-100">
              {displayName}
            </h3>
            {(isStreaming || duration > 0) && (
              <DurationBadge seconds={duration} isActive={isStreaming} />
            )}
          </div>
          <span
            className={`text-sm font-medium uppercase tracking-wider ${statusColor}`}
            aria-live="polite"
          >
            {statusLabel}
          </span>
        </div>
        {cycleId && (
          <p className="text-xs text-stone-400 dark:text-stone-500 mt-1 font-mono relative">
            Cycle: {cycleId}
          </p>
        )}

        {/* Status narrative when streaming */}
        {isStreaming && state.reasoningText && (
          <div className="mt-2 relative">
            <StatusNarrative text={narrative} isGenerating={isNarrativeGenerating} />
          </div>
        )}
      </div>

      {/* Reasoning phases indicator */}
      {(isStreaming || state.status === "complete") && (
        <ReasoningPhases currentPhase={currentPhase} reducedMotion={reducedMotion} />
      )}

      {/* Content */}
      <div>
        {/* Tool Calls Section */}
        <CollapsibleSection
          title="Tool Calls"
          count={state.toolCalls.length}
          isOpen={toolCallsOpen}
          onToggle={handleToolCallsToggle}
          reducedMotion={reducedMotion}
        >
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
        <CollapsibleSection
          title="Reasoning"
          isOpen={reasoningOpen}
          onToggle={handleReasoningToggle}
          reducedMotion={reducedMotion}
          summary={!reasoningOpen ? generateIntelligentSummary(state.reasoningText) : undefined}
        >
          <StreamingReasoning
            text={state.reasoningText}
            isStreaming={isStreaming}
            toolCalls={state.toolCalls}
          />
        </CollapsibleSection>

        {/* Text Output Section (if different from reasoning) */}
        {state.textOutput && state.textOutput !== state.reasoningText && (
          <CollapsibleSection
            title="Output"
            isOpen={outputOpen}
            onToggle={handleOutputToggle}
            reducedMotion={reducedMotion}
          >
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
