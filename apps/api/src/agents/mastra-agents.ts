/**
 * Real Mastra Agent Implementation
 *
 * Creates actual Mastra Agent instances configured with Google Gemini models.
 * These agents use the prompts and configs from @cream/mastra-kit.
 *
 * All agents use a single global model selected via trading_config.global_model:
 * - gemini-3-flash-preview (default, faster)
 * - gemini-3-pro-preview (more capable reasoning)
 *
 * The global model is passed via RequestContext.set("model", globalModel).
 *
 * @see docs/plans/05-agents.md
 */

import {
  DEFAULT_GLOBAL_MODEL,
  type GlobalModel,
  getModelId as getGlobalModelId,
} from "@cream/domain";
import { type IndicatorHypothesis, IndicatorHypothesisSchema } from "@cream/indicators";
import {
  AGENT_CONFIGS,
  AGENT_PROMPTS,
  type AgentType,
  type BearishResearchOutput,
  type BullishResearchOutput,
  buildResearcherPrompt,
  type CriticOutput,
  type DecisionPlan,
  economicCalendarTool,
  type FundamentalsAnalysisOutput,
  getGreeksTool,
  getMarketSnapshotsTool,
  getOptionChainTool,
  getPortfolioStateTool,
  getPredictionSignalsTool,
  getQuotesTool,
  helixQueryTool,
  newsSearchTool,
  type ResearcherInput,
  type RiskManagerOutput,
  recalcIndicatorTool,
  type SentimentAnalysisOutput,
  type TechnicalAnalysisOutput,
  webSearchTool,
} from "@cream/mastra-kit";
import { Agent } from "@mastra/core/agent";
import { RequestContext } from "@mastra/core/request-context";
import type { Tool } from "@mastra/core/tools";
import { z } from "zod";

// Re-export types for convenience
export type {
  BearishResearchOutput,
  BullishResearchOutput,
  CriticOutput,
  DecisionPlan,
  FundamentalsAnalysisOutput,
  RiskManagerOutput,
  SentimentAnalysisOutput,
  TechnicalAnalysisOutput,
};

// ============================================
// Model Mapping
// ============================================

/**
 * Get the Mastra-compatible model ID for the global model setting.
 * Uses the getModelId from @cream/domain which maps:
 * - gemini-3-flash-preview -> google/gemini-3-flash-preview
 * - gemini-3-pro-preview -> google/gemini-3-pro-preview
 *
 * Falls back to default (flash) if invalid model is passed.
 */
function getModelIdForRuntime(model: string | undefined): string {
  // If it's already in provider format, return as-is
  if (model?.includes("/")) {
    return model;
  }
  // Use the domain function to map global model names
  return getGlobalModelId((model as GlobalModel) ?? DEFAULT_GLOBAL_MODEL);
}

// ============================================
// Tool Registry
// ============================================

/**
 * Maps config tool names to actual Mastra tool instances.
 * Tools not in this registry will be logged as warnings but won't fail agent creation.
 * Using Tool<any, any> to allow heterogeneous tool types in the registry.
 */
// biome-ignore lint/suspicious/noExplicitAny: Mastra tools have varying generic types
const TOOL_INSTANCES: Record<string, Tool<any, any>> = {
  // Trading tools
  get_quotes: getQuotesTool,
  get_portfolio_state: getPortfolioStateTool,
  option_chain: getOptionChainTool,
  get_greeks: getGreeksTool,
  // Data tools
  recalc_indicator: recalcIndicatorTool,
  economic_calendar: economicCalendarTool,
  news_search: newsSearchTool,
  helix_query: helixQueryTool,
  web_search: webSearchTool,
  // Prediction market tools
  get_prediction_signals: getPredictionSignalsTool,
  get_market_snapshots: getMarketSnapshotsTool,
};

// ============================================
// Zod Schemas for Structured Output
// ============================================

const KeyLevelsSchema = z.object({
  support: z.array(z.number()),
  resistance: z.array(z.number()),
  pivot: z.number(),
});

const TechnicalAnalysisSchema = z.object({
  instrument_id: z.string(),
  setup_classification: z.enum(["BREAKOUT", "PULLBACK", "REVERSAL", "RANGE_BOUND", "NO_SETUP"]),
  key_levels: KeyLevelsSchema,
  trend_assessment: z.string(),
  momentum_assessment: z.string(),
  volatility_assessment: z.string(),
  technical_thesis: z.string(),
  invalidation_conditions: z.array(z.string()),
});

const EventImpactSchema = z.object({
  event_id: z.string(),
  event_type: z.enum([
    "EARNINGS",
    "GUIDANCE",
    "M&A",
    "REGULATORY",
    "PRODUCT",
    "MACRO",
    "ANALYST",
    "SOCIAL",
  ]),
  impact_direction: z.enum(["BULLISH", "BEARISH", "NEUTRAL", "UNCERTAIN"]),
  impact_magnitude: z.enum(["HIGH", "MEDIUM", "LOW"]),
  reasoning: z.string(),
});

const SentimentAnalysisSchema = z.object({
  instrument_id: z.string(),
  event_impacts: z.array(EventImpactSchema),
  overall_sentiment: z.enum(["BULLISH", "BEARISH", "NEUTRAL", "MIXED"]),
  sentiment_strength: z.number().min(0).max(1),
  duration_expectation: z.enum(["INTRADAY", "DAYS", "WEEKS", "PERSISTENT"]),
  linked_event_ids: z.array(z.string()),
});

const EventRiskSchema = z.object({
  event: z.string(),
  date: z.string(),
  potential_impact: z.enum(["HIGH", "MEDIUM", "LOW"]),
});

const FundamentalsAnalysisSchema = z.object({
  instrument_id: z.string(),
  fundamental_drivers: z.array(z.string()),
  fundamental_headwinds: z.array(z.string()),
  valuation_context: z.string(),
  macro_context: z.string(),
  event_risk: z.array(EventRiskSchema),
  fundamental_thesis: z.string(),
  linked_event_ids: z.array(z.string()),
});

const SupportingFactorSchema = z.object({
  factor: z.string(),
  source: z.enum(["TECHNICAL", "SENTIMENT", "FUNDAMENTAL", "MEMORY"]),
  strength: z.enum(["STRONG", "MODERATE", "WEAK"]),
});

const BullishResearchSchema = z.object({
  instrument_id: z.string(),
  bullish_thesis: z.string(),
  supporting_factors: z.array(SupportingFactorSchema),
  target_conditions: z.string(),
  invalidation_conditions: z.string(),
  conviction_level: z.number().min(0).max(1),
  memory_case_ids: z.array(z.string()),
  strongest_counterargument: z.string(),
});

const BearishResearchSchema = z.object({
  instrument_id: z.string(),
  bearish_thesis: z.string(),
  supporting_factors: z.array(SupportingFactorSchema),
  target_conditions: z.string(),
  invalidation_conditions: z.string(),
  conviction_level: z.number().min(0).max(1),
  memory_case_ids: z.array(z.string()),
  strongest_counterargument: z.string(),
});

const TradeSizeSchema = z.object({
  value: z.number(),
  unit: z.enum(["SHARES", "CONTRACTS", "DOLLARS", "PCT_EQUITY"]),
});

const StopLossSchema = z.object({
  price: z.number(),
  type: z.enum(["FIXED", "TRAILING"]),
});

const TakeProfitSchema = z.object({
  price: z.number(),
});

const RationaleSchema = z.object({
  summary: z.string(),
  bullishFactors: z.array(z.string()),
  bearishFactors: z.array(z.string()),
  decisionLogic: z.string(),
  memoryReferences: z.array(z.string()),
});

const DecisionSchema = z.object({
  decisionId: z.string(),
  instrumentId: z.string(),
  action: z.enum(["BUY", "SELL", "HOLD", "CLOSE"]),
  direction: z.enum(["LONG", "SHORT", "FLAT"]),
  size: TradeSizeSchema,
  stopLoss: StopLossSchema.optional(),
  takeProfit: TakeProfitSchema.optional(),
  strategyFamily: z.enum([
    "EQUITY_LONG",
    "EQUITY_SHORT",
    "OPTION_LONG",
    "OPTION_SHORT",
    "VERTICAL_SPREAD",
    "IRON_CONDOR",
    "STRADDLE",
    "STRANGLE",
    "CALENDAR_SPREAD",
  ]),
  timeHorizon: z.enum(["INTRADAY", "SWING", "POSITION"]),
  rationale: RationaleSchema,
  thesisState: z.enum(["WATCHING", "ENTERED", "ADDING", "MANAGING", "EXITING", "CLOSED"]),
});

