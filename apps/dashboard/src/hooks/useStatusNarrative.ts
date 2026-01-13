/**
 * Status Narrative Hook
 *
 * Generates dynamic, contextual status summaries for agent reasoning.
 * Uses Gemini Flash via the dashboard-api for LLM-powered summaries,
 * with a fallback to local extraction when the API is unavailable.
 *
 * @see docs/plans/ui/41-reasoning-trace-ux.md
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { config } from "@/lib/config";

// ============================================
// Constants
// ============================================

/** How often to refresh the narrative while streaming (ms) */
const REFRESH_INTERVAL = 2500;

/** Minimum reasoning length before attempting summarization */
const MIN_REASONING_LENGTH = 50;

/** API endpoint for summarization */
const SUMMARIZE_ENDPOINT = `${config.api.baseUrl}/api/ai/summarize-reasoning`;

// ============================================
// Types
// ============================================

export interface UseStatusNarrativeResult {
  /** Current status narrative text */
  narrative: string;
  /** Whether the narrative is currently being generated */
  isGenerating: boolean;
  /** Force a refresh of the narrative */
  refresh: () => void;
}

// ============================================
// Fallback Extraction
// ============================================

/**
 * Local fallback: Extract a key phrase from reasoning without API call.
 * Used when the API is unavailable or returns an error.
 */
function extractKeyPhrase(reasoning: string): string {
  const recent = reasoning.slice(-200).trim();

  const actionPatterns = [
    /(?:I(?:'m| am| will| need to| should))\s+([^.!?]{10,50})/i,
    /(?:Let me|Now|First|Next)\s+([^.!?]{10,40})/i,
    /(?:Looking at|Checking|Analyzing|Evaluating|Considering)\s+([^.!?]{5,35})/i,
  ];

  for (const pattern of actionPatterns) {
    const match = recent.match(pattern);
    if (match?.[1]) {
      const phrase = match[1].trim();
      const summary = phrase.charAt(0).toUpperCase() + phrase.slice(1);
      return summary.length > 40 ? `${summary.slice(0, 40)}...` : `${summary}...`;
    }
  }

  const sentences = recent.split(/[.!?]+/);
  const lastSentence = sentences.filter((s) => s.trim().length > 10).pop();

  if (lastSentence) {
    const trimmed = lastSentence.trim();
    return trimmed.length > 40 ? `${trimmed.slice(0, 40)}...` : `${trimmed}...`;
  }

  return "Processing...";
}

// ============================================
// API Integration
// ============================================

/**
 * Fetch status narrative from API with fallback to local extraction.
 */
async function fetchStatusNarrative(reasoning: string): Promise<string> {
  if (reasoning.length < MIN_REASONING_LENGTH) {
    return "Thinking...";
  }

  try {
    const res = await fetch(SUMMARIZE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reasoning }),
    });

    if (!res.ok) {
      throw new Error(`API returned ${res.status}`);
    }

    const data = (await res.json()) as { summary: string };
    return data.summary;
  } catch {
    // Fallback to local extraction
    return extractKeyPhrase(reasoning);
  }
}

// ============================================
// Hook
// ============================================

/**
 * Hook to generate dynamic status narratives for agent reasoning.
 *
 * @param reasoningText - The current reasoning text to summarize
 * @param isStreaming - Whether the agent is currently streaming
 * @returns Status narrative and control functions
 *
 * @example
 * ```tsx
 * const { narrative, isGenerating } = useStatusNarrative(
 *   state.reasoningText,
 *   state.status === "processing"
 * );
 * ```
 */
export function useStatusNarrative(
  reasoningText: string,
  isStreaming: boolean
): UseStatusNarrativeResult {
  const [narrative, setNarrative] = useState("Thinking...");
  const [isGenerating, setIsGenerating] = useState(false);
  const lastReasoningRef = useRef("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Generate narrative function
  const generateNarrative = useCallback(async (text: string) => {
    if (!text || text.length < MIN_REASONING_LENGTH) {
      setNarrative("Thinking...");
      return;
    }

    // Skip if reasoning hasn't changed significantly
    if (Math.abs(text.length - lastReasoningRef.current.length) < 50) {
      return;
    }

    setIsGenerating(true);
    try {
      const newNarrative = await fetchStatusNarrative(text);
      setNarrative(newNarrative);
      lastReasoningRef.current = text;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  // Manual refresh function
  const refresh = useCallback(() => {
    if (reasoningText) {
      lastReasoningRef.current = ""; // Reset to force refresh
      generateNarrative(reasoningText);
    }
  }, [reasoningText, generateNarrative]);

  // Generate immediately when reasoning starts and periodically while streaming
  useEffect(() => {
    if (!isStreaming) {
      // Clear interval when not streaming
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      // Keep last narrative when stopped
      return;
    }

    // Generate immediately on first content
    generateNarrative(reasoningText);

    // Then refresh periodically while streaming
    intervalRef.current = setInterval(() => {
      generateNarrative(reasoningText);
    }, REFRESH_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isStreaming, reasoningText, generateNarrative]);

  // Reset when reasoning is cleared
  useEffect(() => {
    if (!reasoningText) {
      setNarrative("Thinking...");
      lastReasoningRef.current = "";
    }
  }, [reasoningText]);

  return { narrative, isGenerating, refresh };
}

export default useStatusNarrative;
