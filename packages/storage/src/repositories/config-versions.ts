/**
 * @see docs/plans/ui/04-data-requirements.md
 */

import type { Row, TursoClient } from "../turso.js";
import { parseJson, RepositoryError, toBoolean, toJson } from "./base.js";

export interface ConfigVersion {
  id: string;
  environment: string;
  config: Record<string, unknown>;
  description: string | null;
  active: boolean;
  createdAt: string;
  createdBy: string | null;
  activatedAt: string | null;
  deactivatedAt: string | null;
}

export interface CreateConfigVersionInput {
  id: string;
  environment: string;
  config: Record<string, unknown>;
  description?: string | null;
  createdBy?: string | null;
}

function mapConfigVersionRow(row: Row): ConfigVersion {
  return {
    id: row.id as string,
    environment: row.environment as string,
    config: parseJson<Record<string, unknown>>(row.config_json, {}),
    description: row.description as string | null,
    active: toBoolean(row.active),
    createdAt: row.created_at as string,
    createdBy: row.created_by as string | null,
    activatedAt: row.activated_at as string | null,
    deactivatedAt: row.deactivated_at as string | null,
  };
}

export class ConfigVersionsRepository {
  private readonly table = "config_versions";

  constructor(private readonly client: TursoClient) {}

  async create(input: CreateConfigVersionInput): Promise<ConfigVersion> {
    try {
      await this.client.run(
        `INSERT INTO ${this.table} (
          id, environment, config_json, description, active, created_by
        ) VALUES (?, ?, ?, ?, 0, ?)`,
        [
          input.id,
          input.environment,
          toJson(input.config),
          input.description ?? null,
          input.createdBy ?? null,
        ]
      );
    } catch (error) {
      throw RepositoryError.fromSqliteError(this.table, error as Error);
    }

    return this.findById(input.id) as Promise<ConfigVersion>;
  }

  async findById(id: string): Promise<ConfigVersion | null> {
    const row = await this.client.get<Row>(`SELECT * FROM ${this.table} WHERE id = ?`, [id]);

    return row ? mapConfigVersionRow(row) : null;
  }

  async findByIdOrThrow(id: string): Promise<ConfigVersion> {
    const config = await this.findById(id);
    if (!config) {
      throw RepositoryError.notFound(this.table, id);
    }
    return config;
  }

  async getActive(environment: string): Promise<ConfigVersion | null> {
    const row = await this.client.get<Row>(
      `SELECT * FROM ${this.table} WHERE environment = ? AND active = 1`,
      [environment]
    );

    return row ? mapConfigVersionRow(row) : null;
  }

  async getActiveOrThrow(environment: string): Promise<ConfigVersion> {
    const config = await this.getActive(environment);
    if (!config) {
      throw new RepositoryError(
        `No active config found for environment '${environment}'`,
        "NOT_FOUND",
        this.table
      );
    }
    return config;
  }

  async findByEnvironment(environment: string, limit = 20): Promise<ConfigVersion[]> {
    const rows = await this.client.execute<Row>(
      `SELECT * FROM ${this.table} WHERE environment = ? ORDER BY created_at DESC LIMIT ?`,
      [environment, limit]
    );

    return rows.map(mapConfigVersionRow);
  }

  /** Deactivates current active config before activating the new one. */
  async activate(id: string): Promise<ConfigVersion> {
    const config = await this.findByIdOrThrow(id);
    const now = new Date().toISOString();

    await this.client.run(
      `UPDATE ${this.table} SET active = 0, deactivated_at = ? WHERE environment = ? AND active = 1`,
      [now, config.environment]
    );

    await this.client.run(`UPDATE ${this.table} SET active = 1, activated_at = ? WHERE id = ?`, [
      now,
      id,
    ]);

    return this.findByIdOrThrow(id);
  }

  async deactivate(id: string): Promise<ConfigVersion> {
    const now = new Date().toISOString();

    const result = await this.client.run(
      `UPDATE ${this.table} SET active = 0, deactivated_at = ? WHERE id = ?`,
      [now, id]
    );

    if (result.changes === 0) {
      throw RepositoryError.notFound(this.table, id);
    }

    return this.findByIdOrThrow(id);
  }

  async compare(
    id1: string,
    id2: string
  ): Promise<{
    config1: ConfigVersion;
    config2: ConfigVersion;
    differences: { path: string; value1: unknown; value2: unknown }[];
  }> {
    const config1 = await this.findByIdOrThrow(id1);
    const config2 = await this.findByIdOrThrow(id2);

    const differences: { path: string; value1: unknown; value2: unknown }[] = [];
    const allKeys = new Set(Object.keys(config1.config)).union(
      new Set(Object.keys(config2.config))
    );

    for (const key of allKeys) {
      const v1 = config1.config[key];
      const v2 = config2.config[key];

      if (JSON.stringify(v1) !== JSON.stringify(v2)) {
        differences.push({ path: key, value1: v1, value2: v2 });
      }
    }

    return { config1, config2, differences };
  }

  async delete(id: string): Promise<boolean> {
    const config = await this.findById(id);

    if (config?.active) {
      throw new RepositoryError(
        "Cannot delete active config version",
        "CONSTRAINT_VIOLATION",
        this.table
      );
    }

    const result = await this.client.run(`DELETE FROM ${this.table} WHERE id = ?`, [id]);

    return result.changes > 0;
  }

  async getHistory(
    environment: string,
    limit = 50
  ): Promise<{
    versions: ConfigVersion[];
    activationHistory: { id: string; activatedAt: string; deactivatedAt: string | null }[];
  }> {
    const versions = await this.findByEnvironment(environment, limit);

    const activationHistory = versions
      .filter((v): v is ConfigVersion & { activatedAt: string } => v.activatedAt !== null)
      .map((v) => ({
        id: v.id,
        activatedAt: v.activatedAt,
        deactivatedAt: v.deactivatedAt,
      }))
      .sort((a, b) => b.activatedAt.localeCompare(a.activatedAt));

    return { versions, activationHistory };
  }
}
