/**
 * Agent Unit Tests
 *
 * Tests for all 10 agents in the trading network:
 * - Technical Analyst
 * - News & Sentiment Analyst
 * - Fundamentals & Macro Analyst
 * - Bullish Researcher
 * - Bearish Researcher
 * - Trader
 * - Risk Manager
 * - Critic
 * - Idea Agent (alpha factor hypothesis generation)
 * - Indicator Researcher (indicator hypothesis formulation)
 *
 * Tests cover:
 * - Agent configuration and factory
 * - Output schema validation
 * - Stub agent configuration
 * - Agent context structure
 */

import { describe, expect, it } from "bun:test";
import {
  AGENT_CONFIGS,
  AGENT_PROMPTS,
  AGENT_TYPES,
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
import { z } from "zod";

import {
  type AgentContext,
  bearishResearcherAgent,
  bullishResearcherAgent,
  criticAgent,
  fundamentalsAnalystAgent,
  ideaAgentAgent,
  indicatorResearcherAgent,
  mastraAgents,
  newsAnalystAgent,
  riskManagerAgent,
  technicalAnalystAgent,
  traderAgent,
} from "../src/agents/mastra-agents";

import {
  bearishResearcher,
  bullishResearcher,
  critic,
  fundamentalsAnalyst,
  ideaAgent,
  indicatorResearcher,
  newsAnalyst,
  riskManager,
  agents as stubAgents,
  technicalAnalyst,
  trader,
} from "../src/agents/stub-agents";

// ============================================
// Zod Schemas (mirroring mastra-agents.ts)
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
// Test Data Factories
// ============================================

function createValidTechnicalAnalysis(): TechnicalAnalysisOutput {
  return {
    instrument_id: "AAPL",
    setup_classification: "BREAKOUT",
    key_levels: {
      support: [170.0, 165.0, 160.0],
      resistance: [180.0, 185.0, 190.0],
      pivot: 175.0,
    },
    trend_assessment: "Strong uptrend on daily timeframe",
    momentum_assessment: "RSI at 62, positive MACD crossover",
    volatility_assessment: "ATR expanding, VIX at normal levels",
    technical_thesis: "Breakout above 175 with volume confirmation",
    invalidation_conditions: ["Break below 170", "Volume divergence"],
  };
}

function createValidSentimentAnalysis(): SentimentAnalysisOutput {
  return {
    instrument_id: "AAPL",
    event_impacts: [
      {
        event_id: "evt-001",
        event_type: "EARNINGS",
        impact_direction: "BULLISH",
        impact_magnitude: "HIGH",
        reasoning: "Beat on revenue and EPS, raised guidance",
      },
    ],
    overall_sentiment: "BULLISH",
    sentiment_strength: 0.75,
    duration_expectation: "WEEKS",
    linked_event_ids: ["evt-001"],
  };
}

function createValidFundamentalsAnalysis(): FundamentalsAnalysisOutput {
  return {
    instrument_id: "AAPL",
    fundamental_drivers: ["Strong iPhone sales", "Services revenue growth"],
    fundamental_headwinds: ["China market concerns", "Regulatory pressure"],
    valuation_context: "Trading at 28x P/E, slight premium to historical",
    macro_context: "Fed pausing rates, favorable for growth",
    event_risk: [
      {
        event: "FOMC Meeting",
        date: "2026-01-28",
        potential_impact: "MEDIUM",
      },
    ],
    fundamental_thesis: "Premium valuation supported by growth trajectory",
    linked_event_ids: ["macro-001"],
  };
}

function createValidBullishResearch(): BullishResearchOutput {
  return {
    instrument_id: "AAPL",
    bullish_thesis: "Technical breakout with fundamental support",
    supporting_factors: [
      { factor: "Price above all MAs", source: "TECHNICAL", strength: "STRONG" },
      { factor: "Positive earnings revision", source: "FUNDAMENTAL", strength: "MODERATE" },
    ],
    target_conditions: "Reach 185 within 2 weeks",
    invalidation_conditions: "Break below 170 support",
    conviction_level: 0.8,
    memory_case_ids: ["mem-001"],
    strongest_counterargument: "Stretched valuation multiple",
  };
}

function createValidBearishResearch(): BearishResearchOutput {
  return {
    instrument_id: "AAPL",
    bearish_thesis: "Overbought conditions with resistance ahead",
    supporting_factors: [
      { factor: "RSI approaching overbought", source: "TECHNICAL", strength: "MODERATE" },
      { factor: "China headwinds", source: "FUNDAMENTAL", strength: "WEAK" },
    ],
    target_conditions: "Pull back to 165 support",
    invalidation_conditions: "Clean break above 185 resistance",
    conviction_level: 0.45,
    memory_case_ids: [],
    strongest_counterargument: "Strong momentum hard to fade",
  };
}

function createValidDecisionPlan(): DecisionPlan {
  return {
    cycleId: "cycle-001",
    timestamp: new Date().toISOString(),
    decisions: [
      {
        decisionId: "dec-001",
        instrumentId: "AAPL",
        action: "BUY",
        direction: "LONG",
        size: { value: 100, unit: "SHARES" },
        stopLoss: { price: 170.0, type: "FIXED" },
        takeProfit: { price: 185.0 },
        strategyFamily: "EQUITY_LONG",
        timeHorizon: "SWING",
        rationale: {
          summary: "Bullish breakout setup with risk-reward of 3:1",
          bullishFactors: ["Technical breakout", "Positive sentiment"],
          bearishFactors: ["Stretched valuation"],
          decisionLogic: "Weight of evidence favors long exposure",
          memoryReferences: ["mem-001"],
        },
        thesisState: "ENTERED",
      },
    ],
    portfolioNotes: "Initiating new position in tech sector",
  };
}

function createValidRiskManagerOutput(): RiskManagerOutput {
  return {
    verdict: "APPROVE",
    violations: [],
    required_changes: [],
    risk_notes: "Position size within limits, adequate stop-loss",
  };
}

function createValidCriticOutput(): CriticOutput {
  return {
    verdict: "APPROVE",
    inconsistencies: [],
    missing_justifications: [],
    hallucination_flags: [],
    required_changes: [],
  };
}

function createValidAgentContext(): AgentContext {
  return {
    cycleId: "cycle-001",
    symbols: ["AAPL", "MSFT"],
    snapshots: {
      AAPL: { price: 175.0, volume: 50000000 },
      MSFT: { price: 400.0, volume: 25000000 },
    },
    memory: {},
    externalContext: { news: [], macroIndicators: {} },
    recentEvents: [],
  };
}

// ============================================
// Agent Configuration Tests
// ============================================

describe("Agent Configuration", () => {
  describe("AGENT_TYPES", () => {
    it("should have exactly 10 agent types", () => {
      expect(AGENT_TYPES).toHaveLength(10);
    });

    it("should include all expected agent types", () => {
      const expectedTypes: AgentType[] = [
        "technical_analyst",
        "news_analyst",
        "fundamentals_analyst",
        "bullish_researcher",
        "bearish_researcher",
        "trader",
        "risk_manager",
        "critic",
        "idea_agent",
        "indicator_researcher",
      ];
      expect(AGENT_TYPES).toEqual(expectedTypes);
    });
  });

  describe("AGENT_CONFIGS", () => {
    it("should have configuration for all agent types", () => {
      for (const agentType of AGENT_TYPES) {
        expect(AGENT_CONFIGS[agentType]).toBeDefined();
      }
    });

    it("should have valid configuration structure for each agent", () => {
      for (const agentType of AGENT_TYPES) {
        const config = AGENT_CONFIGS[agentType];
        expect(config.type).toBe(agentType);
        expect(config.name).toBeDefined();
        expect(config.name.length).toBeGreaterThan(0);
        expect(config.role).toBeDefined();
        expect(config.personality).toBeInstanceOf(Array);
        expect(config.tools).toBeInstanceOf(Array);
      }
    });
  });

  describe("AGENT_PROMPTS", () => {
    it("should have prompts for all agent types", () => {
      for (const agentType of AGENT_TYPES) {
        expect(AGENT_PROMPTS[agentType]).toBeDefined();
        expect(typeof AGENT_PROMPTS[agentType]).toBe("string");
        expect(AGENT_PROMPTS[agentType].length).toBeGreaterThan(100);
      }
    });
  });
});

// ============================================
// Mastra Agent Instance Tests
// ============================================

describe("Mastra Agent Instances", () => {
  it("should create technical analyst agent", () => {
    expect(technicalAnalystAgent).toBeDefined();
    expect(technicalAnalystAgent.id).toBe("technical_analyst");
  });

  it("should create news analyst agent", () => {
    expect(newsAnalystAgent).toBeDefined();
    expect(newsAnalystAgent.id).toBe("news_analyst");
  });

  it("should create fundamentals analyst agent", () => {
    expect(fundamentalsAnalystAgent).toBeDefined();
    expect(fundamentalsAnalystAgent.id).toBe("fundamentals_analyst");
  });

  it("should create bullish researcher agent", () => {
    expect(bullishResearcherAgent).toBeDefined();
    expect(bullishResearcherAgent.id).toBe("bullish_researcher");
  });

  it("should create bearish researcher agent", () => {
    expect(bearishResearcherAgent).toBeDefined();
    expect(bearishResearcherAgent.id).toBe("bearish_researcher");
  });

  it("should create trader agent", () => {
    expect(traderAgent).toBeDefined();
    expect(traderAgent.id).toBe("trader");
  });

  it("should create risk manager agent", () => {
    expect(riskManagerAgent).toBeDefined();
    expect(riskManagerAgent.id).toBe("risk_manager");
  });

  it("should create critic agent", () => {
    expect(criticAgent).toBeDefined();
    expect(criticAgent.id).toBe("critic");
  });

  it("should create idea agent", () => {
    expect(ideaAgentAgent).toBeDefined();
    expect(ideaAgentAgent.id).toBe("idea_agent");
  });

  it("should create indicator researcher agent", () => {
    expect(indicatorResearcherAgent).toBeDefined();
    expect(indicatorResearcherAgent.id).toBe("indicator_researcher");
  });

  describe("Agent Registry", () => {
    it("should have all 10 agents in registry", () => {
      expect(Object.keys(mastraAgents)).toHaveLength(10);
    });

    it("should have correct agent ids in registry", () => {
      const expectedIds: AgentType[] = [
        "technical_analyst",
        "news_analyst",
        "fundamentals_analyst",
        "bullish_researcher",
        "bearish_researcher",
        "trader",
        "risk_manager",
        "critic",
        "idea_agent",
        "indicator_researcher",
      ];

      for (const id of expectedIds) {
        expect(mastraAgents[id]).toBeDefined();
        expect(mastraAgents[id].id).toBe(id);
      }
    });
  });
});

// ============================================
// Stub Agent Tests
// ============================================

describe("Stub Agents", () => {
  it("should create technical analyst stub", () => {
    expect(technicalAnalyst).toBeDefined();
    expect(technicalAnalyst.id).toBe("technical_analyst");
    expect(technicalAnalyst.name).toBeDefined();
    expect(technicalAnalyst.systemPrompt).toBeDefined();
  });

  it("should create news analyst stub", () => {
    expect(newsAnalyst).toBeDefined();
    expect(newsAnalyst.id).toBe("news_analyst");
  });

  it("should create fundamentals analyst stub", () => {
    expect(fundamentalsAnalyst).toBeDefined();
    expect(fundamentalsAnalyst.id).toBe("fundamentals_analyst");
  });

  it("should create bullish researcher stub", () => {
    expect(bullishResearcher).toBeDefined();
    expect(bullishResearcher.id).toBe("bullish_researcher");
  });

  it("should create bearish researcher stub", () => {
    expect(bearishResearcher).toBeDefined();
    expect(bearishResearcher.id).toBe("bearish_researcher");
  });

  it("should create trader stub", () => {
    expect(trader).toBeDefined();
    expect(trader.id).toBe("trader");
  });

  it("should create risk manager stub", () => {
    expect(riskManager).toBeDefined();
    expect(riskManager.id).toBe("risk_manager");
  });

  it("should create critic stub", () => {
    expect(critic).toBeDefined();
    expect(critic.id).toBe("critic");
  });

  it("should create idea agent stub", () => {
    expect(ideaAgent).toBeDefined();
    expect(ideaAgent.id).toBe("idea_agent");
  });

  it("should create indicator researcher stub", () => {
    expect(indicatorResearcher).toBeDefined();
    expect(indicatorResearcher.id).toBe("indicator_researcher");
  });

  describe("Stub Agent Registry", () => {
    it("should have all 10 agents in stub registry", () => {
      expect(Object.keys(stubAgents)).toHaveLength(10);
    });

    it("should match Mastra config for all stubs", () => {
      for (const [_key, stub] of Object.entries(stubAgents)) {
        const config = AGENT_CONFIGS[stub.id];
        expect(stub.name).toBe(config.name);
        expect(stub.role).toBe(config.role);
      }
    });
  });
});

// ============================================
// Technical Analyst Output Schema Tests
// ============================================

describe("Technical Analysis Output Schema", () => {
  it("should validate valid technical analysis", () => {
    const valid = createValidTechnicalAnalysis();
    expect(() => TechnicalAnalysisSchema.parse(valid)).not.toThrow();
  });

  it("should validate all setup classifications", () => {
    const classifications = ["BREAKOUT", "PULLBACK", "REVERSAL", "RANGE_BOUND", "NO_SETUP"];
    for (const classification of classifications) {
      const analysis = {
        ...createValidTechnicalAnalysis(),
        setup_classification: classification,
      };
      expect(() => TechnicalAnalysisSchema.parse(analysis)).not.toThrow();
    }
  });

  it("should reject invalid setup classification", () => {
    const invalid = {
      ...createValidTechnicalAnalysis(),
      setup_classification: "INVALID",
    };
    expect(() => TechnicalAnalysisSchema.parse(invalid)).toThrow();
  });

  it("should require key levels", () => {
    const invalid = {
      ...createValidTechnicalAnalysis(),
      key_levels: undefined,
    };
    expect(() => TechnicalAnalysisSchema.parse(invalid)).toThrow();
  });

  it("should require instrument_id", () => {
    const { instrument_id: _, ...withoutId } = createValidTechnicalAnalysis();
    expect(() => TechnicalAnalysisSchema.parse(withoutId)).toThrow();
  });
});

// ============================================
// Sentiment Analysis Output Schema Tests
// ============================================

describe("Sentiment Analysis Output Schema", () => {
  it("should validate valid sentiment analysis", () => {
    const valid = createValidSentimentAnalysis();
    expect(() => SentimentAnalysisSchema.parse(valid)).not.toThrow();
  });

  it("should validate all sentiment types", () => {
    const sentiments = ["BULLISH", "BEARISH", "NEUTRAL", "MIXED"];
    for (const sentiment of sentiments) {
      const analysis = {
        ...createValidSentimentAnalysis(),
        overall_sentiment: sentiment,
      };
      expect(() => SentimentAnalysisSchema.parse(analysis)).not.toThrow();
    }
  });

  it("should validate all event types", () => {
    const eventTypes = [
      "EARNINGS",
      "GUIDANCE",
      "M&A",
      "REGULATORY",
      "PRODUCT",
      "MACRO",
      "ANALYST",
      "SOCIAL",
    ];
    for (const eventType of eventTypes) {
      const analysis = {
        ...createValidSentimentAnalysis(),
        event_impacts: [
          {
            ...createValidSentimentAnalysis().event_impacts[0],
            event_type: eventType,
          },
        ],
      };
      expect(() => SentimentAnalysisSchema.parse(analysis)).not.toThrow();
    }
  });

  it("should validate sentiment_strength range", () => {
    const validMin = { ...createValidSentimentAnalysis(), sentiment_strength: 0 };
    const validMax = { ...createValidSentimentAnalysis(), sentiment_strength: 1 };
    const invalidLow = { ...createValidSentimentAnalysis(), sentiment_strength: -0.1 };
    const invalidHigh = { ...createValidSentimentAnalysis(), sentiment_strength: 1.1 };

    expect(() => SentimentAnalysisSchema.parse(validMin)).not.toThrow();
    expect(() => SentimentAnalysisSchema.parse(validMax)).not.toThrow();
    expect(() => SentimentAnalysisSchema.parse(invalidLow)).toThrow();
    expect(() => SentimentAnalysisSchema.parse(invalidHigh)).toThrow();
  });

  it("should validate duration expectations", () => {
    const durations = ["INTRADAY", "DAYS", "WEEKS", "PERSISTENT"];
    for (const duration of durations) {
      const analysis = {
        ...createValidSentimentAnalysis(),
        duration_expectation: duration,
      };
      expect(() => SentimentAnalysisSchema.parse(analysis)).not.toThrow();
    }
  });
});

// ============================================
// Fundamentals Analysis Output Schema Tests
// ============================================

describe("Fundamentals Analysis Output Schema", () => {
  it("should validate valid fundamentals analysis", () => {
    const valid = createValidFundamentalsAnalysis();
    expect(() => FundamentalsAnalysisSchema.parse(valid)).not.toThrow();
  });

  it("should validate event risk impact levels", () => {
    const impacts = ["HIGH", "MEDIUM", "LOW"];
    for (const impact of impacts) {
      const analysis = {
        ...createValidFundamentalsAnalysis(),
        event_risk: [
          {
            event: "Test Event",
            date: "2026-01-28",
            potential_impact: impact,
          },
        ],
      };
      expect(() => FundamentalsAnalysisSchema.parse(analysis)).not.toThrow();
    }
  });

  it("should allow empty arrays", () => {
    const withEmptyArrays = {
      ...createValidFundamentalsAnalysis(),
      fundamental_drivers: [],
      fundamental_headwinds: [],
      event_risk: [],
      linked_event_ids: [],
    };
    expect(() => FundamentalsAnalysisSchema.parse(withEmptyArrays)).not.toThrow();
  });
});

// ============================================
// Research Output Schema Tests
// ============================================

describe("Research Output Schemas", () => {
  describe("Bullish Research", () => {
    it("should validate valid bullish research", () => {
      const valid = createValidBullishResearch();
      expect(() => BullishResearchSchema.parse(valid)).not.toThrow();
    });

    it("should validate supporting factor sources", () => {
      const sources = ["TECHNICAL", "SENTIMENT", "FUNDAMENTAL", "MEMORY"];
      for (const source of sources) {
        const research = {
          ...createValidBullishResearch(),
          supporting_factors: [{ factor: "Test", source, strength: "STRONG" }],
        };
        expect(() => BullishResearchSchema.parse(research)).not.toThrow();
      }
    });

    it("should validate supporting factor strengths", () => {
      const strengths = ["STRONG", "MODERATE", "WEAK"];
      for (const strength of strengths) {
        const research = {
          ...createValidBullishResearch(),
          supporting_factors: [{ factor: "Test", source: "TECHNICAL", strength }],
        };
        expect(() => BullishResearchSchema.parse(research)).not.toThrow();
      }
    });

    it("should validate conviction_level range", () => {
      const validMin = { ...createValidBullishResearch(), conviction_level: 0 };
      const validMax = { ...createValidBullishResearch(), conviction_level: 1 };
      const invalidLow = { ...createValidBullishResearch(), conviction_level: -0.1 };
      const invalidHigh = { ...createValidBullishResearch(), conviction_level: 1.1 };

      expect(() => BullishResearchSchema.parse(validMin)).not.toThrow();
      expect(() => BullishResearchSchema.parse(validMax)).not.toThrow();
      expect(() => BullishResearchSchema.parse(invalidLow)).toThrow();
      expect(() => BullishResearchSchema.parse(invalidHigh)).toThrow();
    });
  });

  describe("Bearish Research", () => {
    it("should validate valid bearish research", () => {
      const valid = createValidBearishResearch();
      expect(() => BearishResearchSchema.parse(valid)).not.toThrow();
    });

    it("should have same structure as bullish research", () => {
      const bullishKeys = Object.keys(createValidBullishResearch()).sort();
      const bearishKeys = Object.keys(createValidBearishResearch())
        .map((k) => k.replace("bearish", "bullish"))
        .sort();
      expect(bullishKeys).toEqual(bearishKeys);
    });
  });
});

// ============================================
// Decision Plan Schema Tests
// ============================================

describe("Decision Plan Schema", () => {
  it("should validate valid decision plan", () => {
    const valid = createValidDecisionPlan();
    expect(() => DecisionPlanSchema.parse(valid)).not.toThrow();
  });

  it("should validate all trade actions", () => {
    const actions = ["BUY", "SELL", "HOLD", "CLOSE"];
    for (const action of actions) {
      const plan = {
        ...createValidDecisionPlan(),
        decisions: [
          {
            ...createValidDecisionPlan().decisions[0],
            action,
          },
        ],
      };
      expect(() => DecisionPlanSchema.parse(plan)).not.toThrow();
    }
  });

  it("should validate all trade directions", () => {
    const directions = ["LONG", "SHORT", "FLAT"];
    for (const direction of directions) {
      const plan = {
        ...createValidDecisionPlan(),
        decisions: [
          {
            ...createValidDecisionPlan().decisions[0],
            direction,
          },
        ],
      };
      expect(() => DecisionPlanSchema.parse(plan)).not.toThrow();
    }
  });

  it("should validate all size units", () => {
    const units = ["SHARES", "CONTRACTS", "DOLLARS", "PCT_EQUITY"];
    for (const unit of units) {
      const plan = {
        ...createValidDecisionPlan(),
        decisions: [
          {
            ...createValidDecisionPlan().decisions[0],
            size: { value: 100, unit },
          },
        ],
      };
      expect(() => DecisionPlanSchema.parse(plan)).not.toThrow();
    }
  });

  it("should validate all strategy families", () => {
    const strategies = [
      "EQUITY_LONG",
      "EQUITY_SHORT",
      "OPTION_LONG",
      "OPTION_SHORT",
      "VERTICAL_SPREAD",
      "IRON_CONDOR",
      "STRADDLE",
      "STRANGLE",
      "CALENDAR_SPREAD",
    ];
    for (const strategy of strategies) {
      const plan = {
        ...createValidDecisionPlan(),
        decisions: [
          {
            ...createValidDecisionPlan().decisions[0],
            strategyFamily: strategy,
          },
        ],
      };
      expect(() => DecisionPlanSchema.parse(plan)).not.toThrow();
    }
  });

  it("should validate all time horizons", () => {
    const horizons = ["INTRADAY", "SWING", "POSITION"];
    for (const horizon of horizons) {
      const plan = {
        ...createValidDecisionPlan(),
        decisions: [
          {
            ...createValidDecisionPlan().decisions[0],
            timeHorizon: horizon,
          },
        ],
      };
      expect(() => DecisionPlanSchema.parse(plan)).not.toThrow();
    }
  });

  it("should validate all thesis states", () => {
    const states = ["WATCHING", "ENTERED", "ADDING", "MANAGING", "EXITING", "CLOSED"];
    for (const state of states) {
      const plan = {
        ...createValidDecisionPlan(),
        decisions: [
          {
            ...createValidDecisionPlan().decisions[0],
            thesisState: state,
          },
        ],
      };
      expect(() => DecisionPlanSchema.parse(plan)).not.toThrow();
    }
  });

  it("should allow optional stopLoss and takeProfit", () => {
    const planWithoutStops = {
      ...createValidDecisionPlan(),
      decisions: [
        {
          ...createValidDecisionPlan().decisions[0],
          stopLoss: undefined,
          takeProfit: undefined,
        },
      ],
    };
    expect(() => DecisionPlanSchema.parse(planWithoutStops)).not.toThrow();
  });

  it("should validate stop loss types", () => {
    const types = ["FIXED", "TRAILING"];
    for (const type of types) {
      const plan = {
        ...createValidDecisionPlan(),
        decisions: [
          {
            ...createValidDecisionPlan().decisions[0],
            stopLoss: { price: 170.0, type },
          },
        ],
      };
      expect(() => DecisionPlanSchema.parse(plan)).not.toThrow();
    }
  });

  it("should allow empty decisions array", () => {
    const emptyPlan = {
      ...createValidDecisionPlan(),
      decisions: [],
    };
    expect(() => DecisionPlanSchema.parse(emptyPlan)).not.toThrow();
  });
});

// ============================================
// Risk Manager Output Schema Tests
// ============================================

describe("Risk Manager Output Schema", () => {
  it("should validate valid approval output", () => {
    const valid = createValidRiskManagerOutput();
    expect(() => RiskManagerOutputSchema.parse(valid)).not.toThrow();
  });

  it("should validate rejection output with violations", () => {
    const rejection: RiskManagerOutput = {
      verdict: "REJECT",
      violations: [
        {
          constraint: "max_position_size",
          current_value: 0.12,
          limit: 0.1,
          severity: "CRITICAL",
          affected_decisions: ["dec-001"],
        },
      ],
      required_changes: [
        {
          decisionId: "dec-001",
          change: "Reduce position size to 5%",
          reason: "Exceeds maximum position limit",
        },
      ],
      risk_notes: "Position size violation detected",
    };
    expect(() => RiskManagerOutputSchema.parse(rejection)).not.toThrow();
  });

  it("should validate violation severities", () => {
    const severities = ["CRITICAL", "WARNING"];
    for (const severity of severities) {
      const output = {
        ...createValidRiskManagerOutput(),
        verdict: "REJECT" as const,
        violations: [
          {
            constraint: "test",
            current_value: 1,
            limit: 0.5,
            severity,
            affected_decisions: ["dec-001"],
          },
        ],
      };
      expect(() => RiskManagerOutputSchema.parse(output)).not.toThrow();
    }
  });

  it("should allow string values in violations", () => {
    const output = {
      ...createValidRiskManagerOutput(),
      verdict: "REJECT" as const,
      violations: [
        {
          constraint: "sector_concentration",
          current_value: "TECH 45%",
          limit: "40%",
          severity: "WARNING",
          affected_decisions: ["dec-001"],
        },
      ],
    };
    expect(() => RiskManagerOutputSchema.parse(output)).not.toThrow();
  });
});

// ============================================
// Critic Output Schema Tests
// ============================================

describe("Critic Output Schema", () => {
  it("should validate valid approval output", () => {
    const valid = createValidCriticOutput();
    expect(() => CriticOutputSchema.parse(valid)).not.toThrow();
  });

  it("should validate rejection output with issues", () => {
    const rejection: CriticOutput = {
      verdict: "REJECT",
      inconsistencies: [
        {
          decisionId: "dec-001",
          issue: "Direction mismatch",
          expected: "BEARISH given analyst outputs",
          found: "BULLISH entry proposed",
        },
      ],
      missing_justifications: [
        {
          decisionId: "dec-001",
          missing: "No explanation for ignoring bearish signals",
        },
      ],
      hallucination_flags: [
        {
          decisionId: "dec-001",
          claim: "Price target from analyst consensus",
          evidence_status: "NOT_FOUND",
        },
      ],
      required_changes: [
        {
          decisionId: "dec-001",
          change: "Add justification for bullish stance",
        },
      ],
    };
    expect(() => CriticOutputSchema.parse(rejection)).not.toThrow();
  });

  it("should validate evidence status types", () => {
    const statuses = ["NOT_FOUND", "CONTRADICTED"];
    for (const status of statuses) {
      const output = {
        ...createValidCriticOutput(),
        verdict: "REJECT" as const,
        hallucination_flags: [
          {
            decisionId: "dec-001",
            claim: "Test claim",
            evidence_status: status,
          },
        ],
      };
      expect(() => CriticOutputSchema.parse(output)).not.toThrow();
    }
  });
});

// ============================================
// Agent Context Tests
// ============================================

describe("Agent Context", () => {
  it("should create valid agent context", () => {
    const context = createValidAgentContext();
    expect(context.cycleId).toBeDefined();
    expect(context.symbols).toHaveLength(2);
    expect(context.snapshots).toBeDefined();
  });

  it("should handle optional memory", () => {
    const context: AgentContext = {
      cycleId: "cycle-001",
      symbols: ["AAPL"],
      snapshots: { AAPL: {} },
    };
    expect(context.memory).toBeUndefined();
  });

  it("should handle optional externalContext", () => {
    const context: AgentContext = {
      cycleId: "cycle-001",
      symbols: ["AAPL"],
      snapshots: { AAPL: {} },
    };
    expect(context.externalContext).toBeUndefined();
  });

  it("should handle optional recentEvents", () => {
    const context: AgentContext = {
      cycleId: "cycle-001",
      symbols: ["AAPL"],
      snapshots: { AAPL: {} },
    };
    expect(context.recentEvents).toBeUndefined();
  });

  it("should structure recentEvents correctly", () => {
    const context: AgentContext = {
      cycleId: "cycle-001",
      symbols: ["AAPL"],
      snapshots: { AAPL: {} },
      recentEvents: [
        {
          id: "evt-001",
          sourceType: "news",
          eventType: "earnings",
          eventTime: "2026-01-06T10:00:00Z",
          sentiment: "BULLISH",
          summary: "Strong earnings beat",
          importanceScore: 0.9,
          relatedInstruments: ["AAPL"],
        },
      ],
    };
    expect(context.recentEvents).toHaveLength(1);
    expect(context.recentEvents![0].sourceType).toBe("news");
  });
});

// ============================================
// Agent Tool Wiring Tests
// ============================================

describe("Agent Tool Wiring", () => {
  describe("Tool Registration", () => {
    it("should have web_search tool wired for technical analyst", () => {
      const agent = technicalAnalystAgent;
      // Agent tools property exists
      expect(agent.tools).toBeDefined();
      // web_search should be in tools since all agents have it configured
      expect(agent.tools?.web_search).toBeDefined();
    });

    it("should have web_search tool wired for news analyst", () => {
      const agent = newsAnalystAgent;
      expect(agent.tools).toBeDefined();
      expect(agent.tools?.web_search).toBeDefined();
    });

    it("should have web_search tool wired for fundamentals analyst", () => {
      const agent = fundamentalsAnalystAgent;
      expect(agent.tools).toBeDefined();
      expect(agent.tools?.web_search).toBeDefined();
    });

    it("should have web_search tool wired for bullish researcher", () => {
      const agent = bullishResearcherAgent;
      expect(agent.tools).toBeDefined();
      expect(agent.tools?.web_search).toBeDefined();
    });

    it("should have web_search tool wired for bearish researcher", () => {
      const agent = bearishResearcherAgent;
      expect(agent.tools).toBeDefined();
      expect(agent.tools?.web_search).toBeDefined();
    });

    it("should have web_search tool wired for trader", () => {
      const agent = traderAgent;
      expect(agent.tools).toBeDefined();
      expect(agent.tools?.web_search).toBeDefined();
    });

    it("should have web_search tool wired for risk manager", () => {
      const agent = riskManagerAgent;
      expect(agent.tools).toBeDefined();
      expect(agent.tools?.web_search).toBeDefined();
    });

    it("should have web_search tool wired for critic", () => {
      const agent = criticAgent;
      expect(agent.tools).toBeDefined();
      expect(agent.tools?.web_search).toBeDefined();
    });

    it("should have web_search tool wired for idea agent", () => {
      const agent = ideaAgentAgent;
      expect(agent.tools).toBeDefined();
      expect(agent.tools?.web_search).toBeDefined();
    });

    it("should have web_search tool wired for indicator researcher", () => {
      const agent = indicatorResearcherAgent;
      expect(agent.tools).toBeDefined();
      expect(agent.tools?.web_search).toBeDefined();
    });
  });

  describe("Tool Configuration", () => {
    it("should have all 10 agents with tools configured", () => {
      // All agents in AGENT_CONFIGS should have web_search in their tools array
      for (const agentType of AGENT_TYPES) {
        const config = AGENT_CONFIGS[agentType];
        expect(config.tools).toContain("web_search");
      }
    });

    it("should resolve tool instances at agent creation", () => {
      // All Mastra agent instances should have the tools property populated
      for (const [_id, agent] of Object.entries(mastraAgents)) {
        expect(agent.tools).toBeDefined();
        // Each agent should have at least web_search
        expect(Object.keys(agent.tools || {}).length).toBeGreaterThan(0);
      }
    });
  });
});
