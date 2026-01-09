/**
 * Constraints Config Repository
 *
 * Data access for constraints_config table. Manages risk limits configuration
 * with draft/testing/active/archived workflow.
 *
 * @see docs/plans/22-self-service-dashboard.md
 * @see docs/plans/ui/05-api-endpoints.md
 */

import type { Row, TursoClient } from "../turso.js";
import { RepositoryError } from "./base.js";

// ============================================
// Types
// ============================================

/**
 * Constraints configuration status
 */
export type ConstraintsConfigStatus = "draft" | "testing" | "active" | "archived";

/**
 * Constraints environment
 */
export type ConstraintsEnvironment = "BACKTEST" | "PAPER" | "LIVE";

/**
 * Per-instrument limits
 */
export interface PerInstrumentLimits {
  maxShares: number;
  maxContracts: number;
  maxNotional: number;
  maxPctEquity: number;
}

/**
 * Portfolio-level limits
 */
export interface PortfolioLimits {
  maxGrossExposure: number;
  maxNetExposure: number;
  maxConcentration: number;
  maxCorrelation: number;
  maxDrawdown: number;
}

/**
 * Options greeks limits
 */
export interface OptionsLimits {
  maxDelta: number;
  maxGamma: number;
  maxVega: number;
  maxTheta: number;
}

/**
 * Constraints configuration entity
 */
export interface ConstraintsConfig {
  id: string;
  environment: ConstraintsEnvironment;

  // Per-instrument limits
  perInstrument: PerInstrumentLimits;

  // Portfolio limits
  portfolio: PortfolioLimits;

  // Options limits
  options: OptionsLimits;

  // Workflow
  status: ConstraintsConfigStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Create constraints config input
 */
export interface CreateConstraintsConfigInput {
  id: string;
  environment: ConstraintsEnvironment;

  // Per-instrument limits (optional - defaults provided)
  maxShares?: number;
  maxContracts?: number;
  maxNotional?: number;
  maxPctEquity?: number;

  // Portfolio limits
  maxGrossExposure?: number;
  maxNetExposure?: number;
  maxConcentration?: number;
  maxCorrelation?: number;
  maxDrawdown?: number;

  // Options limits
  maxDelta?: number;
  maxGamma?: number;
  maxVega?: number;
  maxTheta?: number;

  // Workflow
  status?: ConstraintsConfigStatus;
}

/**
 * Update constraints config input (partial)
 */
export interface UpdateConstraintsConfigInput {
  // Per-instrument limits
  maxShares?: number;
  maxContracts?: number;
  maxNotional?: number;
  maxPctEquity?: number;

  // Portfolio limits
  maxGrossExposure?: number;
  maxNetExposure?: number;
  maxConcentration?: number;
  maxCorrelation?: number;
  maxDrawdown?: number;

