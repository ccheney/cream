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

/**
 * Semantic thought types for agent reasoning display.
 * Each maps to a specific color from the design system.
 */
export type ThoughtType =
	| "observation" // stone - gathering facts, noting data
	| "analysis" // violet - working through patterns
	| "hypothesis" // indigo - forming predictions
	| "concern" // orange - caution, uncertainty, caveats
	| "insight" // pink - aha moments, realizations
	| "synthesis" // amber - pulling together factors
	| "conclusion" // emerald - final recommendation
	| "question"; // teal - self-reflection, alternatives

export interface UseStatusNarrativeResult {
	/** Current status narrative text */
	narrative: string;
	/** The semantic type of the current reasoning */
	type: ThoughtType;
	/** Classification confidence (0-1) */
	confidence: number;
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

interface NarrativeResponse {
	summary: string;
	type: ThoughtType;
	confidence: number;
}

const DEFAULT_RESPONSE: NarrativeResponse = {
	summary: "Thinking...",
	type: "observation",
	confidence: 0.3,
};

/**
 * Fetch status narrative from API with fallback to local extraction.
 */
async function fetchStatusNarrative(reasoning: string): Promise<NarrativeResponse> {
	if (reasoning.length < MIN_REASONING_LENGTH) {
		return DEFAULT_RESPONSE;
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

		const data = (await res.json()) as NarrativeResponse;
		return data;
	} catch {
		// Fallback to local extraction
		return {
			summary: extractKeyPhrase(reasoning),
			type: "observation",
			confidence: 0.3,
		};
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
 * @returns Status narrative with type classification and control functions
 *
 * @example
 * ```tsx
 * const { narrative, type, confidence, isGenerating } = useStatusNarrative(
 *   state.reasoningText,
 *   state.status === "processing"
 * );
 * ```
 */
export function useStatusNarrative(
	reasoningText: string,
	isStreaming: boolean,
): UseStatusNarrativeResult {
	const [narrative, setNarrative] = useState("Thinking...");
	const [type, setType] = useState<ThoughtType>("observation");
	const [confidence, setConfidence] = useState(0.3);
	const [isGenerating, setIsGenerating] = useState(false);
	const lastReasoningRef = useRef("");
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const narrativeState = createNarrativeStateUpdater(setNarrative, setType, setConfidence);

	const generateNarrative = useCallback(
		async (text: string) => {
			if (!text || text.length < MIN_REASONING_LENGTH) {
				narrativeState.reset();
				return;
			}

			if (Math.abs(text.length - lastReasoningRef.current.length) < 50) {
				return;
			}

			setIsGenerating(true);
			try {
				const response = await fetchStatusNarrative(text);
				narrativeState.setFromResponse(response.summary, response.type, response.confidence);
				lastReasoningRef.current = text;
			} finally {
				setIsGenerating(false);
			}
		},
		[narrativeState],
	);

	// Manual refresh function
	const refresh = useCallback(() => {
		if (reasoningText) {
			lastReasoningRef.current = ""; // Reset to force refresh
			generateNarrative(reasoningText);
		}
	}, [reasoningText, generateNarrative]);

	useNarrativeRefreshTicker(isStreaming, reasoningText, generateNarrative, intervalRef);
	useNarrativeResetEffect(reasoningText, narrativeState.reset);

	return { narrative, type, confidence, isGenerating, refresh };
}

export default useStatusNarrative;
function createNarrativeStateUpdater(
	setNarrative: (value: string) => void,
	setType: (value: ThoughtType) => void,
	setConfidence: (value: number) => void,
) {
	return {
		reset: () => {
			setNarrative("Thinking...");
			setType("observation");
			setConfidence(0.3);
		},
		setFromResponse: (summary: string, responseType: ThoughtType, responseConfidence: number) => {
			setNarrative(summary);
			setType(responseType);
			setConfidence(responseConfidence);
		},
	};
}

function useNarrativeRefreshTicker(
	isStreaming: boolean,
	reasoningText: string,
	generateNarrative: (text: string) => Promise<void>,
	intervalRef: { current: ReturnType<typeof setInterval> | null },
) {
	useEffect(() => {
		if (!isStreaming) {
			if (intervalRef.current) {
				clearInterval(intervalRef.current);
				intervalRef.current = null;
			}
			return;
		}

		generateNarrative(reasoningText);

		intervalRef.current = setInterval(() => {
			generateNarrative(reasoningText);
		}, REFRESH_INTERVAL);

		return () => {
			if (intervalRef.current) {
				clearInterval(intervalRef.current);
				intervalRef.current = null;
			}
		};
	}, [isStreaming, reasoningText, generateNarrative, intervalRef]);
}

function useNarrativeResetEffect(reasoningText: string, resetNarrative: () => void) {
	useEffect(() => {
		if (!reasoningText) {
			resetNarrative();
		}
	}, [reasoningText, resetNarrative]);
}
