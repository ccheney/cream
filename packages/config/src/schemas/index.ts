/**
 * Configuration Schemas Index
 *
 * Exports all Zod schemas and their inferred TypeScript types.
 */

// Core configuration
export {
  CreamEnvironment,
  LLMConfigSchema,
  TimeframesConfigSchema,
  CoreConfigSchema,
  type LLMConfig,
  type TimeframesConfig,
  type CoreConfig,
} from "./core";

// Indicators configuration
export {
  IndicatorName,
  RSIParamsSchema,
  StochasticParamsSchema,
  SMAParamsSchema,
  EMAParamsSchema,
  ATRParamsSchema,
  BollingerBandsParamsSchema,
  VolumeSMAParamsSchema,
  IndicatorConfigSchema,
  IndicatorsConfigSchema,
  RSIIndicatorConfigSchema,
  StochasticIndicatorConfigSchema,
  SMAIndicatorConfigSchema,
  EMAIndicatorConfigSchema,
  ATRIndicatorConfigSchema,
  BollingerBandsIndicatorConfigSchema,
  VolumeSMAIndicatorConfigSchema,
  TypedIndicatorConfigSchema,
  type IndicatorConfig,
  type IndicatorsConfig,
  type RSIIndicatorConfig,
  type StochasticIndicatorConfig,
  type SMAIndicatorConfig,
  type EMAIndicatorConfig,
  type ATRIndicatorConfig,
  type BollingerBandsIndicatorConfig,
  type VolumeSMAIndicatorConfig,
  type TypedIndicatorConfig,
} from "./indicators";

// Features/transforms configuration
export {
  TransformName,
  ReturnsParamsSchema,
  ZScoreParamsSchema,
  PercentileRankParamsSchema,
  VolatilityScaleParamsSchema,
  TransformConfigSchema,
  TransformsConfigSchema,
  NormalizationConfigSchema,
  type TransformConfig,
  type TransformsConfig,
  type NormalizationConfig,
} from "./features";

// Regime configuration
export {
  ClassifierType,
  RegimeLabel,
  RuleBasedConfigSchema,
  CovarianceType,
  RetrainFrequency,
  HMMConfigSchema,
  MLModelConfigSchema,
  RegimeConfigSchema,
  type RuleBasedConfig,
  type HMMConfig,
  type MLModelConfig,
  type RegimeConfig,
} from "./regime";

// Constraints configuration
export {
  PerInstrumentConstraintsSchema,
  PortfolioConstraintsSchema,
  OptionsGreeksConstraintsSchema,
  SizingConstraintsSchema,
  ConstraintsConfigSchema,
  type PerInstrumentConstraints,
  type PortfolioConstraints,
  type OptionsGreeksConstraints,
  type SizingConstraints,
  type ConstraintsConfig,
} from "./constraints";

// Memory configuration
export {
  HelixDBConfigSchema,
  EmbeddingConfigSchema,
  TradeMemoryRetrievalSchema,
  DocumentRetrievalSchema,
  RetrievalConfigSchema,
  CorrectionConfigSchema,
  MemoryConfigSchema,
  type HelixDBConfig,
  type EmbeddingConfig,
  type TradeMemoryRetrieval,
  type DocumentRetrieval,
  type RetrievalConfig,
  type CorrectionConfig,
  type MemoryConfig,
} from "./memory";

// Agents configuration
export {
  AgentName,
  AgentSettingsSchema,
  ConsensusConfigSchema,
  AgentsConfigSchema,
  type AgentSettings,
  type ConsensusConfig,
  type AgentsConfig,
} from "./agents";

// Universe configuration
export {
  UniverseSourceType,
  ComposeMode,
  UniverseProvider,
  IndexId,
  StaticSourceSchema,
  IndexSourceSchema,
  ETFHoldingsSourceSchema,
  ScreenerSourceSchema,
  UniverseSourceSchema,
  UniverseFiltersSchema,
  OptionsUniverseConfigSchema,
  UniverseConfigSchema,
  type StaticSource,
  type IndexSource,
  type ETFHoldingsSource,
  type ScreenerSource,
  type UniverseSource,
  type UniverseFilters,
  type OptionsUniverseConfig,
  type UniverseConfig,
} from "./universe";

// Execution configuration
export {
  OrderType,
  ExecutionTactic,
  BrokerId,
  OrderPolicySchema,
  TacticsConfigSchema,
  AlpacaConfigSchema,
  IBKRConfigSchema,
  ExecutionConfigSchema,
  type OrderPolicy,
  type TacticsConfig,
  type AlpacaConfig,
  type IBKRConfig,
  type ExecutionConfig,
} from "./execution";

// Metrics configuration
export {
  MetricName,
  MetricsWindowSchema,
  MetricsConfigSchema,
  type MetricsWindow,
  type MetricsConfig,
} from "./metrics";
