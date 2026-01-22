/**
 * Retention Policies and Storage Tier Management
 *
 * Defines retention policies by environment and data type for compliance
 * with SEC Rule 17a-4 and FINRA requirements.
 *
 * ## Regulatory Requirements
 *
 * **SEC Rule 17a-4:**
 * - Books and records must be preserved for 6 years
 * - First 2 years must be in an easily accessible location
 * - After 2 years, records can be stored in less accessible format
 *
 * **FINRA Rules:**
 * - Trade confirmations: 3 years (2 years accessible)
 * - Account records: 6 years
 * - Customer complaint records: 4 years
 *
 * ## Storage Tier Architecture
 *
 * | Tier | Embeddings | Graph | Indexes | Latency |
 * |------|------------|-------|---------|---------|
 * | HOT  | Full       | Complete | All  | <5ms    |
 * | WARM | int8 quant | Pruned   | Reduced | <50ms |
 * | COLD | None       | Minimal  | None | seconds |
 *
 * @see docs/plans/04-memory-helixdb.md for full specification
 * @see https://www.finra.org/rules-guidance/guidance/interpretations-financial-operational-rules/sea-rule-17a-4-and-related-interpretations
 */

import { z } from "zod/v4";

/**
 * Storage tier for data lifecycle management
 */
export const StorageTier = z.enum(["HOT", "WARM", "COLD"]);
export type StorageTier = z.infer<typeof StorageTier>;

/**
 * Storage tier characteristics
 */
export interface StorageTierCharacteristics {
	/** Tier name */
	tier: StorageTier;
	/** Description */
	description: string;
	/** Embedding storage strategy */
	embeddings: "full" | "int8_quantized" | "none";
	/** Graph storage strategy */
	graph: "complete" | "pruned" | "minimal";
	/** Index strategy */
	indexes: "all" | "reduced" | "none";
	/** Expected latency */
	expectedLatency: string;
	/** Compression ratio (1.0 = no compression) */
	compressionRatio: number;
}

/**
 * Storage tier specifications
 */
export const STORAGE_TIER_SPECS: Record<StorageTier, StorageTierCharacteristics> = {
	HOT: {
		tier: "HOT",
		description: "Fully indexed and searchable, fastest access",
		embeddings: "full",
		graph: "complete",
		indexes: "all",
		expectedLatency: "<5ms",
		compressionRatio: 1.0,
	},
	WARM: {
		tier: "WARM",
		description: "Compressed embeddings, pruned graph, reduced indexes",
		embeddings: "int8_quantized",
		graph: "pruned",
		indexes: "reduced",
		expectedLatency: "<50ms",
		compressionRatio: 0.25, // 75% reduction
	},
	COLD: {
		tier: "COLD",
		description: "Archival storage, minimal footprint, async retrieval",
		embeddings: "none",
		graph: "minimal",
		indexes: "none",
		expectedLatency: "seconds",
		compressionRatio: 0.1, // 90% reduction
	},
};

/**
 * Trading environment for retention policies
 */
export const RetentionEnvironment = z.enum(["LIVE", "PAPER"]);
export type RetentionEnvironment = z.infer<typeof RetentionEnvironment>;

/**
 * Node types for retention policies
 */
export const RetentionNodeType = z.enum([
	"TradeDecision",
	"TradeLifecycleEvent",
	"FilingChunk_10K_10Q",
	"FilingChunk_8K",
	"TranscriptChunk",
	"NewsItem",
	"ExternalEvent_EARNINGS",
	"ExternalEvent_MACRO",
	"ExternalEvent_NEWS",
	"ExternalEvent_SENTIMENT_SPIKE",
]);
export type RetentionNodeType = z.infer<typeof RetentionNodeType>;

/**
 * Retention period for a storage tier
 */
export const RetentionPeriodSchema = z.object({
	/** Storage tier */
	tier: StorageTier,
	/** Duration in days (-1 = permanent) */
	durationDays: z.number().int().min(-1),
});

export type RetentionPeriod = z.infer<typeof RetentionPeriodSchema>;

/**
 * Complete retention policy for a node type + environment
 */
export const RetentionPolicySchema = z.object({
	/** Node type */
	nodeType: RetentionNodeType,
	/** Environment */
	environment: RetentionEnvironment,
	/** Tier durations (ordered HOT → WARM → COLD) */
	periods: z.array(RetentionPeriodSchema),
	/** Total retention in days (-1 = permanent) */
	totalRetentionDays: z.number().int().min(-1),
	/** SEC/FINRA compliance required */
	complianceRequired: z.boolean(),
	/** Compliance notes */
	complianceNotes: z.string().optional(),
});

