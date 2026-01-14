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
  grounding: "#3B82F6",
  news: "#EC4899",
  fundamentals: "#14B8A6",
  bullish: "#22C55E",
  bearish: "#EF4444",
  trader: "#F59E0B",
  risk: "#F97316",
  critic: "#6366F1",
};

const AGENT_DISPLAY_NAMES: Record<AgentType, string> = {
  grounding: "Grounding Agent",
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
// Semantic Section Types
// ============================================

type SectionType = "normal" | "reflection" | "conclusion";
type SectionStatus = "complete" | "active" | "pending";

interface ThoughtSection {
  title: string | null;
  content: string;
  type: SectionType;
  status: SectionStatus;
  key: string;
}

// ============================================
// Semantic Section Parsing
// ============================================

/**
 * Parse reasoning text into semantic sections.
 * Detects **Header** style markdown headers and groups content accordingly.
 */
function parseThoughtSections(text: string, isStreaming: boolean): ThoughtSection[] {
  if (!text) {
    return [];
  }

  // Split by markdown bold headers like **Header Text**
  // This regex captures the header and the content after it
  const headerPattern = /\*\*([^*]+)\*\*/g;
  const sections: ThoughtSection[] = [];
  let match: RegExpExecArray | null;
  let sectionIndex = 0;

  // Find all headers and split content
  const matches: { header: string; start: number; end: number }[] = [];
  // biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop pattern
  while ((match = headerPattern.exec(text)) !== null) {
    const headerText = match[1];
    if (headerText) {
      matches.push({
        header: headerText.trim(),
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  // If no headers found, treat as single section
  if (matches.length === 0) {
    return [
      {
        title: null,
        content: text.trim(),
        type: detectSectionType(text),
        status: isStreaming ? "active" : "complete",
        key: "section-0",
      },
    ];
  }

  // Build sections from headers
  for (const [i, currentMatch] of matches.entries()) {
    const nextMatch = matches[i + 1];

    // Content before the first header (if any)
    if (i === 0 && currentMatch.start > 0) {
      const preContent = text.slice(0, currentMatch.start).trim();
      if (preContent) {
        sections.push({
          title: null,
          content: preContent,
          type: detectSectionType(preContent),
          status: "complete",
          key: `section-${sectionIndex++}`,
        });
      }
    }

    // Content after this header until next header or end
    const contentStart = currentMatch.end;
    const contentEnd = nextMatch ? nextMatch.start : text.length;
    const content = text.slice(contentStart, contentEnd).trim();

    const isLastSection = i === matches.length - 1;
    const status: SectionStatus = isLastSection && isStreaming ? "active" : "complete";

    sections.push({
      title: currentMatch.header,
      content,
      type: detectSectionType(content, currentMatch.header),
      status,
      key: `section-${sectionIndex++}`,
    });
  }

  return sections;
}

/**
 * Detect the type of a section based on content and title.
 */
function detectSectionType(content: string, title?: string): SectionType {
  const text = `${title || ""} ${content}`;
  const lowerText = text.toLowerCase();

  // Reflection patterns
  const reflectionPatterns = [
    /wait|actually|hmm|reconsider|second thought|but wait/,
    /should also consider|need to reconsider|thinking about it/,
    /however|although|that said|other hand|caveat|concern/,
    /risk|warning|caution|careful/,
  ];

  for (const pattern of reflectionPatterns) {
    if (pattern.test(lowerText)) {
      return "reflection";
    }
  }

  // Conclusion patterns
  const conclusionPatterns = [
    /therefore|thus|conclusion|summarize|overall|finally/,
    /assessment|recommendation|verdict|decision/,
    /based on.*analysis|given.*factors|considering.*above/,
    /synthesis|final.*thought|bottom.*line/,
  ];

  for (const pattern of conclusionPatterns) {
    if (pattern.test(lowerText)) {
      return "conclusion";
    }
  }

  return "normal";
}

// ============================================
// Thought Section Component
// ============================================

function ThoughtSectionComponent({
  section,
  reducedMotion,
}: {
  section: ThoughtSection;
  reducedMotion: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Style configurations based on type
  const typeStyles = {
    normal: {
      bg: "bg-white dark:bg-night-800",
      border: "border-stone-200 dark:border-night-700",
      accent: "border-l-stone-300 dark:border-l-night-600",
      label: null,
      labelBg: "",
      labelText: "",
    },
    reflection: {
      bg: "bg-amber-50/50 dark:bg-amber-900/10",
      border: "border-amber-200 dark:border-amber-800/30",
      accent: "border-l-amber-500",
      label: "Reconsidering",
      labelBg: "bg-amber-100 dark:bg-amber-900/30",
      labelText: "text-amber-700 dark:text-amber-400",
    },
    conclusion: {
      bg: "bg-emerald-50/50 dark:bg-emerald-900/10",
      border: "border-emerald-200 dark:border-emerald-800/30",
      accent: "border-l-emerald-500",
      label: "Synthesis",
      labelBg: "bg-emerald-100 dark:bg-emerald-900/30",
      labelText: "text-emerald-700 dark:text-emerald-400",
    },
  };

  const styles = typeStyles[section.type];

  // Status indicator
  const statusIcon =
    section.status === "complete" ? (
      <svg
        className="w-4 h-4 text-emerald-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ) : section.status === "active" ? (
      <motion.div
        className="w-4 h-4 rounded-full border-2 border-amber-500 border-t-transparent"
        animate={reducedMotion ? {} : { rotate: 360 }}
        transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
      />
    ) : (
      <div className="w-4 h-4 rounded-full border-2 border-stone-300 dark:border-night-600" />
    );

  return (
    <div
      className={`mb-3 rounded-lg border ${styles.border} ${styles.bg} border-l-4 ${styles.accent} overflow-hidden`}
    >
      {/* Section Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-stone-50/50 dark:hover:bg-night-750/50 transition-colors"
      >
        <div className="flex-shrink-0 mt-0.5">{statusIcon}</div>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="font-medium text-stone-800 dark:text-stone-200 truncate">
            {section.title || (
              <span className="text-stone-500 dark:text-stone-400 italic">Thinking...</span>
            )}
          </span>
          {styles.label && (
            <span
              className={`flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${styles.labelBg} ${styles.labelText}`}
            >
              {styles.label}
            </span>
          )}
        </div>
        <motion.svg
          className="w-4 h-4 text-stone-400 flex-shrink-0 mt-0.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.2 }}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </motion.svg>
      </button>

      {/* Section Content */}
      <AnimatePresence initial={false}>
        {isExpanded && section.content && (
          <motion.div
            initial={reducedMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reducedMotion ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-0">
              <div className="pl-7 text-sm text-stone-600 dark:text-stone-400 leading-relaxed prose prose-sm dark:prose-invert prose-stone max-w-none">
                <MarkdownContent content={section.content} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Simple markdown content renderer.
 * Handles basic markdown: bold, italic, lists, links.
 */
function MarkdownContent({ content }: { content: string }) {
  // Parse content into segments
  const segments = useMemo(() => {
    const result: React.ReactNode[] = [];
    const remaining = content;
    let keyIndex = 0;

    // Process line by line for better structure
    const lines = remaining.split("\n");

    for (const line of lines) {
      if (!line.trim()) {
        result.push(<br key={`br-${keyIndex++}`} />);
        continue;
      }

      // Check for bullet points
      const bulletMatch = line.match(/^[\s]*[-•*]\s+(.+)$/);
      if (bulletMatch?.[1]) {
        result.push(
          <div key={`bullet-${keyIndex++}`} className="flex items-start gap-2 my-1">
            <span className="text-stone-400 mt-0.5">•</span>
            <span>{parseInlineMarkdown(bulletMatch[1], keyIndex)}</span>
          </div>
        );
        continue;
      }

      // Regular paragraph
      result.push(
        <p key={`p-${keyIndex++}`} className="my-1">
          {parseInlineMarkdown(line, keyIndex)}
        </p>
      );
    }

    return result;
  }, [content]);

  return <>{segments}</>;
}

/**
 * Parse inline markdown (bold, italic) in a line of text.
 */
function parseInlineMarkdown(text: string, baseKey: number): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const _remaining = text;
  let partIndex = 0;

  // Pattern for **bold** and *italic*
  const pattern = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop pattern
  while ((match = pattern.exec(text)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    // Add formatted text
    if (match[2]) {
      // Bold
      parts.push(
        <strong
          key={`bold-${baseKey}-${partIndex++}`}
          className="font-semibold text-stone-700 dark:text-stone-300"
        >
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      // Italic
      parts.push(
        <em key={`italic-${baseKey}-${partIndex++}`} className="italic">
          {match[3]}
        </em>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

// ============================================
// Streaming Reasoning Component
// ============================================

function StreamingReasoning({
  text,
  isStreaming = false,
  reducedMotion = false,
}: {
  text: string;
  isStreaming?: boolean;
  reducedMotion?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse text into semantic sections
  const sections = useMemo(() => parseThoughtSections(text, isStreaming), [text, isStreaming]);

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
      className="max-h-96 overflow-y-auto rounded-lg bg-stone-50 dark:bg-night-750 p-3"
      aria-live="polite"
      aria-atomic="false"
      aria-relevant="additions"
    >
      {sections.length > 0 ? (
        sections.map((section) => (
          <ThoughtSectionComponent
            key={section.key}
            section={section}
            reducedMotion={reducedMotion}
          />
        ))
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
    <section
      className="bg-white dark:bg-night-800 rounded-lg border border-stone-200 dark:border-night-700 overflow-hidden"
      onKeyDown={handlePanelKeyDown}
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
            reducedMotion={reducedMotion}
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
    </section>
  );
}

export default AgentStreamingDetail;
