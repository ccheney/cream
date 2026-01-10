/**
 * Runtime Configuration Service
 *
 * Central service for loading all runtime configuration from the database.
 * NO YAML fallback - if the database is not seeded, operations throw errors.
 *
 * @see docs/plans/22-self-service-dashboard.md (Phase 2)
 */

import type { GlobalModel } from "@cream/domain";

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
  globalModel: GlobalModel;
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
 * Constraints configuration status
 */
export type RuntimeConstraintsConfigStatus = "draft" | "testing" | "active" | "archived";

/**
 * Per-instrument limits
 */
export interface RuntimePerInstrumentLimits {
  maxShares: number;
  maxContracts: number;
  maxNotional: number;
  maxPctEquity: number;
}

/**
 * Portfolio-level limits
 */
export interface RuntimePortfolioLimits {
  maxGrossExposure: number;
  maxNetExposure: number;
  maxConcentration: number;
  maxCorrelation: number;
  maxDrawdown: number;
}

/**
 * Options greeks limits
 */
export interface RuntimeOptionsLimits {
  maxDelta: number;
  maxGamma: number;
  maxVega: number;
  maxTheta: number;
}

/**
 * Constraints configuration entity
 */
export interface RuntimeConstraintsConfig {
  id: string;
  environment: TradingEnvironment;
  perInstrument: RuntimePerInstrumentLimits;
  portfolio: RuntimePortfolioLimits;
  options: RuntimeOptionsLimits;
  status: RuntimeConstraintsConfigStatus;
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

/**
 * Constraints configs repository interface
 */
export interface ConstraintsConfigRepository {
  getActive(environment: TradingEnvironment): Promise<RuntimeConstraintsConfig | null>;
  getDraft(environment: TradingEnvironment): Promise<RuntimeConstraintsConfig | null>;
  saveDraft(
    environment: TradingEnvironment,
    input: Partial<{
      maxShares: number;
      maxContracts: number;
      maxNotional: number;
      maxPctEquity: number;
      maxGrossExposure: number;
      maxNetExposure: number;
      maxConcentration: number;
      maxCorrelation: number;
      maxDrawdown: number;
      maxDelta: number;
      maxGamma: number;
      maxVega: number;
      maxTheta: number;
    }>
  ): Promise<RuntimeConstraintsConfig>;
  setStatus(id: string, status: RuntimeConstraintsConfigStatus): Promise<RuntimeConstraintsConfig>;
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
  constraints: RuntimeConstraintsConfig;
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
 * Config history entry with diff and full context
 */
export interface ConfigHistoryEntry {
  /** Unique version identifier (trading config id) */
  id: string;
  /** Version number (sequential) */
  version: number;
  /** Full configuration snapshot */
  config: FullRuntimeConfig;
  /** When this version was created */
  createdAt: string;
  /** Who created this version (from auth, if available) */
  createdBy?: string;
  /** Whether this is the active version */
  isActive: boolean;
  /** Changed fields from previous version */
  changedFields: string[];
  /** Optional description of the change */
  description?: string;
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
    private readonly universeConfigsRepo: UniverseConfigsRepository,
    private readonly constraintsConfigRepo?: ConstraintsConfigRepository
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

    // Load constraints config (with defaults if not available)
    let constraints: RuntimeConstraintsConfig;
    if (this.constraintsConfigRepo) {
      const constraintsConfig = await this.constraintsConfigRepo.getActive(environment);
      constraints = constraintsConfig ?? this.getDefaultConstraints(environment);
    } else {
      constraints = this.getDefaultConstraints(environment);
    }

    return { trading, agents, universe, constraints };
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

    // Get or use active constraints
    let constraints: RuntimeConstraintsConfig;
    if (this.constraintsConfigRepo) {
      const constraintsDraft = await this.constraintsConfigRepo.getDraft(environment);
      if (constraintsDraft) {
        constraints = constraintsDraft;
      } else {
        const activeConstraints = await this.constraintsConfigRepo.getActive(environment);
        constraints = activeConstraints ?? this.getDefaultConstraints(environment);
      }
    } else {
      constraints = this.getDefaultConstraints(environment);
    }

    return { trading, agents, universe, constraints };
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
      constraints: Partial<{
        perInstrument: Partial<RuntimePerInstrumentLimits>;
        portfolio: Partial<RuntimePortfolioLimits>;
        options: Partial<RuntimeOptionsLimits>;
      }>;
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
        globalModel: config.trading.globalModel,
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

