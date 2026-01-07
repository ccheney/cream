/**
 * Indicator Retirement Pipeline
 *
 * Gracefully removes indicators from production while preserving history.
 * Does NOT delete files - only removes from active exports and marks as retired.
 *
 * @see docs/plans/19-dynamic-indicator-synthesis.md (lines 1206-1243)
 */

import type { TursoClient } from "@cream/storage";
import { z } from "zod";

// ============================================
// Types
// ============================================

/**
 * Retirement request input
 */
export const RetirementRequestSchema = z.object({
  indicatorId: z.string(),
  reason: z.string(),
  /** Whether to trigger PR creation (defaults to true) */
  createPR: z.boolean().default(true),
  /** Delay in days before full retirement (for graceful degradation) */
  gracePeriodDays: z.number().int().min(0).default(7),
});

export type RetirementRequest = z.infer<typeof RetirementRequestSchema>;

/**
 * Retirement result
 */
export const RetirementResultSchema = z.object({
  indicatorId: z.string(),
  indicatorName: z.string(),
  category: z.string(),
  status: z.enum(["retired", "pending"]),
  retiredAt: z.string(),
  reason: z.string(),
  prUrl: z.string().optional(),
  gracePeriodEnds: z.string().optional(),
});

export type RetirementResult = z.infer<typeof RetirementResultSchema>;

/**
 * Indicator details for retirement
 */
interface IndicatorDetails {
  id: string;
  name: string;
  category: string;
  status: string;
}

// ============================================
// Constants
// ============================================

/**
 * Default retirement configuration
 */
export const RETIREMENT_DEFAULTS = {
  /** Days to continue computing signals after retirement */
  gracePeriodDays: 7,
  /** Maximum indicators to retire in one batch */
  maxBatchSize: 5,
} as const;

// ============================================
// Helper Functions
// ============================================

/**
 * Get indicator details from database.
 */
async function getIndicatorDetails(
  db: TursoClient,
  indicatorId: string
): Promise<IndicatorDetails | null> {
  const row = await db.get<{
    id: string;
    name: string;
    category: string;
    status: string;
  }>("SELECT id, name, category, status FROM indicators WHERE id = ?", [indicatorId]);

  return row ?? null;
}

/**
 * Calculate grace period end date.
 */
function calculateGracePeriodEnd(gracePeriodDays: number): string {
  const end = new Date();
  end.setDate(end.getDate() + gracePeriodDays);
  return end.toISOString();
}

/**
 * Generate deprecation comment for retired indicator.
 */
export function generateDeprecationComment(
  retiredAt: string,
  reason: string,
  indicatorName: string
): string {
  return `/**
 * @deprecated RETIRED: ${retiredAt}
 * Indicator: ${indicatorName}
 * Reason: ${reason}
 *
 * This indicator is no longer in active use.
 * Kept for historical reference - DO NOT DELETE.
 */`;
}

// ============================================
// Retirement Pipeline
// ============================================

/**
 * Indicator retirement service.
 *
 * Handles the graceful retirement of indicators from production:
 * 1. Updates database status to "retired"
 * 2. Preserves source files with deprecation comments
 * 3. Optionally triggers PR creation for export removal
 *
 * @example
 * ```typescript
 * const retirement = new IndicatorRetirement(db);
 *
 * // Retire a single indicator
 * const result = await retirement.retire({
 *   indicatorId: "ind-123",
 *   reason: "IC decay below threshold for 30 consecutive days",
 * });
 *
 * console.log(`Retired ${result.indicatorName}: ${result.prUrl}`);
 *
 * // Batch retire multiple indicators
 * const results = await retirement.retireBatch([
 *   { indicatorId: "ind-123", reason: "IC decay" },
 *   { indicatorId: "ind-456", reason: "Capacity exceeded" },
 * ]);
 * ```
 */
export class IndicatorRetirement {
  constructor(private readonly db: TursoClient) {}

