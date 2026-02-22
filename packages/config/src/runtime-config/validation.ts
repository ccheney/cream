/**
 * Runtime Configuration Validation
 *
 * Validation logic for all configuration types.
 */

import type {
	FullRuntimeConfig,
	RuntimeAgentConfig,
	RuntimeAgentType,
	RuntimeConstraintsConfig,
	RuntimeScannerConfig,
	RuntimeTradingConfig,
	RuntimeValidationResult,
	ValidationError,
} from "./types.js";

export function validateTradingConfig(
	config: RuntimeTradingConfig,
	errors: ValidationError[],
	warnings: string[],
): void {
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

	if (config.highConvictionPct > 1 || config.highConvictionPct <= 0) {
		errors.push({
			field: "trading.highConvictionPct",
			message: "Must be between 0 and 1",
			value: config.highConvictionPct,
		});
	}

	if (config.agentTimeoutMs > config.totalConsensusTimeoutMs) {
		errors.push({
			field: "trading.agentTimeoutMs",
			message: "Agent timeout cannot exceed total consensus timeout",
			value: config.agentTimeoutMs,
		});
	}

	if (config.kellyFraction < 0 || config.kellyFraction > 1) {
		errors.push({
			field: "trading.kellyFraction",
			message: "Kelly fraction must be between 0 and 1",
			value: config.kellyFraction,
		});
	}

	if (config.kellyFraction > 0.5) {
		warnings.push("Kelly fraction > 0.5 is considered aggressive");
	}
	if (config.agentTimeoutMs < 10000) {
		warnings.push("Agent timeout < 10s may cause premature timeouts");
	}
}

export function validateScannerConfig(
	config: RuntimeScannerConfig,
	errors: ValidationError[],
	warnings: string[],
): void {
	if (config.minPrice < 0) {
		errors.push({
			field: "scanner.minPrice",
			message: "Minimum price must be >= 0",
		});
	}
	if (config.minAvgVolume < 0) {
		errors.push({
			field: "scanner.minAvgVolume",
			message: "Minimum average volume must be >= 0",
		});
	}
	if (config.volumeSpikeThreshold < 1) {
		errors.push({
			field: "scanner.volumeSpikeThreshold",
			message: "Volume spike threshold must be >= 1",
		});
	}
	if (config.maxCandidates < 1) {
		errors.push({
			field: "scanner.maxCandidates",
			message: "Max candidates must be at least 1",
		});
	}
	if (!config.enabled) {
		warnings.push("Scanner is disabled; no autonomous OODA cycles will trigger");
	}
}

export function validateAgentConfigs(
	agents: Record<RuntimeAgentType, RuntimeAgentConfig>,
	errors: ValidationError[],
	_warnings: string[],
): void {
	const enabledAgents = Object.values(agents).filter((a) => a.enabled);

	if (enabledAgents.length < 3) {
		errors.push({
			field: "agents",
			message: "At least 3 agents must be enabled for consensus",
			value: enabledAgents.length,
		});
	}
}

export function validateConstraintsConfig(
	config: RuntimeConstraintsConfig,
	errors: ValidationError[],
	warnings: string[],
): void {
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

export function validateCrossConfig(
	config: FullRuntimeConfig,
	_errors: ValidationError[],
	warnings: string[],
): void {
	const enabledAgentCount = Object.values(config.agents).filter((a) => a.enabled).length;
	const estimatedCycleTime = enabledAgentCount * config.trading.agentTimeoutMs;

	if (estimatedCycleTime > config.trading.tradingCycleIntervalMs * 0.8) {
		warnings.push(
			`Cycle interval (${config.trading.tradingCycleIntervalMs}ms) may be too short for ${enabledAgentCount} agents`,
		);
	}
}

export function validateForPromotion(config: FullRuntimeConfig): RuntimeValidationResult {
	const errors: ValidationError[] = [];
	const warnings: string[] = [];

	validateTradingConfig(config.trading, errors, warnings);
	validateScannerConfig(config.scanner, errors, warnings);
	validateAgentConfigs(config.agents, errors, warnings);
	validateConstraintsConfig(config.constraints, errors, warnings);
	validateCrossConfig(config, errors, warnings);

	return {
		valid: errors.length === 0,
		errors,
		warnings,
	};
}
