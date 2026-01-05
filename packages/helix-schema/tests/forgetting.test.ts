/**
 * Active Forgetting Policy Tests
 *
 * Tests for Ebbinghaus forgetting curve implementation.
 */

import { describe, expect, it } from "bun:test";
import {
  // Constants
  DECAY_CONSTANT_DAYS,
  COMPLIANCE_PERIOD_DAYS,
  FREQUENCY_SCALE_FACTOR,
  PNL_NORMALIZATION_FACTOR,
  EDGE_COUNT_NORMALIZATION_FACTOR,
  SUMMARIZATION_THRESHOLD,
  DELETION_THRESHOLD,
  INFINITE_RETENTION,
  DEFAULT_PRUNING_CONFIG,
  // Types
  ForgettingEnvironment,
  ForgettingNodeType,
  type NodeInfo,
  type EdgeInfo,
  type NodeConnectivity,
  type TradeDecisionInfo,
  // Core functions
  calculateRecency,
  calculateFrequency,
  calculateImportance,
  hasComplianceOverride,
  calculateRetentionScore,
  shouldSummarize,
  shouldDelete,
  getForgettingDecision,
  // Batch processing
  batchGetForgettingDecisions,
  filterForSummarization,
  filterForDeletion,
  // Trade cohort summarization
  createTradeCohortSummary,
  groupDecisionsForSummarization,
  formatQuarterlyPeriod,
  formatMonthlyPeriod,
  // Graph pruning
  pruneEdgesByWeight,
  findIsolatedNodes,
  findHubsTooPrune,
  evaluateSubgraphForMerge,
  // Access tracking
  recordAccess,
  daysSinceLastAccess,
  // Metrics
  calculateForgettingMetrics,
} from "../src/retention/forgetting";

// ============================================
// Test Helpers
// ============================================

function createNodeInfo(overrides: Partial<NodeInfo> = {}): NodeInfo {
  return {
    id: "test-node-1",
    nodeType: "TradeDecision",
    environment: "PAPER",
    createdAt: new Date(),
    accessCount: 0,
    edgeCount: 0,
    ...overrides,
  };
}

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

// ============================================
// Constants Tests
// ============================================

describe("Constants", () => {
  it("DECAY_CONSTANT_DAYS is 365 (1 year)", () => {
    expect(DECAY_CONSTANT_DAYS).toBe(365);
  });

  it("COMPLIANCE_PERIOD_DAYS is 6 years", () => {
    expect(COMPLIANCE_PERIOD_DAYS).toBe(6 * 365);
  });

  it("SUMMARIZATION_THRESHOLD is 0.1", () => {
    expect(SUMMARIZATION_THRESHOLD).toBe(0.1);
  });

  it("DELETION_THRESHOLD is 0.05", () => {
    expect(DELETION_THRESHOLD).toBe(0.05);
  });

  it("INFINITE_RETENTION is positive infinity", () => {
    expect(INFINITE_RETENTION).toBe(Number.POSITIVE_INFINITY);
  });

  it("DEFAULT_PRUNING_CONFIG has correct values", () => {
    expect(DEFAULT_PRUNING_CONFIG.minEdgeWeight).toBe(0.3);
    expect(DEFAULT_PRUNING_CONFIG.maxIsolatedSubgraphSize).toBe(5);
    expect(DEFAULT_PRUNING_CONFIG.maxHubEdges).toBe(100);
    expect(DEFAULT_PRUNING_CONFIG.hubEdgeThreshold).toBe(1000);
  });
});

// ============================================
// Zod Schema Tests
// ============================================

describe("ForgettingEnvironment", () => {
  it("accepts LIVE, PAPER, BACKTEST", () => {
    expect(ForgettingEnvironment.parse("LIVE")).toBe("LIVE");
    expect(ForgettingEnvironment.parse("PAPER")).toBe("PAPER");
    expect(ForgettingEnvironment.parse("BACKTEST")).toBe("BACKTEST");
  });

  it("rejects invalid environments", () => {
    const result = ForgettingEnvironment.safeParse("INVALID");
    expect(result.success).toBe(false);
  });
});

