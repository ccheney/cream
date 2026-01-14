/**
 * Runtime Configuration Service
 *
 * Central service for loading all runtime configuration from the database.
 * NO YAML fallback - if the database is not seeded, operations throw errors.
 */

import { getDefaultConstraints } from "./defaults.js";
import { RuntimeConfigError } from "./error.js";
import { findChangedFields, generateChangeDescription } from "./history.js";
import type {
	AgentConfigsRepository,
	ConfigHistoryEntry,
	ConstraintsConfigRepository,
	FullRuntimeConfig,
	RuntimeAgentConfig,
	RuntimeAgentType,
	RuntimeConstraintsConfig,
	RuntimeEnvironment,
	RuntimeOptionsLimits,
	RuntimePerInstrumentLimits,
	RuntimePortfolioLimits,
	RuntimeTradingConfig,
	RuntimeUniverseConfig,
	TradingConfigRepository,
	TradingEnvironment,
	UniverseConfigsRepository,
} from "./types.js";
import { validateForPromotion } from "./validation.js";

export class RuntimeConfigService {
	constructor(
		private readonly tradingConfigRepo: TradingConfigRepository,
		private readonly agentConfigsRepo: AgentConfigsRepository,
		private readonly universeConfigsRepo: UniverseConfigsRepository,
		private readonly constraintsConfigRepo?: ConstraintsConfigRepository
	) {}

	async getActiveConfig(environment: RuntimeEnvironment): Promise<FullRuntimeConfig> {
		const trading = await this.tradingConfigRepo.getActive(environment as TradingEnvironment);
		if (!trading) {
			throw RuntimeConfigError.notSeeded(environment);
		}

		const universe = await this.universeConfigsRepo.getActive(environment);
		if (!universe) {
			throw RuntimeConfigError.notSeeded(environment);
		}

		const agentConfigs = await this.agentConfigsRepo.getAll(environment);
		const agents = this.buildAgentsMap(agentConfigs);

		let constraints: RuntimeConstraintsConfig;
		if (this.constraintsConfigRepo) {
			const constraintsConfig = await this.constraintsConfigRepo.getActive(environment);
			constraints = constraintsConfig ?? getDefaultConstraints(environment);
		} else {
			constraints = getDefaultConstraints(environment);
		}

		return { trading, agents, universe, constraints };
	}

	async getDraft(environment: RuntimeEnvironment): Promise<FullRuntimeConfig> {
		let trading = await this.tradingConfigRepo.getDraft(environment as TradingEnvironment);
		if (!trading) {
			const active = await this.tradingConfigRepo.getActive(environment as TradingEnvironment);
			if (!active) {
				throw RuntimeConfigError.notSeeded(environment);
			}
			trading = active;
		}

		let universe = await this.universeConfigsRepo.getDraft(environment);
		if (!universe) {
			const activeUniverse = await this.universeConfigsRepo.getActive(environment);
			if (!activeUniverse) {
				throw RuntimeConfigError.notSeeded(environment);
			}
			universe = activeUniverse;
		}

		const agentConfigs = await this.agentConfigsRepo.getAll(environment);
		const agents = this.buildAgentsMap(agentConfigs);

		let constraints: RuntimeConstraintsConfig;
		if (this.constraintsConfigRepo) {
			const constraintsDraft = await this.constraintsConfigRepo.getDraft(environment);
			if (constraintsDraft) {
				constraints = constraintsDraft;
			} else {
				const activeConstraints = await this.constraintsConfigRepo.getActive(environment);
				constraints = activeConstraints ?? getDefaultConstraints(environment);
			}
		} else {
			constraints = getDefaultConstraints(environment);
		}

		return { trading, agents, universe, constraints };
	}

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

	async validateForPromotion(config: FullRuntimeConfig) {
		return validateForPromotion(config);
	}

	async promote(environment: RuntimeEnvironment): Promise<FullRuntimeConfig> {
		const draft = await this.getDraft(environment);

		const validation = await this.validateForPromotion(draft);
		if (!validation.valid) {
			throw RuntimeConfigError.validationFailed(validation.errors, environment);
		}

		const tradingDraft = await this.tradingConfigRepo.getDraft(environment as TradingEnvironment);
		if (tradingDraft) {
			await this.tradingConfigRepo.setStatus(tradingDraft.id, "active");
		}

		const universeDraft = await this.universeConfigsRepo.getDraft(environment);
		if (universeDraft) {
			await this.universeConfigsRepo.setStatus(universeDraft.id, "active");
		}

		if (this.constraintsConfigRepo) {
			const constraintsDraft = await this.constraintsConfigRepo.getDraft(environment);
			if (constraintsDraft) {
				await this.constraintsConfigRepo.setStatus(constraintsDraft.id, "active");
			}
		}

		return this.getActiveConfig(environment);
	}

	async promoteToEnvironment(
		sourceEnvironment: RuntimeEnvironment,
		targetEnvironment: RuntimeEnvironment
	): Promise<FullRuntimeConfig> {
		const sourceConfig = await this.getActiveConfig(sourceEnvironment);

		const validation = await this.validateForPromotion(sourceConfig);
		if (!validation.valid) {
			throw RuntimeConfigError.validationFailed(validation.errors, targetEnvironment);
		}

		const sourceTrading = await this.tradingConfigRepo.getActive(
			sourceEnvironment as TradingEnvironment
		);
		if (!sourceTrading) {
			throw RuntimeConfigError.notSeeded(sourceEnvironment);
		}

		const promotedTrading = await this.tradingConfigRepo.promote(
			sourceTrading.id,
			targetEnvironment as TradingEnvironment
		);
		await this.tradingConfigRepo.setStatus(promotedTrading.id, "active");

		await this.agentConfigsRepo.cloneToEnvironment(sourceEnvironment, targetEnvironment);

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

	async getHistory(environment: RuntimeEnvironment, limit = 20): Promise<ConfigHistoryEntry[]> {
		const history = await this.tradingConfigRepo.getHistory(
			environment as TradingEnvironment,
			limit
		);

		const activeTradingConfig = await this.tradingConfigRepo.getActive(
			environment as TradingEnvironment
		);

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
			const previousConfig = history[index + 1];
			const changedFields = previousConfig ? findChangedFields(tradingConfig, previousConfig) : [];

			const fullConfig: FullRuntimeConfig = {
				trading: tradingConfig,
				agents,
				universe,
				constraints: constraints ?? getDefaultConstraints(environment),
			};

			const description = generateChangeDescription(changedFields, tradingConfig, previousConfig);

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

		await this.tradingConfigRepo.setStatus(rollbackConfig.id, "active");

		return this.getActiveConfig(environment);
	}

	private buildAgentsMap(
		agentConfigs: RuntimeAgentConfig[]
	): Record<RuntimeAgentType, RuntimeAgentConfig> {
		const agents: Partial<Record<RuntimeAgentType, RuntimeAgentConfig>> = {};
		for (const config of agentConfigs) {
			agents[config.agentType] = config;
		}
		return agents as Record<RuntimeAgentType, RuntimeAgentConfig>;
	}
}

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
