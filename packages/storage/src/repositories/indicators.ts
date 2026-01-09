/**
 * @see docs/plans/19-dynamic-indicator-synthesis.md
 */

import type { Row, TursoClient } from "../turso.js";
import {
  type PaginatedResult,
  type PaginationOptions,
  paginate,
  parseJson,
  RepositoryError,
  toJson,
} from "./base.js";

export type IndicatorCategory = "momentum" | "trend" | "volatility" | "volume" | "custom";

export type IndicatorStatus = "staging" | "paper" | "production" | "retired";

export interface ValidationReport {
  trialsCount: number;
  rawSharpe: number;
  deflatedSharpe: number;
  probabilityOfOverfit: number;
  informationCoefficient: number;
  icStandardDev: number;
  maxDrawdown: number;
  calmarRatio?: number;
  sortinoRatio?: number;
  walkForwardPeriods: WalkForwardPeriod[];
  validatedAt: string;
}

export interface WalkForwardPeriod {
  startDate: string;
  endDate: string;
  inSampleSharpe: number;
  outOfSampleSharpe: number;
  informationCoefficient: number;
}

export interface PaperTradingReport {
  periodStart: string;
  periodEnd: string;
  tradingDays: number;
  realizedSharpe: number;
  expectedSharpe: number;
  sharpeTrackingError: number;
  realizedIC: number;
  expectedIC: number;
  signalsGenerated: number;
  profitableSignalRate: number;
  returnCorrelation: number;
  recommendation: "PROMOTE" | "EXTEND" | "RETIRE";
  generatedAt: string;
}

export interface TrialParameters {
  lookback?: number;
  smoothing?: number;
  upperThreshold?: number;
  lowerThreshold?: number;
  custom?: Record<string, unknown>;
}