describe("ForgettingNodeType", () => {
  it("accepts valid node types", () => {
    expect(ForgettingNodeType.parse("TradeDecision")).toBe("TradeDecision");
    expect(ForgettingNodeType.parse("TradeLifecycleEvent")).toBe("TradeLifecycleEvent");
    expect(ForgettingNodeType.parse("ExternalEvent")).toBe("ExternalEvent");
    expect(ForgettingNodeType.parse("FilingChunk")).toBe("FilingChunk");
    expect(ForgettingNodeType.parse("TranscriptChunk")).toBe("TranscriptChunk");
    expect(ForgettingNodeType.parse("NewsItem")).toBe("NewsItem");
    expect(ForgettingNodeType.parse("Company")).toBe("Company");
    expect(ForgettingNodeType.parse("MacroEntity")).toBe("MacroEntity");
  });
});

// ============================================
// Recency Calculation Tests
// ============================================

describe("calculateRecency", () => {
  it("returns 1.0 for age 0", () => {
    expect(calculateRecency(0)).toBe(1.0);
  });

  it("returns approximately 1/e for age equal to decay constant", () => {
    const recency = calculateRecency(DECAY_CONSTANT_DAYS);
    const expected = 1 / Math.E;
    expect(Math.abs(recency - expected)).toBeLessThan(0.0001);
  });

  it("decays exponentially with age", () => {
    const r30 = calculateRecency(30);
    const r90 = calculateRecency(90);
    const r365 = calculateRecency(365);
    const r730 = calculateRecency(730);

    // Verify decay order
    expect(r30).toBeGreaterThan(r90);
    expect(r90).toBeGreaterThan(r365);
    expect(r365).toBeGreaterThan(r730);

    // Verify approximate values
    expect(r30).toBeCloseTo(0.921, 2);
    expect(r90).toBeCloseTo(0.781, 2);
    expect(r365).toBeCloseTo(0.368, 2);
    expect(r730).toBeCloseTo(0.135, 2);
  });

  it("throws for negative age", () => {
    expect(() => calculateRecency(-1)).toThrow("Age cannot be negative");
  });

  it("accepts custom decay constant", () => {
    // With 30-day half-life
    const recency = calculateRecency(30, 30);
    expect(recency).toBeCloseTo(1 / Math.E, 3);
  });
});

// ============================================
// Frequency Calculation Tests
// ============================================

describe("calculateFrequency", () => {
  it("returns 0 for access count 0", () => {
    expect(calculateFrequency(0)).toBe(0);
  });

  it("increases logarithmically with access count", () => {
    const f1 = calculateFrequency(1);
    const f10 = calculateFrequency(10);
    const f100 = calculateFrequency(100);

    expect(f1).toBeLessThan(f10);
    expect(f10).toBeLessThan(f100);

    // Log scaling means 10x increase doesn't mean 10x frequency
    expect(f100 / f10).toBeLessThan(2);
  });

  it("throws for negative access count", () => {
    expect(() => calculateFrequency(-1)).toThrow("Access count cannot be negative");
  });

  it("calculates correct values", () => {
    // log(1 + 1) / 10 = log(2) / 10 ≈ 0.0693
    expect(calculateFrequency(1)).toBeCloseTo(Math.log(2) / FREQUENCY_SCALE_FACTOR, 4);

    // log(1 + 100) / 10 = log(101) / 10 ≈ 0.462
    expect(calculateFrequency(100)).toBeCloseTo(Math.log(101) / FREQUENCY_SCALE_FACTOR, 4);
  });
});

// ============================================
// Importance Calculation Tests
// ============================================

describe("calculateImportance", () => {
  it("uses P/L for TradeDecision nodes", () => {
    const node = createNodeInfo({
      nodeType: "TradeDecision",
      realizedPnl: 5000,
      edgeCount: 100,
    });

    const importance = calculateImportance(node);
    // |5000| / 10000 = 0.5
    expect(importance).toBe(0.5);
  });

  it("uses absolute P/L for losses", () => {
    const node = createNodeInfo({
      nodeType: "TradeDecision",
      realizedPnl: -5000,
      edgeCount: 100,
    });

    const importance = calculateImportance(node);
    // |-5000| / 10000 = 0.5
    expect(importance).toBe(0.5);
  });

  it("uses edge count for non-TradeDecision nodes", () => {
    const node = createNodeInfo({
      nodeType: "NewsItem",
      edgeCount: 25,
    });

    const importance = calculateImportance(node);
    // 25 / 50 = 0.5
    expect(importance).toBe(0.5);
  });

  it("falls back to edge count if P/L undefined", () => {
    const node = createNodeInfo({
      nodeType: "TradeDecision",
      realizedPnl: undefined,
      edgeCount: 50,
    });

    const importance = calculateImportance(node);
    // 50 / 50 = 1.0
    expect(importance).toBe(1.0);
  });
});

