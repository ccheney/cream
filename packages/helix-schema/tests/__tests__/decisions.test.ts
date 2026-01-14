/**
 * Forgetting Decision Tests
 *
 * Tests for shouldSummarize, shouldDelete, and getForgettingDecision functions.
 */

import { describe, expect, it } from "bun:test";
import {
	getForgettingDecision,
	INFINITE_RETENTION,
	shouldDelete,
	shouldSummarize,
} from "../../src/retention/forgetting.js";
import { createNodeInfo, daysAgo } from "./fixtures.js";

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
