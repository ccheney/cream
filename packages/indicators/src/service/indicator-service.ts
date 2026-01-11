/**
 * Indicator Service
 *
 * Main orchestration service for indicator calculation and retrieval.
 * Uses constructor injection for all dependencies to enable testing.
 *
 * Architecture:
 * - Real-time indicators (price, liquidity, options) are calculated on-demand
 * - Batch indicators (value, quality, short interest, sentiment, corporate) are fetched from Turso
 * - Results are merged into a unified IndicatorSnapshot
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */

import { log } from "../logger";
import {
  createEmptyCorporateIndicators,
  createEmptyLiquidityIndicators,
  createEmptyMarketContext,
  createEmptyOptionsIndicators,
  createEmptyPriceIndicators,
  createEmptyQualityIndicators,
  createEmptySentimentIndicators,
  createEmptyShortInterestIndicators,
  createEmptySnapshot,
  createEmptyValueIndicators,
  type CorporateIndicators,
  type IndicatorSnapshot,
  type LiquidityIndicators,
  type OHLCVBar,
  type OptionsIndicators,
  type PriceIndicators,
  type QualityIndicators,
  type Quote,
  type SentimentIndicators,
  type ShortInterestIndicators,
  type ValueIndicators,
} from "../types";

// ============================================
// Provider Interfaces (for dependency injection)
// ============================================

/**
 * Market data provider interface
 * Implemented by @cream/marketdata
 */
export interface MarketDataProvider {
  getBars(symbol: string, limit: number): Promise<OHLCVBar[]>;
  getQuote(symbol: string): Promise<Quote | null>;
}

/**
 * Options data provider interface
 * Implemented by @cream/marketdata or execution-engine
 */
export interface OptionsDataProvider {
  getImpliedVolatility(symbol: string): Promise<number | null>;
  getIVSkew(symbol: string): Promise<number | null>;
  getPutCallRatio(symbol: string): Promise<number | null>;
}

// ============================================
// Calculator Interfaces (for dependency injection)
// ============================================

/**
 * Price indicator calculator interface
 */
export interface PriceCalculator {
  calculate(bars: OHLCVBar[]): PriceIndicators;
}

/**
 * Liquidity indicator calculator interface
 */
export interface LiquidityCalculator {
  calculate(bars: OHLCVBar[], quote: Quote | null): LiquidityIndicators;
}

/**
 * Options indicator calculator interface
 */
export interface OptionsCalculator {
  calculate(symbol: string, provider: OptionsDataProvider): Promise<OptionsIndicators>;
}

// ============================================
// Repository Interfaces (for batch indicators)
// ============================================

/**
 * Repository for fundamental (value + quality) indicators
 */
export interface FundamentalRepository {
  getLatest(symbol: string): Promise<{ value: ValueIndicators; quality: QualityIndicators } | null>;
}

/**
 * Repository for short interest indicators
 */
export interface ShortInterestRepository {
  getLatest(symbol: string): Promise<ShortInterestIndicators | null>;
}

/**
 * Repository for sentiment indicators
 */
export interface SentimentRepository {
  getLatest(symbol: string): Promise<SentimentIndicators | null>;
}

/**
 * Repository for corporate actions indicators
 */
export interface CorporateActionsRepository {
  getLatest(symbol: string): Promise<CorporateIndicators | null>;
}

// ============================================
// Service Configuration
// ============================================

export interface IndicatorServiceConfig {
  /** Number of bars to fetch for real-time calculations */
  barsLookback: number;
  /** Whether to fetch batch indicators from repositories */
  includeBatchIndicators: boolean;
  /** Whether to fetch options indicators */
  includeOptionsIndicators: boolean;
}

export const DEFAULT_SERVICE_CONFIG: IndicatorServiceConfig = {
  barsLookback: 200,
  includeBatchIndicators: true,
  includeOptionsIndicators: true,
};

// ============================================
// Service Dependencies
// ============================================