// ============================================
// Compliance Override Tests
// ============================================

describe("hasComplianceOverride", () => {
  it("returns true for LIVE TradeDecision under 6 years", () => {
    const node = createNodeInfo({
      nodeType: "TradeDecision",
      environment: "LIVE",
    });

    expect(hasComplianceOverride(node, 100)).toBe(true);
    expect(hasComplianceOverride(node, 365)).toBe(true);
    expect(hasComplianceOverride(node, 2189)).toBe(true);
  });

  it("returns false for LIVE TradeDecision over 6 years", () => {
    const node = createNodeInfo({
      nodeType: "TradeDecision",
      environment: "LIVE",
    });

    expect(hasComplianceOverride(node, 2190)).toBe(false);
    expect(hasComplianceOverride(node, 3000)).toBe(false);
  });

  it("returns true for LIVE TradeLifecycleEvent under 6 years", () => {
    const node = createNodeInfo({
      nodeType: "TradeLifecycleEvent",
      environment: "LIVE",
    });

    expect(hasComplianceOverride(node, 100)).toBe(true);
  });

  it("returns false for PAPER environment", () => {
    const node = createNodeInfo({
      nodeType: "TradeDecision",
      environment: "PAPER",
    });

    expect(hasComplianceOverride(node, 100)).toBe(false);
  });

  it("returns false for BACKTEST environment", () => {
    const node = createNodeInfo({
      nodeType: "TradeDecision",
      environment: "BACKTEST",
    });

    expect(hasComplianceOverride(node, 100)).toBe(false);
  });

  it("returns false for non-trade node types in LIVE", () => {
    const node = createNodeInfo({
      nodeType: "NewsItem",
      environment: "LIVE",
    });

    expect(hasComplianceOverride(node, 100)).toBe(false);
  });
});

// ============================================
// Retention Score Tests
// ============================================

describe("calculateRetentionScore", () => {
  it("returns breakdown with all components", () => {
    const node = createNodeInfo({
      createdAt: daysAgo(30),
      accessCount: 5,
      edgeCount: 10,
    });

    const breakdown = calculateRetentionScore(node);

    expect(breakdown.baseScore).toBe(1.0);
    expect(breakdown.ageDays).toBe(30);
    expect(breakdown.recencyFactor).toBeGreaterThan(0);
    expect(breakdown.frequencyFactor).toBeGreaterThan(1); // 1 + frequency
    expect(breakdown.importanceFactor).toBeGreaterThan(1); // 1 + importance
    expect(breakdown.complianceOverride).toBe(false);
    expect(breakdown.finalScore).toBeGreaterThan(0);
  });

  it("calculates higher score for newer nodes", () => {
    const newNode = createNodeInfo({ createdAt: daysAgo(7) });
    const oldNode = createNodeInfo({ createdAt: daysAgo(365) });

    const newScore = calculateRetentionScore(newNode);
    const oldScore = calculateRetentionScore(oldNode);

    expect(newScore.finalScore).toBeGreaterThan(oldScore.finalScore);
  });

  it("calculates higher score for frequently accessed nodes", () => {
    const frequentNode = createNodeInfo({ accessCount: 100 });
    const rareNode = createNodeInfo({ accessCount: 0 });

    const frequentScore = calculateRetentionScore(frequentNode);
    const rareScore = calculateRetentionScore(rareNode);

    expect(frequentScore.finalScore).toBeGreaterThan(rareScore.finalScore);
  });

  it("calculates higher score for important trades", () => {
    const bigWin = createNodeInfo({
      nodeType: "TradeDecision",
      realizedPnl: 50000,
    });
    const smallWin = createNodeInfo({
      nodeType: "TradeDecision",
      realizedPnl: 100,
    });

    const bigScore = calculateRetentionScore(bigWin);
    const smallScore = calculateRetentionScore(smallWin);

    expect(bigScore.finalScore).toBeGreaterThan(smallScore.finalScore);
  });

  it("returns infinite score for LIVE compliance nodes", () => {
    const node = createNodeInfo({
      nodeType: "TradeDecision",
      environment: "LIVE",
      createdAt: daysAgo(100),
    });

    const breakdown = calculateRetentionScore(node);

    expect(breakdown.complianceOverride).toBe(true);
    expect(breakdown.finalScore).toBe(INFINITE_RETENTION);
  });

  it("accepts custom reference date", () => {
    const node = createNodeInfo({
      createdAt: new Date("2024-01-01"),
    });

    const refDate = new Date("2024-01-31"); // 30 days later
    const breakdown = calculateRetentionScore(node, refDate);

    expect(breakdown.ageDays).toBe(30);
  });
});