    // Update agent configs (model is now global via trading.globalModel)
    if (config.agents) {
      for (const [agentType, agentConfig] of Object.entries(config.agents)) {
        if (agentConfig) {
          await this.agentConfigsRepo.upsert(environment, agentType as RuntimeAgentType, {
            systemPromptOverride: agentConfig.systemPromptOverride,
            enabled: agentConfig.enabled,
          });
        }
      }
    }

    // Save constraints config draft
    if (config.constraints && this.constraintsConfigRepo) {
      await this.constraintsConfigRepo.saveDraft(environment, {
        maxShares: config.constraints.perInstrument?.maxShares,
        maxContracts: config.constraints.perInstrument?.maxContracts,
        maxNotional: config.constraints.perInstrument?.maxNotional,
        maxPctEquity: config.constraints.perInstrument?.maxPctEquity,
        maxGrossExposure: config.constraints.portfolio?.maxGrossExposure,
        maxNetExposure: config.constraints.portfolio?.maxNetExposure,
        maxConcentration: config.constraints.portfolio?.maxConcentration,
        maxCorrelation: config.constraints.portfolio?.maxCorrelation,
        maxDrawdown: config.constraints.portfolio?.maxDrawdown,
        maxDelta: config.constraints.options?.maxDelta,
        maxGamma: config.constraints.options?.maxGamma,
        maxVega: config.constraints.options?.maxVega,
        maxTheta: config.constraints.options?.maxTheta,
      });
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

    // Validate constraints config
    this.validateConstraintsConfig(config.constraints, errors, warnings);

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

    // Promote constraints config
    if (this.constraintsConfigRepo) {
      const constraintsDraft = await this.constraintsConfigRepo.getDraft(environment);
      if (constraintsDraft) {
        await this.constraintsConfigRepo.setStatus(constraintsDraft.id, "active");
      }
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

    // Get source constraints config and create in target
    if (this.constraintsConfigRepo) {
      const sourceConstraints = await this.constraintsConfigRepo.getActive(sourceEnvironment);
      if (sourceConstraints) {
        await this.constraintsConfigRepo.saveDraft(targetEnvironment, {
          maxShares: sourceConstraints.perInstrument.maxShares,
          maxContracts: sourceConstraints.perInstrument.maxContracts,
          maxNotional: sourceConstraints.perInstrument.maxNotional,
          maxPctEquity: sourceConstraints.perInstrument.maxPctEquity,
          maxGrossExposure: sourceConstraints.portfolio.maxGrossExposure,
          maxNetExposure: sourceConstraints.portfolio.maxNetExposure,
          maxConcentration: sourceConstraints.portfolio.maxConcentration,
          maxCorrelation: sourceConstraints.portfolio.maxCorrelation,
          maxDrawdown: sourceConstraints.portfolio.maxDrawdown,
          maxDelta: sourceConstraints.options.maxDelta,
          maxGamma: sourceConstraints.options.maxGamma,
          maxVega: sourceConstraints.options.maxVega,
          maxTheta: sourceConstraints.options.maxTheta,
        });
        const constraintsDraft = await this.constraintsConfigRepo.getDraft(targetEnvironment);
        if (constraintsDraft) {
          await this.constraintsConfigRepo.setStatus(constraintsDraft.id, "active");
        }
      }
    }

    return this.getActiveConfig(targetEnvironment);
  }

  /**
   * Get configuration history with full context
   */
  async getHistory(environment: RuntimeEnvironment, limit = 20): Promise<ConfigHistoryEntry[]> {
    const history = await this.tradingConfigRepo.getHistory(
      environment as TradingEnvironment,
      limit
    );

    // Get current active config to determine isActive status
    const activeTradingConfig = await this.tradingConfigRepo.getActive(
      environment as TradingEnvironment
    );

    // Get current agents and universe for building full configs
    // (agents/universe aren't version-tracked independently, so use current active)
    const [agentConfigs, universe, constraints] = await Promise.all([
      this.agentConfigsRepo.getAll(environment as TradingEnvironment),
      this.universeConfigsRepo.getActive(environment as TradingEnvironment),
      this.constraintsConfigRepo?.getActive(environment as TradingEnvironment),
    ]);
    const agents = this.buildAgentsMap(agentConfigs);

    if (!universe) {
      throw new RuntimeConfigError("No active universe config", "NOT_SEEDED", environment);
    }

    return history.map((tradingConfig, index) => {
      const changedFields: string[] = [];

      // Compare with previous version to find changes
      if (index < history.length - 1) {
        const prev = history[index + 1];
        if (prev) {
          if (tradingConfig.globalModel !== prev.globalModel) {
            changedFields.push("globalModel");
          }
          if (tradingConfig.maxConsensusIterations !== prev.maxConsensusIterations) {
            changedFields.push("maxConsensusIterations");
          }
          if (tradingConfig.agentTimeoutMs !== prev.agentTimeoutMs) {
            changedFields.push("agentTimeoutMs");
          }
          if (tradingConfig.totalConsensusTimeoutMs !== prev.totalConsensusTimeoutMs) {
            changedFields.push("totalConsensusTimeoutMs");
          }
          if (tradingConfig.convictionDeltaHold !== prev.convictionDeltaHold) {
            changedFields.push("convictionDeltaHold");
          }
          if (tradingConfig.convictionDeltaAction !== prev.convictionDeltaAction) {
            changedFields.push("convictionDeltaAction");
          }
          if (tradingConfig.highConvictionPct !== prev.highConvictionPct) {
            changedFields.push("highConvictionPct");
          }
          if (tradingConfig.mediumConvictionPct !== prev.mediumConvictionPct) {
            changedFields.push("mediumConvictionPct");
          }
          if (tradingConfig.lowConvictionPct !== prev.lowConvictionPct) {
            changedFields.push("lowConvictionPct");
          }
          if (tradingConfig.minRiskRewardRatio !== prev.minRiskRewardRatio) {
            changedFields.push("minRiskRewardRatio");
          }
          if (tradingConfig.kellyFraction !== prev.kellyFraction) {
            changedFields.push("kellyFraction");
          }
          if (tradingConfig.tradingCycleIntervalMs !== prev.tradingCycleIntervalMs) {
            changedFields.push("tradingCycleIntervalMs");
          }
          if (tradingConfig.predictionMarketsIntervalMs !== prev.predictionMarketsIntervalMs) {
            changedFields.push("predictionMarketsIntervalMs");
          }
        }
      }

      // Build full config snapshot (use default constraints if not available)
      const fullConfig: FullRuntimeConfig = {
        trading: tradingConfig,
        agents,
        universe,
        constraints: constraints ?? this.getDefaultConstraints(environment),
      };

      // Generate human-readable description from changed fields
      const description = this.generateChangeDescription(
        changedFields,
        tradingConfig,
        history[index + 1]
      );

      return {
        id: tradingConfig.id,
        version: tradingConfig.version,
        config: fullConfig,
        createdAt: tradingConfig.createdAt,
        isActive: activeTradingConfig?.id === tradingConfig.id,
        changedFields,
        description,
      };
    });
  }

  /**
   * Generate a human-readable description of config changes
   */
  private generateChangeDescription(
    changedFields: string[],
    current: RuntimeTradingConfig,
    previous?: RuntimeTradingConfig
  ): string | undefined {
    if (changedFields.length === 0) {
      if (current.promotedFrom) {
        return "Rollback to previous configuration";
      }
      return "Initial configuration";
    }

    if (changedFields.length === 1) {
      const field = changedFields[0];
      if (!field || !previous) {
        return undefined;
      }
      return this.describeFieldChange(field, current, previous);
    }

    if (changedFields.length <= 3) {
      return `Updated ${changedFields.join(", ")}`;
    }

    return `Updated ${changedFields.length} configuration settings`;
  }

  /**
   * Describe a single field change
   */
  private describeFieldChange(
    field: string,
    current: RuntimeTradingConfig,
    previous: RuntimeTradingConfig
  ): string {
    const fieldDescriptions: Record<string, string> = {
      globalModel: "Changed LLM model",
      maxConsensusIterations: "Adjusted consensus iterations",
      agentTimeoutMs: "Changed agent timeout",
      totalConsensusTimeoutMs: "Changed total consensus timeout",
      convictionDeltaHold: "Adjusted hold conviction threshold",
      convictionDeltaAction: "Adjusted action conviction threshold",
      highConvictionPct: "Changed high conviction percentage",
      mediumConvictionPct: "Changed medium conviction percentage",
      lowConvictionPct: "Changed low conviction percentage",
      minRiskRewardRatio: "Updated minimum risk/reward ratio",
      kellyFraction: "Adjusted Kelly fraction for position sizing",
      tradingCycleIntervalMs: "Changed trading cycle interval",
      predictionMarketsIntervalMs: "Changed prediction markets interval",
    };

    const base = fieldDescriptions[field] ?? `Updated ${field}`;

    // Add before/after for numeric fields
    const currentVal = current[field as keyof RuntimeTradingConfig];
    const prevVal = previous[field as keyof RuntimeTradingConfig];

    if (typeof currentVal === "number" && typeof prevVal === "number") {
      if (field.endsWith("Ms")) {
        // Format milliseconds as seconds/minutes
        const formatMs = (ms: number) => {
          if (ms >= 60000) {
            return `${ms / 60000}m`;
          }
          if (ms >= 1000) {
            return `${ms / 1000}s`;
          }
          return `${ms}ms`;
        };
        return `${base}: ${formatMs(prevVal)} → ${formatMs(currentVal)}`;
      }
      if (field.endsWith("Pct")) {
        return `${base}: ${prevVal}% → ${currentVal}%`;
      }
      return `${base}: ${prevVal} → ${currentVal}`;
    }

    if (typeof currentVal === "string" && typeof prevVal === "string") {
      return `${base}: ${prevVal} → ${currentVal}`;
    }

    return base;
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
    _warnings: string[]
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
    // Note: Model consistency warning removed - all agents now use global model
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

  private validateConstraintsConfig(
    config: RuntimeConstraintsConfig,
    errors: ValidationError[],
    warnings: string[]
  ): void {
    // Per-instrument limits validation
    if (config.perInstrument.maxShares < 1) {
      errors.push({
        field: "constraints.perInstrument.maxShares",
        message: "Must be at least 1",
        value: config.perInstrument.maxShares,
      });
    }
    if (config.perInstrument.maxPctEquity <= 0 || config.perInstrument.maxPctEquity > 1) {
      errors.push({
        field: "constraints.perInstrument.maxPctEquity",
        message: "Must be between 0 and 1",
        value: config.perInstrument.maxPctEquity,
      });
    }

    // Portfolio limits validation
    if (config.portfolio.maxConcentration <= 0 || config.portfolio.maxConcentration > 1) {
      errors.push({
        field: "constraints.portfolio.maxConcentration",
        message: "Must be between 0 and 1",
        value: config.portfolio.maxConcentration,
      });
    }
    if (config.portfolio.maxDrawdown <= 0 || config.portfolio.maxDrawdown > 1) {
      errors.push({
        field: "constraints.portfolio.maxDrawdown",
        message: "Must be between 0 and 1",
        value: config.portfolio.maxDrawdown,
      });
    }

    // Warnings for risky values
    if (config.portfolio.maxGrossExposure > 3) {
      warnings.push("Max gross exposure > 3x is considered highly leveraged");
    }
    if (config.portfolio.maxDrawdown > 0.25) {
      warnings.push("Max drawdown > 25% may expose portfolio to significant losses");
    }
    if (config.perInstrument.maxPctEquity > 0.2) {
      warnings.push("Position size > 20% of equity is considered concentrated");
    }
  }

  private getDefaultConstraints(environment: RuntimeEnvironment): RuntimeConstraintsConfig {
    const now = new Date().toISOString();
    return {
      id: `cc_${environment.toLowerCase()}_default`,
      environment: environment as TradingEnvironment,
      perInstrument: {
        maxShares: 1000,
        maxContracts: 10,
        maxNotional: 50000,
        maxPctEquity: 0.1,
      },
      portfolio: {
        maxGrossExposure: 2.0,
        maxNetExposure: 1.0,
        maxConcentration: 0.25,
        maxCorrelation: 0.7,
        maxDrawdown: 0.15,
      },
      options: {
        maxDelta: 100,
        maxGamma: 50,
        maxVega: 1000,
        maxTheta: 500,
      },
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
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
  universeConfigsRepo: UniverseConfigsRepository,
  constraintsConfigRepo?: ConstraintsConfigRepository
): RuntimeConfigService {
  return new RuntimeConfigService(
    tradingConfigRepo,
    agentConfigsRepo,
    universeConfigsRepo,
    constraintsConfigRepo
  );
}
