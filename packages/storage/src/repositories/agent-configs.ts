/**
 * Agent Configs Repository
 *
 * Data access for agent_configs table. Manages per-agent model, temperature,
 * and prompt configuration with environment-specific overrides.
 *
 * @see docs/plans/22-self-service-dashboard.md (Phase 1)
 */

import type { Row, TursoClient } from "../turso.js";
import { fromBoolean, RepositoryError, toBoolean } from "./base.js";

// ============================================
// Types
// ============================================

/**
 * Agent types in the consensus network
 */
export type AgentType =
  | "technical_analyst"
  | "news_analyst"
  | "fundamentals_analyst"
  | "bullish_researcher"
  | "bearish_researcher"
  | "trader"
  | "risk_manager"
  | "critic";

/**
 * All valid agent types
 */
export const AGENT_TYPES: AgentType[] = [
  "technical_analyst",
  "news_analyst",
  "fundamentals_analyst",
  "bullish_researcher",
  "bearish_researcher",
  "trader",
  "risk_manager",
  "critic",
];

/**
 * Trading environment
 */
export type AgentEnvironment = "BACKTEST" | "PAPER" | "LIVE";

/**
 * Agent configuration entity
 */
export interface AgentConfig {
  id: string;
  environment: AgentEnvironment;
  agentType: AgentType;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPromptOverride: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Create agent config input
 */
export interface CreateAgentConfigInput {
  id: string;
  environment: AgentEnvironment;
  agentType: AgentType;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPromptOverride?: string | null;
  enabled?: boolean;
}

/**
 * Update agent config input (partial)
 */
export interface UpdateAgentConfigInput {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPromptOverride?: string | null;
  enabled?: boolean;
}

// ============================================
// Default Values
// ============================================

/**
 * Default models for different agent types
 * Complex reasoning agents get the larger model
 */
const DEFAULT_MODELS: Record<AgentType, string> = {
  technical_analyst: "gemini-2.5-flash-preview-05-20",
  news_analyst: "gemini-2.5-flash-preview-05-20",
  fundamentals_analyst: "gemini-2.5-pro-preview-05-06",
  bullish_researcher: "gemini-2.5-pro-preview-05-06",
  bearish_researcher: "gemini-2.5-pro-preview-05-06",
  trader: "gemini-2.5-pro-preview-05-06",
  risk_manager: "gemini-2.5-pro-preview-05-06",
  critic: "gemini-2.5-pro-preview-05-06",
};

/**
 * Default configuration values
 */
const DEFAULT_TEMPERATURE = 0;
const DEFAULT_MAX_TOKENS = 4096;

// ============================================
// Row Mapper
// ============================================

function mapAgentConfigRow(row: Row): AgentConfig {
  return {
    id: row.id as string,
    environment: row.environment as AgentEnvironment,
    agentType: row.agent_type as AgentType,
    model: row.model as string,
    temperature: row.temperature as number,
    maxTokens: row.max_tokens as number,
    systemPromptOverride: row.system_prompt_override as string | null,
    enabled: toBoolean(row.enabled),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ============================================
// Repository
// ============================================

/**
 * Agent configs repository
 */
export class AgentConfigsRepository {
  private readonly table = "agent_configs";

  constructor(private readonly client: TursoClient) {}

  /**
   * Create a new agent config
   */
  async create(input: CreateAgentConfigInput): Promise<AgentConfig> {
    const now = new Date().toISOString();
    const defaultModel = DEFAULT_MODELS[input.agentType];

    try {
      await this.client.run(
        `INSERT INTO ${this.table} (
          id, environment, agent_type, model, temperature, max_tokens,
          system_prompt_override, enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.id,
          input.environment,
          input.agentType,
          input.model ?? defaultModel,
          input.temperature ?? DEFAULT_TEMPERATURE,
          input.maxTokens ?? DEFAULT_MAX_TOKENS,
          input.systemPromptOverride ?? null,
          fromBoolean(input.enabled !== false),
          now,
          now,
        ]
      );
    } catch (error) {
      throw RepositoryError.fromSqliteError(this.table, error as Error);
    }

    return this.findById(input.id) as Promise<AgentConfig>;
  }

  /**
   * Find agent config by ID
   */
  async findById(id: string): Promise<AgentConfig | null> {
    const row = await this.client.get<Row>(`SELECT * FROM ${this.table} WHERE id = ?`, [id]);

    return row ? mapAgentConfigRow(row) : null;
  }

  /**
   * Find agent config by ID, throw if not found
   */
  async findByIdOrThrow(id: string): Promise<AgentConfig> {
    const config = await this.findById(id);
    if (!config) {
      throw RepositoryError.notFound(this.table, id);
    }
    return config;
  }

  /**
   * Get config for specific agent in environment
   */
  async get(environment: AgentEnvironment, agentType: AgentType): Promise<AgentConfig | null> {
    const row = await this.client.get<Row>(
      `SELECT * FROM ${this.table} WHERE environment = ? AND agent_type = ?`,
      [environment, agentType]
    );

    return row ? mapAgentConfigRow(row) : null;
  }

  /**
   * Get config for specific agent, throw if not found
   */
  async getOrThrow(environment: AgentEnvironment, agentType: AgentType): Promise<AgentConfig> {
    const config = await this.get(environment, agentType);
    if (!config) {
      throw new RepositoryError(
        `No config found for agent '${agentType}' in environment '${environment}'. Run seed script.`,
        "NOT_FOUND",
        this.table
      );
    }
    return config;
  }

  /**
   * Get all agent configs for environment
   */
  async getAll(environment: AgentEnvironment): Promise<AgentConfig[]> {
    const rows = await this.client.execute<Row>(
      `SELECT * FROM ${this.table} WHERE environment = ? ORDER BY agent_type`,
      [environment]
    );

    return rows.map(mapAgentConfigRow);
  }

  /**
   * Get all enabled agents for environment
   */
  async getEnabled(environment: AgentEnvironment): Promise<AgentConfig[]> {
    const rows = await this.client.execute<Row>(
      `SELECT * FROM ${this.table} WHERE environment = ? AND enabled = 1 ORDER BY agent_type`,
      [environment]
    );

    return rows.map(mapAgentConfigRow);
  }

  /**
   * Update agent config
   */
  async update(id: string, input: UpdateAgentConfigInput): Promise<AgentConfig> {
    await this.findByIdOrThrow(id);
    const now = new Date().toISOString();

    const updateFields: string[] = [];
    const updateValues: unknown[] = [];

    if (input.model !== undefined) {
      updateFields.push("model = ?");
      updateValues.push(input.model);
    }
    if (input.temperature !== undefined) {
      updateFields.push("temperature = ?");
      updateValues.push(input.temperature);
    }
    if (input.maxTokens !== undefined) {
      updateFields.push("max_tokens = ?");
      updateValues.push(input.maxTokens);
    }
    if (input.systemPromptOverride !== undefined) {
      updateFields.push("system_prompt_override = ?");
      updateValues.push(input.systemPromptOverride);
    }
    if (input.enabled !== undefined) {
      updateFields.push("enabled = ?");
      updateValues.push(fromBoolean(input.enabled));
    }

    if (updateFields.length > 0) {
      updateFields.push("updated_at = ?");
      updateValues.push(now);
      updateValues.push(id);

      await this.client.run(
        `UPDATE ${this.table} SET ${updateFields.join(", ")} WHERE id = ?`,
        updateValues
      );
    }

    return this.findByIdOrThrow(id);
  }

  /**
   * Create or update agent config for environment/agent pair
   */
  async upsert(
    environment: AgentEnvironment,
    agentType: AgentType,
    input: UpdateAgentConfigInput
  ): Promise<AgentConfig> {
    const existing = await this.get(environment, agentType);

    if (existing) {
      return this.update(existing.id, input);
    } else {
      return this.create({
        id: `ac_${environment.toLowerCase()}_${agentType}_${Date.now()}`,
        environment,
        agentType,
        ...input,
      });
    }
  }

  /**
   * Enable or disable an agent
   */
  async setEnabled(id: string, enabled: boolean): Promise<AgentConfig> {
    return this.update(id, { enabled });
  }

  /**
   * Reset agent to default values
   */
  async resetToDefaults(environment: AgentEnvironment, agentType: AgentType): Promise<AgentConfig> {
    const existing = await this.get(environment, agentType);

    if (!existing) {
      // Create with defaults
      return this.create({
        id: `ac_${environment.toLowerCase()}_${agentType}_${Date.now()}`,
        environment,
        agentType,
      });
    }

    // Update to defaults
    return this.update(existing.id, {
      model: DEFAULT_MODELS[agentType],
      temperature: DEFAULT_TEMPERATURE,
      maxTokens: DEFAULT_MAX_TOKENS,
      systemPromptOverride: null,
      enabled: true,
    });
  }

  /**
   * Delete an agent config
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.client.run(`DELETE FROM ${this.table} WHERE id = ?`, [id]);

    return result.changes > 0;
  }

  /**
   * Delete all configs for an environment
   */
  async deleteAll(environment: AgentEnvironment): Promise<number> {
    const result = await this.client.run(`DELETE FROM ${this.table} WHERE environment = ?`, [
      environment,
    ]);

    return result.changes;
  }

  /**
   * Clone configs from one environment to another
   */
  async cloneToEnvironment(
    sourceEnvironment: AgentEnvironment,
    targetEnvironment: AgentEnvironment
  ): Promise<AgentConfig[]> {
    const sourceConfigs = await this.getAll(sourceEnvironment);
    const results: AgentConfig[] = [];

    for (const source of sourceConfigs) {
      const newConfig = await this.upsert(targetEnvironment, source.agentType, {
        model: source.model,
        temperature: source.temperature,
        maxTokens: source.maxTokens,
        systemPromptOverride: source.systemPromptOverride,
        enabled: source.enabled,
      });
      results.push(newConfig);
    }

    return results;
  }

  /**
   * Get model usage statistics across environments
   */
  async getModelStats(): Promise<{ model: string; count: number; environments: string[] }[]> {
    const rows = await this.client.execute<Row>(
      `SELECT model, COUNT(*) as count, GROUP_CONCAT(DISTINCT environment) as environments
       FROM ${this.table}
       GROUP BY model
       ORDER BY count DESC`
    );

    return rows.map((row) => ({
      model: row.model as string,
      count: row.count as number,
      environments: (row.environments as string).split(",") as AgentEnvironment[],
    }));
  }
}
