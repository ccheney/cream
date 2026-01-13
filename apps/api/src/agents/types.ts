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
  /** Factor Zoo context - active factors and their current weights */
  factorZoo?: {
    /** Current Mega-Alpha signal value (normalized -1 to 1) */
    megaAlpha: number;
    /** Active factors with their weights and recent performance */
    activeFactors: Array<{
      factorId: string;
      name: string;
      weight: number;
      recentIC: number;
      isDecaying: boolean;
    }>;
    /** Decay alerts for factors showing degradation */
    decayAlerts: Array<{
      factorId: string;
      alertType: string;
      severity: string;
      currentValue: number;
      threshold: number;
      recommendation: string;
    }>;
    /** Factor Zoo summary stats */
    stats: {
      totalFactors: number;
      activeCount: number;
      decayingCount: number;
      averageIC: number;
    };
  };
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
 * Streaming chunk type for WebSocket emission.
 */
export interface AgentStreamChunk {
  type: "text-delta" | "tool-call" | "tool-result" | "reasoning-delta" | "finish" | "error";
  agentType: AgentType;
  payload: {
    text?: string;
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    toolCallId?: string;
    result?: unknown;
    success?: boolean;
    error?: string;
  };
  timestamp: string;
}

/**
 * Callback type for streaming chunk emission.
 * Supports both sync and async callbacks.
 */
export type OnStreamChunk = (chunk: AgentStreamChunk) => void | Promise<void>;

/**
 * Context for Idea Agent
 */
export interface IdeaAgentContext {
  /** Current market regime */
  regime: string;
  /** Uncovered market regimes */
  gaps: string[];
  /** Factors currently experiencing decay */
  decayingFactors: Array<{ id: string; decayRate: number }>;
  /** Factor Zoo summary stats */
  factorZooSummary: string;
  /** Research trigger details */
  trigger: {
    type: string;
    severity: string;
    suggestedFocus: string;
    affectedFactors: string[];
    detectedAt: string;
  };
  /** Similar past hypotheses from memory */
  memoryResults?: Array<{
    hypothesisId: string;
    title: string;
    status: "validated" | "rejected";
    targetRegime: string;
    ic?: number;
    lessonsLearned?: string;
  }>;
  /** Agent configs for runtime settings */
  agentConfigs?: Partial<Record<AgentType, AgentConfigEntry>>;
}
