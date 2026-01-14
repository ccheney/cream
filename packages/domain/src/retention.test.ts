/**
 * Retention Policy Tests
 */

import { describe, expect, it } from "bun:test";
import {
	ALL_RETENTION_POLICIES,
	BACKTEST_RETENTION_POLICIES,
	DURATIONS,
	getCompliancePolicies,
	getPoliciesForEnvironment,
	getRetentionPolicy,
	getTargetTier,
	getTransitionDecision,
	isSECCompliant,
	LIVE_RETENTION_POLICIES,
	type NodeAgeInfo,
	PAPER_RETENTION_POLICIES,
	PERMANENT,
	type RetentionNodeType,
	type RetentionPolicy,
	STORAGE_TIER_SPECS,
	StorageTier,
	validateCompliancePolicies,
} from "./retention";

// ============================================
// Storage Tier Tests
// ============================================

describe("StorageTier", () => {
	it("has HOT, WARM, COLD tiers", () => {
		expect(StorageTier.parse("HOT")).toBe("HOT");
		expect(StorageTier.parse("WARM")).toBe("WARM");
		expect(StorageTier.parse("COLD")).toBe("COLD");
	});

	it("rejects invalid tiers", () => {
		const result = StorageTier.safeParse("INVALID");
		expect(result.success).toBe(false);
	});
});

describe("STORAGE_TIER_SPECS", () => {
	it("HOT tier has full embeddings", () => {
		expect(STORAGE_TIER_SPECS.HOT.embeddings).toBe("full");
		expect(STORAGE_TIER_SPECS.HOT.graph).toBe("complete");
		expect(STORAGE_TIER_SPECS.HOT.indexes).toBe("all");
		expect(STORAGE_TIER_SPECS.HOT.compressionRatio).toBe(1.0);
	});

	it("WARM tier has compressed embeddings", () => {
		expect(STORAGE_TIER_SPECS.WARM.embeddings).toBe("int8_quantized");
		expect(STORAGE_TIER_SPECS.WARM.graph).toBe("pruned");
		expect(STORAGE_TIER_SPECS.WARM.indexes).toBe("reduced");
		expect(STORAGE_TIER_SPECS.WARM.compressionRatio).toBe(0.25);
	});

	it("COLD tier has no embeddings", () => {
		expect(STORAGE_TIER_SPECS.COLD.embeddings).toBe("none");
		expect(STORAGE_TIER_SPECS.COLD.graph).toBe("minimal");
		expect(STORAGE_TIER_SPECS.COLD.indexes).toBe("none");
		expect(STORAGE_TIER_SPECS.COLD.compressionRatio).toBe(0.1);
	});
});

// ============================================
// Duration Constants Tests
// ============================================

describe("DURATIONS", () => {
	it("has correct values", () => {
		expect(DURATIONS.DAYS_7).toBe(7);
		expect(DURATIONS.DAYS_30).toBe(30);
		expect(DURATIONS.DAYS_90).toBe(90);
		expect(DURATIONS.YEAR_1).toBe(365);
		expect(DURATIONS.YEAR_2).toBe(730);
		expect(DURATIONS.YEAR_6).toBe(2190);
		expect(DURATIONS.PERMANENT).toBe(-1);
	});

	it("PERMANENT equals -1", () => {
		expect(PERMANENT).toBe(-1);
	});
});

// ============================================
// LIVE Retention Policy Tests
// ============================================

describe("LIVE_RETENTION_POLICIES", () => {
	it("TradeDecision requires 6+ years (permanent)", () => {
		const policy = LIVE_RETENTION_POLICIES.find((p) => p.nodeType === "TradeDecision");
		expect(policy).toBeDefined();
		expect(policy!.totalRetentionDays).toBe(PERMANENT);
		expect(policy!.complianceRequired).toBe(true);
	});

	it("TradeDecision has HOT(2y) → WARM(4y) → COLD(permanent)", () => {
		const policy = LIVE_RETENTION_POLICIES.find((p) => p.nodeType === "TradeDecision");
		expect(policy!.periods.length).toBe(3);
		expect(policy!.periods[0]).toEqual({ tier: "HOT", durationDays: DURATIONS.YEAR_2 });
		expect(policy!.periods[1]).toEqual({ tier: "WARM", durationDays: DURATIONS.YEAR_4 });
		expect(policy!.periods[2]).toEqual({ tier: "COLD", durationDays: PERMANENT });
	});

	it("TradeLifecycleEvent requires 6+ years (permanent)", () => {
		const policy = LIVE_RETENTION_POLICIES.find((p) => p.nodeType === "TradeLifecycleEvent");
		expect(policy).toBeDefined();
		expect(policy!.totalRetentionDays).toBe(PERMANENT);
		expect(policy!.complianceRequired).toBe(true);
	});

	it("ExternalEvent_MACRO has permanent retention", () => {
		const policy = LIVE_RETENTION_POLICIES.find((p) => p.nodeType === "ExternalEvent_MACRO");
		expect(policy).toBeDefined();
		expect(policy!.totalRetentionDays).toBe(PERMANENT);
	});

	it("ExternalEvent_SENTIMENT_SPIKE has 90 days retention", () => {
		const policy = LIVE_RETENTION_POLICIES.find(
			(p) => p.nodeType === "ExternalEvent_SENTIMENT_SPIKE"
		);
		expect(policy).toBeDefined();
		expect(policy!.totalRetentionDays).toBe(DURATIONS.DAYS_90);
	});
});

