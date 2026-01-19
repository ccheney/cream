/**
 * Type definitions for Mastra agents.
 *
 * Contains all interfaces and type definitions used across agent modules.
 */

import type { AgentType } from "@cream/agents";
import type { IndicatorSnapshot } from "@cream/indicators";

// Re-export types from @cream/agents for convenience
export type {
	BearishResearchOutput,
	BullishResearchOutput,
	CriticOutput,
	DecisionPlan,
	FundamentalsAnalysisOutput,
	RiskManagerOutput,
	SentimentAnalysisOutput,
} from "@cream/agents";

/**
 * Agent configuration from runtime config
 */
export interface AgentConfigEntry {
	enabled: boolean;
	systemPromptOverride?: string | null;
}

export interface AgentContext {
	cycleId: string;
	symbols: string[];
	snapshots: Record<string, unknown>;
	/** Indicator snapshots per symbol from IndicatorService */
	indicators?: Record<string, IndicatorSnapshot>;
	memory?: Record<string, unknown>;
	externalContext?: Record<string, unknown>;
	/** Recent external events from database (news, macro, transcripts) */
	recentEvents?: Array<{
		id: string;
		sourceType: string;
		eventType: string;
		eventTime: string;
		sentiment: string;
		summary: string;
		importanceScore: number;
		relatedInstruments: string[];
	}>;
	/** Market regime classifications per symbol from @cream/regime */
	regimeLabels?: Record<
		string,
		{
			regime: string;
			confidence: number;
			reasoning?: string;
		}
	>;
	/** Prediction market signals (Fed rate, recession probability, etc.) */
	predictionMarketSignals?: {
		fedCutProbability?: number;
		fedHikeProbability?: number;
		recessionProbability12m?: number;
		macroUncertaintyIndex?: number;
		policyEventRisk?: number;
		marketConfidence?: number;
		cpiSurpriseDirection?: number;
		gdpSurpriseDirection?: number;
		timestamp?: string;
		platforms?: string[];
	};
	/** Agent configurations from runtime config (from database) */
	agentConfigs?: Partial<Record<AgentType, AgentConfigEntry>>;
	/** Overnight brief from morning newspaper (compiled from MacroWatch entries) */
	overnightBrief?: string | null;
	/** Grounding output from the Grounding Agent (web search context) */
	groundingOutput?: {
		perSymbol: Array<{
			symbol: string;
			news: string[];
			fundamentals: string[];
			bullCase: string[];
			bearCase: string[];
		}>;
		global: {
			macro: string[];
			events: string[];
		};
		sources: Array<{
			url: string;
			title: string;
			relevance: string;
			sourceType?: "url" | "x" | "news";
		}>;
	};
	/** Accumulated tool results from all agents for audit trail */
	toolResults?: ToolResultEntry[];
}

/**
 * Runtime settings for agent execution including model and prompt overrides.
 * Temperature is fixed at 0.3 for deterministic outputs.
 * maxTokens is omitted to use model's natural maximum (AI SDK default).
 */
export interface AgentRuntimeSettings {
	model?: string;
	systemPromptOverride?: string | null;
}

/**
 * Accumulated tool result for audit trail.
 * Captures tool invocations and results from agent execution.
 */
export interface ToolResultEntry {
	/** Agent that invoked the tool */
	agentType: AgentType;
	/** Tool call ID for correlation */
	toolCallId: string;
	/** Name of the tool invoked */
	toolName: string;
	/** Arguments passed to the tool */
	toolArgs: Record<string, unknown>;
	/** Result returned by the tool */
	result: unknown;
	/** Whether the tool execution succeeded */
	success: boolean;
	/** Timestamp of the tool result */
	timestamp: string;
}

/**
 * Streaming chunk type for WebSocket emission.
 *
 * Chunk types map to AI SDK fullStream events:
 * - text-delta: Incremental text content
 * - reasoning-delta: Incremental reasoning/thinking content
 * - tool-call: Tool invocation with name and args
 * - tool-result: Tool execution result
 * - source: Grounding source (Google Search citation with URL, title)
 * - start: Stream start lifecycle event
 * - finish: Stream finish lifecycle event
 * - error: Error event
 */
export interface AgentStreamChunk {
	type:
		| "text-delta"
		| "tool-call"
		| "tool-result"
		| "reasoning-delta"
		| "source"
		| "start"
		| "finish"
		| "error";
	agentType: AgentType;
	payload: {
		text?: string;
		toolName?: string;
		toolArgs?: Record<string, unknown>;
		toolCallId?: string;
		result?: unknown;
		success?: boolean;
		error?: string;
		/** Source fields for grounding citations */
		sourceId?: string;
		sourceType?: string;
		url?: string;
		title?: string;
		/** Extracted domain from URL (e.g., "yahoo.com") */
		domain?: string;
		/** LogoKit URL for source logo */
		logoUrl?: string;
		providerMetadata?: Record<string, unknown>;
	};
	timestamp: string;
}

/**
 * Callback type for streaming chunk emission.
 * Supports both sync and async callbacks.
 */
export type OnStreamChunk = (chunk: AgentStreamChunk) => void | Promise<void>;
