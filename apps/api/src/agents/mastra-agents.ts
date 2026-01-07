/**
 * Real Mastra Agent Implementation
 *
 * Creates actual Mastra Agent instances configured with Google Gemini models.
 * These agents use the prompts and configs from @cream/mastra-kit.
 *
 * Model routing:
 * - Pro model (gemini-2.0-flash): Complex reasoning (analysts, researchers, trader)
 * - Flash model (gemini-2.0-flash): Fast validation (risk manager, critic)
 *
 * @see docs/plans/05-agents.md
 */

import {
  AGENT_CONFIGS,
  AGENT_PROMPTS,
  type AgentType,
  type BearishResearchOutput,
  type BullishResearchOutput,
  type CriticOutput,
  type DecisionPlan,
  type FundamentalsAnalysisOutput,
  type RiskManagerOutput,
  type SentimentAnalysisOutput,
  type TechnicalAnalysisOutput,
} from "@cream/mastra-kit";
import { Agent } from "@mastra/core/agent";
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
 * Map internal model names to Mastra model identifiers.
 * Using gemini-2.0-flash for all agents (best balance of speed/quality).
 */
function getModelId(internalModel: string): string {
  // Map our model names to Google model IDs
  switch (internalModel) {
    case "gemini-3-pro-preview":
      return "google/gemini-2.0-flash"; // Use flash for cost efficiency
    case "gemini-3-flash-preview":
      return "google/gemini-2.0-flash";
    default:
      return "google/gemini-2.0-flash";
  }
}

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
// Agent Factory
// ============================================

/**
 * Create a Mastra Agent from our config.
 */