const DecisionPlanSchema = z.object({
  cycleId: z.string(),
  timestamp: z.string(),
  decisions: z.array(DecisionSchema),
  portfolioNotes: z.string(),
});

const ConstraintViolationSchema = z.object({
  constraint: z.string(),
  current_value: z.union([z.string(), z.number()]),
  limit: z.union([z.string(), z.number()]),
  severity: z.enum(["CRITICAL", "WARNING"]),
  affected_decisions: z.array(z.string()),
});

const RequiredChangeSchema = z.object({
  decisionId: z.string(),
  change: z.string(),
  reason: z.string(),
});

const RiskManagerOutputSchema = z.object({
  verdict: z.enum(["APPROVE", "REJECT"]),
  violations: z.array(ConstraintViolationSchema),
  required_changes: z.array(RequiredChangeSchema),
  risk_notes: z.string(),
});

const InconsistencySchema = z.object({
  decisionId: z.string(),
  issue: z.string(),
  expected: z.string(),
  found: z.string(),
});

const MissingJustificationSchema = z.object({
  decisionId: z.string(),
  missing: z.string(),
});

const HallucinationFlagSchema = z.object({
  decisionId: z.string(),
  claim: z.string(),
  evidence_status: z.enum(["NOT_FOUND", "CONTRADICTED"]),
});

const CriticRequiredChangeSchema = z.object({
  decisionId: z.string(),
  change: z.string(),
});

const CriticOutputSchema = z.object({
  verdict: z.enum(["APPROVE", "REJECT"]),
  inconsistencies: z.array(InconsistencySchema),
  missing_justifications: z.array(MissingJustificationSchema),
  hallucination_flags: z.array(HallucinationFlagSchema),
  required_changes: z.array(CriticRequiredChangeSchema),
});

// ============================================
// Idea Agent Output Schema
// ============================================

const IdeaAgentOutputSchema = z.object({
  hypothesis_id: z.string(),
  title: z.string(),
  economic_rationale: z.string(),
  market_mechanism: z.enum([
    "BEHAVIORAL_BIAS",
    "STRUCTURAL_CONSTRAINT",
    "INFORMATION_ASYMMETRY",
    "LIQUIDITY_PREMIUM",
    "RISK_PREMIUM",
  ]),
  target_regime: z.enum(["BULL_TREND", "BEAR_TREND", "RANGE", "HIGH_VOL", "LOW_VOL"]),
  expected_metrics: z.object({
    ic_target: z.number(),
    sharpe_target: z.number(),
    decay_half_life_days: z.number(),
  }),
  falsification_criteria: z.array(z.string()),
  required_features: z.array(z.string()),
  parameter_count: z.number(),
  related_literature: z.array(
    z.object({
      title: z.string(),
      authors: z.string(),
      url: z.string().nullable(),
      relevance: z.string(),
    })
  ),
  originality_justification: z.string(),
  similar_past_hypotheses: z.array(
    z.object({
      hypothesis_id: z.string(),
      outcome: z.enum(["validated", "rejected"]),
      lesson: z.string(),
    })
  ),
  implementation_hints: z.string(),
});

export type IdeaAgentOutput = z.infer<typeof IdeaAgentOutputSchema>;

// ============================================
// Agent Factory
// ============================================

/**
 * Create a Mastra Agent from our config.
 * Uses dynamic model selection to allow runtime model override via RequestContext.
 * Resolves tool instances from TOOL_INSTANCES registry based on config.tools.
 *
 * NOTE: All agents now use the global model from trading_config.global_model.
 * The global model is passed via RequestContext.set("model", globalModel).
 */
function createAgent(agentType: AgentType): Agent {
  const config = AGENT_CONFIGS[agentType];
  const systemPrompt = AGENT_PROMPTS[agentType];

  // Resolve tool instances from config
  // biome-ignore lint/suspicious/noExplicitAny: Mastra tools have varying generic types
  const tools: Record<string, Tool<any, any>> = {};
  for (const toolName of config.tools) {
    const tool = TOOL_INSTANCES[toolName];
    if (tool) {
      tools[toolName] = tool;
    } else {
      // biome-ignore lint/suspicious/noConsole: Intentional warning for unmapped tools during development
      console.warn(
        `[createAgent] Tool '${toolName}' not found in TOOL_INSTANCES for agent '${agentType}'`
      );
    }
  }

  // Use dynamic model function to get the global model from RequestContext
  // The global model is set via requestContext.set("model", globalModel) by the caller
  const dynamicModel = ({ requestContext }: { requestContext: RequestContext }) => {
    const runtimeModel = requestContext?.get("model") as string | undefined;
    return getModelIdForRuntime(runtimeModel);
  };

  return new Agent({
    id: config.type,
    name: config.name,
    instructions: systemPrompt,
    model: dynamicModel,
    tools: Object.keys(tools).length > 0 ? tools : undefined,
  });
}

// ============================================
// Agent Instances
// ============================================

/** Technical Analyst - Analyzes price action and indicators */
export const technicalAnalystAgent = createAgent("technical_analyst");

/** News & Sentiment Analyst - Assesses news impact */
export const newsAnalystAgent = createAgent("news_analyst");

/** Fundamentals & Macro Analyst - Evaluates fundamentals */
export const fundamentalsAnalystAgent = createAgent("fundamentals_analyst");

/** Bullish Researcher - Constructs the long case */
export const bullishResearcherAgent = createAgent("bullish_researcher");

/** Bearish Researcher - Constructs the short/avoid case */
export const bearishResearcherAgent = createAgent("bearish_researcher");

/** Trader - Synthesizes into DecisionPlan */
export const traderAgent = createAgent("trader");

/** Risk Manager - Validates against constraints */
export const riskManagerAgent = createAgent("risk_manager");

/** Critic - Checks logical consistency */
export const criticAgent = createAgent("critic");

/** Idea Agent - Generates alpha factor hypotheses */
export const ideaAgentAgent = createAgent("idea_agent");

/** Indicator Researcher - Formulates indicator hypotheses */
export const indicatorResearcherAgent = createAgent("indicator_researcher");

// ============================================
// Agent Registry
// ============================================

export const mastraAgents = {
  technical_analyst: technicalAnalystAgent,
  news_analyst: newsAnalystAgent,
  fundamentals_analyst: fundamentalsAnalystAgent,
  bullish_researcher: bullishResearcherAgent,
  bearish_researcher: bearishResearcherAgent,
  trader: traderAgent,
  risk_manager: riskManagerAgent,
  critic: criticAgent,
  idea_agent: ideaAgentAgent,
  indicator_researcher: indicatorResearcherAgent,
} as const;

export type MastraAgentRegistry = typeof mastraAgents;

// ============================================
// Agent Execution Functions
// ============================================

/**
 * Agent configuration from runtime config
 */
export interface AgentConfigEntry {
  model: string;
  enabled: boolean;
  systemPromptOverride?: string | null;
}

