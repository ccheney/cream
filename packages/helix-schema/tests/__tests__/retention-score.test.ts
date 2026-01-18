/**
 * Retention Score Calculation Tests
 *
 * Tests for recency, frequency, importance, compliance override, and retention score calculations.
 */

import { describe, expect, it } from "bun:test";
import {
	calculateFrequency,
	calculateImportance,
	calculateRecency,
	calculateRetentionScore,
	DECAY_CONSTANT_DAYS,
	FREQUENCY_SCALE_FACTOR,
	hasComplianceOverride,
	INFINITE_RETENTION,
} from "../../src/retention/forgetting.js";
import { createNodeInfo, daysAgo } from "./fixtures.js";

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

		expect(r30).toBeGreaterThan(r90);
		expect(r90).toBeGreaterThan(r365);
		expect(r365).toBeGreaterThan(r730);

		expect(r30).toBeCloseTo(0.921, 2);
		expect(r90).toBeCloseTo(0.781, 2);
		expect(r365).toBeCloseTo(0.368, 2);
		expect(r730).toBeCloseTo(0.135, 2);
	});

	it("throws for negative age", () => {
		expect(() => calculateRecency(-1)).toThrow("Age cannot be negative");
	});

	it("accepts custom decay constant", () => {
		const recency = calculateRecency(30, 30);
		expect(recency).toBeCloseTo(1 / Math.E, 3);
	});
});

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

		expect(f100 / f10).toBeLessThan(2);
	});

	it("throws for negative access count", () => {
		expect(() => calculateFrequency(-1)).toThrow("Access count cannot be negative");
	});

	it("calculates correct values", () => {
		expect(calculateFrequency(1)).toBeCloseTo(Math.log(2) / FREQUENCY_SCALE_FACTOR, 4);
		expect(calculateFrequency(100)).toBeCloseTo(Math.log(101) / FREQUENCY_SCALE_FACTOR, 4);
	});
});

describe("calculateImportance", () => {
	it("uses P/L for TradeDecision nodes", () => {
		const node = createNodeInfo({
			nodeType: "TradeDecision",
			realizedPnl: 5000,
			edgeCount: 100,
		});

		const importance = calculateImportance(node);
		expect(importance).toBe(0.5);
	});

	it("uses absolute P/L for losses", () => {
		const node = createNodeInfo({
			nodeType: "TradeDecision",
			realizedPnl: -5000,
			edgeCount: 100,
		});

		const importance = calculateImportance(node);
		expect(importance).toBe(0.5);
	});

	it("uses edge count for non-TradeDecision nodes", () => {
		const node = createNodeInfo({
			nodeType: "NewsItem",
			edgeCount: 25,
		});

		const importance = calculateImportance(node);
		expect(importance).toBe(0.5);
	});

	it("falls back to edge count if P/L undefined", () => {
		const node = createNodeInfo({
			nodeType: "TradeDecision",
			realizedPnl: undefined,
			edgeCount: 50,
		});

		const importance = calculateImportance(node);
		expect(importance).toBe(1.0);
	});
});

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

	it("returns false for non-trade node types in LIVE", () => {
		const node = createNodeInfo({
			nodeType: "NewsItem",
			environment: "LIVE",
		});

		expect(hasComplianceOverride(node, 100)).toBe(false);
	});
});

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
		expect(breakdown.frequencyFactor).toBeGreaterThan(1);
		expect(breakdown.importanceFactor).toBeGreaterThan(1);
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

		const refDate = new Date("2024-01-31");
		const breakdown = calculateRetentionScore(node, refDate);

		expect(breakdown.ageDays).toBe(30);
	});
});
