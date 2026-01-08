/**
 * Runtime Configuration Service
 *
 * Central service for loading all runtime configuration from the database.
 * NO YAML fallback - if the database is not seeded, operations throw errors.
 *
 * @see docs/plans/22-self-service-dashboard.md (Phase 2)
 */

// ============================================
// Repository Interface Types
// ============================================
// These types mirror the ones from @cream/storage but are defined here
// to avoid a cyclic dependency (storage depends on config).

/**
 * Trading environment
 */
export type TradingEnvironment = "BACKTEST" | "PAPER" | "LIVE";

/**
 * Trading configuration status
 */
export type RuntimeTradingConfigStatus = "draft" | "testing" | "active" | "archived";

/**
 * Trading configuration entity
 */
export interface RuntimeTradingConfig {
  id: string;
  environment: TradingEnvironment;
  version: number;
  maxConsensusIterations: number;
  agentTimeoutMs: number;
  totalConsensusTimeoutMs: number;
  convictionDeltaHold: number;
  convictionDeltaAction: number;
  highConvictionPct: number;
  mediumConvictionPct: number;
  lowConvictionPct: number;
  minRiskRewardRatio: number;
  kellyFraction: number;
  tradingCycleIntervalMs: number;
  predictionMarketsIntervalMs: number;
  status: RuntimeTradingConfigStatus;
  createdAt: string;
  updatedAt: string;
  promotedFrom: string | null;
}

/**
 * Agent types in the consensus network
 */
export type RuntimeAgentType =
  | "technical_analyst"
  | "news_analyst"
  | "fundamentals_analyst"
  | "bullish_researcher"
  | "bearish_researcher"
  | "trader"
  | "risk_manager"
  | "critic";

/**
 * Agent configuration entity
 */