export interface Indicator {
  id: string;
  name: string;
  category: IndicatorCategory;
  status: IndicatorStatus;
  hypothesis: string;
  economicRationale: string;
  generatedAt: string;
  generatedBy: string;
  codeHash: string | null;
  astSignature: string | null;
  validationReport: ValidationReport | null;
  paperTradingStart: string | null;
  paperTradingEnd: string | null;
  paperTradingReport: PaperTradingReport | null;
  promotedAt: string | null;
  prUrl: string | null;
  mergedAt: string | null;
  retiredAt: string | null;
  retirementReason: string | null;
  similarTo: string | null;
  replaces: string | null;
  parityReport: Record<string, unknown> | null;
  parityValidatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IndicatorTrial {
  id: string;
  indicatorId: string;
  trialNumber: number;
  hypothesis: string;
  parameters: TrialParameters;
  sharpeRatio: number | null;
  informationCoefficient: number | null;
  maxDrawdown: number | null;
  calmarRatio: number | null;
  sortinoRatio: number | null;
  selected: boolean;
  createdAt: string;
}

export interface IndicatorICHistory {
  id: string;
  indicatorId: string;
  date: string;
  icValue: number;
  icStd: number;
  decisionsUsedIn: number;
  decisionsCorrect: number;
  createdAt: string;
}

export interface CreateIndicatorInput {
  id: string;
  name: string;
  category: IndicatorCategory;
  hypothesis: string;
  economicRationale: string;
  generatedBy: string;
  codeHash?: string;
  astSignature?: string;
  similarTo?: string;
  replaces?: string;
}

export interface CreateIndicatorTrialInput {
  id: string;
  indicatorId: string;
  trialNumber: number;
  hypothesis: string;
  parameters: TrialParameters;
}

export interface CreateIndicatorICHistoryInput {
  id: string;
  indicatorId: string;
  date: string;
  icValue: number;
  icStd: number;
  decisionsUsedIn?: number;
  decisionsCorrect?: number;
}

export interface IndicatorFilters {
  status?: IndicatorStatus | IndicatorStatus[];
  category?: IndicatorCategory;
  generatedBy?: string;
  codeHash?: string;
}

export interface TrialFilters {
  indicatorId?: string;
  selected?: boolean;
}

export interface ICHistoryFilters {
  startDate?: string;
  endDate?: string;
  limit?: number;
}

function mapIndicatorRow(row: Row): Indicator {
  return {
    id: row.id as string,
    name: row.name as string,
    category: row.category as IndicatorCategory,
    status: row.status as IndicatorStatus,
    hypothesis: row.hypothesis as string,
    economicRationale: row.economic_rationale as string,
    generatedAt: row.generated_at as string,
    generatedBy: row.generated_by as string,
    codeHash: row.code_hash as string | null,
    astSignature: row.ast_signature as string | null,
    validationReport: parseJson<ValidationReport | null>(row.validation_report, null),
    paperTradingStart: row.paper_trading_start as string | null,
    paperTradingEnd: row.paper_trading_end as string | null,
    paperTradingReport: parseJson<PaperTradingReport | null>(row.paper_trading_report, null),
    promotedAt: row.promoted_at as string | null,
    prUrl: row.pr_url as string | null,
    mergedAt: row.merged_at as string | null,
    retiredAt: row.retired_at as string | null,
    retirementReason: row.retirement_reason as string | null,
    similarTo: row.similar_to as string | null,
    replaces: row.replaces as string | null,
    parityReport: parseJson<Record<string, unknown> | null>(row.parity_report, null),
    parityValidatedAt: row.parity_validated_at as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapTrialRow(row: Row): IndicatorTrial {
  return {
    id: row.id as string,
    indicatorId: row.indicator_id as string,
    trialNumber: row.trial_number as number,
    hypothesis: row.hypothesis as string,
    parameters: parseJson<TrialParameters>(row.parameters, {}),
    sharpeRatio: row.sharpe_ratio as number | null,
    informationCoefficient: row.information_coefficient as number | null,
    maxDrawdown: row.max_drawdown as number | null,
    calmarRatio: row.calmar_ratio as number | null,
    sortinoRatio: row.sortino_ratio as number | null,
    selected: (row.selected as number) === 1,
    createdAt: row.created_at as string,
  };
}

function mapICHistoryRow(row: Row): IndicatorICHistory {
  return {
    id: row.id as string,
    indicatorId: row.indicator_id as string,
    date: row.date as string,
    icValue: row.ic_value as number,
    icStd: row.ic_std as number,
    decisionsUsedIn: row.decisions_used_in as number,
    decisionsCorrect: row.decisions_correct as number,
    createdAt: row.created_at as string,
  };
}

export class IndicatorsRepository {
  constructor(private client: TursoClient) {}

  async create(input: CreateIndicatorInput): Promise<Indicator> {
    try {
      await this.client.run(
        `INSERT INTO indicators (
          id, name, category, status, hypothesis, economic_rationale,
          generated_at, generated_by, code_hash, ast_signature,
          similar_to, replaces
        ) VALUES (?, ?, ?, 'staging', ?, ?, datetime('now'), ?, ?, ?, ?, ?)`,
        [
          input.id,
          input.name,
          input.category,
          input.hypothesis,
          input.economicRationale,
          input.generatedBy,
          input.codeHash ?? null,
          input.astSignature ?? null,
          input.similarTo ?? null,
          input.replaces ?? null,
        ]
      );

      const indicator = await this.findById(input.id);
      if (!indicator) {
        throw RepositoryError.notFound("indicators", input.id);
      }
      return indicator;
    } catch (error) {
      throw RepositoryError.fromSqliteError("indicators", error as Error);
    }
  }

  async findById(id: string): Promise<Indicator | null> {
    const row = await this.client.get<Row>("SELECT * FROM indicators WHERE id = ?", [id]);
    return row ? mapIndicatorRow(row) : null;
  }

  async findByIdOrThrow(id: string): Promise<Indicator> {
    const indicator = await this.findById(id);
    if (!indicator) {
      throw RepositoryError.notFound("indicators", id);
    }
    return indicator;
  }

  async findByName(name: string): Promise<Indicator | null> {
    const row = await this.client.get<Row>("SELECT * FROM indicators WHERE name = ?", [name]);
    return row ? mapIndicatorRow(row) : null;
  }

  async findByCodeHash(codeHash: string): Promise<Indicator | null> {
    const row = await this.client.get<Row>("SELECT * FROM indicators WHERE code_hash = ?", [
      codeHash,
    ]);
    return row ? mapIndicatorRow(row) : null;
  }

  async findMany(
    filters?: IndicatorFilters,
    pagination?: PaginationOptions
  ): Promise<PaginatedResult<Indicator>> {
    let sql = "SELECT * FROM indicators WHERE 1=1";
    const args: unknown[] = [];

    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        const placeholders = filters.status.map(() => "?").join(", ");
        sql += ` AND status IN (${placeholders})`;
        args.push(...filters.status);
      } else {
        sql += " AND status = ?";
        args.push(filters.status);
      }
    }

    if (filters?.category) {
      sql += " AND category = ?";
      args.push(filters.category);
    }

    if (filters?.generatedBy) {
      sql += " AND generated_by = ?";
      args.push(filters.generatedBy);
    }

    if (filters?.codeHash) {
      sql += " AND code_hash = ?";
      args.push(filters.codeHash);
    }

    sql += " ORDER BY created_at DESC";

    const countSql = sql.replace("SELECT *", "SELECT COUNT(*) as count");

    const result = await paginate<Row>(this.client, sql, countSql, args, pagination);

    return {
      ...result,
      data: result.data.map(mapIndicatorRow),
    };
  }

  async findActive(): Promise<Indicator[]> {
    const rows = await this.client.execute<Row>(
      "SELECT * FROM indicators WHERE status IN ('paper', 'production') ORDER BY created_at DESC"
    );
    return rows.map(mapIndicatorRow);
  }

  async findProduction(): Promise<Indicator[]> {
    const rows = await this.client.execute<Row>(
      "SELECT * FROM indicators WHERE status = 'production' ORDER BY created_at DESC"
    );
    return rows.map(mapIndicatorRow);
  }

  async updateStatus(id: string, status: IndicatorStatus): Promise<Indicator> {
    try {
      await this.client.run(
        "UPDATE indicators SET status = ?, updated_at = datetime('now') WHERE id = ?",
        [status, id]
      );
      return this.findByIdOrThrow(id);
    } catch (error) {
      throw RepositoryError.fromSqliteError("indicators", error as Error);
    }
  }

  async saveValidationReport(id: string, report: ValidationReport): Promise<Indicator> {
    try {
      await this.client.run(
        `UPDATE indicators
         SET validation_report = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [toJson(report), id]
      );
      return this.findByIdOrThrow(id);
    } catch (error) {
      throw RepositoryError.fromSqliteError("indicators", error as Error);
    }
  }

  async startPaperTrading(id: string, startTimestamp: string): Promise<Indicator> {
    try {
      await this.client.run(
        `UPDATE indicators
         SET status = 'paper', paper_trading_start = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [startTimestamp, id]
      );
      return this.findByIdOrThrow(id);
    } catch (error) {
      throw RepositoryError.fromSqliteError("indicators", error as Error);
    }
  }

  async endPaperTrading(
    id: string,
    endTimestamp: string,
    report: PaperTradingReport
  ): Promise<Indicator> {
    try {
      await this.client.run(
        `UPDATE indicators
         SET paper_trading_end = ?, paper_trading_report = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [endTimestamp, toJson(report), id]
      );
      return this.findByIdOrThrow(id);
    } catch (error) {
      throw RepositoryError.fromSqliteError("indicators", error as Error);
    }
  }

  /**
   * Promote to production
   *
   * @param id - Indicator ID
   * @param prUrl - Pull request URL
   * @param parityReport - Optional parity validation report (JSON)
   */
  async promote(
    id: string,
    prUrl: string,
    parityReport?: Record<string, unknown>
  ): Promise<Indicator> {
    try {
      if (parityReport) {
        await this.client.run(
          `UPDATE indicators
           SET status = 'production', promoted_at = datetime('now'), pr_url = ?,
               parity_report = ?, parity_validated_at = datetime('now'), updated_at = datetime('now')
           WHERE id = ?`,
          [prUrl, toJson(parityReport), id]
        );
      } else {
        await this.client.run(
          `UPDATE indicators
           SET status = 'production', promoted_at = datetime('now'), pr_url = ?, updated_at = datetime('now')
           WHERE id = ?`,
          [prUrl, id]
        );
      }
      return this.findByIdOrThrow(id);
    } catch (error) {
      throw RepositoryError.fromSqliteError("indicators", error as Error);
    }
  }

  /**
   * Update parity validation result for an indicator.
   */
  async updateParityValidation(
    id: string,
    parityReport: Record<string, unknown>
  ): Promise<Indicator> {
    try {
      await this.client.run(
        `UPDATE indicators
         SET parity_report = ?, parity_validated_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?`,
        [toJson(parityReport), id]
      );
      return this.findByIdOrThrow(id);
    } catch (error) {
      throw RepositoryError.fromSqliteError("indicators", error as Error);
    }
  }

  /**
   * Mark PR as merged
   */
  async markMerged(id: string): Promise<Indicator> {
    try {
      await this.client.run(
        `UPDATE indicators
         SET merged_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?`,
        [id]
      );
      return this.findByIdOrThrow(id);
    } catch (error) {
      throw RepositoryError.fromSqliteError("indicators", error as Error);
    }
  }

  /**
   * Retire an indicator
   */
  async retire(id: string, reason: string): Promise<Indicator> {
    try {
      await this.client.run(
        `UPDATE indicators
         SET status = 'retired', retired_at = datetime('now'), retirement_reason = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [reason, id]
      );
      return this.findByIdOrThrow(id);
    } catch (error) {
      throw RepositoryError.fromSqliteError("indicators", error as Error);
    }
  }

  /**
   * Delete an indicator (and cascade to trials/history)
   */
  async delete(id: string): Promise<boolean> {
    try {
      const result = await this.client.run("DELETE FROM indicators WHERE id = ?", [id]);
      return (result?.changes ?? 0) > 0;
    } catch (error) {
      throw RepositoryError.fromSqliteError("indicators", error as Error);
    }
  }

  // ============================================
  // Trials CRUD
  // ============================================

  /**
   * Create a new trial
   */
  async createTrial(input: CreateIndicatorTrialInput): Promise<IndicatorTrial> {
    try {
      await this.client.run(
        `INSERT INTO indicator_trials (
          id, indicator_id, trial_number, hypothesis, parameters
        ) VALUES (?, ?, ?, ?, ?)`,
        [input.id, input.indicatorId, input.trialNumber, input.hypothesis, toJson(input.parameters)]
      );

      const trial = await this.findTrialById(input.id);
      if (!trial) {
        throw RepositoryError.notFound("indicator_trials", input.id);
      }
      return trial;
    } catch (error) {
      throw RepositoryError.fromSqliteError("indicator_trials", error as Error);
    }
  }

  /**
   * Find trial by ID
   */
  async findTrialById(id: string): Promise<IndicatorTrial | null> {
    const row = await this.client.get<Row>("SELECT * FROM indicator_trials WHERE id = ?", [id]);
    return row ? mapTrialRow(row) : null;
  }

  /**
   * Find trials for an indicator
   */
  async findTrialsByIndicatorId(indicatorId: string): Promise<IndicatorTrial[]> {
    const rows = await this.client.execute<Row>(
      "SELECT * FROM indicator_trials WHERE indicator_id = ? ORDER BY trial_number",
      [indicatorId]
    );
    return rows.map(mapTrialRow);
  }

  /**
   * Update trial results
   */
  async updateTrialResults(
    id: string,
    results: {
      sharpeRatio?: number;
      informationCoefficient?: number;
      maxDrawdown?: number;
      calmarRatio?: number;
      sortinoRatio?: number;
    }
  ): Promise<IndicatorTrial> {
    try {
      const sets: string[] = [];
      const args: unknown[] = [];

      if (results.sharpeRatio !== undefined) {
        sets.push("sharpe_ratio = ?");
        args.push(results.sharpeRatio);
      }
      if (results.informationCoefficient !== undefined) {
        sets.push("information_coefficient = ?");
        args.push(results.informationCoefficient);
      }
      if (results.maxDrawdown !== undefined) {
        sets.push("max_drawdown = ?");
        args.push(results.maxDrawdown);
      }
      if (results.calmarRatio !== undefined) {
        sets.push("calmar_ratio = ?");
        args.push(results.calmarRatio);
      }
      if (results.sortinoRatio !== undefined) {
        sets.push("sortino_ratio = ?");
        args.push(results.sortinoRatio);
      }

      if (sets.length === 0) {
        return this.findTrialById(id) as Promise<IndicatorTrial>;
      }

      args.push(id);
      await this.client.run(`UPDATE indicator_trials SET ${sets.join(", ")} WHERE id = ?`, args);

      const trial = await this.findTrialById(id);
      if (!trial) {
        throw RepositoryError.notFound("indicator_trials", id);
      }
      return trial;
    } catch (error) {
      throw RepositoryError.fromSqliteError("indicator_trials", error as Error);
    }
  }

  /**
   * Mark a trial as selected
   */
  async selectTrial(id: string): Promise<IndicatorTrial> {
    try {
      // First, get the indicator_id for this trial
      const trial = await this.findTrialById(id);
      if (!trial) {
        throw RepositoryError.notFound("indicator_trials", id);
      }

      // Deselect all trials for this indicator
      await this.client.run("UPDATE indicator_trials SET selected = 0 WHERE indicator_id = ?", [
        trial.indicatorId,
      ]);

      // Select this trial
      await this.client.run("UPDATE indicator_trials SET selected = 1 WHERE id = ?", [id]);

      return this.findTrialById(id) as Promise<IndicatorTrial>;
    } catch (error) {
      throw RepositoryError.fromSqliteError("indicator_trials", error as Error);
    }
  }

  /**
   * Get count of trials for an indicator (for DSR calculation)
   */
  async getTrialCount(indicatorId: string): Promise<number> {
    const row = await this.client.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM indicator_trials WHERE indicator_id = ?",
      [indicatorId]
    );
    return row?.count ?? 0;
  }