export type RetentionPolicy = z.infer<typeof RetentionPolicySchema>;

const DAYS_PER_YEAR = 365;

/** Permanent retention (never delete) */
export const PERMANENT = -1;

/** Common duration values */
export const DURATIONS = {
	DAYS_7: 7,
	DAYS_30: 30,
	DAYS_90: 90,
	DAYS_120: 120,
	YEAR_1: DAYS_PER_YEAR,
	YEAR_2: 2 * DAYS_PER_YEAR,
	YEAR_3: 3 * DAYS_PER_YEAR,
	YEAR_4: 4 * DAYS_PER_YEAR,
	YEAR_5: 5 * DAYS_PER_YEAR,
	YEAR_6: 6 * DAYS_PER_YEAR,
	PERMANENT,
};

/**
 * LIVE environment retention policies (SEC/FINRA compliant)
 */
export const LIVE_RETENTION_POLICIES: RetentionPolicy[] = [
	{
		nodeType: "TradeDecision",
		environment: "LIVE",
		periods: [
			{ tier: "HOT", durationDays: DURATIONS.YEAR_2 },
			{ tier: "WARM", durationDays: DURATIONS.YEAR_4 },
			{ tier: "COLD", durationDays: PERMANENT },
		],
		totalRetentionDays: PERMANENT,
		complianceRequired: true,
		complianceNotes: "SEC Rule 17a-4: 6 years, 2 years accessible",
	},
	{
		nodeType: "TradeLifecycleEvent",
		environment: "LIVE",
		periods: [
			{ tier: "HOT", durationDays: DURATIONS.YEAR_2 },
			{ tier: "WARM", durationDays: DURATIONS.YEAR_4 },
			{ tier: "COLD", durationDays: PERMANENT },
		],
		totalRetentionDays: PERMANENT,
		complianceRequired: true,
		complianceNotes: "SEC Rule 17a-4: 6 years, 2 years accessible",
	},
	{
		nodeType: "FilingChunk_10K_10Q",
		environment: "LIVE",
		periods: [
			{ tier: "HOT", durationDays: DURATIONS.YEAR_2 },
			{ tier: "WARM", durationDays: DURATIONS.YEAR_5 },
			{ tier: "COLD", durationDays: PERMANENT },
		],
		totalRetentionDays: PERMANENT,
		complianceRequired: false,
		complianceNotes: "Annual/quarterly filings - permanent reference value",
	},
	{
		nodeType: "FilingChunk_8K",
		environment: "LIVE",
		periods: [
			{ tier: "HOT", durationDays: DURATIONS.YEAR_1 },
			{ tier: "WARM", durationDays: DURATIONS.YEAR_3 },
			{ tier: "COLD", durationDays: DURATIONS.YEAR_5 },
		],
		totalRetentionDays: DURATIONS.YEAR_5 + DURATIONS.YEAR_3 + DURATIONS.YEAR_1,
		complianceRequired: false,
	},
	{
		nodeType: "TranscriptChunk",
		environment: "LIVE",
		periods: [
			{ tier: "HOT", durationDays: DURATIONS.YEAR_1 },
			{ tier: "WARM", durationDays: DURATIONS.YEAR_2 },
			{ tier: "COLD", durationDays: DURATIONS.YEAR_5 },
		],
		totalRetentionDays: DURATIONS.YEAR_5 + DURATIONS.YEAR_2 + DURATIONS.YEAR_1,
		complianceRequired: false,
	},
	{
		nodeType: "NewsItem",
		environment: "LIVE",
		periods: [
			{ tier: "HOT", durationDays: DURATIONS.DAYS_90 },
			{ tier: "WARM", durationDays: DURATIONS.YEAR_1 },
			{ tier: "COLD", durationDays: DURATIONS.YEAR_2 },
		],
		totalRetentionDays: DURATIONS.YEAR_2 + DURATIONS.YEAR_1 + DURATIONS.DAYS_90,
		complianceRequired: false,
	},
	{
		nodeType: "ExternalEvent_EARNINGS",
		environment: "LIVE",
		periods: [
			{ tier: "HOT", durationDays: DURATIONS.YEAR_1 },
			{ tier: "WARM", durationDays: DURATIONS.YEAR_4 },
		],
		totalRetentionDays: DURATIONS.YEAR_5,
		complianceRequired: false,
	},
	{
		nodeType: "ExternalEvent_MACRO",
		environment: "LIVE",
		periods: [
			{ tier: "HOT", durationDays: DURATIONS.YEAR_2 },
			{ tier: "WARM", durationDays: PERMANENT },
		],
		totalRetentionDays: PERMANENT,
		complianceRequired: false,
		complianceNotes: "FOMC, CPI, NFP - permanent historical reference",
	},
	{
		nodeType: "ExternalEvent_NEWS",
		environment: "LIVE",
		periods: [
			{ tier: "HOT", durationDays: DURATIONS.DAYS_90 },
			{ tier: "WARM", durationDays: DURATIONS.YEAR_1 - DURATIONS.DAYS_90 },
		],
		totalRetentionDays: DURATIONS.YEAR_1,
		complianceRequired: false,
	},
	{
		nodeType: "ExternalEvent_SENTIMENT_SPIKE",
		environment: "LIVE",
		periods: [{ tier: "HOT", durationDays: DURATIONS.DAYS_90 }],
		totalRetentionDays: DURATIONS.DAYS_90,
		complianceRequired: false,
	},
];