// ============================================
// Should Summarize Tests
// ============================================

describe("shouldSummarize", () => {
  it("returns true for scores below threshold", () => {
    expect(shouldSummarize(0.05)).toBe(true);
    expect(shouldSummarize(0.09)).toBe(true);
  });

  it("returns false for scores at or above threshold", () => {
    expect(shouldSummarize(0.1)).toBe(false);
    expect(shouldSummarize(0.5)).toBe(false);
    expect(shouldSummarize(1.0)).toBe(false);
  });

  it("returns false for infinite score", () => {
    expect(shouldSummarize(INFINITE_RETENTION)).toBe(false);
  });

  it("accepts custom threshold", () => {
    expect(shouldSummarize(0.4, 0.5)).toBe(true);
    expect(shouldSummarize(0.6, 0.5)).toBe(false);
  });
});

// ============================================
// Should Delete Tests
// ============================================

describe("shouldDelete", () => {
  it("returns true for low scores in PAPER/BACKTEST", () => {
    expect(shouldDelete(0.01, "PAPER")).toBe(true);
    expect(shouldDelete(0.04, "BACKTEST")).toBe(true);
  });

  it("returns false for LIVE environment", () => {
    expect(shouldDelete(0.01, "LIVE")).toBe(false);
  });

  it("returns false for scores at or above threshold", () => {
    expect(shouldDelete(0.05, "PAPER")).toBe(false);
    expect(shouldDelete(0.5, "BACKTEST")).toBe(false);
  });

  it("returns false for infinite score", () => {
    expect(shouldDelete(INFINITE_RETENTION, "PAPER")).toBe(false);
  });
});

// ============================================
// Get Forgetting Decision Tests
// ============================================

describe("getForgettingDecision", () => {
  it("returns complete decision for normal node", () => {
    const node = createNodeInfo({
      createdAt: daysAgo(30),
      accessCount: 10,
    });

    const decision = getForgettingDecision(node);

    expect(decision.nodeId).toBe(node.id);
    expect(decision.score).toBeGreaterThan(0);
    expect(decision.breakdown).toBeDefined();
    expect(typeof decision.shouldSummarize).toBe("boolean");
    expect(typeof decision.shouldDelete).toBe("boolean");
    expect(decision.reason).toBeDefined();
  });

  it("marks old unused nodes for summarization", () => {
    const node = createNodeInfo({
      createdAt: daysAgo(1000),
      accessCount: 0,
      edgeCount: 0,
    });

    const decision = getForgettingDecision(node);

    expect(decision.shouldSummarize).toBe(true);
    expect(decision.reason).toContain("summarization threshold");
  });

  it("marks very old unused BACKTEST nodes for deletion", () => {
    const node = createNodeInfo({
      createdAt: daysAgo(2000),
      accessCount: 0,
      edgeCount: 0,
      environment: "BACKTEST",
    });

    const decision = getForgettingDecision(node);

    expect(decision.shouldDelete).toBe(true);
    expect(decision.reason).toContain("deletion threshold");
  });

  it("protects LIVE compliance nodes", () => {
    const node = createNodeInfo({
      nodeType: "TradeDecision",
      environment: "LIVE",
      createdAt: daysAgo(100),
    });

    const decision = getForgettingDecision(node);

    expect(decision.breakdown.complianceOverride).toBe(true);
    expect(decision.shouldSummarize).toBe(false);
    expect(decision.shouldDelete).toBe(false);
    expect(decision.reason).toContain("Compliance override");
  });
});

// ============================================
// Batch Processing Tests
// ============================================