export interface RuntimeAgentConfig {
  id: string;
  environment: TradingEnvironment;
  agentType: RuntimeAgentType;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPromptOverride: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Universe source type
 */
export type RuntimeUniverseSource = "static" | "index" | "screener";

/**
 * Universe configuration status
 */
export type RuntimeUniverseConfigStatus = "draft" | "testing" | "active" | "archived";

/**
 * Universe configuration entity
 */
export interface RuntimeUniverseConfig {
  id: string;
  environment: TradingEnvironment;
  source: RuntimeUniverseSource;
  staticSymbols: string[] | null;
  indexSource: string | null;
  minVolume: number | null;
  minMarketCap: number | null;
  optionableOnly: boolean;
  includeList: string[];
  excludeList: string[];
  status: RuntimeUniverseConfigStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Trading config repository interface
 */
export interface TradingConfigRepository {
  getActive(environment: TradingEnvironment): Promise<RuntimeTradingConfig | null>;
  getDraft(environment: TradingEnvironment): Promise<RuntimeTradingConfig | null>;
  saveDraft(
    environment: TradingEnvironment,
    input: Partial<
      Omit<RuntimeTradingConfig, "id" | "environment" | "createdAt" | "updatedAt" | "status">
    >
  ): Promise<RuntimeTradingConfig>;
  setStatus(id: string, status: RuntimeTradingConfigStatus): Promise<RuntimeTradingConfig>;
  getHistory(environment: TradingEnvironment, limit: number): Promise<RuntimeTradingConfig[]>;
  findById(id: string): Promise<RuntimeTradingConfig | null>;
  getNextVersion(environment: TradingEnvironment): Promise<number>;
  create(input: {
    id: string;
    environment: TradingEnvironment;
    version: number;
    maxConsensusIterations?: number;
    agentTimeoutMs?: number;
    totalConsensusTimeoutMs?: number;
    convictionDeltaHold?: number;
    convictionDeltaAction?: number;
    highConvictionPct?: number;
    mediumConvictionPct?: number;
    lowConvictionPct?: number;
    minRiskRewardRatio?: number;
    kellyFraction?: number;
    tradingCycleIntervalMs?: number;
    predictionMarketsIntervalMs?: number;
    status?: RuntimeTradingConfigStatus;
    promotedFrom?: string | null;
  }): Promise<RuntimeTradingConfig>;
  promote(sourceId: string, targetEnvironment: TradingEnvironment): Promise<RuntimeTradingConfig>;
}

/**
 * Agent configs repository interface
 */
export interface AgentConfigsRepository {
  getAll(environment: TradingEnvironment): Promise<RuntimeAgentConfig[]>;
  upsert(
    environment: TradingEnvironment,
    agentType: RuntimeAgentType,
    config: Partial<
      Omit<RuntimeAgentConfig, "id" | "environment" | "agentType" | "createdAt" | "updatedAt">
    >
  ): Promise<RuntimeAgentConfig>;
  cloneToEnvironment(
    source: TradingEnvironment,
    target: TradingEnvironment
  ): Promise<void> | Promise<unknown[]>;
}

/**
 * Universe configs repository interface
 */
export interface UniverseConfigsRepository {
  getActive(environment: TradingEnvironment): Promise<RuntimeUniverseConfig | null>;
  getDraft(environment: TradingEnvironment): Promise<RuntimeUniverseConfig | null>;
  saveDraft(
    environment: TradingEnvironment,
    input: Partial<
      Omit<RuntimeUniverseConfig, "id" | "environment" | "createdAt" | "updatedAt" | "status">
    >
  ): Promise<RuntimeUniverseConfig>;
  setStatus(id: string, status: RuntimeUniverseConfigStatus): Promise<RuntimeUniverseConfig>;
}

// ============================================
// Types
// ============================================

/**
 * Environment type for runtime config
 */
export type RuntimeEnvironment = "BACKTEST" | "PAPER" | "LIVE";

/**
 * Full runtime configuration
 */
export interface FullRuntimeConfig {
  trading: RuntimeTradingConfig;
  agents: Record<RuntimeAgentType, RuntimeAgentConfig>;
  universe: RuntimeUniverseConfig;
}

/**
 * Validation error details
 */
export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

/**
 * Validation result
 */
export interface RuntimeValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

/**
 * Config history entry with diff
 */
export interface ConfigHistoryEntry {
  tradingConfig: RuntimeTradingConfig;
  changedAt: string;
  changedFields: string[];
}

/**
 * Runtime config service error
 */
export class RuntimeConfigError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "NOT_SEEDED"
      | "VALIDATION_FAILED"
      | "PROMOTION_FAILED"
      | "ROLLBACK_FAILED",
    public readonly environment?: RuntimeEnvironment,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "RuntimeConfigError";
  }

  static notSeeded(environment: RuntimeEnvironment): RuntimeConfigError {
    return new RuntimeConfigError(
      `No active config found for ${environment}. Run 'bun run db:seed' first.`,
      "NOT_SEEDED",
      environment
    );
  }

  static validationFailed(
    errors: ValidationError[],
    environment?: RuntimeEnvironment
  ): RuntimeConfigError {
    const errorMessages = errors.map((e) => `${e.field}: ${e.message}`).join("; ");
    return new RuntimeConfigError(
      `Config validation failed: ${errorMessages}`,
      "VALIDATION_FAILED",
      environment,
      errors
    );
  }
}

// ============================================
// Service Implementation
// ============================================

/**
 * Runtime configuration service
 *
 * Loads all configuration from the database with no YAML fallback.
 */
export class RuntimeConfigService {
  constructor(
    private readonly tradingConfigRepo: TradingConfigRepository,
    private readonly agentConfigsRepo: AgentConfigsRepository,
    private readonly universeConfigsRepo: UniverseConfigsRepository
  ) {}

  /**
   * Load active configuration from DB
   *
   * @throws RuntimeConfigError if no active config exists (run db:seed first)
   */
  async getActiveConfig(environment: RuntimeEnvironment): Promise<FullRuntimeConfig> {
    // Load trading config
    const trading = await this.tradingConfigRepo.getActive(environment as TradingEnvironment);
    if (!trading) {
      throw RuntimeConfigError.notSeeded(environment);
    }

    // Load universe config
    const universe = await this.universeConfigsRepo.getActive(environment);
    if (!universe) {
      throw RuntimeConfigError.notSeeded(environment);
    }

    // Load all agent configs
    const agentConfigs = await this.agentConfigsRepo.getAll(environment);
    const agents = this.buildAgentsMap(agentConfigs);

    return { trading, agents, universe };
  }

