/**
 * Runtime Configuration Module
 *
 * @see docs/plans/22-self-service-dashboard.md (Phase 2)
 */

export { RuntimeConfigError } from "./error.js";
export {
	describeFieldChange,
	findChangedFields,
	generateChangeDescription,
} from "./history.js";
export { createRuntimeConfigService, RuntimeConfigService } from "./service.js";
export type {
	AgentConfigsRepository,
	ConfigHistoryEntry,
	ConstraintsConfigRepository,
	FullRuntimeConfig,
	RuntimeAgentConfig,
	RuntimeAgentType,
	RuntimeConstraintsConfig,
	RuntimeConstraintsConfigStatus,
	RuntimeEnvironment,
	RuntimeOptionsLimits,
	RuntimePerInstrumentLimits,
	RuntimePortfolioLimits,
	RuntimeScannerConfig,
	RuntimeScannerConfigStatus,
	RuntimeTradingConfig,
	RuntimeTradingConfigStatus,
	RuntimeValidationResult,
	ScannerConfigsRepository,
	TradingConfigRepository,
	TradingEnvironment,
	ValidationError,
} from "./types.js";
export {
	validateAgentConfigs,
	validateConstraintsConfig,
	validateCrossConfig,
	validateForPromotion,
	validateScannerConfig,
	validateTradingConfig,
} from "./validation.js";
