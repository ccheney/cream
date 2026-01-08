/**
 * Universe Configs Repository
 *
 * Data access for universe_configs table. Manages trading universe configuration
 * with draft/testing/active/archived workflow.
 *
 * @see docs/plans/22-self-service-dashboard.md (Phase 1)
 */

import type { Row, TursoClient } from "../turso.js";
import { fromBoolean, parseJson, RepositoryError, toBoolean, toJson } from "./base.js";

// ============================================
// Types
// ============================================

/**
 * Universe source type
 */
export type UniverseSource = "static" | "index" | "screener";

/**
 * Universe configuration status
 */
export type UniverseConfigStatus = "draft" | "testing" | "active" | "archived";

/**
 * Universe environment
 */
export type UniverseEnvironment = "BACKTEST" | "PAPER" | "LIVE";

/**
 * Universe configuration entity
 */
export interface UniverseConfig {
  id: string;
  environment: UniverseEnvironment;
  source: UniverseSource;
  staticSymbols: string[] | null;
  indexSource: string | null;
  minVolume: number | null;
  minMarketCap: number | null;
  optionableOnly: boolean;
  includeList: string[];
  excludeList: string[];
  status: UniverseConfigStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Create universe config input
 */
export interface CreateUniverseConfigInput {
  id: string;
  environment: UniverseEnvironment;
  source: UniverseSource;
  staticSymbols?: string[] | null;
  indexSource?: string | null;
  minVolume?: number | null;
  minMarketCap?: number | null;
  optionableOnly?: boolean;
  includeList?: string[];
  excludeList?: string[];
  status?: UniverseConfigStatus;
}

/**
 * Update universe config input (partial)
 */
export interface UpdateUniverseConfigInput {
  source?: UniverseSource;
  staticSymbols?: string[] | null;
  indexSource?: string | null;
  minVolume?: number | null;
  minMarketCap?: number | null;
  optionableOnly?: boolean;
  includeList?: string[];
  excludeList?: string[];
}

// ============================================
// Row Mapper
// ============================================

function mapUniverseConfigRow(row: Row): UniverseConfig {
  return {
    id: row.id as string,
    environment: row.environment as UniverseEnvironment,
    source: row.source as UniverseSource,
    staticSymbols: parseJson<string[] | null>(row.static_symbols, null),
    indexSource: row.index_source as string | null,
    minVolume: row.min_volume as number | null,
    minMarketCap: row.min_market_cap as number | null,
    optionableOnly: toBoolean(row.optionable_only),
    includeList: parseJson<string[]>(row.include_list, []),
    excludeList: parseJson<string[]>(row.exclude_list, []),
    status: row.status as UniverseConfigStatus,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ============================================
// Repository
// ============================================

/**
 * Universe configs repository
 */
export class UniverseConfigsRepository {
  private readonly table = "universe_configs";

  constructor(private readonly client: TursoClient) {}

  /**
   * Create a new universe config
   */
  async create(input: CreateUniverseConfigInput): Promise<UniverseConfig> {
    const now = new Date().toISOString();

    try {
      await this.client.run(
        `INSERT INTO ${this.table} (
          id, environment, source,
          static_symbols, index_source,
          min_volume, min_market_cap, optionable_only,
          include_list, exclude_list,
          status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.id,
          input.environment,
          input.source,
          input.staticSymbols ? toJson(input.staticSymbols) : null,
          input.indexSource ?? null,
          input.minVolume ?? null,
          input.minMarketCap ?? null,
          fromBoolean(input.optionableOnly ?? false),
          toJson(input.includeList ?? []),
          toJson(input.excludeList ?? []),
          input.status ?? "draft",
          now,
          now,
        ]
      );
    } catch (error) {
      throw RepositoryError.fromSqliteError(this.table, error as Error);
    }

    return this.findById(input.id) as Promise<UniverseConfig>;
  }

  /**
   * Find universe config by ID
   */
  async findById(id: string): Promise<UniverseConfig | null> {
    const row = await this.client.get<Row>(`SELECT * FROM ${this.table} WHERE id = ?`, [id]);

    return row ? mapUniverseConfigRow(row) : null;
  }

  /**
   * Find universe config by ID, throw if not found
   */
  async findByIdOrThrow(id: string): Promise<UniverseConfig> {
    const config = await this.findById(id);
    if (!config) {
      throw RepositoryError.notFound(this.table, id);
    }
    return config;
  }

  /**
   * Get active config for environment
   */
  async getActive(environment: UniverseEnvironment): Promise<UniverseConfig | null> {
    const row = await this.client.get<Row>(
      `SELECT * FROM ${this.table} WHERE environment = ? AND status = 'active'`,
      [environment]
    );

    return row ? mapUniverseConfigRow(row) : null;
  }

  /**
   * Get active config, throw if not found
   */
  async getActiveOrThrow(environment: UniverseEnvironment): Promise<UniverseConfig> {
    const config = await this.getActive(environment);
    if (!config) {
      throw new RepositoryError(
        `No active universe config found for environment '${environment}'. Run seed script.`,
        "NOT_FOUND",
        this.table
      );
    }
    return config;
  }

  /**
   * Get draft config for editing
   */
  async getDraft(environment: UniverseEnvironment): Promise<UniverseConfig | null> {
    const row = await this.client.get<Row>(
      `SELECT * FROM ${this.table} WHERE environment = ? AND status = 'draft' ORDER BY created_at DESC LIMIT 1`,
      [environment]
    );

    return row ? mapUniverseConfigRow(row) : null;
  }

  /**
   * Save draft config (update existing draft or create new one)
   */
  async saveDraft(
    environment: UniverseEnvironment,
    input: UpdateUniverseConfigInput & { id?: string }
  ): Promise<UniverseConfig> {
    const existingDraft = await this.getDraft(environment);
    const now = new Date().toISOString();

    if (existingDraft) {
      // Update existing draft
      const updateFields: string[] = [];
      const updateValues: unknown[] = [];

      if (input.source !== undefined) {
        updateFields.push("source = ?");
        updateValues.push(input.source);
      }
      if (input.staticSymbols !== undefined) {
        updateFields.push("static_symbols = ?");
        updateValues.push(input.staticSymbols ? toJson(input.staticSymbols) : null);
      }
      if (input.indexSource !== undefined) {
        updateFields.push("index_source = ?");
        updateValues.push(input.indexSource);
      }
      if (input.minVolume !== undefined) {
        updateFields.push("min_volume = ?");
        updateValues.push(input.minVolume);
      }
      if (input.minMarketCap !== undefined) {
        updateFields.push("min_market_cap = ?");
        updateValues.push(input.minMarketCap);
      }
      if (input.optionableOnly !== undefined) {
        updateFields.push("optionable_only = ?");
        updateValues.push(fromBoolean(input.optionableOnly));
      }
      if (input.includeList !== undefined) {
        updateFields.push("include_list = ?");
        updateValues.push(toJson(input.includeList));
      }
      if (input.excludeList !== undefined) {
        updateFields.push("exclude_list = ?");
        updateValues.push(toJson(input.excludeList));
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
      const activeConfig = await this.getActive(environment);

      return this.create({
        id: input.id ?? `uc_${environment.toLowerCase()}_${Date.now()}`,
        environment,
        source: input.source ?? activeConfig?.source ?? "static",
        staticSymbols: input.staticSymbols ?? activeConfig?.staticSymbols ?? null,
        indexSource: input.indexSource ?? activeConfig?.indexSource ?? null,
        minVolume: input.minVolume ?? activeConfig?.minVolume ?? null,
        minMarketCap: input.minMarketCap ?? activeConfig?.minMarketCap ?? null,
        optionableOnly: input.optionableOnly ?? activeConfig?.optionableOnly ?? false,
        includeList: input.includeList ?? activeConfig?.includeList ?? [],
        excludeList: input.excludeList ?? activeConfig?.excludeList ?? [],
        status: "draft",
      });
    }
  }

  /**
   * Update config status
   */
  async setStatus(id: string, status: UniverseConfigStatus): Promise<UniverseConfig> {
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
  async getHistory(environment: UniverseEnvironment, limit = 20): Promise<UniverseConfig[]> {
    const rows = await this.client.execute<Row>(
      `SELECT * FROM ${this.table} WHERE environment = ? ORDER BY created_at DESC LIMIT ?`,
      [environment, limit]
    );

    return rows.map(mapUniverseConfigRow);
  }

  /**
   * Delete a config (cannot delete active)
   */
  async delete(id: string): Promise<boolean> {
    const config = await this.findById(id);

    if (config?.status === "active") {
      throw new RepositoryError(
        "Cannot delete active universe config",
        "CONSTRAINT_VIOLATION",
        this.table
      );
    }

    const result = await this.client.run(`DELETE FROM ${this.table} WHERE id = ?`, [id]);

    return result.changes > 0;
  }
}
