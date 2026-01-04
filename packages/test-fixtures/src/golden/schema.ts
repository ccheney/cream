/**
 * Golden Dataset Schema
 *
 * Zod schemas for golden dataset metadata and case validation.
 *
 * @see docs/plans/14-testing.md lines 328-364
 */

import { z } from "zod";

// ============================================
// Agent Types
// ============================================

/**
 * Agent types that can have golden datasets
 */
export const GoldenAgentType = z.enum([
  "trader",
  "technical_analyst",
  "news_analyst",
  "fundamentals_analyst",
  "bullish_research",
  "bearish_research",
  "risk_manager",
  "critic",
]);
export type GoldenAgentType = z.infer<typeof GoldenAgentType>;

// ============================================
// Case Metadata
// ============================================

/**
 * Market regime for the test case
 */
export const MarketRegime = z.enum([
  "bull_trend",
  "bear_trend",
  "range",
  "high_vol",
  "low_vol",
  "crash",
  "recovery",
]);
export type MarketRegime = z.infer<typeof MarketRegime>;

/**
 * Scenario category for the test case
 */
export const ScenarioCategory = z.enum([
  "momentum",
  "mean_reversion",
  "breakout",
  "earnings",
  "macro_event",
  "sector_rotation",
  "risk_off",
  "adversarial",
]);
export type ScenarioCategory = z.infer<typeof ScenarioCategory>;

/**
 * Metadata for a single golden case
 */
export const GoldenCaseMetadataSchema = z.object({
  /** Unique case identifier (e.g., "trader_001") */
  id: z.string().min(1),
  /** Agent this case is for */
  agent: GoldenAgentType,
  /** Test scenario category */
  scenario: ScenarioCategory,
  /** Market regime during this case */
  regime: MarketRegime,
  /** When the case was first created */
  created: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/),
  /** When the case was last refreshed */
  refreshed: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/),
  /** Tags for filtering and grouping */
  tags: z.array(z.string()).default([]),
  /** Whether this is an adversarial/edge case */
  adversarial: z.boolean().default(false),
  /** Brief description of what this case tests */
  description: z.string().optional(),
  /** Expected behavior or outcome */
  expectedOutcome: z.string().optional(),
});
export type GoldenCaseMetadata = z.infer<typeof GoldenCaseMetadataSchema>;

// ============================================
// Dataset Metadata
// ============================================

/**
 * Metadata for the entire golden dataset
 */
export const GoldenDatasetMetadataSchema = z.object({
  /** Semantic version of the dataset */
  dataset_version: z.string().regex(/^\d+\.\d+\.\d+$/),
  /** When the dataset was first created */
  created: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** When the dataset was last refreshed */
  last_refreshed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** All cases in the dataset */
  cases: z.array(GoldenCaseMetadataSchema),
  /** Notes about the dataset */
  notes: z.string().optional(),
});
export type GoldenDatasetMetadata = z.infer<typeof GoldenDatasetMetadataSchema>;

// ============================================
// Staleness Configuration
// ============================================

/**
 * Staleness thresholds in months
 */
export const STALENESS_THRESHOLDS = {
  /** Warn if dataset older than this */
  WARN_MONTHS: 6,
  /** Fail if dataset older than this */
  FAIL_MONTHS: 12,
};

/**
 * Staleness check result
 */
export interface StalenessCheckResult {
  /** Whether the dataset is stale */
  isStale: boolean;
  /** Whether staleness is critical (should fail CI) */
  isCritical: boolean;
  /** Age of the dataset in months */
  ageMonths: number;
  /** Human-readable message */
  message: string;
}

/**
 * Check dataset staleness
 */
export function checkStaleness(lastRefreshed: string): StalenessCheckResult {
  const refreshDate = new Date(lastRefreshed);
  const now = new Date();
  const ageMonths = (now.getFullYear() - refreshDate.getFullYear()) * 12 +
    (now.getMonth() - refreshDate.getMonth());

  if (ageMonths >= STALENESS_THRESHOLDS.FAIL_MONTHS) {
    return {
      isStale: true,
      isCritical: true,
      ageMonths,
      message: `Golden dataset is critically stale (${ageMonths} months old, threshold: ${STALENESS_THRESHOLDS.FAIL_MONTHS} months)`,
    };
  }

  if (ageMonths >= STALENESS_THRESHOLDS.WARN_MONTHS) {
    return {
      isStale: true,
      isCritical: false,
      ageMonths,
      message: `Golden dataset is stale (${ageMonths} months old, threshold: ${STALENESS_THRESHOLDS.WARN_MONTHS} months)`,
    };
  }

  return {
    isStale: false,
    isCritical: false,
    ageMonths,
    message: `Golden dataset is fresh (${ageMonths} months old)`,
  };
}
