/**
 * Mastra Kit Services
 *
 * Business logic services for the Cream trading system.
 */

export {
	createDecayMonitorService,
	type DailyCheckResult,
	DEFAULT_DECAY_MONITOR_CONFIG,
	type DecayAlert,
	DecayAlertSchema,
	type DecayAlertService,
	type DecayAlertType,
	DecayAlertTypeSchema,
	type DecayMonitorConfig,
	type DecayMonitorDependencies,
	DecayMonitorService,
	type DecaySeverity,
	DecaySeveritySchema,
	type MarketDataProvider,
} from "./decay-monitor";
export {
	createFactorZooService,
	DEFAULT_FACTOR_ZOO_CONFIG,
	type DecayCheckResult,
	type FactorZooConfig,
	type FactorZooDependencies,
	type FactorZooEventEmitter,
	FactorZooService,
	type MegaAlphaResult,
	type QualifyingFactor,
	type WeightUpdateResult,
} from "./factor-zoo";
export {
	createIdeaAgent,
	type HelixClient,
	IdeaAgent,
	type IdeaAgentDependencies,
	type IdeaGenerationResult,
	type LLMProvider,
} from "./idea-agent";
export {
	createResearchTriggerService,
	type MarketBetaProvider,
	type ResearchTriggerDependencies,
	ResearchTriggerService,
} from "./research-trigger";