export interface IndicatorServiceDependencies {
  marketData: MarketDataProvider;
  optionsData?: OptionsDataProvider;
  priceCalculator?: PriceCalculator;
  liquidityCalculator?: LiquidityCalculator;
  optionsCalculator?: OptionsCalculator;
  fundamentalRepo?: FundamentalRepository;
  shortInterestRepo?: ShortInterestRepository;
  sentimentRepo?: SentimentRepository;
  corporateActionsRepo?: CorporateActionsRepository;
}

// ============================================
// Service Implementation
// ============================================

/**
 * Main indicator service for calculating and retrieving indicator snapshots.
 *
 * @example
 * ```typescript
 * const service = new IndicatorService({
 *   marketData: alpacaProvider,
 *   priceCalculator: new PriceCalculatorImpl(),
 *   fundamentalRepo: new FundamentalRepoImpl(turso),
 * });
 *
 * const snapshot = await service.getSnapshot("AAPL");
 * console.log(snapshot.price.rsi_14);
 * ```
 */
export class IndicatorService {
  private readonly config: IndicatorServiceConfig;
  private readonly deps: IndicatorServiceDependencies;

  constructor(
    deps: IndicatorServiceDependencies,
    config: Partial<IndicatorServiceConfig> = {},
  ) {
    this.deps = deps;
    this.config = { ...DEFAULT_SERVICE_CONFIG, ...config };
  }

  /**
   * Get a full indicator snapshot for a symbol.
   *
   * Combines real-time indicators (calculated on-demand) with
   * batch indicators (fetched from repositories).
   */
  async getSnapshot(symbol: string): Promise<IndicatorSnapshot> {
    const startTime = Date.now();

    try {
      // Fetch market data
      const bars = await this.deps.marketData.getBars(symbol, this.config.barsLookback);
      const quote = await this.deps.marketData.getQuote(symbol);

      // Calculate real-time indicators
      const price = this.calculatePriceIndicators(bars);
      const liquidity = this.calculateLiquidityIndicators(bars, quote);
      const options = await this.calculateOptionsIndicators(symbol);

      // Fetch batch indicators
      const { value, quality } = await this.fetchFundamentals(symbol);
      const shortInterest = await this.fetchShortInterest(symbol);
      const sentiment = await this.fetchSentiment(symbol);
      const corporate = await this.fetchCorporateActions(symbol);

      const snapshot: IndicatorSnapshot = {
        symbol,
        timestamp: Date.now(),
        price,
        liquidity,
        options,
        value,
        quality,
        short_interest: shortInterest,
        sentiment,
        corporate,
        market: createEmptyMarketContext(),
        metadata: {
          price_updated_at: Date.now(),
          fundamentals_date: null,
          short_interest_date: null,
          sentiment_date: null,
          data_quality: "PARTIAL",
          missing_fields: this.calculateMissingFields(price, liquidity, options),
        },
      };

      log.debug({ symbol, duration: Date.now() - startTime, barsCount: bars.length }, "Generated indicator snapshot");

      return snapshot;
    } catch (error) {
      log.error({ symbol, error }, "Failed to generate indicator snapshot");
      throw error;
    }
  }

  /**
   * Get only price-based indicators for a symbol.
   * Faster than getSnapshot() when only price indicators are needed.
   */
  async getPriceIndicators(symbol: string): Promise<PriceIndicators> {
    const bars = await this.deps.marketData.getBars(symbol, this.config.barsLookback);
    return this.calculatePriceIndicators(bars);
  }