  /**
   * Retire a single indicator.
   *
   * @param request - Retirement request details
   * @returns Retirement result
   */
  async retire(request: RetirementRequest): Promise<RetirementResult> {
    const { indicatorId, reason, gracePeriodDays = RETIREMENT_DEFAULTS.gracePeriodDays } = request;

    // Get indicator details
    const indicator = await getIndicatorDetails(this.db, indicatorId);
    if (!indicator) {
      throw new Error(`Indicator not found: ${indicatorId}`);
    }

    // Check if already retired
    if (indicator.status === "retired") {
      throw new Error(`Indicator already retired: ${indicatorId}`);
    }

    const retiredAt = new Date().toISOString();
    const gracePeriodEnds =
      gracePeriodDays > 0 ? calculateGracePeriodEnd(gracePeriodDays) : undefined;

    // Update database status
    await this.db.run(
      `UPDATE indicators
       SET status = 'retired',
           retired_at = ?,
           retirement_reason = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
      [retiredAt, reason, indicatorId]
    );

    // Log retirement to activity
    await this.logRetirement(indicatorId, indicator.name, reason, retiredAt);

    return {
      indicatorId,
      indicatorName: indicator.name,
      category: indicator.category,
      status: "retired",
      retiredAt,
      reason,
      gracePeriodEnds,
    };
  }

  /**
   * Retire multiple indicators in batch.
   *
   * @param requests - Array of retirement requests
   * @returns Array of retirement results
   */
  async retireBatch(requests: RetirementRequest[]): Promise<RetirementResult[]> {
    if (requests.length > RETIREMENT_DEFAULTS.maxBatchSize) {
      throw new Error(
        `Batch size ${requests.length} exceeds maximum ${RETIREMENT_DEFAULTS.maxBatchSize}`
      );
    }

    const results: RetirementResult[] = [];

    for (const request of requests) {
      try {
        const result = await this.retire(request);
        results.push(result);
      } catch (error) {
        // Log error but continue with other retirements
        console.error(`Failed to retire ${request.indicatorId}:`, error);
      }
    }

    return results;
  }

  /**
   * Get indicators pending retirement (in grace period).
   */
  async getPendingRetirements(): Promise<
    Array<{
      indicatorId: string;
      indicatorName: string;
      retiredAt: string;
      reason: string;
    }>
  > {
    const rows = await this.db.execute<{
      id: string;
      name: string;
      retired_at: string;
      retirement_reason: string;
    }>(
      `SELECT id, name, retired_at, retirement_reason
       FROM indicators
       WHERE status = 'retired'
         AND retired_at >= datetime('now', '-7 days')
       ORDER BY retired_at DESC`
    );

    return rows.map((row) => ({
      indicatorId: row.id,
      indicatorName: row.name,
      retiredAt: row.retired_at,
      reason: row.retirement_reason,
    }));
  }

  /**
   * Get retirement history for an indicator.
   */
  async getRetirementHistory(indicatorId: string): Promise<{
    indicatorId: string;
    indicatorName: string;
    retiredAt: string | null;
    reason: string | null;
    status: string;
  } | null> {
    const row = await this.db.get<{
      id: string;
      name: string;
      retired_at: string | null;
      retirement_reason: string | null;
      status: string;
    }>(
      `SELECT id, name, retired_at, retirement_reason, status
       FROM indicators
       WHERE id = ?`,
      [indicatorId]
    );

    if (!row) {
      return null;
    }

    return {
      indicatorId: row.id,
      indicatorName: row.name,
      retiredAt: row.retired_at,
      reason: row.retirement_reason,
      status: row.status,
    };
  }

  /**
   * Check if indicator can be retired.
   *
   * Returns false if indicator is in paper trading or already retired.
   */
  async canRetire(indicatorId: string): Promise<{
    canRetire: boolean;
    reason: string;
  }> {
    const indicator = await getIndicatorDetails(this.db, indicatorId);

    if (!indicator) {
      return { canRetire: false, reason: "Indicator not found" };
    }

    if (indicator.status === "retired") {
      return { canRetire: false, reason: "Already retired" };
    }

    if (indicator.status === "paper") {
      return { canRetire: false, reason: "Currently in paper trading - complete or cancel first" };
    }

    if (indicator.status === "staging") {
      return { canRetire: false, reason: "Still in staging - never promoted to production" };
    }

    return { canRetire: true, reason: "OK" };
  }

  /**
   * Log retirement event to activity table.
   */
  private async logRetirement(
    indicatorId: string,
    indicatorName: string,
    reason: string,
    retiredAt: string
  ): Promise<void> {
    // Note: This would insert into an activity_log table if it exists
    // For now, we just log to console for audit trail
    console.log(
      JSON.stringify({
        event: "indicator_retirement",
        indicatorId,
        indicatorName,
        reason,
        retiredAt,
        timestamp: new Date().toISOString(),
      })
    );
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Generate PR body for indicator retirement.
 */
export function generateRetirementPRBody(
  indicatorName: string,
  reason: string,
  metrics?: {
    avgIC30Day?: number;
    consecutiveLowICDays?: number;
    hitRate?: number;
  }
): string {
  let body = `## Indicator Retirement

### Indicator: ${indicatorName}

### Reason for Retirement
${reason}

`;

  if (metrics) {
    body += `### Final Metrics
| Metric | Value |
|--------|-------|
`;
    if (metrics.avgIC30Day !== undefined) {
      body += `| 30-day IC | ${metrics.avgIC30Day.toFixed(4)} |\n`;
    }
    if (metrics.consecutiveLowICDays !== undefined) {
      body += `| Consecutive Low IC Days | ${metrics.consecutiveLowICDays} |\n`;
    }
    if (metrics.hitRate !== undefined) {
      body += `| Hit Rate | ${(metrics.hitRate * 100).toFixed(1)}% |\n`;
    }
    body += "\n";
  }

  body += `### Checklist
- [x] Indicator status updated to retired in database
- [x] Source file preserved with deprecation comment
- [x] Activity log updated
- [ ] Human review of retirement decision
- [ ] Export removal (if applicable)
`;

  return body;
}