/**
 * PAPER environment retention policies (shorter retention)
 */
export const PAPER_RETENTION_POLICIES: RetentionPolicy[] = [
	{
		nodeType: "TradeDecision",
		environment: "PAPER",
		periods: [
			{ tier: "HOT", durationDays: DURATIONS.DAYS_90 },
			{ tier: "WARM", durationDays: DURATIONS.YEAR_1 },
			{ tier: "COLD", durationDays: DURATIONS.YEAR_2 },
		],
		totalRetentionDays: DURATIONS.YEAR_3 + DURATIONS.DAYS_90,
		complianceRequired: false,
	},
	{
		nodeType: "TradeLifecycleEvent",
		environment: "PAPER",
		periods: [
			{ tier: "HOT", durationDays: DURATIONS.DAYS_90 },
			{ tier: "WARM", durationDays: DURATIONS.YEAR_1 },
		],
		totalRetentionDays: DURATIONS.YEAR_1 + DURATIONS.DAYS_90,
		complianceRequired: false,
	},
];

/**
 * All retention policies indexed by environment
 */
export const ALL_RETENTION_POLICIES: Record<RetentionEnvironment, RetentionPolicy[]> = {
	LIVE: LIVE_RETENTION_POLICIES,
	PAPER: PAPER_RETENTION_POLICIES,
};

/**
 * Get retention policy for a node type and environment
 *
 * @param nodeType - Node type
 * @param environment - Environment
 * @returns Retention policy or undefined if not found
 */
export function getRetentionPolicy(
	nodeType: RetentionNodeType,
	environment: RetentionEnvironment,
): RetentionPolicy | undefined {
	const policies = ALL_RETENTION_POLICIES[environment];
	return policies.find((p) => p.nodeType === nodeType);
}

/**
 * Get all policies for an environment
 */
export function getPoliciesForEnvironment(environment: RetentionEnvironment): RetentionPolicy[] {
	return ALL_RETENTION_POLICIES[environment];
}

/**
 * Get all policies requiring compliance
 */
export function getCompliancePolicies(): RetentionPolicy[] {
	return Object.values(ALL_RETENTION_POLICIES)
		.flat()
		.filter((p) => p.complianceRequired);
}

/**
 * Node age and tier information for transition decisions
 */
export interface NodeAgeInfo {
	/** Age of the node in days */
	ageDays: number;
	/** Current storage tier */
	currentTier: StorageTier;
	/** Node type */
	nodeType: RetentionNodeType;
	/** Environment */
	environment: RetentionEnvironment;
}

/**
 * Tier transition result
 */
export interface TierTransitionResult {
	/** Whether a transition should occur */
	shouldTransition: boolean;
	/** Target tier (if transitioning) */
	targetTier?: StorageTier;
	/** Whether the node should be deleted */
	shouldDelete: boolean;
	/** Days until next transition */
	daysUntilNextTransition?: number;
	/** Reason for the decision */
	reason: string;
}

/**
 * Determine if a node should transition to a different tier
 *
 * @param nodeInfo - Node age and tier information
 * @returns Transition decision
 */