  /**
   * Get indicator snapshots for multiple symbols.
   * Executes in parallel for efficiency.
   */
  async getSnapshots(symbols: string[]): Promise<Map<string, IndicatorSnapshot>> {
    const results = new Map<string, IndicatorSnapshot>();

    const promises = symbols.map(async (symbol) => {
      try {
        const snapshot = await this.getSnapshot(symbol);
        results.set(symbol, snapshot);
      } catch (error) {
        log.warn({ symbol, error }, "Failed to get snapshot for symbol");
        results.set(symbol, createEmptySnapshot(symbol));
      }
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Get only liquidity indicators for a symbol.
   */
  async getLiquidityIndicators(symbol: string): Promise<LiquidityIndicators> {
    const bars = await this.deps.marketData.getBars(symbol, this.config.barsLookback);
    const quote = await this.deps.marketData.getQuote(symbol);
    return this.calculateLiquidityIndicators(bars, quote);
  }

  /**
   * Get only options-derived indicators for a symbol.
   */
  async getOptionsIndicators(symbol: string): Promise<OptionsIndicators> {
    return this.calculateOptionsIndicators(symbol);
  }

  // ============================================
  // Private: Real-time Calculations
  // ============================================

  private calculatePriceIndicators(bars: OHLCVBar[]): PriceIndicators {
    if (this.deps.priceCalculator) {
      return this.deps.priceCalculator.calculate(bars);
    }
    return createEmptyPriceIndicators();
  }

  private calculateLiquidityIndicators(
    bars: OHLCVBar[],
    quote: Quote | null,
  ): LiquidityIndicators {
    if (this.deps.liquidityCalculator) {
      return this.deps.liquidityCalculator.calculate(bars, quote);
    }
    return createEmptyLiquidityIndicators();
  }

  private async calculateOptionsIndicators(symbol: string): Promise<OptionsIndicators> {
    if (!this.config.includeOptionsIndicators || !this.deps.optionsCalculator || !this.deps.optionsData) {
      return createEmptyOptionsIndicators();
    }
    return this.deps.optionsCalculator.calculate(symbol, this.deps.optionsData);
  }

  // ============================================
  // Private: Batch Indicator Fetching
  // ============================================

  private async fetchFundamentals(
    symbol: string,
  ): Promise<{ value: ValueIndicators; quality: QualityIndicators }> {
    if (!this.config.includeBatchIndicators || !this.deps.fundamentalRepo) {
      return {
        value: createEmptyValueIndicators(),
        quality: createEmptyQualityIndicators(),
      };
    }

    const result = await this.deps.fundamentalRepo.getLatest(symbol);
    return result ?? {
      value: createEmptyValueIndicators(),
      quality: createEmptyQualityIndicators(),
    };
  }

  private async fetchShortInterest(symbol: string): Promise<ShortInterestIndicators> {
    if (!this.config.includeBatchIndicators || !this.deps.shortInterestRepo) {
      return createEmptyShortInterestIndicators();
    }
    return (await this.deps.shortInterestRepo.getLatest(symbol)) ?? createEmptyShortInterestIndicators();
  }

  private async fetchSentiment(symbol: string): Promise<SentimentIndicators> {
    if (!this.config.includeBatchIndicators || !this.deps.sentimentRepo) {
      return createEmptySentimentIndicators();
    }
    return (await this.deps.sentimentRepo.getLatest(symbol)) ?? createEmptySentimentIndicators();
  }

  private async fetchCorporateActions(symbol: string): Promise<CorporateIndicators> {
    if (!this.config.includeBatchIndicators || !this.deps.corporateActionsRepo) {
      return createEmptyCorporateIndicators();
    }
    return (await this.deps.corporateActionsRepo.getLatest(symbol)) ?? createEmptyCorporateIndicators();
  }

  // ============================================
  // Private: Helpers
  // ============================================

  private calculateMissingFields(
    price: PriceIndicators,
    liquidity: LiquidityIndicators,
    options: OptionsIndicators,
  ): string[] {
    const missing: string[] = [];

    if (price.rsi_14 === null) missing.push("rsi_14");
    if (price.atr_14 === null) missing.push("atr_14");
    if (liquidity.bid_ask_spread === null) missing.push("bid_ask_spread");
    if (options.implied_volatility === null) missing.push("implied_volatility");

    return missing;
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create an IndicatorService with minimal dependencies.
 * Useful for testing or when only price indicators are needed.
 */
export function createIndicatorService(
  marketData: MarketDataProvider,
  config?: Partial<IndicatorServiceConfig>,
): IndicatorService {
  return new IndicatorService({ marketData }, config);
}