  /**
   * Get draft configuration for editing
   *
   * Returns existing draft or creates one from active config.
   */
  async getDraft(environment: RuntimeEnvironment): Promise<FullRuntimeConfig> {
    // Get or create trading draft
    let trading = await this.tradingConfigRepo.getDraft(environment as TradingEnvironment);
    if (!trading) {
      // Create draft from active or throw if no active
      const active = await this.tradingConfigRepo.getActive(environment as TradingEnvironment);
      if (!active) {
        throw RuntimeConfigError.notSeeded(environment);
      }
      // Return active as the "draft" to edit
      trading = active;
    }

    // Get or use active universe
    let universe = await this.universeConfigsRepo.getDraft(environment);
    if (!universe) {
      const activeUniverse = await this.universeConfigsRepo.getActive(environment);
      if (!activeUniverse) {
        throw RuntimeConfigError.notSeeded(environment);
      }
      universe = activeUniverse;
    }

    // Get agent configs (no draft concept for individual agents)
    const agentConfigs = await this.agentConfigsRepo.getAll(environment);
    const agents = this.buildAgentsMap(agentConfigs);

    return { trading, agents, universe };
  }

  /**
   * Save draft configuration
   *
   * Creates or updates draft config without affecting the running system.
   */
  async saveDraft(
    environment: RuntimeEnvironment,
    config: Partial<{
      trading: Partial<RuntimeTradingConfig>;
      universe: Partial<RuntimeUniverseConfig>;
      agents: Partial<Record<RuntimeAgentType, Partial<RuntimeAgentConfig>>>;
    }>
  ): Promise<FullRuntimeConfig> {
    // Save trading config draft
    if (config.trading) {
      await this.tradingConfigRepo.saveDraft(environment as TradingEnvironment, {
        maxConsensusIterations: config.trading.maxConsensusIterations,
        agentTimeoutMs: config.trading.agentTimeoutMs,
        totalConsensusTimeoutMs: config.trading.totalConsensusTimeoutMs,
        convictionDeltaHold: config.trading.convictionDeltaHold,
        convictionDeltaAction: config.trading.convictionDeltaAction,
        highConvictionPct: config.trading.highConvictionPct,
        mediumConvictionPct: config.trading.mediumConvictionPct,
        lowConvictionPct: config.trading.lowConvictionPct,
        minRiskRewardRatio: config.trading.minRiskRewardRatio,
        kellyFraction: config.trading.kellyFraction,
        tradingCycleIntervalMs: config.trading.tradingCycleIntervalMs,
        predictionMarketsIntervalMs: config.trading.predictionMarketsIntervalMs,
      });
    }

    // Save universe config draft
    if (config.universe) {
      await this.universeConfigsRepo.saveDraft(environment, {
        source: config.universe.source,
        staticSymbols: config.universe.staticSymbols,
        indexSource: config.universe.indexSource,
        minVolume: config.universe.minVolume,
        minMarketCap: config.universe.minMarketCap,
        optionableOnly: config.universe.optionableOnly,
        includeList: config.universe.includeList,
        excludeList: config.universe.excludeList,
      });
    }

    // Update agent configs
    if (config.agents) {
      for (const [agentType, agentConfig] of Object.entries(config.agents)) {
        if (agentConfig) {
          await this.agentConfigsRepo.upsert(environment, agentType as RuntimeAgentType, {
            model: agentConfig.model,
            temperature: agentConfig.temperature,
            maxTokens: agentConfig.maxTokens,
            systemPromptOverride: agentConfig.systemPromptOverride,
            enabled: agentConfig.enabled,
          });
        }
      }
    }

    return this.getDraft(environment);
  }

  /**
   * Validate configuration for promotion
   */
  async validateForPromotion(config: FullRuntimeConfig): Promise<RuntimeValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    // Validate trading config
    this.validateTradingConfig(config.trading, errors, warnings);

    // Validate universe config
    this.validateUniverseConfig(config.universe, errors, warnings);

