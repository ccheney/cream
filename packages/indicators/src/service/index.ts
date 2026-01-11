/**
 * Indicator Service
 *
 * Main service layer for indicator calculation and retrieval.
 * Orchestrates calculators, caching, and persistence.
 */

export {
  type CorporateActionsRepository,
  createIndicatorService,
  DEFAULT_SERVICE_CONFIG,
  type FundamentalRepository,
  IndicatorService,
  type IndicatorServiceConfig,
  type IndicatorServiceDependencies,
  type LiquidityCalculator,
  type MarketDataProvider,
  type OptionsCalculator,
  type OptionsDataProvider,
  type PriceCalculator,
  type SentimentRepository,
  type ShortInterestRepository,
} from "./indicator-service";
export { createLiquidityCalculator, LiquidityCalculatorAdapter } from "./liquidity-calculator";
export {
  createOptionsCalculator,
  OptionsCalculatorAdapter,
  type OptionsCalculatorInput,
} from "./options-calculator";
export { createPriceCalculator, PriceCalculatorAdapter } from "./price-calculator";
