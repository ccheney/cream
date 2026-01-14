/**
 * Thought Classification Hook
 *
 * Classifies thought sections into semantic types using LLM.
 * Types map to the design system colors for visual differentiation.
 *
 * @see docs/plans/ui/21-color-system.md
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { config } from "@/lib/config";

// ============================================
// Constants
// ============================================

/** API endpoint for classification */
const CLASSIFY_ENDPOINT = `${config.api.baseUrl}/api/ai/classify-thought`;

/** Minimum content length before attempting classification */
const MIN_CONTENT_LENGTH = 20;

/** Cache TTL in milliseconds (5 minutes) */
const CACHE_TTL = 5 * 60 * 1000;

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

export interface ThoughtClassification {
	type: ThoughtType;
	confidence: number;
}

export interface UseThoughtClassificationResult {
	/** The classified type */
	type: ThoughtType;
	/** Classification confidence (0-1) */
	confidence: number;
	/** Whether classification is in progress */
	isClassifying: boolean;
}

// ============================================
// Cache
// ============================================

interface CacheEntry {
	classification: ThoughtClassification;
	timestamp: number;
}

const classificationCache = new Map<string, CacheEntry>();

function getCacheKey(content: string, title?: string): string {
	const normalized = `${title || ""}:${content.slice(0, 200)}`;
	let hash = 0;
	for (let i = 0; i < normalized.length; i++) {
		const char = normalized.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash;
	}
	return hash.toString(36);
}

function getFromCache(key: string): ThoughtClassification | null {
	const entry = classificationCache.get(key);
	if (!entry) {
		return null;
	}

	if (Date.now() - entry.timestamp > CACHE_TTL) {
		classificationCache.delete(key);
		return null;
	}

	return entry.classification;
}

function setCache(key: string, classification: ThoughtClassification): void {
	classificationCache.set(key, {
		classification,
		timestamp: Date.now(),
	});

	// Prune old entries if cache gets too large
	if (classificationCache.size > 100) {
		const now = Date.now();
		for (const [k, v] of classificationCache) {
			if (now - v.timestamp > CACHE_TTL) {
				classificationCache.delete(k);
			}
		}
	}
}

// ============================================
// API Integration
// ============================================

async function fetchClassification(
	content: string,
	title?: string
): Promise<ThoughtClassification> {
	if (content.length < MIN_CONTENT_LENGTH) {
		return { type: "observation", confidence: 0.5 };
	}

	try {
		const res = await fetch(CLASSIFY_ENDPOINT, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ content, title }),
		});

		if (!res.ok) {
			throw new Error(`API returned ${res.status}`);
		}

		const data = (await res.json()) as ThoughtClassification;
		return data;
	} catch {
		return { type: "observation", confidence: 0.3 };
	}
}

// ============================================
// Hook
// ============================================

/**
 * Hook to classify thought sections into semantic types using LLM.
 * Results are cached to avoid repeated API calls.
 *
 * @param content - The thought section content
 * @param title - Optional section title/header
 * @param isComplete - Whether the section is complete (triggers classification)
 *
 * @example
 * ```tsx
 * const { type, confidence, isClassifying } = useThoughtClassification(
 *   section.content,
 *   section.title,
 *   section.status === "complete"
 * );
 * ```
 */
export function useThoughtClassification(
	content: string,
	title?: string,
	isComplete = false
): UseThoughtClassificationResult {
	const [type, setType] = useState<ThoughtType>("observation");
	const [confidence, setConfidence] = useState(0.3);
	const [isClassifying, setIsClassifying] = useState(false);

	const lastContentRef = useRef("");
	const abortRef = useRef<AbortController | null>(null);

	const classify = useCallback(async (contentToClassify: string, titleToUse?: string) => {
		const cacheKey = getCacheKey(contentToClassify, titleToUse);

		// Check cache first
		const cached = getFromCache(cacheKey);
		if (cached) {
			setType(cached.type);
			setConfidence(cached.confidence);
			return;
		}

		setIsClassifying(true);
		try {
			const result = await fetchClassification(contentToClassify, titleToUse);
			setType(result.type);
			setConfidence(result.confidence);
			setCache(cacheKey, result);
		} finally {
			setIsClassifying(false);
		}
	}, []);

	// Fetch LLM classification when section completes
	useEffect(() => {
		if (!isComplete || !content || content.length < MIN_CONTENT_LENGTH) {
			return;
		}

		// Skip if content hasn't changed significantly
		if (Math.abs(content.length - lastContentRef.current.length) < 30) {
			return;
		}

		lastContentRef.current = content;

		// Cancel previous request
		if (abortRef.current) {
			abortRef.current.abort();
		}
		abortRef.current = new AbortController();

		classify(content, title);

		return () => {
			if (abortRef.current) {
				abortRef.current.abort();
			}
		};
	}, [content, title, isComplete, classify]);

	return { type, confidence, isClassifying };
}

export default useThoughtClassification;
