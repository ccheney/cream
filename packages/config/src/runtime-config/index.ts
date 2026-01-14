/**
 * Runtime Configuration Module
 *
 * @see docs/plans/22-self-service-dashboard.md (Phase 2)
 */

export { getDefaultConstraints } from "./defaults.js";
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
	RuntimeTradingConfig,
	RuntimeTradingConfigStatus,
	RuntimeUniverseConfig,
	RuntimeUniverseConfigStatus,
	RuntimeUniverseSource,
	RuntimeValidationResult,
	TradingConfigRepository,
	TradingEnvironment,
	UniverseConfigsRepository,
	ValidationError,
} from "./types.js";
export {
	validateAgentConfigs,
	validateConstraintsConfig,
	validateCrossConfig,
	validateForPromotion,
	validateTradingConfig,
	validateUniverseConfig,
} from "./validation.js";