// ============================================
// PAPER Retention Policy Tests
// ============================================

describe("PAPER_RETENTION_POLICIES", () => {
	it("TradeDecision has ~3 years retention", () => {
		const policy = PAPER_RETENTION_POLICIES.find((p) => p.nodeType === "TradeDecision");
		expect(policy).toBeDefined();
		expect(policy!.totalRetentionDays).toBe(DURATIONS.YEAR_3 + DURATIONS.DAYS_90);
		expect(policy!.complianceRequired).toBe(false);
	});

	it("TradeLifecycleEvent has ~1 year retention", () => {
		const policy = PAPER_RETENTION_POLICIES.find((p) => p.nodeType === "TradeLifecycleEvent");
		expect(policy).toBeDefined();
		expect(policy!.totalRetentionDays).toBe(DURATIONS.YEAR_1 + DURATIONS.DAYS_90);
	});
});

// ============================================
// BACKTEST Retention Policy Tests
// ============================================

describe("BACKTEST_RETENTION_POLICIES", () => {
	it("TradeDecision has 120 days retention", () => {
		const policy = BACKTEST_RETENTION_POLICIES.find((p) => p.nodeType === "TradeDecision");
		expect(policy).toBeDefined();
		expect(policy!.totalRetentionDays).toBe(DURATIONS.DAYS_120);
	});

	it("TradeLifecycleEvent has 37 days retention", () => {
		const policy = BACKTEST_RETENTION_POLICIES.find((p) => p.nodeType === "TradeLifecycleEvent");
		expect(policy).toBeDefined();
		expect(policy!.totalRetentionDays).toBe(DURATIONS.DAYS_30 + DURATIONS.DAYS_7);
	});
});

// ============================================
// Policy Lookup Tests
// ============================================

describe("getRetentionPolicy", () => {
	it("returns policy for LIVE TradeDecision", () => {
		const policy = getRetentionPolicy("TradeDecision", "LIVE");
		expect(policy).toBeDefined();
		expect(policy!.environment).toBe("LIVE");
		expect(policy!.nodeType).toBe("TradeDecision");
	});

	it("returns policy for PAPER TradeDecision", () => {
		const policy = getRetentionPolicy("TradeDecision", "PAPER");
		expect(policy).toBeDefined();
		expect(policy!.environment).toBe("PAPER");
	});

	it("returns undefined for unknown node type", () => {
		const policy = getRetentionPolicy("NewsItem", "BACKTEST");
		expect(policy).toBeUndefined();
	});
});

describe("getPoliciesForEnvironment", () => {
	it("returns all LIVE policies", () => {
		const policies = getPoliciesForEnvironment("LIVE");
		expect(policies.length).toBe(LIVE_RETENTION_POLICIES.length);
		for (const p of policies) {
			expect(p.environment).toBe("LIVE");
		}
	});
});

describe("getCompliancePolicies", () => {
	it("returns only policies with complianceRequired=true", () => {
		const policies = getCompliancePolicies();
		expect(policies.length).toBeGreaterThan(0);
		for (const p of policies) {
			expect(p.complianceRequired).toBe(true);
		}
	});

	it("includes LIVE TradeDecision", () => {
		const policies = getCompliancePolicies();
		const hasTradeDecision = policies.some(
			(p) => p.nodeType === "TradeDecision" && p.environment === "LIVE"
		);
		expect(hasTradeDecision).toBe(true);
	});
});

// ============================================
// Tier Transition Tests
// ============================================

