/**
 * Runtime Configuration Service
 *
 * Central service for loading all runtime configuration from the database.
 * NO YAML fallback - if the database is not seeded, operations throw errors.
 *
 * @see docs/plans/22-self-service-dashboard.md (Phase 2)
 */

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
} from "./runtime-config/index.js";
export {
	createRuntimeConfigService,
	RuntimeConfigError,
	RuntimeConfigService,
} from "./runtime-config/index.js";