export interface AgentContext {
  cycleId: string;
  symbols: string[];
  snapshots: Record<string, unknown>;
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
 * Default temperature for agent generation (deterministic outputs for trading decisions).
 * Not configurable - hardcoded for consistency and safety.
 */
const DEFAULT_TEMPERATURE = 0.3;

/**
 * Runtime settings for agent execution including model and prompt overrides.
 * Temperature is fixed at 0.3 for deterministic outputs.
 * maxTokens is omitted to use model's natural maximum (AI SDK default).
 */
interface AgentRuntimeSettings {
  model?: string;
  systemPromptOverride?: string | null;
}

/**
 * Get runtime settings for an agent from context config.
 */
function getAgentRuntimeSettings(
  agentType: AgentType,
  agentConfigs?: Partial<Record<AgentType, AgentConfigEntry>>
): AgentRuntimeSettings {
  const config = agentConfigs?.[agentType];
  if (config) {
    return {
      model: config.model,
      systemPromptOverride: config.systemPromptOverride,
    };
  }
  return {};
}

/**
 * Create a RequestContext with model configuration for runtime model selection.
 */
function createRequestContext(model?: string): RequestContext {
  const ctx = new RequestContext();
  if (model) {
    ctx.set("model", model);
  }
  return ctx;
}

/**
 * Build generation options with model settings, runtime context, and optional instruction override.
 * Uses fixed temperature (0.3) and model's natural max tokens.
 */
function buildGenerateOptions(
  settings: AgentRuntimeSettings,
  structuredOutput: { schema: z.ZodType }
): {
  structuredOutput: { schema: z.ZodType };
  modelSettings: { temperature: number };
  requestContext: RequestContext;
  instructions?: string;
} {
  const options: {
    structuredOutput: { schema: z.ZodType };
    modelSettings: { temperature: number };
    requestContext: RequestContext;
    instructions?: string;
  } = {
    structuredOutput,
    modelSettings: {
      temperature: DEFAULT_TEMPERATURE,
    },
    requestContext: createRequestContext(settings.model),
  };

  // Apply system prompt override if configured
  if (settings.systemPromptOverride) {
    options.instructions = settings.systemPromptOverride;
  }

  return options;
}

/**
 * Build regime context section for prompts.
 */
function buildRegimeContext(regimeLabels?: AgentContext["regimeLabels"]): string {
  if (!regimeLabels || Object.keys(regimeLabels).length === 0) {
    return "";
  }

  const lines = Object.entries(regimeLabels).map(([symbol, data]) => {
    const confidence = (data.confidence * 100).toFixed(0);
    return `- ${symbol}: ${data.regime} (${confidence}% confidence)${data.reasoning ? ` - ${data.reasoning}` : ""}`;
  });

  return `\nMarket Regime Classifications:
${lines.join("\n")}
`;
}

/**
 * Build Factor Zoo context section for prompts.
 * Includes Mega-Alpha signal, active factors with weights, and decay alerts.
 */
function buildFactorZooContext(factorZoo?: AgentContext["factorZoo"]): string {
  if (!factorZoo) {
    return "";
  }

  const megaAlphaSignal = factorZoo.megaAlpha >= 0 ? "BULLISH" : "BEARISH";
  const megaAlphaStrength = Math.abs(factorZoo.megaAlpha);

  // Build factor lines with weight and decay status
  const factorLines = factorZoo.activeFactors
    .filter((f) => f.weight > 0.01) // Only show factors with meaningful weight
    .sort((a, b) => b.weight - a.weight) // Sort by weight descending
    .slice(0, 10) // Top 10 factors
    .map((f) => {
      const decayFlag = f.isDecaying ? " ⚠️ DECAYING" : "";
      return `  - ${f.name}: ${(f.weight * 100).toFixed(1)}% weight, IC=${f.recentIC.toFixed(3)}${decayFlag}`;
    });

  // Build alert lines
  const alertLines = factorZoo.decayAlerts
    .filter((a) => a.severity === "CRITICAL")
    .slice(0, 5)
    .map((a) => `  - ${a.factorId}: ${a.alertType} (${a.recommendation})`);

  let output = `
Factor Zoo Quantitative Signals:
- Mega-Alpha: ${factorZoo.megaAlpha.toFixed(3)} (${megaAlphaSignal}, strength: ${(megaAlphaStrength * 100).toFixed(0)}%)
- Active Factors: ${factorZoo.stats.activeCount}/${factorZoo.stats.totalFactors} (avg IC: ${factorZoo.stats.averageIC.toFixed(3)})
- Decaying Factors: ${factorZoo.stats.decayingCount}

Top Weighted Factors:
${factorLines.join("\n")}`;

  if (alertLines.length > 0) {
    output += `

Critical Decay Alerts:
${alertLines.join("\n")}`;
  }

  return output;
}

/**
 * Build prediction market context section for prompts.
 * Includes Fed rate probabilities, recession risk, and policy event risk.
 */
function buildPredictionMarketContext(
  predictionMarketSignals?: AgentContext["predictionMarketSignals"]
): string {
  if (!predictionMarketSignals) {
    return "";
  }

  const lines: string[] = [];

  // Fed rate probabilities
  if (
    predictionMarketSignals.fedCutProbability !== undefined ||
    predictionMarketSignals.fedHikeProbability !== undefined
  ) {
    const cutProb = predictionMarketSignals.fedCutProbability;
    const hikeProb = predictionMarketSignals.fedHikeProbability;
    if (cutProb !== undefined) {
      lines.push(`- Fed Rate Cut Probability: ${(cutProb * 100).toFixed(1)}%`);
    }
    if (hikeProb !== undefined) {
      lines.push(`- Fed Rate Hike Probability: ${(hikeProb * 100).toFixed(1)}%`);
    }
  }

  // Recession probability
  if (predictionMarketSignals.recessionProbability12m !== undefined) {
    lines.push(
      `- 12-Month Recession Probability: ${(predictionMarketSignals.recessionProbability12m * 100).toFixed(1)}%`
    );
  }

  // Macro uncertainty and policy event risk
  if (predictionMarketSignals.macroUncertaintyIndex !== undefined) {
    const uncertainty = predictionMarketSignals.macroUncertaintyIndex;
    const level = uncertainty > 0.7 ? "HIGH" : uncertainty > 0.4 ? "MODERATE" : "LOW";
    lines.push(`- Macro Uncertainty Index: ${(uncertainty * 100).toFixed(1)}% (${level})`);
  }

  if (predictionMarketSignals.policyEventRisk !== undefined) {
    lines.push(
      `- Policy Event Risk: ${(predictionMarketSignals.policyEventRisk * 100).toFixed(1)}%`
    );
  }

  // Economic surprise directions
  if (predictionMarketSignals.cpiSurpriseDirection !== undefined) {
    const cpiDir = predictionMarketSignals.cpiSurpriseDirection > 0 ? "HIGHER" : "LOWER";
    lines.push(
      `- CPI Surprise Direction: ${cpiDir} (${Math.abs(predictionMarketSignals.cpiSurpriseDirection * 100).toFixed(1)}%)`
    );
  }

  if (predictionMarketSignals.gdpSurpriseDirection !== undefined) {
    const gdpDir = predictionMarketSignals.gdpSurpriseDirection > 0 ? "HIGHER" : "LOWER";
    lines.push(
      `- GDP Surprise Direction: ${gdpDir} (${Math.abs(predictionMarketSignals.gdpSurpriseDirection * 100).toFixed(1)}%)`
    );
  }

  // Market confidence
  if (predictionMarketSignals.marketConfidence !== undefined) {
    lines.push(
      `- Market Confidence: ${(predictionMarketSignals.marketConfidence * 100).toFixed(1)}%`
    );
  }

  if (lines.length === 0) {
    return "";
  }

  const platforms = predictionMarketSignals.platforms?.join(", ") || "Unknown";
  const timestamp = predictionMarketSignals.timestamp || "Unknown";

  return `
Prediction Market Signals (from ${platforms}, updated ${timestamp}):
${lines.join("\n")}
`;
}

/**
 * Run Technical Analyst agent.
 */
export async function runTechnicalAnalyst(
  context: AgentContext
): Promise<TechnicalAnalysisOutput[]> {
  const regimeContext = buildRegimeContext(context.regimeLabels);

  const prompt = `Analyze the following instruments:
${JSON.stringify(context.snapshots, null, 2)}
${regimeContext}
Symbols to analyze: ${context.symbols.join(", ")}
Cycle ID: ${context.cycleId}

Consider the market regime when assessing trend, momentum, and volatility.
Regime context should inform your setup classification and technical thesis.`;

  const settings = getAgentRuntimeSettings("technical_analyst", context.agentConfigs);
  const options = buildGenerateOptions(settings, { schema: z.array(TechnicalAnalysisSchema) });

  const response = await technicalAnalystAgent.generate(
    [{ role: "user", content: prompt }],
    options
  );

  // Ensure we always return an array, even if structured output parsing fails
  const result = response.object as TechnicalAnalysisOutput[] | undefined;
  return result ?? [];
}

/**
 * Run News & Sentiment Analyst agent.
 */
export async function runNewsAnalyst(context: AgentContext): Promise<SentimentAnalysisOutput[]> {
  // Filter recent events relevant to news/sentiment (news, press_release types)
  const newsEvents = (context.recentEvents ?? []).filter(
    (e) => e.sourceType === "news" || e.sourceType === "press_release"
  );

  const prompt = `Analyze news and sentiment for the following instruments:

Current News from Pipeline:
${JSON.stringify(context.externalContext?.news ?? [], null, 2)}

Recent Historical Events (from database):
${JSON.stringify(newsEvents, null, 2)}

Symbols to analyze: ${context.symbols.join(", ")}
Cycle ID: ${context.cycleId}`;

  const settings = getAgentRuntimeSettings("news_analyst", context.agentConfigs);
  const options = buildGenerateOptions(settings, { schema: z.array(SentimentAnalysisSchema) });

  const response = await newsAnalystAgent.generate([{ role: "user", content: prompt }], options);

  // Ensure we always return an array, even if structured output parsing fails
  const result = response.object as SentimentAnalysisOutput[] | undefined;
  return result ?? [];
}

/**
 * Run Fundamentals & Macro Analyst agent.
 */
export async function runFundamentalsAnalyst(
  context: AgentContext
): Promise<FundamentalsAnalysisOutput[]> {
  // Filter recent events relevant to fundamentals (macro, earnings, transcripts)
  const fundamentalEvents = (context.recentEvents ?? []).filter(
    (e) =>
      e.sourceType === "macro" ||
      e.sourceType === "transcript" ||
      e.eventType === "earnings" ||
      e.eventType === "guidance" ||
      e.eventType === "macro_release"
  );

  const regimeContext = buildRegimeContext(context.regimeLabels);
  const predictionMarketContext = buildPredictionMarketContext(context.predictionMarketSignals);

  const prompt = `Analyze fundamentals and macro context for the following instruments:

Current Macro Indicators:
${JSON.stringify(context.externalContext?.macroIndicators ?? {}, null, 2)}
${regimeContext}${predictionMarketContext}
Recent Fundamental/Macro Events (from database):
${JSON.stringify(fundamentalEvents, null, 2)}

Symbols to analyze: ${context.symbols.join(", ")}
Cycle ID: ${context.cycleId}

The market regime classification reflects the current market environment.
Use this context to assess whether fundamental drivers align with or diverge from the regime.
HIGH_VOL regimes may warrant more conservative positioning; BULL_TREND supports growth exposure.

${
  context.predictionMarketSignals
    ? `IMPORTANT: Prediction market signals reflect real-money bets on macro outcomes.
- High Fed cut probability suggests easing expectations - generally supportive for equities
- High recession probability warrants defensive positioning
- High macro uncertainty may justify smaller position sizes
- Use these signals to inform your fundamental thesis and event risk assessment.`
    : ""
}`;

  const settings = getAgentRuntimeSettings("fundamentals_analyst", context.agentConfigs);
  const options = buildGenerateOptions(settings, { schema: z.array(FundamentalsAnalysisSchema) });

  const response = await fundamentalsAnalystAgent.generate(
    [{ role: "user", content: prompt }],
    options
  );

  // Ensure we always return an array, even if structured output parsing fails
  const result = response.object as FundamentalsAnalysisOutput[] | undefined;
  return result ?? [];
}

/**
 * Run all analyst agents in parallel.
 */
export async function runAnalystsParallel(context: AgentContext): Promise<{
  technical: TechnicalAnalysisOutput[];
  news: SentimentAnalysisOutput[];
  fundamentals: FundamentalsAnalysisOutput[];
}> {
  const [technical, news, fundamentals] = await Promise.all([
    runTechnicalAnalyst(context),
    runNewsAnalyst(context),
    runFundamentalsAnalyst(context),
  ]);

  return { technical, news, fundamentals };
}

/**
 * Run Bullish Researcher agent.
 */
export async function runBullishResearcher(
  context: AgentContext,
  analystOutputs: {
    technical: TechnicalAnalysisOutput[];
    news: SentimentAnalysisOutput[];
    fundamentals: FundamentalsAnalysisOutput[];
  }
): Promise<BullishResearchOutput[]> {
  const prompt = `Construct the bullish case for the following instruments based on analyst outputs:

Technical Analysis:
${JSON.stringify(analystOutputs.technical, null, 2)}

News & Sentiment Analysis:
${JSON.stringify(analystOutputs.news, null, 2)}

Fundamentals Analysis:
${JSON.stringify(analystOutputs.fundamentals, null, 2)}

Memory context (similar historical cases):
${JSON.stringify(context.memory ?? {}, null, 2)}

Symbols: ${context.symbols.join(", ")}
Cycle ID: ${context.cycleId}`;

  const settings = getAgentRuntimeSettings("bullish_researcher", context.agentConfigs);
  const options = buildGenerateOptions(settings, { schema: z.array(BullishResearchSchema) });

  const response = await bullishResearcherAgent.generate(
    [{ role: "user", content: prompt }],
    options
  );

  // Ensure we always return an array, even if structured output parsing fails
  const result = response.object as BullishResearchOutput[] | undefined;
  return result ?? [];
}

/**
 * Run Bearish Researcher agent.
 */
export async function runBearishResearcher(
  context: AgentContext,
  analystOutputs: {
    technical: TechnicalAnalysisOutput[];
    news: SentimentAnalysisOutput[];
    fundamentals: FundamentalsAnalysisOutput[];
  }
): Promise<BearishResearchOutput[]> {
  const prompt = `Construct the bearish case for the following instruments based on analyst outputs:

Technical Analysis:
${JSON.stringify(analystOutputs.technical, null, 2)}

News & Sentiment Analysis:
${JSON.stringify(analystOutputs.news, null, 2)}

Fundamentals Analysis:
${JSON.stringify(analystOutputs.fundamentals, null, 2)}

Memory context (similar historical cases):
${JSON.stringify(context.memory ?? {}, null, 2)}

Symbols: ${context.symbols.join(", ")}
Cycle ID: ${context.cycleId}`;

  const settings = getAgentRuntimeSettings("bearish_researcher", context.agentConfigs);
  const options = buildGenerateOptions(settings, { schema: z.array(BearishResearchSchema) });

  const response = await bearishResearcherAgent.generate(
    [{ role: "user", content: prompt }],
    options
  );

  // Ensure we always return an array, even if structured output parsing fails
  const result = response.object as BearishResearchOutput[] | undefined;
  return result ?? [];
}

/**
 * Run both research agents in parallel (debate phase).
 */
export async function runDebateParallel(
  context: AgentContext,
  analystOutputs: {
    technical: TechnicalAnalysisOutput[];
    news: SentimentAnalysisOutput[];
    fundamentals: FundamentalsAnalysisOutput[];
  }
): Promise<{
  bullish: BullishResearchOutput[];
  bearish: BearishResearchOutput[];
}> {
  const [bullish, bearish] = await Promise.all([
    runBullishResearcher(context, analystOutputs),
    runBearishResearcher(context, analystOutputs),
  ]);

  return { bullish, bearish };
}

/**
 * Run Trader agent to synthesize DecisionPlan.
 * Incorporates Factor Zoo signals (Mega-Alpha) when available.
 */
export async function runTrader(
  context: AgentContext,
  debateOutputs: {
    bullish: BullishResearchOutput[];
    bearish: BearishResearchOutput[];
  },
  portfolioState?: Record<string, unknown>
): Promise<DecisionPlan> {
  const factorZooContext = buildFactorZooContext(context.factorZoo);

  const prompt = `Synthesize the debate into a concrete trading plan:

Bullish Research:
${JSON.stringify(debateOutputs.bullish, null, 2)}

Bearish Research:
${JSON.stringify(debateOutputs.bearish, null, 2)}
${factorZooContext}
Current Portfolio State:
${JSON.stringify(portfolioState ?? {}, null, 2)}

Cycle ID: ${context.cycleId}
Timestamp: ${new Date().toISOString()}

${
  context.factorZoo
    ? `IMPORTANT: Factor Zoo signals provide quantitative evidence. The Mega-Alpha signal (${context.factorZoo.megaAlpha.toFixed(3)}) represents the weighted combination of ${context.factorZoo.stats.activeCount} active factors.
- Use Mega-Alpha direction to inform overall market stance
- Weight position sizing by signal strength
- Be cautious of factors showing decay (IC degradation)
- Critical alerts indicate factors losing predictive power`
    : ""
}`;

  const settings = getAgentRuntimeSettings("trader", context.agentConfigs);
  const options = buildGenerateOptions(settings, { schema: DecisionPlanSchema });

  const response = await traderAgent.generate([{ role: "user", content: prompt }], options);

  return response.object as DecisionPlan;
}

/**
 * Run Risk Manager agent to validate plan.
 * Considers Factor Zoo decay alerts as risk factors.
 */
export async function runRiskManager(
  plan: DecisionPlan,
  portfolioState?: Record<string, unknown>,
  constraints?: Record<string, unknown>,
  factorZooContext?: AgentContext["factorZoo"],
  agentConfigs?: Partial<Record<AgentType, AgentConfigEntry>>
): Promise<RiskManagerOutput> {
  const decayRiskSection = factorZooContext?.decayAlerts.length
    ? `
Factor Zoo Risk Alerts:
${factorZooContext.decayAlerts.map((a) => `- ${a.factorId}: ${a.alertType} (${a.severity}) - ${a.recommendation}`).join("\n")}

NOTE: Decaying factors indicate reduced signal reliability. Consider this when validating positions that rely on quantitative signals.`
    : "";

  const prompt = `Validate this trading plan against risk constraints:

Decision Plan:
${JSON.stringify(plan, null, 2)}

Current Portfolio State:
${JSON.stringify(portfolioState ?? {}, null, 2)}

Risk Constraints:
${JSON.stringify(constraints ?? {}, null, 2)}${decayRiskSection}`;

  const settings = getAgentRuntimeSettings("risk_manager", agentConfigs);
  const options = buildGenerateOptions(settings, { schema: RiskManagerOutputSchema });
  // Use lower temperature (0.1) for validation agents to ensure consistent risk assessment
  options.modelSettings.temperature = 0.1;

  const response = await riskManagerAgent.generate([{ role: "user", content: prompt }], options);

  return response.object as RiskManagerOutput;
}

/**
 * Run Critic agent to check logical consistency.
 */
export async function runCritic(
  plan: DecisionPlan,
  analystOutputs: {
    technical: TechnicalAnalysisOutput[];
    news: SentimentAnalysisOutput[];
    fundamentals: FundamentalsAnalysisOutput[];
  },
  debateOutputs: {
    bullish: BullishResearchOutput[];
    bearish: BearishResearchOutput[];
  },
  agentConfigs?: Partial<Record<AgentType, AgentConfigEntry>>
): Promise<CriticOutput> {
  const prompt = `Validate the logical consistency of this trading plan:

Decision Plan:
${JSON.stringify(plan, null, 2)}

Supporting Analyst Outputs:
Technical: ${JSON.stringify(analystOutputs.technical, null, 2)}
News: ${JSON.stringify(analystOutputs.news, null, 2)}
Fundamentals: ${JSON.stringify(analystOutputs.fundamentals, null, 2)}

Debate Outputs:
Bullish: ${JSON.stringify(debateOutputs.bullish, null, 2)}
Bearish: ${JSON.stringify(debateOutputs.bearish, null, 2)}`;

  const settings = getAgentRuntimeSettings("critic", agentConfigs);
  const options = buildGenerateOptions(settings, { schema: CriticOutputSchema });
  // Use lower temperature (0.1) for validation agents to ensure consistent critique
  options.modelSettings.temperature = 0.1;

  const response = await criticAgent.generate([{ role: "user", content: prompt }], options);

  return response.object as CriticOutput;
}

/**
 * Run both approval agents in parallel.
 * Passes Factor Zoo context to Risk Manager for decay-aware validation.
 */
export async function runApprovalParallel(
  plan: DecisionPlan,
  analystOutputs: {
    technical: TechnicalAnalysisOutput[];
    news: SentimentAnalysisOutput[];
    fundamentals: FundamentalsAnalysisOutput[];
  },
  debateOutputs: {
    bullish: BullishResearchOutput[];
    bearish: BearishResearchOutput[];
  },
  portfolioState?: Record<string, unknown>,
  constraints?: Record<string, unknown>,
  factorZooContext?: AgentContext["factorZoo"],
  agentConfigs?: Partial<Record<AgentType, AgentConfigEntry>>
): Promise<{
  riskManager: RiskManagerOutput;
  critic: CriticOutput;
}> {
  const [riskManager, critic] = await Promise.all([
    runRiskManager(plan, portfolioState, constraints, factorZooContext, agentConfigs),
    runCritic(plan, analystOutputs, debateOutputs, agentConfigs),
  ]);

  return { riskManager, critic };
}

// ============================================
// Agent Streaming Types
// ============================================

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
 */
export type OnStreamChunk = (chunk: AgentStreamChunk) => void;

// ============================================
// Agent Streaming Functions
// ============================================

/**
 * Run Technical Analyst agent with streaming.
 * Emits tool calls and reasoning as they occur, returns structured output.
 */
export async function runTechnicalAnalystStreaming(
  context: AgentContext,
  onChunk: OnStreamChunk
): Promise<TechnicalAnalysisOutput[]> {
  const regimeContext = buildRegimeContext(context.regimeLabels);

  const prompt = `Analyze the following instruments:
${JSON.stringify(context.snapshots, null, 2)}
${regimeContext}
Symbols to analyze: ${context.symbols.join(", ")}
Cycle ID: ${context.cycleId}

Consider the market regime when assessing trend, momentum, and volatility.
Regime context should inform your setup classification and technical thesis.`;

  const settings = getAgentRuntimeSettings("technical_analyst", context.agentConfigs);
  const options = buildGenerateOptions(settings, { schema: z.array(TechnicalAnalysisSchema) });

  const stream = await technicalAnalystAgent.stream([{ role: "user", content: prompt }], options);

  for await (const chunk of stream.fullStream) {
    const streamChunk: AgentStreamChunk = {
      type: chunk.type as AgentStreamChunk["type"],
      agentType: "technical_analyst",
      payload: {},
      timestamp: new Date().toISOString(),
    };

    switch (chunk.type) {
      case "text-delta":
        streamChunk.payload.text = chunk.payload.text;
        onChunk(streamChunk);
        break;
      case "tool-call":
        streamChunk.payload.toolName = chunk.payload.toolName;
        streamChunk.payload.toolArgs = chunk.payload.args;
        streamChunk.payload.toolCallId = chunk.payload.toolCallId;
        onChunk(streamChunk);
        break;
      case "tool-result":
        streamChunk.payload.toolCallId = chunk.payload.toolCallId;
        streamChunk.payload.result = chunk.payload.result;
        streamChunk.payload.success = true;
        onChunk(streamChunk);
        break;
      case "reasoning-delta":
        streamChunk.payload.text = chunk.payload.text;
        onChunk(streamChunk);
        break;
      case "error":
        streamChunk.payload.error =
          chunk.payload.error instanceof Error
            ? chunk.payload.error.message
            : String(chunk.payload.error);
        onChunk(streamChunk);
        break;
    }
  }

  // Ensure we always return an array, even if structured output parsing fails
  const result = (await stream.object) as TechnicalAnalysisOutput[] | undefined;
  return result ?? [];
}

/**
 * Run News & Sentiment Analyst agent with streaming.
 */
export async function runNewsAnalystStreaming(
  context: AgentContext,
  onChunk: OnStreamChunk
): Promise<SentimentAnalysisOutput[]> {
  const newsEvents = (context.recentEvents ?? []).filter(
    (e) => e.sourceType === "news" || e.sourceType === "press_release"
  );

  const prompt = `Analyze news and sentiment for the following instruments:

Current News from Pipeline:
${JSON.stringify(context.externalContext?.news ?? [], null, 2)}

Recent Historical Events (from database):
${JSON.stringify(newsEvents, null, 2)}

Symbols to analyze: ${context.symbols.join(", ")}
Cycle ID: ${context.cycleId}`;

  const settings = getAgentRuntimeSettings("news_analyst", context.agentConfigs);
  const options = buildGenerateOptions(settings, { schema: z.array(SentimentAnalysisSchema) });

  const stream = await newsAnalystAgent.stream([{ role: "user", content: prompt }], options);

  for await (const chunk of stream.fullStream) {
    const streamChunk: AgentStreamChunk = {
      type: chunk.type as AgentStreamChunk["type"],
      agentType: "news_analyst",
      payload: {},
      timestamp: new Date().toISOString(),
    };

    switch (chunk.type) {
      case "text-delta":
        streamChunk.payload.text = chunk.payload.text;
        onChunk(streamChunk);
        break;
      case "tool-call":
        streamChunk.payload.toolName = chunk.payload.toolName;
        streamChunk.payload.toolArgs = chunk.payload.args;
        streamChunk.payload.toolCallId = chunk.payload.toolCallId;
        onChunk(streamChunk);
        break;
      case "tool-result":
        streamChunk.payload.toolCallId = chunk.payload.toolCallId;
        streamChunk.payload.result = chunk.payload.result;
        streamChunk.payload.success = true;
        onChunk(streamChunk);
        break;
      case "reasoning-delta":
        streamChunk.payload.text = chunk.payload.text;
        onChunk(streamChunk);
        break;
      case "error":
        streamChunk.payload.error =
          chunk.payload.error instanceof Error
            ? chunk.payload.error.message
            : String(chunk.payload.error);
        onChunk(streamChunk);
        break;
    }
  }

  // Ensure we always return an array, even if structured output parsing fails
  const result = (await stream.object) as SentimentAnalysisOutput[] | undefined;
  return result ?? [];
}

/**
 * Run Fundamentals & Macro Analyst agent with streaming.
 */
export async function runFundamentalsAnalystStreaming(
  context: AgentContext,
  onChunk: OnStreamChunk
): Promise<FundamentalsAnalysisOutput[]> {
  const fundamentalEvents = (context.recentEvents ?? []).filter(
    (e) =>
      e.sourceType === "macro" ||
      e.sourceType === "transcript" ||
      e.eventType === "earnings" ||
      e.eventType === "guidance" ||
      e.eventType === "macro_release"
  );

  const regimeContext = buildRegimeContext(context.regimeLabels);
  const predictionMarketContext = buildPredictionMarketContext(context.predictionMarketSignals);

  const prompt = `Analyze fundamentals and macro context for the following instruments:

Current Macro Indicators:
${JSON.stringify(context.externalContext?.macroIndicators ?? {}, null, 2)}
${regimeContext}${predictionMarketContext}
Recent Fundamental/Macro Events (from database):
${JSON.stringify(fundamentalEvents, null, 2)}

Symbols to analyze: ${context.symbols.join(", ")}
Cycle ID: ${context.cycleId}

The market regime classification reflects the current market environment.
Use this context to assess whether fundamental drivers align with or diverge from the regime.
HIGH_VOL regimes may warrant more conservative positioning; BULL_TREND supports growth exposure.

${
  context.predictionMarketSignals
    ? `IMPORTANT: Prediction market signals reflect real-money bets on macro outcomes.
- High Fed cut probability suggests easing expectations - generally supportive for equities
- High recession probability warrants defensive positioning
- High macro uncertainty may justify smaller position sizes
- Use these signals to inform your fundamental thesis and event risk assessment.`
    : ""
}`;

  const settings = getAgentRuntimeSettings("fundamentals_analyst", context.agentConfigs);
  const options = buildGenerateOptions(settings, { schema: z.array(FundamentalsAnalysisSchema) });

  const stream = await fundamentalsAnalystAgent.stream(
    [{ role: "user", content: prompt }],
    options
  );

  for await (const chunk of stream.fullStream) {
    const streamChunk: AgentStreamChunk = {
      type: chunk.type as AgentStreamChunk["type"],
      agentType: "fundamentals_analyst",
      payload: {},
      timestamp: new Date().toISOString(),
    };

    switch (chunk.type) {
      case "text-delta":
        streamChunk.payload.text = chunk.payload.text;
        onChunk(streamChunk);
        break;
      case "tool-call":
        streamChunk.payload.toolName = chunk.payload.toolName;
        streamChunk.payload.toolArgs = chunk.payload.args;
        streamChunk.payload.toolCallId = chunk.payload.toolCallId;
        onChunk(streamChunk);
        break;
      case "tool-result":
        streamChunk.payload.toolCallId = chunk.payload.toolCallId;
        streamChunk.payload.result = chunk.payload.result;
        streamChunk.payload.success = true;
        onChunk(streamChunk);
        break;
      case "reasoning-delta":
        streamChunk.payload.text = chunk.payload.text;
        onChunk(streamChunk);
        break;
      case "error":
        streamChunk.payload.error =
          chunk.payload.error instanceof Error
            ? chunk.payload.error.message
            : String(chunk.payload.error);
        onChunk(streamChunk);
        break;
    }
  }

  // Ensure we always return an array, even if structured output parsing fails
  const result = (await stream.object) as FundamentalsAnalysisOutput[] | undefined;
  return result ?? [];
}

/**
 * Run all analyst agents in parallel with streaming.
 */
export async function runAnalystsParallelStreaming(
  context: AgentContext,
  onChunk: OnStreamChunk
): Promise<{
  technical: TechnicalAnalysisOutput[];
  news: SentimentAnalysisOutput[];
  fundamentals: FundamentalsAnalysisOutput[];
}> {
  const [technical, news, fundamentals] = await Promise.all([
    runTechnicalAnalystStreaming(context, onChunk),
    runNewsAnalystStreaming(context, onChunk),
    runFundamentalsAnalystStreaming(context, onChunk),
  ]);

  return { technical, news, fundamentals };
}

/**
 * Run Bullish Researcher agent with streaming.
 */
export async function runBullishResearcherStreaming(
  context: AgentContext,
  analystOutputs: {
    technical: TechnicalAnalysisOutput[];
    news: SentimentAnalysisOutput[];
    fundamentals: FundamentalsAnalysisOutput[];
  },
  onChunk: OnStreamChunk
): Promise<BullishResearchOutput[]> {
  const prompt = `Construct the bullish case for the following instruments based on analyst outputs:

Technical Analysis:
${JSON.stringify(analystOutputs.technical, null, 2)}

News & Sentiment Analysis:
${JSON.stringify(analystOutputs.news, null, 2)}

Fundamentals Analysis:
${JSON.stringify(analystOutputs.fundamentals, null, 2)}

Memory context (similar historical cases):
${JSON.stringify(context.memory ?? {}, null, 2)}

Symbols: ${context.symbols.join(", ")}
Cycle ID: ${context.cycleId}`;

  const settings = getAgentRuntimeSettings("bullish_researcher", context.agentConfigs);
  const options = buildGenerateOptions(settings, { schema: z.array(BullishResearchSchema) });

  const stream = await bullishResearcherAgent.stream([{ role: "user", content: prompt }], options);

  for await (const chunk of stream.fullStream) {
    const streamChunk: AgentStreamChunk = {
      type: chunk.type as AgentStreamChunk["type"],
      agentType: "bullish_researcher",
      payload: {},
      timestamp: new Date().toISOString(),
    };

    switch (chunk.type) {
      case "text-delta":
        streamChunk.payload.text = chunk.payload.text;
        onChunk(streamChunk);
        break;
      case "tool-call":
        streamChunk.payload.toolName = chunk.payload.toolName;
        streamChunk.payload.toolArgs = chunk.payload.args;
        streamChunk.payload.toolCallId = chunk.payload.toolCallId;
        onChunk(streamChunk);
        break;
      case "tool-result":
        streamChunk.payload.toolCallId = chunk.payload.toolCallId;
        streamChunk.payload.result = chunk.payload.result;
        streamChunk.payload.success = true;
        onChunk(streamChunk);
        break;
      case "reasoning-delta":
        streamChunk.payload.text = chunk.payload.text;
        onChunk(streamChunk);
        break;
      case "error":
        streamChunk.payload.error =
          chunk.payload.error instanceof Error
            ? chunk.payload.error.message
            : String(chunk.payload.error);
        onChunk(streamChunk);
        break;
    }
  }

  // Ensure we always return an array, even if structured output parsing fails
  const result = (await stream.object) as BullishResearchOutput[] | undefined;
  return result ?? [];
}

/**
 * Run Bearish Researcher agent with streaming.
 */
export async function runBearishResearcherStreaming(
  context: AgentContext,
  analystOutputs: {
    technical: TechnicalAnalysisOutput[];
    news: SentimentAnalysisOutput[];
    fundamentals: FundamentalsAnalysisOutput[];
  },
  onChunk: OnStreamChunk
): Promise<BearishResearchOutput[]> {
  const prompt = `Construct the bearish case for the following instruments based on analyst outputs:

Technical Analysis:
${JSON.stringify(analystOutputs.technical, null, 2)}

News & Sentiment Analysis:
${JSON.stringify(analystOutputs.news, null, 2)}

Fundamentals Analysis:
${JSON.stringify(analystOutputs.fundamentals, null, 2)}

Memory context (similar historical cases):
${JSON.stringify(context.memory ?? {}, null, 2)}

Symbols: ${context.symbols.join(", ")}
Cycle ID: ${context.cycleId}`;

  const settings = getAgentRuntimeSettings("bearish_researcher", context.agentConfigs);
  const options = buildGenerateOptions(settings, { schema: z.array(BearishResearchSchema) });

  const stream = await bearishResearcherAgent.stream([{ role: "user", content: prompt }], options);

  for await (const chunk of stream.fullStream) {
    const streamChunk: AgentStreamChunk = {
      type: chunk.type as AgentStreamChunk["type"],
      agentType: "bearish_researcher",
      payload: {},
      timestamp: new Date().toISOString(),
    };

    switch (chunk.type) {
      case "text-delta":
        streamChunk.payload.text = chunk.payload.text;
        onChunk(streamChunk);
        break;
      case "tool-call":
        streamChunk.payload.toolName = chunk.payload.toolName;
        streamChunk.payload.toolArgs = chunk.payload.args;
        streamChunk.payload.toolCallId = chunk.payload.toolCallId;
        onChunk(streamChunk);
        break;
      case "tool-result":
        streamChunk.payload.toolCallId = chunk.payload.toolCallId;
        streamChunk.payload.result = chunk.payload.result;
        streamChunk.payload.success = true;
        onChunk(streamChunk);
        break;
      case "reasoning-delta":
        streamChunk.payload.text = chunk.payload.text;
        onChunk(streamChunk);
        break;
      case "error":
        streamChunk.payload.error =
          chunk.payload.error instanceof Error
            ? chunk.payload.error.message
            : String(chunk.payload.error);
        onChunk(streamChunk);
        break;
    }
  }

  // Ensure we always return an array, even if structured output parsing fails
  const result = (await stream.object) as BearishResearchOutput[] | undefined;
  return result ?? [];
}

/**
 * Run both research agents in parallel with streaming (debate phase).
 */
export async function runDebateParallelStreaming(
  context: AgentContext,
  analystOutputs: {
    technical: TechnicalAnalysisOutput[];
    news: SentimentAnalysisOutput[];
    fundamentals: FundamentalsAnalysisOutput[];
  },
  onChunk: OnStreamChunk
): Promise<{
  bullish: BullishResearchOutput[];
  bearish: BearishResearchOutput[];
}> {
  const [bullish, bearish] = await Promise.all([
    runBullishResearcherStreaming(context, analystOutputs, onChunk),
    runBearishResearcherStreaming(context, analystOutputs, onChunk),
  ]);

  return { bullish, bearish };
}

/**
 * Run Trader agent with streaming.
 */
export async function runTraderStreaming(
  context: AgentContext,
  debateOutputs: {
    bullish: BullishResearchOutput[];
    bearish: BearishResearchOutput[];
  },
  onChunk: OnStreamChunk,
  portfolioState?: Record<string, unknown>
): Promise<DecisionPlan> {
  const factorZooContext = buildFactorZooContext(context.factorZoo);

  const prompt = `Synthesize the debate into a concrete trading plan:

Bullish Research:
${JSON.stringify(debateOutputs.bullish, null, 2)}

Bearish Research:
${JSON.stringify(debateOutputs.bearish, null, 2)}
${factorZooContext}
Current Portfolio State:
${JSON.stringify(portfolioState ?? {}, null, 2)}

Cycle ID: ${context.cycleId}
Timestamp: ${new Date().toISOString()}

${
  context.factorZoo
    ? `IMPORTANT: Factor Zoo signals provide quantitative evidence. The Mega-Alpha signal (${context.factorZoo.megaAlpha.toFixed(3)}) represents the weighted combination of ${context.factorZoo.stats.activeCount} active factors.
- Use Mega-Alpha direction to inform overall market stance
- Weight position sizing by signal strength
- Be cautious of factors showing decay (IC degradation)
- Critical alerts indicate factors losing predictive power`
    : ""
}`;

  const settings = getAgentRuntimeSettings("trader", context.agentConfigs);
  const options = buildGenerateOptions(settings, { schema: DecisionPlanSchema });

  const stream = await traderAgent.stream([{ role: "user", content: prompt }], options);

  for await (const chunk of stream.fullStream) {
    const streamChunk: AgentStreamChunk = {
      type: chunk.type as AgentStreamChunk["type"],
      agentType: "trader",
      payload: {},
      timestamp: new Date().toISOString(),
    };

    switch (chunk.type) {
      case "text-delta":
        streamChunk.payload.text = chunk.payload.text;
        onChunk(streamChunk);
        break;
      case "tool-call":
        streamChunk.payload.toolName = chunk.payload.toolName;
        streamChunk.payload.toolArgs = chunk.payload.args;
        streamChunk.payload.toolCallId = chunk.payload.toolCallId;
        onChunk(streamChunk);
        break;
      case "tool-result":
        streamChunk.payload.toolCallId = chunk.payload.toolCallId;
        streamChunk.payload.result = chunk.payload.result;
        streamChunk.payload.success = true;
        onChunk(streamChunk);
        break;
      case "reasoning-delta":
        streamChunk.payload.text = chunk.payload.text;
        onChunk(streamChunk);
        break;
      case "error":
        streamChunk.payload.error =
          chunk.payload.error instanceof Error
            ? chunk.payload.error.message
            : String(chunk.payload.error);
        onChunk(streamChunk);
        break;
    }
  }

  return (await stream.object) as DecisionPlan;
}

/**
 * Run Risk Manager agent with streaming.
 */
export async function runRiskManagerStreaming(
  plan: DecisionPlan,
  onChunk: OnStreamChunk,
  portfolioState?: Record<string, unknown>,
  constraints?: Record<string, unknown>,
  factorZooContext?: AgentContext["factorZoo"],
  agentConfigs?: Partial<Record<AgentType, AgentConfigEntry>>
): Promise<RiskManagerOutput> {
  const decayRiskSection = factorZooContext?.decayAlerts.length
    ? `
Factor Zoo Risk Alerts:
${factorZooContext.decayAlerts.map((a) => `- ${a.factorId}: ${a.alertType} (${a.severity}) - ${a.recommendation}`).join("\n")}

NOTE: Decaying factors indicate reduced signal reliability. Consider this when validating positions that rely on quantitative signals.`
    : "";

  const prompt = `Validate this trading plan against risk constraints:

Decision Plan:
${JSON.stringify(plan, null, 2)}

Current Portfolio State:
${JSON.stringify(portfolioState ?? {}, null, 2)}

Risk Constraints:
${JSON.stringify(constraints ?? {}, null, 2)}${decayRiskSection}`;

  const settings = getAgentRuntimeSettings("risk_manager", agentConfigs);
  const options = buildGenerateOptions(settings, { schema: RiskManagerOutputSchema });
  options.modelSettings.temperature = 0.1;

  const stream = await riskManagerAgent.stream([{ role: "user", content: prompt }], options);

  for await (const chunk of stream.fullStream) {
    const streamChunk: AgentStreamChunk = {
      type: chunk.type as AgentStreamChunk["type"],
      agentType: "risk_manager",
      payload: {},
      timestamp: new Date().toISOString(),
    };

    switch (chunk.type) {
      case "text-delta":
        streamChunk.payload.text = chunk.payload.text;
        onChunk(streamChunk);
        break;
      case "tool-call":
        streamChunk.payload.toolName = chunk.payload.toolName;
        streamChunk.payload.toolArgs = chunk.payload.args;
        streamChunk.payload.toolCallId = chunk.payload.toolCallId;
        onChunk(streamChunk);
        break;
      case "tool-result":
        streamChunk.payload.toolCallId = chunk.payload.toolCallId;
        streamChunk.payload.result = chunk.payload.result;
        streamChunk.payload.success = true;
        onChunk(streamChunk);
        break;
      case "reasoning-delta":
        streamChunk.payload.text = chunk.payload.text;
        onChunk(streamChunk);
        break;
      case "error":
        streamChunk.payload.error =
          chunk.payload.error instanceof Error
            ? chunk.payload.error.message
            : String(chunk.payload.error);
        onChunk(streamChunk);
        break;
    }
  }

  return (await stream.object) as RiskManagerOutput;
}

/**
 * Run Critic agent with streaming.
 */
export async function runCriticStreaming(
  plan: DecisionPlan,
  analystOutputs: {
    technical: TechnicalAnalysisOutput[];
    news: SentimentAnalysisOutput[];
    fundamentals: FundamentalsAnalysisOutput[];
  },
  debateOutputs: {
    bullish: BullishResearchOutput[];
    bearish: BearishResearchOutput[];
  },
  onChunk: OnStreamChunk,
  agentConfigs?: Partial<Record<AgentType, AgentConfigEntry>>
): Promise<CriticOutput> {
  const prompt = `Validate the logical consistency of this trading plan:

Decision Plan:
${JSON.stringify(plan, null, 2)}

Supporting Analyst Outputs:
Technical: ${JSON.stringify(analystOutputs.technical, null, 2)}
News: ${JSON.stringify(analystOutputs.news, null, 2)}
Fundamentals: ${JSON.stringify(analystOutputs.fundamentals, null, 2)}

Debate Outputs:
Bullish: ${JSON.stringify(debateOutputs.bullish, null, 2)}
Bearish: ${JSON.stringify(debateOutputs.bearish, null, 2)}`;

  const settings = getAgentRuntimeSettings("critic", agentConfigs);
  const options = buildGenerateOptions(settings, { schema: CriticOutputSchema });
  options.modelSettings.temperature = 0.1;

  const stream = await criticAgent.stream([{ role: "user", content: prompt }], options);

  for await (const chunk of stream.fullStream) {
    const streamChunk: AgentStreamChunk = {
      type: chunk.type as AgentStreamChunk["type"],
      agentType: "critic",
      payload: {},
      timestamp: new Date().toISOString(),
    };

    switch (chunk.type) {
      case "text-delta":
        streamChunk.payload.text = chunk.payload.text;
        onChunk(streamChunk);
        break;
      case "tool-call":
        streamChunk.payload.toolName = chunk.payload.toolName;
        streamChunk.payload.toolArgs = chunk.payload.args;
        streamChunk.payload.toolCallId = chunk.payload.toolCallId;
        onChunk(streamChunk);
        break;
      case "tool-result":
        streamChunk.payload.toolCallId = chunk.payload.toolCallId;
        streamChunk.payload.result = chunk.payload.result;
        streamChunk.payload.success = true;
        onChunk(streamChunk);
        break;
      case "reasoning-delta":
        streamChunk.payload.text = chunk.payload.text;
        onChunk(streamChunk);
        break;
      case "error":
        streamChunk.payload.error =
          chunk.payload.error instanceof Error
            ? chunk.payload.error.message
            : String(chunk.payload.error);
        onChunk(streamChunk);
        break;
    }
  }

  return (await stream.object) as CriticOutput;
}

/**
 * Run both approval agents in parallel with streaming.
 */
export async function runApprovalParallelStreaming(
  plan: DecisionPlan,
  analystOutputs: {
    technical: TechnicalAnalysisOutput[];
    news: SentimentAnalysisOutput[];
    fundamentals: FundamentalsAnalysisOutput[];
  },
  debateOutputs: {
    bullish: BullishResearchOutput[];
    bearish: BearishResearchOutput[];
  },
  onChunk: OnStreamChunk,
  portfolioState?: Record<string, unknown>,
  constraints?: Record<string, unknown>,
  factorZooContext?: AgentContext["factorZoo"],
  agentConfigs?: Partial<Record<AgentType, AgentConfigEntry>>
): Promise<{
  riskManager: RiskManagerOutput;
  critic: CriticOutput;
}> {
  const [riskManager, critic] = await Promise.all([
    runRiskManagerStreaming(
      plan,
      onChunk,
      portfolioState,
      constraints,
      factorZooContext,
      agentConfigs
    ),
    runCriticStreaming(plan, analystOutputs, debateOutputs, onChunk, agentConfigs),
  ]);

  return { riskManager, critic };
}

/**
 * Revise a plan based on rejection feedback.
 */
export async function revisePlan(
  originalPlan: DecisionPlan,
  rejectionReasons: string[],
  _analystOutputs: {
    technical: TechnicalAnalysisOutput[];
    news: SentimentAnalysisOutput[];
    fundamentals: FundamentalsAnalysisOutput[];
  },
  debateOutputs: {
    bullish: BullishResearchOutput[];
    bearish: BearishResearchOutput[];
  },
  agentConfigs?: Partial<Record<AgentType, AgentConfigEntry>>
): Promise<DecisionPlan> {
  const prompt = `Revise the following trading plan based on the rejection feedback:

Original Plan:
${JSON.stringify(originalPlan, null, 2)}

Rejection Reasons:
${rejectionReasons.map((r) => `- ${r}`).join("\n")}

Supporting Context (for reference):
Bullish Research: ${JSON.stringify(debateOutputs.bullish, null, 2)}
Bearish Research: ${JSON.stringify(debateOutputs.bearish, null, 2)}

Please address ALL rejection reasons and produce a revised plan that:
1. Fixes all constraint violations
2. Addresses all logical inconsistencies
3. Removes any unsupported claims
4. Maintains proper stop-loss and take-profit levels`;

  const settings = getAgentRuntimeSettings("trader", agentConfigs);
  const options = buildGenerateOptions(settings, { schema: DecisionPlanSchema });

  const response = await traderAgent.generate([{ role: "user", content: prompt }], options);

  return response.object as DecisionPlan;
}

// ============================================
// Research Agent Execution Functions
// ============================================

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

/**
 * Run Idea Agent to generate alpha factor hypotheses.
 */
export async function runIdeaAgent(context: IdeaAgentContext): Promise<IdeaAgentOutput> {
  const decayingInfo =
    context.decayingFactors.length > 0
      ? context.decayingFactors
          .map((f) => `${f.id} (decay rate: ${f.decayRate.toFixed(4)}/day)`)
          .join(", ")
      : "None currently decaying";

  const memoryInfo =
    context.memoryResults && context.memoryResults.length > 0
      ? JSON.stringify(
          context.memoryResults.map((h) => ({
            id: h.hypothesisId,
            title: h.title,
            status: h.status,
            regime: h.targetRegime,
            ic: h.ic,
            lessons: h.lessonsLearned,
          })),
          null,
          2
        )
      : "No similar past hypotheses found";

  const prompt = `<context>
<trigger>
Type: ${context.trigger.type}
Severity: ${context.trigger.severity}
Suggested Focus: ${context.trigger.suggestedFocus}
Affected Factors: ${context.trigger.affectedFactors.join(", ") || "None specifically"}
Detected At: ${context.trigger.detectedAt}
</trigger>

<market_state>
Current Regime: ${context.regime}
Uncovered Regimes: ${context.gaps.length > 0 ? context.gaps.join(", ") : "All regimes covered"}
Decaying Factors: ${decayingInfo}
</market_state>

<factor_zoo>
${context.factorZooSummary}
</factor_zoo>

<memory_context>
Similar Past Hypotheses:
${memoryInfo}
</memory_context>
</context>

<task>
Generate a novel alpha factor hypothesis that addresses the research trigger.

Requirements:
1. Target the ${context.trigger.type === "REGIME_GAP" ? `uncovered ${context.regime} regime` : "current market conditions"}
2. ${context.trigger.type === "ALPHA_DECAY" ? `Consider replacing or improving on: ${context.trigger.affectedFactors.join(", ")}` : "Focus on novel alpha sources"}
3. Use web search to find supporting academic research
4. Ensure the hypothesis is sufficiently different from existing factors

Output a complete hypothesis.
</task>`;

  const settings = getAgentRuntimeSettings("idea_agent", context.agentConfigs);
  const options = buildGenerateOptions(settings, { schema: IdeaAgentOutputSchema });

  const response = await ideaAgentAgent.generate([{ role: "user", content: prompt }], options);

  return response.object as IdeaAgentOutput;
}

/**
 * Run Indicator Researcher agent to formulate indicator hypotheses.
 */
export async function runIndicatorResearcher(
  input: ResearcherInput,
  agentConfigs?: Partial<Record<AgentType, AgentConfigEntry>>
): Promise<IndicatorHypothesis> {
  const prompt = buildResearcherPrompt(input);

  const settings = getAgentRuntimeSettings("indicator_researcher", agentConfigs);
  const options = buildGenerateOptions(settings, { schema: IndicatorHypothesisSchema });

  const response = await indicatorResearcherAgent.generate(
    [{ role: "user", content: prompt }],
    options
  );

  return response.object as IndicatorHypothesis;
}
