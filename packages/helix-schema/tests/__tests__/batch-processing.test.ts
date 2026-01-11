/**
 * Batch Processing Tests
 *
 * Tests for batch forgetting decisions, filtering, and metrics.
 */

import { describe, expect, it } from "bun:test";
import {
  batchGetForgettingDecisions,
  calculateForgettingMetrics,
  filterForDeletion,
  filterForSummarization,
} from "../../src/retention/forgetting.js";
import { createNodeInfo, daysAgo } from "./fixtures.js";

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

    expect(toDelete.some((d) => d.nodeId === "ancient")).toBe(true);
  });
});

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
    expect(metrics.complianceOverrideCount).toBe(1);
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