describe("batchGetForgettingDecisions", () => {
  it("processes multiple nodes", () => {
    const nodes = [
      createNodeInfo({ id: "node-1", createdAt: daysAgo(30) }),
      createNodeInfo({ id: "node-2", createdAt: daysAgo(365) }),
      createNodeInfo({ id: "node-3", createdAt: daysAgo(1000) }),
    ];

    const decisions = batchGetForgettingDecisions(nodes);

    expect(decisions.length).toBe(3);
    expect(decisions[0].nodeId).toBe("node-1");
    expect(decisions[1].nodeId).toBe("node-2");
    expect(decisions[2].nodeId).toBe("node-3");
  });
});

describe("filterForSummarization", () => {
  it("returns only summarization candidates", () => {
    const nodes = [
      createNodeInfo({ id: "new", createdAt: daysAgo(7) }),
      createNodeInfo({ id: "old", createdAt: daysAgo(1000), environment: "PAPER" }),
    ];

    const decisions = batchGetForgettingDecisions(nodes);
    const toSummarize = filterForSummarization(decisions);

    // Only old node should need summarization
    expect(toSummarize.length).toBeLessThanOrEqual(1);
  });
});

describe("filterForDeletion", () => {
  it("returns only deletion candidates", () => {
    const nodes = [
      createNodeInfo({ id: "new", createdAt: daysAgo(7), environment: "BACKTEST" }),
      createNodeInfo({ id: "ancient", createdAt: daysAgo(3000), environment: "BACKTEST" }),
    ];

    const decisions = batchGetForgettingDecisions(nodes);
    const toDelete = filterForDeletion(decisions);

    // Only ancient node should be deleted
    expect(toDelete.some((d) => d.nodeId === "ancient")).toBe(true);
  });
});

// ============================================
// Trade Cohort Summarization Tests
// ============================================

describe("createTradeCohortSummary", () => {
  it("creates summary from trade decisions", () => {
    const decisions: TradeDecisionInfo[] = [
      {
        decisionId: "d1",
        instrumentId: "AAPL",
        regimeLabel: "BULLISH",
        createdAt: new Date("2024-07-01"),
        closedAt: new Date("2024-07-05"),
        realizedPnl: 1000,
        returnPct: 0.05,
        isWin: true,
      },
      {
        decisionId: "d2",
        instrumentId: "AAPL",
        regimeLabel: "BULLISH",
        createdAt: new Date("2024-07-10"),
        closedAt: new Date("2024-07-12"),
        realizedPnl: -500,
        returnPct: -0.02,
        isWin: false,
      },
      {
        decisionId: "d3",
        instrumentId: "AAPL",
        regimeLabel: "BULLISH",
        createdAt: new Date("2024-07-15"),
        closedAt: new Date("2024-07-20"),
        realizedPnl: 2000,
        returnPct: 0.08,
        isWin: true,
      },
    ];

    const summary = createTradeCohortSummary("2024-Q3", "AAPL", "BULLISH", decisions);

    expect(summary.summaryType).toBe("trade_cohort");
    expect(summary.period).toBe("2024-Q3");
    expect(summary.instrumentId).toBe("AAPL");
    expect(summary.regimeLabel).toBe("BULLISH");
    expect(summary.stats.totalDecisions).toBe(3);
    expect(summary.stats.winRate).toBeCloseTo(2 / 3, 2);
    expect(summary.stats.totalPnl).toBe(2500);
    expect(summary.notableDecisionIds).toContain("d3"); // Highest P/L
  });

  it("throws for empty decisions", () => {
    expect(() => createTradeCohortSummary("2024-Q3", "AAPL", "BULLISH", [])).toThrow("Cannot create summary");
  });

  it("limits notable decisions", () => {
    const decisions: TradeDecisionInfo[] = Array.from({ length: 10 }, (_, i) => ({
      decisionId: `d${i}`,
      instrumentId: "AAPL",
      regimeLabel: "BULLISH",
      createdAt: new Date(),
      realizedPnl: i * 100,
      returnPct: 0.01,
      isWin: true,
    }));

    const summary = createTradeCohortSummary("2024-Q3", "AAPL", "BULLISH", decisions, 3);

    expect(summary.notableDecisionIds.length).toBe(3);
  });
});

