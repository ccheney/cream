/**
 * Idea Agent Tests
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "BACKTEST";

import { describe, expect, mock, test } from "bun:test";
import type { Factor, FactorZooStats, Hypothesis, ResearchTrigger } from "@cream/domain";
import type { FactorZooRepository } from "@cream/storage";
import {
  buildFactorZooSummary,
  buildIdeaAgentUserPrompt,
  IDEA_AGENT_SYSTEM_PROMPT,
  type IdeaContext,
} from "../prompts/idea-agent.js";
import { type HelixClient, IdeaAgent, type LLMProvider } from "./idea-agent.js";

// ============================================
// Mock Factory Helpers
// ============================================

function createMockTrigger(overrides: Partial<ResearchTrigger> = {}): ResearchTrigger {
  return {
    type: "REGIME_GAP",
    severity: "MEDIUM",
    affectedFactors: [],
    suggestedFocus: "Develop strategies for HIGH_VOL regime",
    detectedAt: new Date().toISOString(),
    metadata: {
      currentRegime: "HIGH_VOL",
      coveredRegimes: ["BULL_TREND", "BEAR_TREND"],
      uncoveredRegimes: ["HIGH_VOL", "LOW_VOL", "RANGE"],
    },
    ...overrides,
  };
}

function createMockStats(overrides: Partial<FactorZooStats> = {}): FactorZooStats {
  return {
    totalFactors: 10,
    activeFactors: 5,
    decayingFactors: 1,
    researchFactors: 2,
    retiredFactors: 2,
    averageIc: 0.04,
    totalWeight: 1.0,
    hypothesesValidated: 3,
    hypothesesRejected: 1,
    ...overrides,
  };
}

function createMockFactor(overrides: Partial<Factor> = {}): Factor {
  return {
    factorId: "factor-1",
    hypothesisId: "hyp-1",
    name: "Momentum Factor",
    status: "active",
    version: 1,
    author: "test",
    pythonModule: null,
    typescriptModule: null,
    symbolicLength: null,
    parameterCount: null,
    featureCount: null,
    originalityScore: null,
    hypothesisAlignment: null,
    stage1Sharpe: 1.5,
    stage1Ic: 0.05,
    stage1MaxDrawdown: 0.1,
    stage1CompletedAt: "2025-01-01T00:00:00Z",
    stage2Pbo: 0.1,
    stage2DsrPvalue: 0.05,
    stage2Wfe: 0.8,
    stage2CompletedAt: "2025-01-01T00:00:00Z",
    paperValidationPassed: true,
    paperStartDate: "2025-01-01T00:00:00Z",
    paperEndDate: "2025-01-15T00:00:00Z",
    paperRealizedSharpe: 1.2,
    paperRealizedIc: 0.04,
    currentWeight: 0.1,
    lastIc: 0.05,
    decayRate: null,
    targetRegimes: null,
    parityReport: null,
    parityValidatedAt: null,
    createdAt: "2025-01-01T00:00:00Z",
    promotedAt: "2025-01-15T00:00:00Z",
    retiredAt: null,
    lastUpdated: "2025-01-20T00:00:00Z",
    ...overrides,
  };
}

function createMockRepository(overrides: Partial<FactorZooRepository> = {}): FactorZooRepository {
  return {
    findActiveFactors: mock(() => Promise.resolve([])),
    findDecayingFactors: mock(() => Promise.resolve([])),
    findActiveResearchRuns: mock(() => Promise.resolve([])),
    getStats: mock(() => Promise.resolve(createMockStats())),
    getPerformanceHistory: mock(() => Promise.resolve([])),
    createHypothesis: mock((h) =>
      Promise.resolve({
        hypothesisId: "hyp-test-123",
        ...h,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as Hypothesis)
    ),
    findHypothesisById: mock(() => Promise.resolve(null)),
    updateHypothesisStatus: mock(() => Promise.resolve()),
    findHypothesesByStatus: mock(() => Promise.resolve([])),
    createFactor: mock(() => Promise.resolve({} as never)),
    findFactorById: mock(() => Promise.resolve(null)),
    findFactorsByStatus: mock(() => Promise.resolve([])),
    updateFactorStatus: mock(() => Promise.resolve()),
    promote: mock(() => Promise.resolve()),
    markDecaying: mock(() => Promise.resolve()),
    retire: mock(() => Promise.resolve()),
    recordDailyPerformance: mock(() => Promise.resolve()),
    updateCorrelations: mock(() => Promise.resolve()),
    getCorrelationMatrix: mock(() => Promise.resolve(new Map())),
    updateWeights: mock(() => Promise.resolve()),
    getActiveWeights: mock(() => Promise.resolve(new Map())),
    createResearchRun: mock(() => Promise.resolve({} as never)),
    findResearchRunById: mock(() => Promise.resolve(null)),
    updateResearchRun: mock(() => Promise.resolve()),
    ...overrides,
  } as FactorZooRepository;
}

function createMockLLMProvider(response: string): LLMProvider {
  return {
    generate: mock(() => Promise.resolve(response)),
  };
}

// ============================================
// Prompt Template Tests
// ============================================

describe("IDEA_AGENT_SYSTEM_PROMPT", () => {
  test("contains role definition", () => {
    expect(IDEA_AGENT_SYSTEM_PROMPT).toContain("<role>");
    expect(IDEA_AGENT_SYSTEM_PROMPT).toContain("Quantitative Research Analyst");
  });

  test("contains constraints", () => {
    expect(IDEA_AGENT_SYSTEM_PROMPT).toContain("<constraints>");
    expect(IDEA_AGENT_SYSTEM_PROMPT).toContain("economic rationale");
    expect(IDEA_AGENT_SYSTEM_PROMPT).toContain("falsification criteria");
  });

  test("contains tools section", () => {
    expect(IDEA_AGENT_SYSTEM_PROMPT).toContain("<tools>");
    expect(IDEA_AGENT_SYSTEM_PROMPT).toContain("google_search");
    expect(IDEA_AGENT_SYSTEM_PROMPT).toContain("helix_query");
  });

  test("contains instructions for structured output", () => {
    // Output format handled by Gemini structured output - no <output_format> tag needed
    expect(IDEA_AGENT_SYSTEM_PROMPT).toContain("<instructions>");
    expect(IDEA_AGENT_SYSTEM_PROMPT).toContain("<output>");
    expect(IDEA_AGENT_SYSTEM_PROMPT).toContain("Chain-of-Thought");
  });
});

describe("buildIdeaAgentUserPrompt", () => {
  test("includes trigger information", () => {
    const context: IdeaContext = {
      regime: "HIGH_VOL",
      gaps: ["HIGH_VOL", "LOW_VOL"],
      decayingFactors: [{ id: "factor-1", decayRate: 0.01 }],
      memoryResults: [],
      factorZooSummary: "Test summary",
      trigger: createMockTrigger(),
    };

    const prompt = buildIdeaAgentUserPrompt(context);

    expect(prompt).toContain("REGIME_GAP");
    expect(prompt).toContain("MEDIUM");
    expect(prompt).toContain("HIGH_VOL");
  });

  test("includes decaying factors", () => {
    const context: IdeaContext = {
      regime: "BULL_TREND",
      gaps: [],
      decayingFactors: [
        { id: "factor-1", decayRate: 0.01 },
        { id: "factor-2", decayRate: 0.02 },
      ],
      memoryResults: [],
      factorZooSummary: "Test summary",
      trigger: createMockTrigger({ type: "ALPHA_DECAY" }),
    };

    const prompt = buildIdeaAgentUserPrompt(context);

    expect(prompt).toContain("factor-1");
    expect(prompt).toContain("factor-2");
  });

  test("includes memory results when available", () => {
    const context: IdeaContext = {
      regime: "BULL_TREND",
      gaps: [],
      decayingFactors: [],
      memoryResults: [
        {
          hypothesisId: "hyp-old-1",
          title: "Previous Momentum Hypothesis",
          status: "rejected",
          targetRegime: "BULL_TREND",
          lessonsLearned: "Too sensitive to noise",
        },
      ],
      factorZooSummary: "Test summary",
      trigger: createMockTrigger(),
    };

    const prompt = buildIdeaAgentUserPrompt(context);

    expect(prompt).toContain("hyp-old-1");
    expect(prompt).toContain("Previous Momentum Hypothesis");
    expect(prompt).toContain("rejected");
  });
});

describe("buildFactorZooSummary", () => {
  test("formats stats correctly", () => {
    const stats = createMockStats({
      totalFactors: 15,
      activeFactors: 8,
      decayingFactors: 2,
    });
    const activeNames = ["Momentum", "Value", "Quality"];

    const summary = buildFactorZooSummary(stats, activeNames);

    expect(summary).toContain("Total Factors: 15");
    expect(summary).toContain("Active Factors: 8");
    expect(summary).toContain("Decaying Factors: 2");
    expect(summary).toContain("Momentum, Value, Quality");
  });

  test("handles empty active factors", () => {
    const stats = createMockStats();
    const summary = buildFactorZooSummary(stats, []);

    expect(summary).toContain("Active Factor Names: None");
  });
});

// ============================================
// IdeaAgent Service Tests
// ============================================

describe("IdeaAgent.buildContext", () => {
  test("builds context from repository data", async () => {
    const mockRepo = createMockRepository({
      findActiveFactors: mock(() =>
        Promise.resolve([
          createMockFactor({ factorId: "f1", name: "Momentum" }),
          createMockFactor({ factorId: "f2", name: "Value" }),
        ])
      ),
      findDecayingFactors: mock(() =>
        Promise.resolve([createMockFactor({ factorId: "f3", name: "Old Factor", decayRate: 0.01 })])
      ),
    });

    const agent = new IdeaAgent({ factorZoo: mockRepo });
    const trigger = createMockTrigger();
    const context = await agent.buildContext(trigger);

    expect(context.regime).toBe("HIGH_VOL");
    expect(context.gaps).toContain("HIGH_VOL");
    expect(context.decayingFactors).toHaveLength(1);
    expect(context.factorZooSummary).toContain("Momentum, Value");
  });

  test("extracts regime from trigger metadata", async () => {
    const mockRepo = createMockRepository();
    const agent = new IdeaAgent({ factorZoo: mockRepo });

    const trigger = createMockTrigger({
      metadata: { currentRegime: "BEAR_TREND" },
    });
    const context = await agent.buildContext(trigger);

    expect(context.regime).toBe("BEAR_TREND");
  });
});

describe("IdeaAgent.generateHypothesis", () => {
  const mockLLMResponse = `<analysis>
I analyzed the trigger and found a regime gap in HIGH_VOL.
</analysis>

<output>
{
  "hypothesis_id": "hyp-123-vol-breakout",
  "title": "Volatility Breakout Strategy",
  "economic_rationale": "During high volatility regimes, there is a tendency for momentum to cluster. This creates predictable patterns as institutions rebalance.",
  "market_mechanism": "BEHAVIORAL_BIAS",
  "target_regime": "HIGH_VOL",
  "expected_metrics": {
    "ic_target": 0.05,
    "sharpe_target": 1.5,
    "decay_half_life_days": 60
  },
  "falsification_criteria": [
    "IC drops below 0.02 for 20 consecutive days",
    "Strategy loses money in 3 consecutive HIGH_VOL periods"
  ],
  "required_features": ["volatility", "momentum", "volume"],
  "parameter_count": 5,
  "related_literature": [
    {
      "title": "Volatility Clustering in Financial Markets",
      "authors": "Smith et al.",
      "url": "https://example.com/paper",
      "relevance": "Provides theoretical foundation"
    }
  ],
  "originality_justification": "Combines volatility clustering with momentum signals",
  "similar_past_hypotheses": [],
  "implementation_hints": "Use ATR for volatility measurement"
}
</output>`;

  test("generates hypothesis from LLM response", async () => {
    const mockRepo = createMockRepository();
    const mockLLM = createMockLLMProvider(mockLLMResponse);

    const agent = new IdeaAgent({ factorZoo: mockRepo }, mockLLM);
    const trigger = createMockTrigger();

    const result = await agent.generateHypothesis(trigger);

    expect(result.hypothesis.title).toBe("Volatility Breakout Strategy");
    expect(result.hypothesis.economicRationale).toContain("high volatility regimes");
    expect(result.hypothesis.marketMechanism).toBe("BEHAVIORAL_BIAS");
    expect(result.hypothesis.targetRegime).toBe("volatile");
    expect(result.hypothesis.status).toBe("proposed");
  });

  test("throws error when LLM not configured", async () => {
    const mockRepo = createMockRepository();
    const agent = new IdeaAgent({ factorZoo: mockRepo });
    const trigger = createMockTrigger();

    await expect(agent.generateHypothesis(trigger)).rejects.toThrow("LLM provider not configured");
  });

  test("stores hypothesis in repository", async () => {
    const createHypothesisMock = mock((h) =>
      Promise.resolve({
        hypothesisId: "hyp-stored-123",
        ...h,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as Hypothesis)
    );

    const mockRepo = createMockRepository({
      createHypothesis: createHypothesisMock,
    });
    const mockLLM = createMockLLMProvider(mockLLMResponse);

    const agent = new IdeaAgent({ factorZoo: mockRepo }, mockLLM);
    await agent.generateHypothesis(createMockTrigger());

    expect(createHypothesisMock).toHaveBeenCalledTimes(1);
  });
});

describe("IdeaAgent.validateOriginality", () => {
  test("detects similar factors", async () => {
    const mockRepo = createMockRepository({
      findActiveFactors: mock(() =>
        Promise.resolve([
          createMockFactor({ factorId: "f1", name: "Momentum Factor" }),
          createMockFactor({ factorId: "f2", name: "Value Factor" }),
        ])
      ),
    });

    const agent = new IdeaAgent({ factorZoo: mockRepo });
    const result = await agent.validateOriginality({
      title: "Momentum Factor", // Exact match
      economicRationale: "Test",
      marketMechanism: "BEHAVIORAL_BIAS",
      targetRegime: "bull",
      falsificationCriteria: { conditions: [], thresholds: undefined, timeHorizon: undefined },
      status: "proposed",
      iteration: 1,
      parentHypothesisId: null,
    });

    expect(result.isOriginal).toBe(false);
    expect(result.similarFactors).toHaveLength(1);
    expect(result.similarFactors[0]?.factorId).toBe("f1");
  });

  test("approves original hypotheses", async () => {
    const mockRepo = createMockRepository({
      findActiveFactors: mock(() =>
        Promise.resolve([
          createMockFactor({ factorId: "f1", name: "Momentum Factor" }),
          createMockFactor({ factorId: "f2", name: "Value Factor" }),
        ])
      ),
    });

    const agent = new IdeaAgent({ factorZoo: mockRepo });
    const result = await agent.validateOriginality({
      title: "Volatility Regime Switching",
      economicRationale: "Test",
      marketMechanism: "STRUCTURAL_CONSTRAINT",
      targetRegime: "volatile",
      falsificationCriteria: { conditions: [], thresholds: undefined, timeHorizon: undefined },
      status: "proposed",
      iteration: 1,
      parentHypothesisId: null,
    });

    expect(result.isOriginal).toBe(true);
    expect(result.similarFactors).toHaveLength(0);
  });
});

describe("IdeaAgent.querySimilarHypotheses", () => {
  test("returns empty when no helix client", async () => {
    const mockRepo = createMockRepository();
    const agent = new IdeaAgent({ factorZoo: mockRepo });

    const results = await agent.querySimilarHypotheses("momentum strategy");

    expect(results).toHaveLength(0);
  });

  test("queries helix client when available", async () => {
    const mockRepo = createMockRepository();
    const mockHelixQuery = mock(() =>
      Promise.resolve([
        {
          hypothesis_id: "hyp-old-1",
          title: "Old Momentum Hypothesis",
          status: "rejected",
          target_regime: "bull",
          ic: 0.02,
          lessons_learned: "Too noisy",
        },
      ])
    );

    const mockHelix = {
      query: mockHelixQuery,
      vectorSearch: mock(() => Promise.resolve([])),
    } as HelixClient;

    const agent = new IdeaAgent({ factorZoo: mockRepo, helixClient: mockHelix });
    const results = await agent.querySimilarHypotheses("momentum strategy");

    expect(mockHelixQuery).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect(results[0]?.hypothesisId).toBe("hyp-old-1");
    expect(results[0]?.status).toBe("rejected");
  });

  test("handles helix query errors gracefully", async () => {
    const mockRepo = createMockRepository();
    const mockHelix = {
      query: mock(() => Promise.reject(new Error("Connection failed"))),
      vectorSearch: mock(() => Promise.resolve([])),
    } as HelixClient;

    const agent = new IdeaAgent({ factorZoo: mockRepo, helixClient: mockHelix });
    const results = await agent.querySimilarHypotheses("momentum strategy");

    expect(results).toHaveLength(0);
  });
});