export function getTransitionDecision(nodeInfo: NodeAgeInfo): TierTransitionResult {
	const policy = getRetentionPolicy(nodeInfo.nodeType, nodeInfo.environment);

	if (!policy) {
		return {
			shouldTransition: false,
			shouldDelete: false,
			reason: "No retention policy found",
		};
	}

	// Calculate cumulative age thresholds for each tier
	let cumulativeDays = 0;
	const tierThresholds: { tier: StorageTier; endDay: number }[] = [];

	for (const period of policy.periods) {
		if (period.durationDays === PERMANENT) {
			tierThresholds.push({ tier: period.tier, endDay: Number.MAX_SAFE_INTEGER });
		} else {
			cumulativeDays += period.durationDays;
			tierThresholds.push({ tier: period.tier, endDay: cumulativeDays });
		}
	}

	// Find current tier based on age
	let expectedTier: StorageTier | null = null;
	let daysUntilNext: number | undefined;

	for (let i = 0; i < tierThresholds.length; i++) {
		const threshold = tierThresholds[i];

		if (!threshold) {
			continue;
		}

		if (nodeInfo.ageDays < threshold.endDay) {
			expectedTier = threshold.tier;
			if (threshold.endDay !== Number.MAX_SAFE_INTEGER) {
				daysUntilNext = threshold.endDay - nodeInfo.ageDays;
			}
			break;
		}
	}

	// Check if node should be deleted (beyond all tiers)
	if (!expectedTier) {
		const lastThreshold = tierThresholds[tierThresholds.length - 1];
		if (
			lastThreshold &&
			lastThreshold.endDay !== Number.MAX_SAFE_INTEGER &&
			nodeInfo.ageDays >= lastThreshold.endDay
		) {
			return {
				shouldTransition: false,
				shouldDelete: true,
				reason: `Node exceeded total retention of ${policy.totalRetentionDays} days`,
			};
		}
	}

	// Check if transition needed
	if (expectedTier && expectedTier !== nodeInfo.currentTier) {
		// Only transition to "later" tiers (HOT → WARM → COLD)
		const tierOrder: StorageTier[] = ["HOT", "WARM", "COLD"];
		const currentIndex = tierOrder.indexOf(nodeInfo.currentTier);
		const expectedIndex = tierOrder.indexOf(expectedTier);

		if (expectedIndex > currentIndex) {
			return {
				shouldTransition: true,
				targetTier: expectedTier,
				shouldDelete: false,
				daysUntilNextTransition: daysUntilNext,
				reason: `Age ${nodeInfo.ageDays} days exceeds ${nodeInfo.currentTier} tier threshold`,
			};
		}
	}

	return {
		shouldTransition: false,
		shouldDelete: false,
		daysUntilNextTransition: daysUntilNext,
		reason: `Node at correct tier (${nodeInfo.currentTier}) for age ${nodeInfo.ageDays} days`,
	};
}

/**
 * Calculate the target tier for a node based on age
 *
 * @param ageDays - Age of node in days
 * @param nodeType - Node type
 * @param environment - Environment
 * @returns Target storage tier
 */
export function getTargetTier(
	ageDays: number,
	nodeType: RetentionNodeType,
	environment: RetentionEnvironment,
): StorageTier | null {
	const policy = getRetentionPolicy(nodeType, environment);
	if (!policy) {
		return null;
	}

	let cumulativeDays = 0;

	for (const period of policy.periods) {
		if (period.durationDays === PERMANENT) {
			return period.tier;
		}
		cumulativeDays += period.durationDays;
		if (ageDays < cumulativeDays) {
			return period.tier;
		}
	}

	return null;
}

/**
 * Check if a policy meets SEC Rule 17a-4 requirements
 *
 * @param policy - Retention policy
 * @returns Whether policy is compliant
 */
export function isSECCompliant(policy: RetentionPolicy): boolean {
	// Must retain for at least 6 years
	if (policy.totalRetentionDays !== PERMANENT && policy.totalRetentionDays < DURATIONS.YEAR_6) {
		return false;
	}

	// First 2 years must be accessible (HOT or WARM)
	let accessibleDays = 0;
	for (const period of policy.periods) {
		if (period.tier === "HOT" || period.tier === "WARM") {
			if (period.durationDays === PERMANENT) {
				accessibleDays = Number.MAX_SAFE_INTEGER;
			} else {
				accessibleDays += period.durationDays;
			}
		}
		if (accessibleDays >= DURATIONS.YEAR_2) {
			break;
		}
	}

	return accessibleDays >= DURATIONS.YEAR_2;
}

/**
 * Validate all compliance policies meet requirements
 *
 * @returns Validation result with any violations
 */
export function validateCompliancePolicies(): {
	valid: boolean;
	violations: { policy: RetentionPolicy; reason: string }[];
} {
	const violations: { policy: RetentionPolicy; reason: string }[] = [];

	for (const policy of getCompliancePolicies()) {
		if (!isSECCompliant(policy)) {
			violations.push({
				policy,
				reason: "Does not meet SEC Rule 17a-4 requirements (6 years retention, 2 years accessible)",
			});
		}
	}

	return {
		valid: violations.length === 0,
		violations,
	};
}