describe("groupDecisionsForSummarization", () => {
  it("groups by period, instrument, and regime", () => {
    const decisions: TradeDecisionInfo[] = [
      {
        decisionId: "d1",
        instrumentId: "AAPL",
        regimeLabel: "BULLISH",
        createdAt: new Date("2024-07-01"),
        realizedPnl: 100,
        returnPct: 0.01,
        isWin: true,
      },
      {
        decisionId: "d2",
        instrumentId: "AAPL",
        regimeLabel: "BULLISH",
        createdAt: new Date("2024-08-01"),
        realizedPnl: 200,
        returnPct: 0.02,
        isWin: true,
      },
      {
        decisionId: "d3",
        instrumentId: "GOOG",
        regimeLabel: "BULLISH",
        createdAt: new Date("2024-07-15"),
        realizedPnl: 300,
        returnPct: 0.03,
        isWin: true,
      },
    ];

    const groups = groupDecisionsForSummarization(decisions);

    // AAPL Q3 BULLISH should have 2 decisions
    const aaplGroup = groups.get("2024-Q3:AAPL:BULLISH");
    expect(aaplGroup?.length).toBe(2);

    // GOOG Q3 BULLISH should have 1 decision
    const googGroup = groups.get("2024-Q3:GOOG:BULLISH");
    expect(googGroup?.length).toBe(1);
  });
});

describe("formatQuarterlyPeriod", () => {
  it("formats dates to quarterly periods", () => {
    expect(formatQuarterlyPeriod(new Date("2024-01-15"))).toBe("2024-Q1");
    expect(formatQuarterlyPeriod(new Date("2024-04-01"))).toBe("2024-Q2");
    expect(formatQuarterlyPeriod(new Date("2024-07-31"))).toBe("2024-Q3");
    expect(formatQuarterlyPeriod(new Date("2024-12-25"))).toBe("2024-Q4");
  });
});

describe("formatMonthlyPeriod", () => {
  it("formats dates to monthly periods", () => {
    expect(formatMonthlyPeriod(new Date("2024-01-15"))).toBe("2024-01");
    expect(formatMonthlyPeriod(new Date("2024-12-01"))).toBe("2024-12");
  });
});

// ============================================
// Graph Pruning Tests
// ============================================

describe("pruneEdgesByWeight", () => {
  it("returns edges below weight threshold", () => {
    const edges: EdgeInfo[] = [
      { edgeId: "e1", sourceId: "n1", targetId: "n2", weight: 0.1 },
      { edgeId: "e2", sourceId: "n2", targetId: "n3", weight: 0.5 },
      { edgeId: "e3", sourceId: "n3", targetId: "n4", weight: 0.2 },
    ];

    const actions = pruneEdgesByWeight(edges);

    expect(actions.length).toBe(2);
    expect(actions[0].type).toBe("remove_edge");
    expect(actions.some((a) => a.type === "remove_edge" && a.edgeId === "e1")).toBe(true);
    expect(actions.some((a) => a.type === "remove_edge" && a.edgeId === "e3")).toBe(true);
  });

  it("returns empty for all edges above threshold", () => {
    const edges: EdgeInfo[] = [
      { edgeId: "e1", sourceId: "n1", targetId: "n2", weight: 0.5 },
      { edgeId: "e2", sourceId: "n2", targetId: "n3", weight: 0.8 },
    ];

    const actions = pruneEdgesByWeight(edges);

    expect(actions.length).toBe(0);
  });

  it("accepts custom threshold", () => {
    const edges: EdgeInfo[] = [
      { edgeId: "e1", sourceId: "n1", targetId: "n2", weight: 0.4 },
    ];

    expect(pruneEdgesByWeight(edges, 0.3).length).toBe(0);
    expect(pruneEdgesByWeight(edges, 0.5).length).toBe(1);
  });
});

describe("findIsolatedNodes", () => {
  it("finds nodes with no edges", () => {
    const nodes: NodeConnectivity[] = [
      { nodeId: "n1", edgeIds: ["e1", "e2"] },
      { nodeId: "n2", edgeIds: [] },
      { nodeId: "n3", edgeIds: ["e3"] },
      { nodeId: "n4", edgeIds: [] },
    ];

    const actions = findIsolatedNodes(nodes);

    expect(actions.length).toBe(2);
    expect(actions.every((a) => a.type === "remove_node")).toBe(true);
    expect(actions.some((a) => a.type === "remove_node" && a.nodeId === "n2")).toBe(true);
    expect(actions.some((a) => a.type === "remove_node" && a.nodeId === "n4")).toBe(true);
  });
});