describe("getTransitionDecision", () => {
	it("keeps new node in HOT tier", () => {
		const nodeInfo: NodeAgeInfo = {
			ageDays: 10,
			currentTier: "HOT",
			nodeType: "TradeDecision",
			environment: "LIVE",
		};

		const result = getTransitionDecision(nodeInfo);

		expect(result.shouldTransition).toBe(false);
		expect(result.shouldDelete).toBe(false);
		expect(result.reason).toContain("correct tier");
	});

	it("transitions to WARM after 2 years for LIVE TradeDecision", () => {
		const nodeInfo: NodeAgeInfo = {
			ageDays: DURATIONS.YEAR_2 + 1, // Just past 2 year threshold
			currentTier: "HOT",
			nodeType: "TradeDecision",
			environment: "LIVE",
		};

		const result = getTransitionDecision(nodeInfo);

		expect(result.shouldTransition).toBe(true);
		expect(result.targetTier).toBe("WARM");
		expect(result.shouldDelete).toBe(false);
	});

	it("transitions to COLD after 6 years for LIVE TradeDecision", () => {
		const nodeInfo: NodeAgeInfo = {
			ageDays: DURATIONS.YEAR_6 + 1,
			currentTier: "WARM",
			nodeType: "TradeDecision",
			environment: "LIVE",
		};

		const result = getTransitionDecision(nodeInfo);

		expect(result.shouldTransition).toBe(true);
		expect(result.targetTier).toBe("COLD");
		expect(result.shouldDelete).toBe(false);
	});

	it("deletes BACKTEST TradeDecision after 120 days", () => {
		const nodeInfo: NodeAgeInfo = {
			ageDays: DURATIONS.DAYS_120 + 1,
			currentTier: "WARM",
			nodeType: "TradeDecision",
			environment: "BACKTEST",
		};

		const result = getTransitionDecision(nodeInfo);

		expect(result.shouldDelete).toBe(true);
		expect(result.reason).toContain("exceeded total retention");
	});

	it("handles unknown node type gracefully", () => {
		const nodeInfo: NodeAgeInfo = {
			ageDays: 10,
			currentTier: "HOT",
			nodeType: "NewsItem" as RetentionNodeType,
			environment: "BACKTEST",
		};

		const result = getTransitionDecision(nodeInfo);

		expect(result.shouldTransition).toBe(false);
		expect(result.reason).toContain("No retention policy");
	});

	it("calculates days until next transition", () => {
		const nodeInfo: NodeAgeInfo = {
			ageDays: 100,
			currentTier: "HOT",
			nodeType: "TradeDecision",
			environment: "LIVE",
		};

		const result = getTransitionDecision(nodeInfo);

		expect(result.daysUntilNextTransition).toBeDefined();
		expect(result.daysUntilNextTransition).toBe(DURATIONS.YEAR_2 - 100);
	});
});

describe("getTargetTier", () => {
	it("returns HOT for new nodes", () => {
		const tier = getTargetTier(10, "TradeDecision", "LIVE");
		expect(tier).toBe("HOT");
	});

	it("returns WARM for 3-year-old LIVE TradeDecision", () => {
		const tier = getTargetTier(DURATIONS.YEAR_3, "TradeDecision", "LIVE");
		expect(tier).toBe("WARM");
	});

	it("returns COLD for 7-year-old LIVE TradeDecision", () => {
		const tier = getTargetTier(DURATIONS.YEAR_6 + 1, "TradeDecision", "LIVE");
		expect(tier).toBe("COLD");
	});

	it("returns null for expired BACKTEST data", () => {
		const tier = getTargetTier(DURATIONS.DAYS_120 + 1, "TradeDecision", "BACKTEST");
		expect(tier).toBeNull();
	});

	it("returns null for unknown node type", () => {
		const tier = getTargetTier(10, "Unknown" as RetentionNodeType, "LIVE");
		expect(tier).toBeNull();
	});
});

// ============================================
// Compliance Tests
// ============================================

describe("isSECCompliant", () => {
	it("LIVE TradeDecision is SEC compliant", () => {
		const policy = getRetentionPolicy("TradeDecision", "LIVE")!;
		expect(isSECCompliant(policy)).toBe(true);
	});

	it("PAPER TradeDecision is NOT SEC compliant", () => {
		const policy = getRetentionPolicy("TradeDecision", "PAPER")!;
		expect(isSECCompliant(policy)).toBe(false);
	});

	it("requires 6 years total retention", () => {
		const shortRetention: RetentionPolicy = {
			nodeType: "TradeDecision",
			environment: "LIVE",
			periods: [{ tier: "HOT", durationDays: DURATIONS.YEAR_3 }],
			totalRetentionDays: DURATIONS.YEAR_3,
			complianceRequired: true,
		};

		expect(isSECCompliant(shortRetention)).toBe(false);
	});

	it("requires 2 years accessible (HOT or WARM)", () => {
		const coldTooSoon: RetentionPolicy = {
			nodeType: "TradeDecision",
			environment: "LIVE",
			periods: [
				{ tier: "HOT", durationDays: DURATIONS.YEAR_1 },
				{ tier: "COLD", durationDays: PERMANENT },
			],
			totalRetentionDays: PERMANENT,
			complianceRequired: true,
		};

		expect(isSECCompliant(coldTooSoon)).toBe(false);
	});
});

describe("validateCompliancePolicies", () => {
	it("validates all compliance policies", () => {
		const result = validateCompliancePolicies();
		expect(result.valid).toBe(true);
		expect(result.violations.length).toBe(0);
	});
});

// ============================================
// ALL_RETENTION_POLICIES Tests
// ============================================

describe("ALL_RETENTION_POLICIES", () => {
	it("has policies for all environments", () => {
		expect(ALL_RETENTION_POLICIES.LIVE).toBeDefined();
		expect(ALL_RETENTION_POLICIES.PAPER).toBeDefined();
		expect(ALL_RETENTION_POLICIES.BACKTEST).toBeDefined();
	});

	it("LIVE has the most policies", () => {
		expect(ALL_RETENTION_POLICIES.LIVE.length).toBeGreaterThan(ALL_RETENTION_POLICIES.PAPER.length);
		expect(ALL_RETENTION_POLICIES.LIVE.length).toBeGreaterThan(
			ALL_RETENTION_POLICIES.BACKTEST.length
		);
	});
});