  // ============================================
  // IC History CRUD
  // ============================================

  /**
   * Record IC history entry
   */
  async recordICHistory(input: CreateIndicatorICHistoryInput): Promise<IndicatorICHistory> {
    try {
      await this.client.run(
        `INSERT INTO indicator_ic_history (
          id, indicator_id, date, ic_value, ic_std, decisions_used_in, decisions_correct
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          input.id,
          input.indicatorId,
          input.date,
          input.icValue,
          input.icStd,
          input.decisionsUsedIn ?? 0,
          input.decisionsCorrect ?? 0,
        ]
      );

      const history = await this.findICHistoryById(input.id);
      if (!history) {
        throw RepositoryError.notFound("indicator_ic_history", input.id);
      }
      return history;
    } catch (error) {
      throw RepositoryError.fromSqliteError("indicator_ic_history", error as Error);
    }
  }

  /**
   * Find IC history by ID
   */
  async findICHistoryById(id: string): Promise<IndicatorICHistory | null> {
    const row = await this.client.get<Row>("SELECT * FROM indicator_ic_history WHERE id = ?", [id]);
    return row ? mapICHistoryRow(row) : null;
  }

  /**
   * Find IC history for an indicator
   */
  async findICHistoryByIndicatorId(
    indicatorId: string,
    filters?: ICHistoryFilters
  ): Promise<IndicatorICHistory[]> {
    let sql = "SELECT * FROM indicator_ic_history WHERE indicator_id = ?";
    const args: unknown[] = [indicatorId];

    if (filters?.startDate) {
      sql += " AND date >= ?";
      args.push(filters.startDate);
    }

    if (filters?.endDate) {
      sql += " AND date <= ?";
      args.push(filters.endDate);
    }

    sql += " ORDER BY date DESC";

    if (filters?.limit) {
      sql += " LIMIT ?";
      args.push(filters.limit);
    }

    const rows = await this.client.execute<Row>(sql, args);
    return rows.map(mapICHistoryRow);
  }

  /**
   * Get average IC for an indicator over recent entries
   * @param indicatorId - The indicator ID
   * @param days - Optional number of recent entries to average (default: all)
   */
  async getAverageIC(indicatorId: string, days?: number): Promise<number | null> {
    let sql = `
      SELECT AVG(ic_value) as avg_ic
      FROM indicator_ic_history
      WHERE indicator_id = ?
    `;
    const args: unknown[] = [indicatorId];

    if (days) {
      // Get average of most recent N entries
      sql = `
        SELECT AVG(ic_value) as avg_ic
        FROM (
          SELECT ic_value
          FROM indicator_ic_history
          WHERE indicator_id = ?
          ORDER BY date DESC
          LIMIT ?
        )
      `;
      args.push(days);
    }

    const row = await this.client.get<{ avg_ic: number | null }>(sql, args);

    if (!row || row.avg_ic === null) {
      return null;
    }

    return row.avg_ic;
  }
}