function createAgent(agentType: AgentType): Agent {
  const config = AGENT_CONFIGS[agentType];
  const systemPrompt = AGENT_PROMPTS[agentType];

  return new Agent({
    id: config.type,
    name: config.name,
    instructions: systemPrompt,
    model: getModelId(config.model),
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
} as const;

export type MastraAgentRegistry = typeof mastraAgents;

// ============================================
// Agent Execution Functions
// ============================================

export interface AgentContext {
  cycleId: string;
  symbols: string[];
  snapshots: Record<string, unknown>;
  memory?: Record<string, unknown>;
  externalContext?: Record<string, unknown>;
}

/**
 * Default model settings for agent generation.
 */
const DEFAULT_MODEL_SETTINGS = {
  temperature: 0.3, // Lower temperature for more deterministic outputs
  maxTokens: 4096,
};

/**
 * Run Technical Analyst agent.
 */
export async function runTechnicalAnalyst(
  context: AgentContext
): Promise<TechnicalAnalysisOutput[]> {
  const prompt = `Analyze the following instruments:
${JSON.stringify(context.snapshots, null, 2)}

Symbols to analyze: ${context.symbols.join(", ")}
Cycle ID: ${context.cycleId}`;

  const response = await technicalAnalystAgent.generate([{ role: "user", content: prompt }], {
    structuredOutput: {
      schema: z.array(TechnicalAnalysisSchema),
    },
    modelSettings: DEFAULT_MODEL_SETTINGS,
  });

  return response.object as TechnicalAnalysisOutput[];
}

/**
 * Run News & Sentiment Analyst agent.
 */
export async function runNewsAnalyst(context: AgentContext): Promise<SentimentAnalysisOutput[]> {
  const prompt = `Analyze news and sentiment for the following instruments:
${JSON.stringify(context.externalContext?.news ?? [], null, 2)}

Symbols to analyze: ${context.symbols.join(", ")}
Cycle ID: ${context.cycleId}`;

  const response = await newsAnalystAgent.generate([{ role: "user", content: prompt }], {
    structuredOutput: {
      schema: z.array(SentimentAnalysisSchema),
    },
    modelSettings: DEFAULT_MODEL_SETTINGS,
  });

  return response.object as SentimentAnalysisOutput[];
}

/**
 * Run Fundamentals & Macro Analyst agent.
 */
export async function runFundamentalsAnalyst(
  context: AgentContext
): Promise<FundamentalsAnalysisOutput[]> {
  const prompt = `Analyze fundamentals and macro context for the following instruments:
${JSON.stringify(context.externalContext?.macroIndicators ?? {}, null, 2)}

Symbols to analyze: ${context.symbols.join(", ")}
Cycle ID: ${context.cycleId}`;

  const response = await fundamentalsAnalystAgent.generate([{ role: "user", content: prompt }], {
    structuredOutput: {
      schema: z.array(FundamentalsAnalysisSchema),
    },
    modelSettings: DEFAULT_MODEL_SETTINGS,
  });

  return response.object as FundamentalsAnalysisOutput[];
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

  const response = await bullishResearcherAgent.generate([{ role: "user", content: prompt }], {
    structuredOutput: {
      schema: z.array(BullishResearchSchema),
    },
    modelSettings: DEFAULT_MODEL_SETTINGS,
  });

  return response.object as BullishResearchOutput[];
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

  const response = await bearishResearcherAgent.generate([{ role: "user", content: prompt }], {
    structuredOutput: {
      schema: z.array(BearishResearchSchema),
    },
    modelSettings: DEFAULT_MODEL_SETTINGS,
  });

  return response.object as BearishResearchOutput[];
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
 */
export async function runTrader(
  context: AgentContext,
  debateOutputs: {
    bullish: BullishResearchOutput[];
    bearish: BearishResearchOutput[];
  },
  portfolioState?: Record<string, unknown>
): Promise<DecisionPlan> {
  const prompt = `Synthesize the debate into a concrete trading plan:

Bullish Research:
${JSON.stringify(debateOutputs.bullish, null, 2)}

Bearish Research:
${JSON.stringify(debateOutputs.bearish, null, 2)}

Current Portfolio State:
${JSON.stringify(portfolioState ?? {}, null, 2)}

Cycle ID: ${context.cycleId}
Timestamp: ${new Date().toISOString()}`;

  const response = await traderAgent.generate([{ role: "user", content: prompt }], {
    structuredOutput: {
      schema: DecisionPlanSchema,
    },
    modelSettings: DEFAULT_MODEL_SETTINGS,
  });

  return response.object as DecisionPlan;
}

/**
 * Run Risk Manager agent to validate plan.
 */
export async function runRiskManager(
  plan: DecisionPlan,
  portfolioState?: Record<string, unknown>,
  constraints?: Record<string, unknown>
): Promise<RiskManagerOutput> {
  const prompt = `Validate this trading plan against risk constraints:

Decision Plan:
${JSON.stringify(plan, null, 2)}

Current Portfolio State:
${JSON.stringify(portfolioState ?? {}, null, 2)}

Risk Constraints:
${JSON.stringify(constraints ?? {}, null, 2)}`;

  const response = await riskManagerAgent.generate([{ role: "user", content: prompt }], {
    structuredOutput: {
      schema: RiskManagerOutputSchema,
    },
    modelSettings: {
      ...DEFAULT_MODEL_SETTINGS,
      temperature: 0.1, // Very low temperature for validation
    },
  });

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
  }
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

  const response = await criticAgent.generate([{ role: "user", content: prompt }], {
    structuredOutput: {
      schema: CriticOutputSchema,
    },
    modelSettings: {
      ...DEFAULT_MODEL_SETTINGS,
      temperature: 0.1, // Very low temperature for validation
    },
  });

  return response.object as CriticOutput;
}

/**
 * Run both approval agents in parallel.
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
  constraints?: Record<string, unknown>
): Promise<{
  riskManager: RiskManagerOutput;
  critic: CriticOutput;
}> {
  const [riskManager, critic] = await Promise.all([
    runRiskManager(plan, portfolioState, constraints),
    runCritic(plan, analystOutputs, debateOutputs),
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
  }
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

  const response = await traderAgent.generate([{ role: "user", content: prompt }], {
    structuredOutput: {
      schema: DecisionPlanSchema,
    },
    modelSettings: DEFAULT_MODEL_SETTINGS,
  });

  return response.object as DecisionPlan;
}
