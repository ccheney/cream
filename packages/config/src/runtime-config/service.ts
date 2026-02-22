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
	RuntimeScannerConfig,
	TradingConfigRepository,
	TradingEnvironment,
	ScannerConfigsRepository,
} from "./types.js";
import { validateForPromotion } from "./validation.js";

type DraftUpdateConfig = Partial<{
	trading: Partial<RuntimeTradingConfig>;
	scanner: Partial<RuntimeScannerConfig>;
	agents: Partial<Record<RuntimeAgentType, Partial<RuntimeAgentConfig>>>;
	constraints: Partial<{
		perInstrument: Partial<RuntimePerInstrumentLimits>;
		portfolio: Partial<RuntimePortfolioLimits>;
		options: Partial<RuntimeOptionsLimits>;
	}>;
}>;

export class RuntimeConfigService {
	constructor(
		private readonly tradingConfigRepo: TradingConfigRepository,
		private readonly agentConfigsRepo: AgentConfigsRepository,
		private readonly scannerConfigsRepo: ScannerConfigsRepository,
		private readonly constraintsConfigRepo?: ConstraintsConfigRepository,
	) {}

	async getActiveConfig(environment: RuntimeEnvironment): Promise<FullRuntimeConfig> {
		const trading = await this.tradingConfigRepo.getActive(environment as TradingEnvironment);
		if (!trading) {
			throw RuntimeConfigError.notSeeded(environment);
		}

		const scanner = await this.scannerConfigsRepo.getActive(environment);
		if (!scanner) {
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

		return { trading, agents, scanner, constraints };
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

		let scanner = await this.scannerConfigsRepo.getDraft(environment);
		if (!scanner) {
			const activeScanner = await this.scannerConfigsRepo.getActive(environment);
			if (!activeScanner) {
				throw RuntimeConfigError.notSeeded(environment);
			}
			scanner = activeScanner;
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

		return { trading, agents, scanner, constraints };
	}

	async saveDraft(
		environment: RuntimeEnvironment,
		config: DraftUpdateConfig,
	): Promise<FullRuntimeConfig> {
		await this.saveTradingDraft(environment, config.trading);
		await this.saveScannerDraft(environment, config.scanner);
		await this.saveAgentDrafts(environment, config.agents);
		await this.saveConstraintsDraft(environment, config.constraints);

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

		const scannerDraft = await this.scannerConfigsRepo.getDraft(environment);
		if (scannerDraft) {
			await this.scannerConfigsRepo.setStatus(scannerDraft.id, "active");
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
		targetEnvironment: RuntimeEnvironment,
	): Promise<FullRuntimeConfig> {
		const sourceConfig = await this.getActiveConfig(sourceEnvironment);

		const validation = await this.validateForPromotion(sourceConfig);
		if (!validation.valid) {
			throw RuntimeConfigError.validationFailed(validation.errors, targetEnvironment);
		}

		await this.promoteTrading(sourceEnvironment, targetEnvironment);
		await this.agentConfigsRepo.cloneToEnvironment(sourceEnvironment, targetEnvironment);
		await this.promoteScanner(sourceEnvironment, targetEnvironment);
		await this.promoteConstraints(sourceEnvironment, targetEnvironment);

		return this.getActiveConfig(targetEnvironment);
	}

	async getHistory(environment: RuntimeEnvironment, limit = 20): Promise<ConfigHistoryEntry[]> {
		const history = await this.tradingConfigRepo.getHistory(
			environment as TradingEnvironment,
			limit,
		);

		const activeTradingConfig = await this.tradingConfigRepo.getActive(
			environment as TradingEnvironment,
		);

		const [agentConfigs, scanner, constraints] = await Promise.all([
			this.agentConfigsRepo.getAll(environment as TradingEnvironment),
			this.scannerConfigsRepo.getActive(environment as TradingEnvironment),
			this.constraintsConfigRepo?.getActive(environment as TradingEnvironment),
		]);
		const agents = this.buildAgentsMap(agentConfigs);

		if (!scanner) {
			throw new RuntimeConfigError("No active scanner config", "NOT_SEEDED", environment);
		}

		return history.map((tradingConfig, index) => {
			const previousConfig = history[index + 1];
			const changedFields = previousConfig ? findChangedFields(tradingConfig, previousConfig) : [];

			const fullConfig: FullRuntimeConfig = {
				trading: tradingConfig,
				agents,
				scanner,
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
				environment,
			);
		}

		if (config.environment !== environment) {
			throw new RuntimeConfigError(
				`Config ${versionId} belongs to ${config.environment}, not ${environment}`,
				"ROLLBACK_FAILED",
				environment,
			);
		}

		const nextVersion = await this.tradingConfigRepo.getNextVersion(
			environment as TradingEnvironment,
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
		agentConfigs: RuntimeAgentConfig[],
	): Record<RuntimeAgentType, RuntimeAgentConfig> {
		const agents: Partial<Record<RuntimeAgentType, RuntimeAgentConfig>> = {};
		for (const config of agentConfigs) {
			agents[config.agentType] = config;
		}
		return agents as Record<RuntimeAgentType, RuntimeAgentConfig>;
	}

	private async saveTradingDraft(
		environment: RuntimeEnvironment,
		trading: DraftUpdateConfig["trading"],
	): Promise<void> {
		if (!trading) {
			return;
		}
		await this.tradingConfigRepo.saveDraft(environment as TradingEnvironment, {
			maxConsensusIterations: trading.maxConsensusIterations,
			agentTimeoutMs: trading.agentTimeoutMs,
			totalConsensusTimeoutMs: trading.totalConsensusTimeoutMs,
			convictionDeltaHold: trading.convictionDeltaHold,
			convictionDeltaAction: trading.convictionDeltaAction,
			highConvictionPct: trading.highConvictionPct,
			mediumConvictionPct: trading.mediumConvictionPct,
			lowConvictionPct: trading.lowConvictionPct,
			minRiskRewardRatio: trading.minRiskRewardRatio,
			kellyFraction: trading.kellyFraction,
			tradingCycleIntervalMs: trading.tradingCycleIntervalMs,
			predictionMarketsIntervalMs: trading.predictionMarketsIntervalMs,
			globalModel: trading.globalModel,
		});
	}

	private async saveScannerDraft(
		environment: RuntimeEnvironment,
		scanner: DraftUpdateConfig["scanner"],
	): Promise<void> {
		if (!scanner) {
			return;
		}
		await this.scannerConfigsRepo.saveDraft(environment, {
			minPrice: scanner.minPrice,
			minAvgVolume: scanner.minAvgVolume,
			volumeSpikeThreshold: scanner.volumeSpikeThreshold,
			priceMoveThreshold: scanner.priceMoveThreshold,
			gapThreshold: scanner.gapThreshold,
			maxCandidates: scanner.maxCandidates,
			cooldownSeconds: scanner.cooldownSeconds,
			enabled: scanner.enabled,
		});
	}

	private async saveAgentDrafts(
		environment: RuntimeEnvironment,
		agents: DraftUpdateConfig["agents"],
	): Promise<void> {
		if (!agents) {
			return;
		}
		for (const [agentType, agentConfig] of Object.entries(agents)) {
			if (!agentConfig) {
				continue;
			}
			await this.agentConfigsRepo.upsert(environment, agentType as RuntimeAgentType, {
				systemPromptOverride: agentConfig.systemPromptOverride,
				enabled: agentConfig.enabled,
			});
		}
	}

	private async saveConstraintsDraft(
		environment: RuntimeEnvironment,
		constraints: DraftUpdateConfig["constraints"],
	): Promise<void> {
		if (!constraints || !this.constraintsConfigRepo) {
			return;
		}
		await this.constraintsConfigRepo.saveDraft(environment, {
			maxShares: constraints.perInstrument?.maxShares,
			maxContracts: constraints.perInstrument?.maxContracts,
			maxNotional: constraints.perInstrument?.maxNotional,
			maxPctEquity: constraints.perInstrument?.maxPctEquity,
			maxGrossExposure: constraints.portfolio?.maxGrossExposure,
			maxNetExposure: constraints.portfolio?.maxNetExposure,
			maxConcentration: constraints.portfolio?.maxConcentration,
			maxCorrelation: constraints.portfolio?.maxCorrelation,
			maxDrawdown: constraints.portfolio?.maxDrawdown,
			maxDelta: constraints.options?.maxDelta,
			maxGamma: constraints.options?.maxGamma,
			maxVega: constraints.options?.maxVega,
			maxTheta: constraints.options?.maxTheta,
		});
	}

	private async promoteTrading(
		sourceEnvironment: RuntimeEnvironment,
		targetEnvironment: RuntimeEnvironment,
	): Promise<void> {
		const sourceTrading = await this.tradingConfigRepo.getActive(
			sourceEnvironment as TradingEnvironment,
		);
		if (!sourceTrading) {
			throw RuntimeConfigError.notSeeded(sourceEnvironment);
		}
		const promotedTrading = await this.tradingConfigRepo.promote(
			sourceTrading.id,
			targetEnvironment as TradingEnvironment,
		);
		await this.tradingConfigRepo.setStatus(promotedTrading.id, "active");
	}

	private async promoteScanner(
		sourceEnvironment: RuntimeEnvironment,
		targetEnvironment: RuntimeEnvironment,
	): Promise<void> {
		const sourceScanner = await this.scannerConfigsRepo.getActive(sourceEnvironment);
		if (!sourceScanner) {
			return;
		}
		await this.scannerConfigsRepo.saveDraft(targetEnvironment, {
			minPrice: sourceScanner.minPrice,
			minAvgVolume: sourceScanner.minAvgVolume,
			volumeSpikeThreshold: sourceScanner.volumeSpikeThreshold,
			priceMoveThreshold: sourceScanner.priceMoveThreshold,
			gapThreshold: sourceScanner.gapThreshold,
			maxCandidates: sourceScanner.maxCandidates,
			cooldownSeconds: sourceScanner.cooldownSeconds,
			enabled: sourceScanner.enabled,
		});
		const scannerDraft = await this.scannerConfigsRepo.getDraft(targetEnvironment);
		if (!scannerDraft) {
			return;
		}
		await this.scannerConfigsRepo.setStatus(scannerDraft.id, "active");
	}

	private async promoteConstraints(
		sourceEnvironment: RuntimeEnvironment,
		targetEnvironment: RuntimeEnvironment,
	): Promise<void> {
		if (!this.constraintsConfigRepo) {
			return;
		}
		const sourceConstraints = await this.constraintsConfigRepo.getActive(sourceEnvironment);
		if (!sourceConstraints) {
			return;
		}
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
		if (!constraintsDraft) {
			return;
		}
		await this.constraintsConfigRepo.setStatus(constraintsDraft.id, "active");
	}
}

export function createRuntimeConfigService(
	tradingConfigRepo: TradingConfigRepository,
	agentConfigsRepo: AgentConfigsRepository,
	scannerConfigsRepo: ScannerConfigsRepository,
	constraintsConfigRepo?: ConstraintsConfigRepository,
): RuntimeConfigService {
	return new RuntimeConfigService(
		tradingConfigRepo,
		agentConfigsRepo,
		scannerConfigsRepo,
		constraintsConfigRepo,
	);
}