    // Validate agent configs
    this.validateAgentConfigs(config.agents, errors, warnings);

    // Cross-config validation
    this.validateCrossConfig(config, errors, warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Promote draft to active
   *
   * Archives current active and makes draft the new active.
   */
  async promote(environment: RuntimeEnvironment): Promise<FullRuntimeConfig> {
    // Get the draft
    const draft = await this.getDraft(environment);

    // Validate before promotion
    const validation = await this.validateForPromotion(draft);
    if (!validation.valid) {
      throw RuntimeConfigError.validationFailed(validation.errors, environment);
    }

    // Promote trading config
    const tradingDraft = await this.tradingConfigRepo.getDraft(environment as TradingEnvironment);
    if (tradingDraft) {
      await this.tradingConfigRepo.setStatus(tradingDraft.id, "active");
    }

    // Promote universe config
    const universeDraft = await this.universeConfigsRepo.getDraft(environment);
    if (universeDraft) {
      await this.universeConfigsRepo.setStatus(universeDraft.id, "active");
    }

    return this.getActiveConfig(environment);
  }

  /**
   * Promote config from one environment to another (e.g., PAPER → LIVE)
   */
  async promoteToEnvironment(
    sourceEnvironment: RuntimeEnvironment,
    targetEnvironment: RuntimeEnvironment
  ): Promise<FullRuntimeConfig> {
    // Get active config from source
    const sourceConfig = await this.getActiveConfig(sourceEnvironment);

    // Validate for target environment
    const validation = await this.validateForPromotion(sourceConfig);
    if (!validation.valid) {
      throw RuntimeConfigError.validationFailed(validation.errors, targetEnvironment);
    }

    // Get source trading config
    const sourceTrading = await this.tradingConfigRepo.getActive(
      sourceEnvironment as TradingEnvironment
    );
    if (!sourceTrading) {
      throw RuntimeConfigError.notSeeded(sourceEnvironment);
    }

    // Promote trading config to target environment
    const promotedTrading = await this.tradingConfigRepo.promote(
      sourceTrading.id,
      targetEnvironment as TradingEnvironment
    );
    await this.tradingConfigRepo.setStatus(promotedTrading.id, "active");

    // Clone agent configs to target environment
    await this.agentConfigsRepo.cloneToEnvironment(sourceEnvironment, targetEnvironment);

    // Get source universe config and create in target
    const sourceUniverse = await this.universeConfigsRepo.getActive(sourceEnvironment);
    if (sourceUniverse) {
      await this.universeConfigsRepo.saveDraft(targetEnvironment, {
        source: sourceUniverse.source,
        staticSymbols: sourceUniverse.staticSymbols,
        indexSource: sourceUniverse.indexSource,
        minVolume: sourceUniverse.minVolume,
        minMarketCap: sourceUniverse.minMarketCap,
        optionableOnly: sourceUniverse.optionableOnly,
        includeList: sourceUniverse.includeList,
        excludeList: sourceUniverse.excludeList,
      });
      const universeDraft = await this.universeConfigsRepo.getDraft(targetEnvironment);
      if (universeDraft) {
        await this.universeConfigsRepo.setStatus(universeDraft.id, "active");
      }
    }

    return this.getActiveConfig(targetEnvironment);
  }

  /**
   * Get configuration history
   */
  async getHistory(environment: RuntimeEnvironment, limit = 20): Promise<ConfigHistoryEntry[]> {
    const history = await this.tradingConfigRepo.getHistory(
      environment as TradingEnvironment,
      limit
    );

    return history.map((config, index) => {
      const changedFields: string[] = [];

      // Compare with previous version to find changes
      if (index < history.length - 1) {
        const prev = history[index + 1];
        if (prev) {
          if (config.maxConsensusIterations !== prev.maxConsensusIterations) {
            changedFields.push("maxConsensusIterations");
          }
          if (config.agentTimeoutMs !== prev.agentTimeoutMs) {
            changedFields.push("agentTimeoutMs");
          }
          if (config.convictionDeltaHold !== prev.convictionDeltaHold) {
            changedFields.push("convictionDeltaHold");
          }
          if (config.convictionDeltaAction !== prev.convictionDeltaAction) {
            changedFields.push("convictionDeltaAction");
          }
          if (config.highConvictionPct !== prev.highConvictionPct) {
            changedFields.push("highConvictionPct");
          }
          if (config.kellyFraction !== prev.kellyFraction) {
            changedFields.push("kellyFraction");
          }
          if (config.tradingCycleIntervalMs !== prev.tradingCycleIntervalMs) {
            changedFields.push("tradingCycleIntervalMs");
          }
        }
      }

      return {
        tradingConfig: config,
        changedAt: config.createdAt,
        changedFields,
      };
    });
  }

  /**
   * Rollback to a previous config version
   */
  async rollback(environment: RuntimeEnvironment, versionId: string): Promise<FullRuntimeConfig> {
    const config = await this.tradingConfigRepo.findById(versionId);
    if (!config) {
      throw new RuntimeConfigError(
        `Config version ${versionId} not found`,
        "ROLLBACK_FAILED",
        environment
      );
    }

    if (config.environment !== environment) {
      throw new RuntimeConfigError(
        `Config ${versionId} belongs to ${config.environment}, not ${environment}`,
        "ROLLBACK_FAILED",
        environment
      );
    }

    // Create a new version with the old config's values
    const nextVersion = await this.tradingConfigRepo.getNextVersion(
      environment as TradingEnvironment
    );
    const rollbackConfig = await this.tradingConfigRepo.create({
      id: `tc_${environment.toLowerCase()}_v${nextVersion}_rollback_${Date.now()}`,
      environment: environment as TradingEnvironment,
      version: nextVersion,
      maxConsensusIterations: config.maxConsensusIterations,
      agentTimeoutMs: config.agentTimeoutMs,
      totalConsensusTimeoutMs: config.totalConsensusTimeoutMs,
      convictionDeltaHold: config.convictionDeltaHold,
      convictionDeltaAction: config.convictionDeltaAction,
      highConvictionPct: config.highConvictionPct,
      mediumConvictionPct: config.mediumConvictionPct,
      lowConvictionPct: config.lowConvictionPct,
      minRiskRewardRatio: config.minRiskRewardRatio,
      kellyFraction: config.kellyFraction,
      tradingCycleIntervalMs: config.tradingCycleIntervalMs,
      predictionMarketsIntervalMs: config.predictionMarketsIntervalMs,
      status: "draft",
      promotedFrom: versionId,
    });

    // Activate the rollback config
    await this.tradingConfigRepo.setStatus(rollbackConfig.id, "active");

    return this.getActiveConfig(environment);
  }

  // ============================================
  // Private Helpers
  // ============================================

  private buildAgentsMap(
    agentConfigs: RuntimeAgentConfig[]
  ): Record<RuntimeAgentType, RuntimeAgentConfig> {
    const agents: Partial<Record<RuntimeAgentType, RuntimeAgentConfig>> = {};
    for (const config of agentConfigs) {
      agents[config.agentType] = config;
    }
    return agents as Record<RuntimeAgentType, RuntimeAgentConfig>;
  }

  private validateTradingConfig(
    config: RuntimeTradingConfig,
    errors: ValidationError[],
    warnings: string[]
  ): void {
    // Validate conviction percentages are in order
    if (config.highConvictionPct <= config.mediumConvictionPct) {
      errors.push({
        field: "trading.highConvictionPct",
        message: "High conviction must be greater than medium conviction",
        value: config.highConvictionPct,
      });
    }
    if (config.mediumConvictionPct <= config.lowConvictionPct) {
      errors.push({
        field: "trading.mediumConvictionPct",
        message: "Medium conviction must be greater than low conviction",
        value: config.mediumConvictionPct,
      });
    }

    // Validate conviction percentages are valid (0-1)
    if (config.highConvictionPct > 1 || config.highConvictionPct <= 0) {
      errors.push({
        field: "trading.highConvictionPct",
        message: "Must be between 0 and 1",
        value: config.highConvictionPct,
      });
    }

    // Validate timeouts
    if (config.agentTimeoutMs > config.totalConsensusTimeoutMs) {
      errors.push({
        field: "trading.agentTimeoutMs",
        message: "Agent timeout cannot exceed total consensus timeout",
        value: config.agentTimeoutMs,
      });
    }

    // Validate Kelly fraction
    if (config.kellyFraction < 0 || config.kellyFraction > 1) {
      errors.push({
        field: "trading.kellyFraction",
        message: "Kelly fraction must be between 0 and 1",
        value: config.kellyFraction,
      });
    }

    // Warnings for risky values
    if (config.kellyFraction > 0.5) {
      warnings.push("Kelly fraction > 0.5 is considered aggressive");
    }
    if (config.agentTimeoutMs < 10000) {
      warnings.push("Agent timeout < 10s may cause premature timeouts");
    }
  }

  private validateUniverseConfig(
    config: RuntimeUniverseConfig,
    errors: ValidationError[],
    warnings: string[]
  ): void {
    // Validate source-specific requirements
    if (
      config.source === "static" &&
      (!config.staticSymbols || config.staticSymbols.length === 0)
    ) {
      errors.push({
        field: "universe.staticSymbols",
        message: "Static source requires at least one symbol",
      });
    }

    if (config.source === "index" && !config.indexSource) {
      errors.push({
        field: "universe.indexSource",
        message: "Index source requires indexSource to be set",
      });
    }

    // Validate exclude doesn't include same symbols as include
    const includeSet = new Set(config.includeList);
    const overlapping = config.excludeList.filter((s) => includeSet.has(s));
    if (overlapping.length > 0) {
      errors.push({
        field: "universe.excludeList",
        message: `Symbols cannot be in both include and exclude: ${overlapping.join(", ")}`,
      });
    }

    // Warnings
    if (config.source === "static" && config.staticSymbols && config.staticSymbols.length > 100) {
      warnings.push("Large static universe (>100 symbols) may impact performance");
    }
  }

  private validateAgentConfigs(
    agents: Record<RuntimeAgentType, RuntimeAgentConfig>,
    errors: ValidationError[],
    warnings: string[]
  ): void {
    const enabledAgents = Object.values(agents).filter((a) => a.enabled);

    // Must have at least some agents enabled
    if (enabledAgents.length < 3) {
      errors.push({
        field: "agents",
        message: "At least 3 agents must be enabled for consensus",
        value: enabledAgents.length,
      });
    }

    // Validate temperature ranges
    for (const [agentType, config] of Object.entries(agents)) {
      if (config.temperature < 0 || config.temperature > 2) {
        errors.push({
          field: `agents.${agentType}.temperature`,
          message: "Temperature must be between 0 and 2",
          value: config.temperature,
        });
      }

      if (config.maxTokens < 100 || config.maxTokens > 100000) {
        errors.push({
          field: `agents.${agentType}.maxTokens`,
          message: "maxTokens must be between 100 and 100000",
          value: config.maxTokens,
        });
      }
    }

    // Warnings for model consistency
    const models = new Set(enabledAgents.map((a) => a.model));
    if (models.size > 3) {
      warnings.push("Using more than 3 different models may increase latency and costs");
    }
  }

  private validateCrossConfig(
    config: FullRuntimeConfig,
    _errors: ValidationError[],
    warnings: string[]
  ): void {
    // Validate trading cycle interval is reasonable
    const enabledAgentCount = Object.values(config.agents).filter((a) => a.enabled).length;
    const estimatedCycleTime = enabledAgentCount * config.trading.agentTimeoutMs;

    if (estimatedCycleTime > config.trading.tradingCycleIntervalMs * 0.8) {
      warnings.push(
        `Cycle interval (${config.trading.tradingCycleIntervalMs}ms) may be too short for ${enabledAgentCount} agents`
      );
    }
  }
}

// ============================================
// Factory
// ============================================

/**
 * Create a RuntimeConfigService instance
 */
export function createRuntimeConfigService(
  tradingConfigRepo: TradingConfigRepository,
  agentConfigsRepo: AgentConfigsRepository,
  universeConfigsRepo: UniverseConfigsRepository
): RuntimeConfigService {
  return new RuntimeConfigService(tradingConfigRepo, agentConfigsRepo, universeConfigsRepo);
}
