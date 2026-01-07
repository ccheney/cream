/**
 * Factor Zoo Repository
 *
 * Data access for the Factor Zoo system that manages alpha factors
 * throughout their lifecycle.
 *
 * @see docs/plans/20-research-to-production-pipeline.md
 */

import type {
  DailyMetrics,
  Factor,
  FactorCorrelation,
  FactorPerformance,
  FactorStatus,
  FactorZooStats,
  Hypothesis,
  HypothesisStatus,
  NewFactor,
  NewHypothesis,
  NewResearchRun,
  ResearchPhase,
  ResearchRun,
} from "@cream/domain";

import type { Row, TursoClient } from "../turso.js";
import { parseJson, RepositoryError, toJson } from "./base.js";

// ============================================
// Row Mappers
// ============================================

function mapHypothesisRow(row: Row): Hypothesis {
  return {
    hypothesisId: row.hypothesis_id as string,
    title: row.title as string,
    economicRationale: row.economic_rationale as string,
    marketMechanism: row.market_mechanism as string,
    targetRegime: row.target_regime as Hypothesis["targetRegime"],
    falsificationCriteria: parseJson(row.falsification_criteria, null),
    status: row.status as HypothesisStatus,
    iteration: row.iteration as number,
    parentHypothesisId: row.parent_hypothesis_id as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapFactorRow(row: Row): Factor {
  return {
    factorId: row.factor_id as string,
    hypothesisId: row.hypothesis_id as string | null,
    name: row.name as string,
    status: row.status as FactorStatus,
    version: row.version as number,
    author: row.author as string,
    pythonModule: row.python_module as string | null,
    typescriptModule: row.typescript_module as string | null,
    symbolicLength: row.symbolic_length as number | null,
    parameterCount: row.parameter_count as number | null,
    featureCount: row.feature_count as number | null,
    originalityScore: row.originality_score as number | null,
    hypothesisAlignment: row.hypothesis_alignment as number | null,
    stage1Sharpe: row.stage1_sharpe as number | null,
    stage1Ic: row.stage1_ic as number | null,
    stage1MaxDrawdown: row.stage1_max_drawdown as number | null,
    stage1CompletedAt: row.stage1_completed_at as string | null,
    stage2Pbo: row.stage2_pbo as number | null,
    stage2DsrPvalue: row.stage2_dsr_pvalue as number | null,
    stage2Wfe: row.stage2_wfe as number | null,
    stage2CompletedAt: row.stage2_completed_at as string | null,
    paperValidationPassed: (row.paper_validation_passed as number) === 1,
    paperStartDate: row.paper_start_date as string | null,
    paperEndDate: row.paper_end_date as string | null,
    paperRealizedSharpe: row.paper_realized_sharpe as number | null,
    paperRealizedIc: row.paper_realized_ic as number | null,
    currentWeight: row.current_weight as number,
    lastIc: row.last_ic as number | null,
    decayRate: row.decay_rate as number | null,
    createdAt: row.created_at as string,
    promotedAt: row.promoted_at as string | null,
    retiredAt: row.retired_at as string | null,
    lastUpdated: row.last_updated as string,
  };
}

function mapPerformanceRow(row: Row): FactorPerformance {
  return {
    id: row.id as string,
    factorId: row.factor_id as string,
    date: row.date as string,
    ic: row.ic as number,
    icir: row.icir as number | null,
    sharpe: row.sharpe as number | null,
    weight: row.weight as number,
    signalCount: row.signal_count as number,
    createdAt: row.created_at as string,
  };
}

function mapCorrelationRow(row: Row): FactorCorrelation {
  return {
    factorId1: row.factor_id_1 as string,
    factorId2: row.factor_id_2 as string,
    correlation: row.correlation as number,
    computedAt: row.computed_at as string,
  };
}

function mapResearchRunRow(row: Row): ResearchRun {
  return {
    runId: row.run_id as string,
    triggerType: row.trigger_type as ResearchRun["triggerType"],
    triggerReason: row.trigger_reason as string,
    phase: row.phase as ResearchPhase,
    currentIteration: row.current_iteration as number,
    hypothesisId: row.hypothesis_id as string | null,
    factorId: row.factor_id as string | null,
    prUrl: row.pr_url as string | null,
    errorMessage: row.error_message as string | null,
    tokensUsed: row.tokens_used as number,
    computeHours: row.compute_hours as number,
    startedAt: row.started_at as string,
    completedAt: row.completed_at as string | null,
  };
}

// ============================================
// Repository
// ============================================

/**
 * Factor Zoo repository for managing alpha factors
 */
export class FactorZooRepository {
  constructor(private client: TursoClient) {}

  // ============================================
  // Hypothesis CRUD
  // ============================================

  /**
   * Create a new hypothesis
   */
  async createHypothesis(input: NewHypothesis): Promise<Hypothesis> {
    const id = input.hypothesisId ?? crypto.randomUUID();
    const now = new Date().toISOString();

    try {
      await this.client.run(
        `INSERT INTO hypotheses (
          hypothesis_id, title, economic_rationale, market_mechanism,
          target_regime, falsification_criteria, status, iteration,
          parent_hypothesis_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.title,
          input.economicRationale,
          input.marketMechanism,
          input.targetRegime,
          toJson(input.falsificationCriteria),
          input.status,
          input.iteration,
          input.parentHypothesisId,
          now,
          now,
        ]
      );

      const result = await this.findHypothesisById(id);
      if (!result) {
        throw new RepositoryError("Failed to create hypothesis", "QUERY_ERROR", "hypotheses");
      }
      return result;
    } catch (error) {
      if (error instanceof RepositoryError) {
        throw error;
      }
      throw new RepositoryError(
        `Failed to create hypothesis: ${error}`,
        "QUERY_ERROR",
        "hypotheses"
      );
    }
  }

  /**
   * Find hypothesis by ID
   */
  async findHypothesisById(id: string): Promise<Hypothesis | null> {
    const result = await this.client.execute("SELECT * FROM hypotheses WHERE hypothesis_id = ?", [
      id,
    ]);
    const row = result[0];
    if (!row) {
      return null;
    }
    return mapHypothesisRow(row);
  }

  /**
   * Update hypothesis status
   */
  async updateHypothesisStatus(id: string, status: HypothesisStatus): Promise<void> {
    const now = new Date().toISOString();
    await this.client.run(
      "UPDATE hypotheses SET status = ?, updated_at = ? WHERE hypothesis_id = ?",
      [status, now, id]
    );
  }

  /**
   * Find hypotheses by status
   */
  async findHypothesesByStatus(status: HypothesisStatus): Promise<Hypothesis[]> {
    const result = await this.client.execute("SELECT * FROM hypotheses WHERE status = ?", [status]);
    return result.map(mapHypothesisRow);
  }

  // ============================================
  // Factor CRUD
  // ============================================

  /**
   * Create a new factor
   */
  async createFactor(input: NewFactor): Promise<Factor> {
    const id = input.factorId ?? crypto.randomUUID();
    const now = new Date().toISOString();

    try {
      await this.client.run(
        `INSERT INTO factors (
          factor_id, hypothesis_id, name, status, version, author,
          python_module, typescript_module,
          symbolic_length, parameter_count, feature_count,
          originality_score, hypothesis_alignment,
          stage1_sharpe, stage1_ic, stage1_max_drawdown, stage1_completed_at,
          stage2_pbo, stage2_dsr_pvalue, stage2_wfe, stage2_completed_at,
          paper_validation_passed, paper_start_date, paper_end_date,
          paper_realized_sharpe, paper_realized_ic,
          current_weight, last_ic, decay_rate,
          created_at, promoted_at, retired_at, last_updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.hypothesisId,
          input.name,
          input.status,
          input.version,
          input.author,
          input.pythonModule,
          input.typescriptModule,
          input.symbolicLength,
          input.parameterCount,
          input.featureCount,
          input.originalityScore,
          input.hypothesisAlignment,
          input.stage1Sharpe,
          input.stage1Ic,
          input.stage1MaxDrawdown,
          input.stage1CompletedAt,
          input.stage2Pbo,
          input.stage2DsrPvalue,
          input.stage2Wfe,
          input.stage2CompletedAt,
          input.paperValidationPassed ? 1 : 0,
          input.paperStartDate,
          input.paperEndDate,
          input.paperRealizedSharpe,
          input.paperRealizedIc,
          input.currentWeight,
          input.lastIc,
          input.decayRate,
          now,
          input.promotedAt,
          input.retiredAt,
          now,
        ]
      );

      const result = await this.findFactorById(id);
      if (!result) {
        throw new RepositoryError("Failed to create factor", "QUERY_ERROR", "factors");
      }
      return result;
    } catch (error) {
      if (error instanceof RepositoryError) {
        throw error;
      }
      throw new RepositoryError(`Failed to create factor: ${error}`, "QUERY_ERROR", "factors");
    }
  }

  /**
   * Find factor by ID
   */
  async findFactorById(id: string): Promise<Factor | null> {
    const result = await this.client.execute("SELECT * FROM factors WHERE factor_id = ?", [id]);
    const row = result[0];
    if (!row) {
      return null;
    }
    return mapFactorRow(row);
  }

  /**
   * Find active factors (status = 'active')
   */
  async findActiveFactors(): Promise<Factor[]> {
    const result = await this.client.execute(
      "SELECT * FROM factors WHERE status = 'active' ORDER BY current_weight DESC"
    );
    return result.map(mapFactorRow);
  }

  /**
   * Find decaying factors
   */
  async findDecayingFactors(): Promise<Factor[]> {
    const result = await this.client.execute(
      "SELECT * FROM factors WHERE status = 'decaying' ORDER BY decay_rate ASC"
    );
    return result.map(mapFactorRow);
  }

  /**
   * Find factors by status
   */
  async findFactorsByStatus(status: FactorStatus): Promise<Factor[]> {
    const result = await this.client.execute("SELECT * FROM factors WHERE status = ?", [status]);
    return result.map(mapFactorRow);
  }

  /**
   * Update factor status
   */
  async updateFactorStatus(id: string, status: FactorStatus): Promise<void> {
    const now = new Date().toISOString();
    const updates: Record<string, string | null> = { status, last_updated: now };

    if (status === "active") {
      updates.promoted_at = now;
    } else if (status === "retired") {
      updates.retired_at = now;
    }

    const setClauses = Object.keys(updates)
      .map((k) => `${k} = ?`)
      .join(", ");
    const values = [...Object.values(updates), id];

    await this.client.run(`UPDATE factors SET ${setClauses} WHERE factor_id = ?`, values);
  }

  /**
   * Promote a factor to active status
   */
  async promote(factorId: string): Promise<void> {
    await this.updateFactorStatus(factorId, "active");
  }

  /**
   * Mark a factor as decaying
   */
  async markDecaying(factorId: string, decayRate: number): Promise<void> {
    const now = new Date().toISOString();
    await this.client.run(
      "UPDATE factors SET status = 'decaying', decay_rate = ?, last_updated = ? WHERE factor_id = ?",
      [decayRate, now, factorId]
    );
  }

  /**
   * Retire a factor
   */
  async retire(factorId: string): Promise<void> {
    await this.updateFactorStatus(factorId, "retired");
  }

  // ============================================
  // Performance Tracking
  // ============================================

  /**
   * Record daily performance for a factor
   */
  async recordDailyPerformance(factorId: string, metrics: DailyMetrics): Promise<void> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.client.run(
      `INSERT INTO factor_performance (id, factor_id, date, ic, icir, sharpe, weight, signal_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(factor_id, date) DO UPDATE SET
         ic = excluded.ic,
         icir = excluded.icir,
         sharpe = excluded.sharpe,
         weight = excluded.weight,
         signal_count = excluded.signal_count`,
      [
        id,
        factorId,
        metrics.date,
        metrics.ic,
        metrics.icir ?? null,
        metrics.sharpe ?? null,
        metrics.weight ?? 0,
        metrics.signalCount ?? 0,
        now,
      ]
    );

    // Update last_ic on the factor
    await this.client.run("UPDATE factors SET last_ic = ?, last_updated = ? WHERE factor_id = ?", [
      metrics.ic,
      now,
      factorId,
    ]);
  }

  /**
   * Get performance history for a factor
   */
  async getPerformanceHistory(factorId: string, days: number): Promise<FactorPerformance[]> {
    const result = await this.client.execute(
      `SELECT * FROM factor_performance
       WHERE factor_id = ?
       ORDER BY date DESC
       LIMIT ?`,
      [factorId, days]
    );
    return result.map(mapPerformanceRow);
  }

  // ============================================
  // Correlation Tracking
  // ============================================

  /**
   * Update correlations between factors
   */
  async updateCorrelations(correlations: FactorCorrelation[]): Promise<void> {
    const now = new Date().toISOString();

    for (const corr of correlations) {
      // Ensure canonical ordering (factor_id_1 < factor_id_2)
      const [id1, id2] =
        corr.factorId1 < corr.factorId2
          ? [corr.factorId1, corr.factorId2]
          : [corr.factorId2, corr.factorId1];

      await this.client.run(
        `INSERT INTO factor_correlations (factor_id_1, factor_id_2, correlation, computed_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(factor_id_1, factor_id_2) DO UPDATE SET
           correlation = excluded.correlation,
           computed_at = excluded.computed_at`,
        [id1, id2, corr.correlation, now]
      );
    }
  }

  /**
   * Get correlation matrix for all active factors
   */
  async getCorrelationMatrix(): Promise<Map<string, Map<string, number>>> {
    const result = await this.client.execute(`
      SELECT fc.* FROM factor_correlations fc
      JOIN factors f1 ON fc.factor_id_1 = f1.factor_id
      JOIN factors f2 ON fc.factor_id_2 = f2.factor_id
      WHERE f1.status = 'active' AND f2.status = 'active'
    `);

    const matrix = new Map<string, Map<string, number>>();

    for (const row of result) {
      const corr = mapCorrelationRow(row);

      // Add both directions
      let map1 = matrix.get(corr.factorId1);
      if (!map1) {
        map1 = new Map();
        matrix.set(corr.factorId1, map1);
      }
      let map2 = matrix.get(corr.factorId2);
      if (!map2) {
        map2 = new Map();
        matrix.set(corr.factorId2, map2);
      }

      map1.set(corr.factorId2, corr.correlation);
      map2.set(corr.factorId1, corr.correlation);
    }

    return matrix;
  }

  // ============================================
  // Weight Management
  // ============================================

  /**
   * Update weights for multiple factors
   */
  async updateWeights(weights: Map<string, number>): Promise<void> {
    const now = new Date().toISOString();

    for (const [factorId, weight] of weights) {
      await this.client.run(
        "UPDATE factors SET current_weight = ?, last_updated = ? WHERE factor_id = ?",
        [weight, now, factorId]
      );
    }
  }

  /**
   * Get current weights for all active factors
   */
  async getActiveWeights(): Promise<Map<string, number>> {
    const result = await this.client.execute(
      "SELECT factor_id, current_weight FROM factors WHERE status = 'active'"
    );

    const weights = new Map<string, number>();
    for (const row of result) {
      weights.set(row.factor_id as string, row.current_weight as number);
    }
    return weights;
  }

  // ============================================
  // Research Runs
  // ============================================

  /**
   * Create a new research run
   */
  async createResearchRun(input: NewResearchRun): Promise<ResearchRun> {
    const id = input.runId ?? crypto.randomUUID();
    const now = new Date().toISOString();

    try {
      await this.client.run(
        `INSERT INTO research_runs (
          run_id, trigger_type, trigger_reason, phase, current_iteration,
          hypothesis_id, factor_id, pr_url, error_message,
          tokens_used, compute_hours, started_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.triggerType,
          input.triggerReason,
          input.phase,
          input.currentIteration,
          input.hypothesisId,
          input.factorId,
          input.prUrl,
          input.errorMessage,
          input.tokensUsed,
          input.computeHours,
          now,
          input.completedAt,
        ]
      );

      const result = await this.findResearchRunById(id);
      if (!result) {
        throw new RepositoryError("Failed to create research run", "QUERY_ERROR", "research_runs");
      }
      return result;
    } catch (error) {
      if (error instanceof RepositoryError) {
        throw error;
      }
      throw new RepositoryError(
        `Failed to create research run: ${error}`,
        "QUERY_ERROR",
        "research_runs"
      );
    }
  }

  /**
   * Find research run by ID
   */
  async findResearchRunById(id: string): Promise<ResearchRun | null> {
    const result = await this.client.execute("SELECT * FROM research_runs WHERE run_id = ?", [id]);
    const row = result[0];
    if (!row) {
      return null;
    }
    return mapResearchRunRow(row);
  }

  /**
   * Update research run
   */
  async updateResearchRun(runId: string, updates: Partial<ResearchRun>): Promise<void> {
    const updateFields: string[] = [];
    const values: unknown[] = [];

    if (updates.phase !== undefined) {
      updateFields.push("phase = ?");
      values.push(updates.phase);
    }
    if (updates.currentIteration !== undefined) {
      updateFields.push("current_iteration = ?");
      values.push(updates.currentIteration);
    }
    if (updates.hypothesisId !== undefined) {
      updateFields.push("hypothesis_id = ?");
      values.push(updates.hypothesisId);
    }
    if (updates.factorId !== undefined) {
      updateFields.push("factor_id = ?");
      values.push(updates.factorId);
    }
    if (updates.prUrl !== undefined) {
      updateFields.push("pr_url = ?");
      values.push(updates.prUrl);
    }
    if (updates.errorMessage !== undefined) {
      updateFields.push("error_message = ?");
      values.push(updates.errorMessage);
    }
    if (updates.tokensUsed !== undefined) {
      updateFields.push("tokens_used = ?");
      values.push(updates.tokensUsed);
    }
    if (updates.computeHours !== undefined) {
      updateFields.push("compute_hours = ?");
      values.push(updates.computeHours);
    }
    if (updates.completedAt !== undefined) {
      updateFields.push("completed_at = ?");
      values.push(updates.completedAt);
    }

    if (updateFields.length === 0) {
      return;
    }

    values.push(runId);
    await this.client.run(
      `UPDATE research_runs SET ${updateFields.join(", ")} WHERE run_id = ?`,
      values
    );
  }

  /**
   * Find active research runs (not completed or failed)
   */
  async findActiveResearchRuns(): Promise<ResearchRun[]> {
    const result = await this.client.execute(
      "SELECT * FROM research_runs WHERE phase NOT IN ('completed', 'failed') ORDER BY started_at DESC"
    );
    return result.map(mapResearchRunRow);
  }

  // ============================================
  // Statistics
  // ============================================

  /**
   * Get Factor Zoo statistics
   */
  async getStats(): Promise<FactorZooStats> {
    const [factorStats, hypothesisStats, avgIc, totalWeight] = await Promise.all([
      this.client.execute(`
        SELECT status, COUNT(*) as count FROM factors GROUP BY status
      `),
      this.client.execute(`
        SELECT status, COUNT(*) as count FROM hypotheses GROUP BY status
      `),
      this.client.execute(`
        SELECT AVG(last_ic) as avg_ic FROM factors WHERE status = 'active'
      `),
      this.client.execute(`
        SELECT SUM(current_weight) as total_weight FROM factors WHERE status = 'active'
      `),
    ]);

    const factorCounts: Record<string, number> = {};
    for (const row of factorStats) {
      factorCounts[row.status as string] = row.count as number;
    }

    const hypothesisCounts: Record<string, number> = {};
    for (const row of hypothesisStats) {
      hypothesisCounts[row.status as string] = row.count as number;
    }

    return {
      totalFactors: Object.values(factorCounts).reduce((a, b) => a + b, 0),
      activeFactors: factorCounts.active ?? 0,
      decayingFactors: factorCounts.decaying ?? 0,
      researchFactors: factorCounts.research ?? 0,
      retiredFactors: factorCounts.retired ?? 0,
      averageIc: (avgIc[0]?.avg_ic as number) ?? 0,
      totalWeight: (totalWeight[0]?.total_weight as number) ?? 0,
      hypothesesValidated: hypothesisCounts.validated ?? 0,
      hypothesesRejected: hypothesisCounts.rejected ?? 0,
    };
  }
}