  // Options limits
  maxDelta?: number;
  maxGamma?: number;
  maxVega?: number;
  maxTheta?: number;
}

// ============================================
// Row Mapper
// ============================================

function mapConstraintsConfigRow(row: Row): ConstraintsConfig {
  return {
    id: row.id as string,
    environment: row.environment as ConstraintsEnvironment,

    perInstrument: {
      maxShares: row.max_shares as number,
      maxContracts: row.max_contracts as number,
      maxNotional: row.max_notional as number,
      maxPctEquity: row.max_pct_equity as number,
    },

    portfolio: {
      maxGrossExposure: row.max_gross_exposure as number,
      maxNetExposure: row.max_net_exposure as number,
      maxConcentration: row.max_concentration as number,
      maxCorrelation: row.max_correlation as number,
      maxDrawdown: row.max_drawdown as number,
    },

    options: {
      maxDelta: row.max_delta as number,
      maxGamma: row.max_gamma as number,
      maxVega: row.max_vega as number,
      maxTheta: row.max_theta as number,
    },

    status: row.status as ConstraintsConfigStatus,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ============================================
// Repository
// ============================================

/**
 * Constraints config repository
 */
export class ConstraintsConfigRepository {
  private readonly table = "constraints_config";

  constructor(private readonly client: TursoClient) {}

  /**
   * Create a new constraints config
   */
  async create(input: CreateConstraintsConfigInput): Promise<ConstraintsConfig> {
    const now = new Date().toISOString();

    try {
      await this.client.run(
        `INSERT INTO ${this.table} (
          id, environment,
          max_shares, max_contracts, max_notional, max_pct_equity,
          max_gross_exposure, max_net_exposure, max_concentration, max_correlation, max_drawdown,
          max_delta, max_gamma, max_vega, max_theta,
          status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.id,
          input.environment,
          input.maxShares ?? 1000,
          input.maxContracts ?? 10,
          input.maxNotional ?? 50000,
          input.maxPctEquity ?? 0.1,
          input.maxGrossExposure ?? 2.0,
          input.maxNetExposure ?? 1.0,
          input.maxConcentration ?? 0.25,
          input.maxCorrelation ?? 0.7,
          input.maxDrawdown ?? 0.15,
          input.maxDelta ?? 100,
          input.maxGamma ?? 50,
          input.maxVega ?? 1000,
          input.maxTheta ?? 500,
          input.status ?? "draft",
          now,
          now,
        ]
      );
    } catch (error) {
      throw RepositoryError.fromSqliteError(this.table, error as Error);
    }

    return this.findById(input.id) as Promise<ConstraintsConfig>;
  }

  /**
   * Find constraints config by ID
   */
  async findById(id: string): Promise<ConstraintsConfig | null> {
    const row = await this.client.get<Row>(`SELECT * FROM ${this.table} WHERE id = ?`, [id]);

    return row ? mapConstraintsConfigRow(row) : null;
  }

  /**
   * Find constraints config by ID, throw if not found
   */
  async findByIdOrThrow(id: string): Promise<ConstraintsConfig> {
    const config = await this.findById(id);
    if (!config) {
      throw RepositoryError.notFound(this.table, id);
    }
    return config;
  }

  /**
   * Get active config for environment
   */
  async getActive(environment: ConstraintsEnvironment): Promise<ConstraintsConfig | null> {
    const row = await this.client.get<Row>(
      `SELECT * FROM ${this.table} WHERE environment = ? AND status = 'active'`,
      [environment]
    );

    return row ? mapConstraintsConfigRow(row) : null;
  }

  /**
   * Get active config, throw if not found
   */
  async getActiveOrThrow(environment: ConstraintsEnvironment): Promise<ConstraintsConfig> {
    const config = await this.getActive(environment);
    if (!config) {
      throw new RepositoryError(
        `No active constraints config found for environment '${environment}'. Run seed script.`,
        "NOT_FOUND",
        this.table
      );
    }
    return config;
  }

  /**
   * Get draft config for editing
   */
  async getDraft(environment: ConstraintsEnvironment): Promise<ConstraintsConfig | null> {
    const row = await this.client.get<Row>(
      `SELECT * FROM ${this.table} WHERE environment = ? AND status = 'draft' ORDER BY created_at DESC LIMIT 1`,
      [environment]
    );

    return row ? mapConstraintsConfigRow(row) : null;
  }

  /**
   * Save draft config (update existing draft or create new one)
   */
  async saveDraft(
    environment: ConstraintsEnvironment,
    input: UpdateConstraintsConfigInput & { id?: string }
  ): Promise<ConstraintsConfig> {
    const existingDraft = await this.getDraft(environment);
    const now = new Date().toISOString();

    if (existingDraft) {
      // Update existing draft
      const updateFields: string[] = [];
      const updateValues: unknown[] = [];

      // Per-instrument limits
      if (input.maxShares !== undefined) {
        updateFields.push("max_shares = ?");
        updateValues.push(input.maxShares);
      }
      if (input.maxContracts !== undefined) {
        updateFields.push("max_contracts = ?");
        updateValues.push(input.maxContracts);
      }
      if (input.maxNotional !== undefined) {
        updateFields.push("max_notional = ?");
        updateValues.push(input.maxNotional);
      }
      if (input.maxPctEquity !== undefined) {
        updateFields.push("max_pct_equity = ?");
        updateValues.push(input.maxPctEquity);
      }

      // Portfolio limits
      if (input.maxGrossExposure !== undefined) {
        updateFields.push("max_gross_exposure = ?");
        updateValues.push(input.maxGrossExposure);
      }
      if (input.maxNetExposure !== undefined) {
        updateFields.push("max_net_exposure = ?");
        updateValues.push(input.maxNetExposure);
      }
      if (input.maxConcentration !== undefined) {
        updateFields.push("max_concentration = ?");
        updateValues.push(input.maxConcentration);
      }
      if (input.maxCorrelation !== undefined) {
        updateFields.push("max_correlation = ?");
        updateValues.push(input.maxCorrelation);
      }
      if (input.maxDrawdown !== undefined) {
        updateFields.push("max_drawdown = ?");
        updateValues.push(input.maxDrawdown);
      }

      // Options limits
      if (input.maxDelta !== undefined) {
        updateFields.push("max_delta = ?");
        updateValues.push(input.maxDelta);
      }
      if (input.maxGamma !== undefined) {
        updateFields.push("max_gamma = ?");
        updateValues.push(input.maxGamma);
      }
      if (input.maxVega !== undefined) {
        updateFields.push("max_vega = ?");
        updateValues.push(input.maxVega);
      }
      if (input.maxTheta !== undefined) {
        updateFields.push("max_theta = ?");
        updateValues.push(input.maxTheta);
      }

      if (updateFields.length > 0) {
        updateFields.push("updated_at = ?");
        updateValues.push(now);
        updateValues.push(existingDraft.id);

        await this.client.run(
          `UPDATE ${this.table} SET ${updateFields.join(", ")} WHERE id = ?`,
          updateValues
        );
      }

      return this.findByIdOrThrow(existingDraft.id);
    } else {
      // Create new draft based on active config or defaults
      return this.create({
        id: input.id ?? `cc_${environment.toLowerCase()}_${Date.now()}`,
        environment,
        status: "draft",
        ...input,
      });
    }
  }

  /**
   * Update config status
   */
  async setStatus(id: string, status: ConstraintsConfigStatus): Promise<ConstraintsConfig> {
    const config = await this.findByIdOrThrow(id);
    const now = new Date().toISOString();

    // If setting to active, archive current active config
    if (status === "active") {
      await this.client.run(
        `UPDATE ${this.table} SET status = 'archived', updated_at = ? WHERE environment = ? AND status = 'active'`,
        [now, config.environment]
      );
    }

    await this.client.run(`UPDATE ${this.table} SET status = ?, updated_at = ? WHERE id = ?`, [
      status,
      now,
      id,
    ]);

    return this.findByIdOrThrow(id);
  }

  /**
   * Get version history for environment
   */
  async getHistory(environment: ConstraintsEnvironment, limit = 20): Promise<ConstraintsConfig[]> {
    const rows = await this.client.execute<Row>(
      `SELECT * FROM ${this.table} WHERE environment = ? ORDER BY created_at DESC LIMIT ?`,
      [environment, limit]
    );

    return rows.map(mapConstraintsConfigRow);
  }

  /**
   * Delete a config (cannot delete active)
   */
  async delete(id: string): Promise<boolean> {
    const config = await this.findById(id);

    if (config?.status === "active") {
      throw new RepositoryError(
        "Cannot delete active constraints config",
        "CONSTRAINT_VIOLATION",
        this.table
      );
    }

    const result = await this.client.run(`DELETE FROM ${this.table} WHERE id = ?`, [id]);

    return result.changes > 0;
  }
}