describe("findHubsTooPrune", () => {
  it("finds hubs exceeding threshold", () => {
    const nodes: NodeConnectivity[] = [
      { nodeId: "n1", edgeIds: Array.from({ length: 50 }, (_, i) => `e${i}`) },
      { nodeId: "n2", edgeIds: Array.from({ length: 1500 }, (_, i) => `e${i}`) },
    ];

    const actions = findHubsTooPrune(nodes);

    expect(actions.length).toBe(1);
    expect(actions[0].type).toBe("prune_hub");
    if (actions[0].type === "prune_hub") {
      expect(actions[0].nodeId).toBe("n2");
      expect(actions[0].retainedEdges).toBe(100);
      expect(actions[0].prunedEdges).toBe(1400);
    }
  });
});

describe("evaluateSubgraphForMerge", () => {
  it("returns merge action for small subgraphs", () => {
    const nodeIds = ["n1", "n2", "n3"];

    const action = evaluateSubgraphForMerge(nodeIds);

    expect(action).not.toBeNull();
    expect(action?.type).toBe("merge_subgraph");
    if (action?.type === "merge_subgraph") {
      expect(action.nodeIds).toEqual(nodeIds);
    }
  });

  it("returns null for subgraphs at max size", () => {
    const nodeIds = ["n1", "n2", "n3", "n4", "n5"];

    const action = evaluateSubgraphForMerge(nodeIds);

    expect(action).toBeNull();
  });

  it("returns null for single node", () => {
    const action = evaluateSubgraphForMerge(["n1"]);

    expect(action).toBeNull();
  });
});

// ============================================
// Access Tracking Tests
// ============================================

describe("recordAccess", () => {
  it("creates new record for first access", () => {
    const accessTime = new Date();
    const record = recordAccess(undefined, "node-1", accessTime);

    expect(record.nodeId).toBe("node-1");
    expect(record.accessCount).toBe(1);
    expect(record.firstAccessedAt).toEqual(accessTime);
    expect(record.lastAccessedAt).toEqual(accessTime);
  });

  it("increments count for existing record", () => {
    const firstAccess = new Date("2024-01-01");
    const secondAccess = new Date("2024-01-15");

    const first = recordAccess(undefined, "node-1", firstAccess);
    const second = recordAccess(first, "node-1", secondAccess);

    expect(second.accessCount).toBe(2);
    expect(second.firstAccessedAt).toEqual(firstAccess);
    expect(second.lastAccessedAt).toEqual(secondAccess);
  });
});

describe("daysSinceLastAccess", () => {
  it("calculates days since last access", () => {
    const record = {
      nodeId: "node-1",
      accessCount: 5,
      firstAccessedAt: new Date("2024-01-01"),
      lastAccessedAt: new Date("2024-01-01"),
    };

    const refDate = new Date("2024-01-31");
    const days = daysSinceLastAccess(record, refDate);

    expect(days).toBe(30);
  });
});

// ============================================
// Metrics Tests
// ============================================

describe("calculateForgettingMetrics", () => {
  it("calculates metrics from decisions", () => {
    const nodes = [
      createNodeInfo({ id: "n1", createdAt: daysAgo(7), environment: "PAPER" }),
      createNodeInfo({ id: "n2", createdAt: daysAgo(365), environment: "PAPER" }),
      createNodeInfo({ id: "n3", createdAt: daysAgo(1000), environment: "BACKTEST" }),
      createNodeInfo({
        id: "n4",
        nodeType: "TradeDecision",
        environment: "LIVE",
        createdAt: daysAgo(100),
      }),
    ];

    const decisions = batchGetForgettingDecisions(nodes);
    const metrics = calculateForgettingMetrics(decisions);

    expect(metrics.totalNodes).toBe(4);
    expect(metrics.complianceOverrideCount).toBe(1); // LIVE TradeDecision
    expect(metrics.scoreDistribution.infinite).toBe(1);
    expect(metrics.avgRetentionScore).toBeGreaterThan(0);
  });

  it("handles empty decisions", () => {
    const metrics = calculateForgettingMetrics([]);

    expect(metrics.totalNodes).toBe(0);
    expect(metrics.avgRetentionScore).toBe(0);
    expect(metrics.medianRetentionScore).toBe(0);
  });
});
