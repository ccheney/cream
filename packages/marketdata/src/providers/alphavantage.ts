/**
 * Alpha Vantage API Client
 *
 * Provides macro economic indicators:
 * - Treasury yields
 * - CPI, GDP, unemployment
 * - Federal funds rate
 *
 * @see https://www.alphavantage.co/documentation/
 */

import { z } from "zod";
import { createRestClient, type RateLimitConfig, type RestClient } from "../client";

// ============================================
// API Configuration
// ============================================

const ALPHA_VANTAGE_BASE_URL = "https://www.alphavantage.co";

/**
 * Alpha Vantage rate limits.
 */
export const ALPHA_VANTAGE_RATE_LIMITS: Record<string, RateLimitConfig> = {
  free: { maxRequests: 25, intervalMs: 86400000 }, // 25/day
  premium: { maxRequests: 75, intervalMs: 60000 }, // 75/min
};

// ============================================
// Response Schemas
// ============================================

/**
 * Economic indicator data point.
 */
export const EconomicDataPointSchema = z.object({
  date: z.string(),
  value: z.string().transform((v) => (v === "." ? null : parseFloat(v))),
});
export type EconomicDataPoint = z.infer<typeof EconomicDataPointSchema>;

/**
 * Economic indicator response.
 */
export const EconomicIndicatorResponseSchema = z.object({
  name: z.string(),
  interval: z.string(),
  unit: z.string(),
  data: z.array(EconomicDataPointSchema),
});
export type EconomicIndicatorResponse = z.infer<typeof EconomicIndicatorResponseSchema>;

/**
 * Treasury yield response.
 */
export const TreasuryYieldResponseSchema = z.object({
  name: z.string(),
  interval: z.string(),
  unit: z.string(),
  data: z.array(EconomicDataPointSchema),
});
export type TreasuryYieldResponse = z.infer<typeof TreasuryYieldResponseSchema>;

/**
 * Federal funds rate response.
 */
export const FederalFundsRateResponseSchema = z.object({
  name: z.string(),
  interval: z.string(),
  unit: z.string(),
  data: z.array(EconomicDataPointSchema),
});
export type FederalFundsRateResponse = z.infer<typeof FederalFundsRateResponseSchema>;

// ============================================
// Alpha Vantage Client
// ============================================

/**
 * Alpha Vantage API client configuration.
 */
export interface AlphaVantageClientConfig {
  /** Alpha Vantage API key */
  apiKey: string;
  /** Subscription tier for rate limiting */
  tier?: "free" | "premium";
}

/**
 * Treasury maturity.
 */
export type TreasuryMaturity = "3month" | "2year" | "5year" | "7year" | "10year" | "30year";

/**
 * Economic indicator interval.
 */
export type EconomicInterval = "daily" | "weekly" | "monthly" | "quarterly" | "annual";

/**
 * Economic indicator types.
 */
export type EconomicIndicatorType =
  | "REAL_GDP"
  | "REAL_GDP_PER_CAPITA"
  | "TREASURY_YIELD"
  | "FEDERAL_FUNDS_RATE"
  | "CPI"
  | "INFLATION"
  | "INFLATION_EXPECTATION"
  | "CONSUMER_SENTIMENT"
  | "RETAIL_SALES"
  | "DURABLE_GOODS"
  | "UNEMPLOYMENT"
  | "NONFARM_PAYROLL";

/**
 * Indicator metadata for display and caching.
 */
export interface IndicatorMetadata {
  code: EconomicIndicatorType;
  name: string;
  description: string;
  unit: string;
  frequency: "daily" | "weekly" | "monthly" | "quarterly" | "annual";
  cacheTtlMs: number;
}

/**
 * Indicator metadata registry.
 */
export const INDICATOR_METADATA: Record<EconomicIndicatorType, IndicatorMetadata> = {
  REAL_GDP: {
    code: "REAL_GDP",
    name: "Real GDP",
    description: "Gross Domestic Product adjusted for inflation",
    unit: "billions of dollars",
    frequency: "quarterly",
    cacheTtlMs: 86400000 * 7, // 7 days (quarterly data)
  },
  REAL_GDP_PER_CAPITA: {
    code: "REAL_GDP_PER_CAPITA",
    name: "Real GDP per Capita",
    description: "Real GDP divided by population",
    unit: "chained 2017 dollars",
    frequency: "quarterly",
    cacheTtlMs: 86400000 * 7, // 7 days
  },
  TREASURY_YIELD: {
    code: "TREASURY_YIELD",
    name: "Treasury Yield",
    description: "US Treasury bond yield by maturity",
    unit: "percent",
    frequency: "daily",
    cacheTtlMs: 86400000, // 24 hours
  },
  FEDERAL_FUNDS_RATE: {
    code: "FEDERAL_FUNDS_RATE",
    name: "Federal Funds Rate",
    description: "Interest rate at which banks lend to each other overnight",
    unit: "percent",
    frequency: "daily",
    cacheTtlMs: 86400000, // 24 hours
  },
  CPI: {
    code: "CPI",
    name: "Consumer Price Index",
    description: "Measure of average change in prices paid by consumers",
    unit: "index",
    frequency: "monthly",
    cacheTtlMs: 86400000 * 3, // 3 days (monthly data)
  },
  INFLATION: {
    code: "INFLATION",
    name: "Inflation Rate",
    description: "Annual inflation rate",
    unit: "percent",
    frequency: "annual",
    cacheTtlMs: 86400000 * 7, // 7 days
  },
  INFLATION_EXPECTATION: {
    code: "INFLATION_EXPECTATION",
    name: "Inflation Expectation",
    description: "Market-based inflation expectations",
    unit: "percent",
    frequency: "monthly",
    cacheTtlMs: 86400000 * 3, // 3 days
  },
  CONSUMER_SENTIMENT: {
    code: "CONSUMER_SENTIMENT",
    name: "Consumer Sentiment",
    description: "University of Michigan Consumer Sentiment Index",
    unit: "index",
    frequency: "monthly",
    cacheTtlMs: 86400000 * 3, // 3 days
  },
  RETAIL_SALES: {
    code: "RETAIL_SALES",
    name: "Retail Sales",
    description: "Total retail and food services sales",
    unit: "millions of dollars",
    frequency: "monthly",
    cacheTtlMs: 86400000 * 3, // 3 days
  },
  DURABLE_GOODS: {
    code: "DURABLE_GOODS",
    name: "Durable Goods Orders",
    description: "New orders for manufactured durable goods",
    unit: "millions of dollars",
    frequency: "monthly",
    cacheTtlMs: 86400000 * 3, // 3 days
  },
  UNEMPLOYMENT: {
    code: "UNEMPLOYMENT",
    name: "Unemployment Rate",
    description: "Percentage of labor force that is unemployed",
    unit: "percent",
    frequency: "monthly",
    cacheTtlMs: 86400000 * 3, // 3 days
  },
  NONFARM_PAYROLL: {
    code: "NONFARM_PAYROLL",
    name: "Nonfarm Payroll",
    description: "Total number of paid U.S. workers excluding farm employees",
    unit: "thousands of persons",
    frequency: "monthly",
    cacheTtlMs: 86400000 * 3, // 3 days
  },
};

/**
 * Alpha Vantage API client.
 */
export class AlphaVantageClient {
  private client: RestClient;
  private apiKey: string;

  constructor(config: AlphaVantageClientConfig) {
    const rateLimit = ALPHA_VANTAGE_RATE_LIMITS[config.tier ?? "free"];

    this.client = createRestClient({
      baseUrl: ALPHA_VANTAGE_BASE_URL,
      rateLimit,
      retry: {
        maxRetries: 2, // Lower retries due to strict rate limits
        initialDelayMs: 2000,
        maxDelayMs: 10000,
        backoffMultiplier: 2,
      },
    });

    this.apiKey = config.apiKey;
  }

  /**
   * Get Treasury yield data.
   */
  async getTreasuryYield(
    maturity: TreasuryMaturity = "10year",
    interval: EconomicInterval = "daily"
  ): Promise<TreasuryYieldResponse> {
    return this.client.get(
      "/query",
      {
        function: "TREASURY_YIELD",
        maturity,
        interval,
        apikey: this.apiKey,
      },
      TreasuryYieldResponseSchema
    );
  }

  /**
   * Get Federal Funds Rate data.
   */
  async getFederalFundsRate(
    interval: EconomicInterval = "daily"
  ): Promise<FederalFundsRateResponse> {
    return this.client.get<FederalFundsRateResponse>(
      "/query",
      {
        function: "FEDERAL_FUNDS_RATE",
        interval,
        apikey: this.apiKey,
      },
      FederalFundsRateResponseSchema
    );
  }

  /**
   * Get Consumer Price Index (CPI) data.
   */
  async getCPI(interval: "monthly" | "semiannual" = "monthly"): Promise<EconomicIndicatorResponse> {
    return this.client.get<EconomicIndicatorResponse>(
      "/query",
      {
        function: "CPI",
        interval,
        apikey: this.apiKey,
      },
      EconomicIndicatorResponseSchema
    );
  }

  /**
   * Get Real GDP data.
   */
  async getRealGDP(
    interval: "quarterly" | "annual" = "quarterly"
  ): Promise<EconomicIndicatorResponse> {
    return this.client.get(
      "/query",
      {
        function: "REAL_GDP",
        interval,
        apikey: this.apiKey,
      },
      EconomicIndicatorResponseSchema
    );
  }

  /**
   * Get unemployment rate data.
   */
  async getUnemploymentRate(): Promise<EconomicIndicatorResponse> {
    return this.client.get(
      "/query",
      {
        function: "UNEMPLOYMENT",
        apikey: this.apiKey,
      },
      EconomicIndicatorResponseSchema
    );
  }

  /**
   * Get inflation data.
   */
  async getInflation(): Promise<EconomicIndicatorResponse> {
    return this.client.get(
      "/query",
      {
        function: "INFLATION",
        apikey: this.apiKey,
      },
      EconomicIndicatorResponseSchema
    );
  }

  /**
   * Get retail sales data.
   */
  async getRetailSales(): Promise<EconomicIndicatorResponse> {
    return this.client.get(
      "/query",
      {
        function: "RETAIL_SALES",
        apikey: this.apiKey,
      },
      EconomicIndicatorResponseSchema
    );
  }

  /**
   * Get nonfarm payroll data.
   */
  async getNonfarmPayroll(): Promise<EconomicIndicatorResponse> {
    return this.client.get(
      "/query",
      {
        function: "NONFARM_PAYROLL",
        apikey: this.apiKey,
      },
      EconomicIndicatorResponseSchema
    );
  }

  /**
   * Get durable goods orders data.
   */
  async getDurableGoods(): Promise<EconomicIndicatorResponse> {
    return this.client.get(
      "/query",
      {
        function: "DURABLES",
        apikey: this.apiKey,
      },
      EconomicIndicatorResponseSchema
    );
  }

  /**
   * Get Real GDP per capita data.
   */
  async getRealGDPPerCapita(
    _interval: "quarterly" | "annual" = "quarterly"
  ): Promise<EconomicIndicatorResponse> {
    return this.client.get(
      "/query",
      {
        function: "REAL_GDP_PER_CAPITA",
        apikey: this.apiKey,
      },
      EconomicIndicatorResponseSchema
    );
  }

  /**
   * Get inflation expectation data.
   */
  async getInflationExpectation(): Promise<EconomicIndicatorResponse> {
    return this.client.get(
      "/query",
      {
        function: "INFLATION_EXPECTATION",
        apikey: this.apiKey,
      },
      EconomicIndicatorResponseSchema
    );
  }

  /**
   * Get consumer sentiment data.
   */
  async getConsumerSentiment(): Promise<EconomicIndicatorResponse> {
    return this.client.get(
      "/query",
      {
        function: "CONSUMER_SENTIMENT",
        apikey: this.apiKey,
      },
      EconomicIndicatorResponseSchema
    );
  }

  /**
   * Get all treasury yields for yield curve analysis.
   */
  async getYieldCurve(
    interval: EconomicInterval = "daily"
  ): Promise<Map<TreasuryMaturity, TreasuryYieldResponse>> {
    const maturities: TreasuryMaturity[] = [
      "3month",
      "2year",
      "5year",
      "7year",
      "10year",
      "30year",
    ];
    const results = new Map<TreasuryMaturity, TreasuryYieldResponse>();

    for (const maturity of maturities) {
      const response = await this.getTreasuryYield(maturity, interval);
      results.set(maturity, response);
    }

    return results;
  }

  /**
   * Get indicator metadata.
   */
  static getMetadata(indicator: EconomicIndicatorType): IndicatorMetadata {
    return INDICATOR_METADATA[indicator];
  }

  /**
   * Get all indicator metadata.
   */
  static getAllMetadata(): Record<EconomicIndicatorType, IndicatorMetadata> {
    return INDICATOR_METADATA;
  }

  /**
   * Get latest value for an economic indicator.
   */
  static getLatestValue(response: EconomicIndicatorResponse): number | null {
    if (response.data.length === 0) {
      return null;
    }
    const latest = response.data[0];
    if (!latest || latest.value === null) {
      return null;
    }
    return latest.value;
  }

  /**
   * Get value at a specific date (or nearest prior).
   */
  static getValueAtDate(
    response: EconomicIndicatorResponse,
    targetDate: string
  ): { date: string; value: number | null } | null {
    // Data is typically sorted newest first
    for (const point of response.data) {
      if (point.date <= targetDate) {
        return { date: point.date, value: point.value };
      }
    }
    return null;
  }

  /**
   * Get percent change between two dates.
   */
  static getPercentChange(
    response: EconomicIndicatorResponse,
    fromDate: string,
    toDate: string
  ): number | null {
    const fromValue = AlphaVantageClient.getValueAtDate(response, fromDate);
    const toValue = AlphaVantageClient.getValueAtDate(response, toDate);

    if (!fromValue?.value || !toValue?.value || fromValue.value === 0) {
      return null;
    }

    return ((toValue.value - fromValue.value) / fromValue.value) * 100;
  }
}

// ============================================
// Factory
// ============================================

/**
 * Create an Alpha Vantage client from environment variables.
 */
export function createAlphaVantageClientFromEnv(): AlphaVantageClient {
  const apiKey = process.env.ALPHAVANTAGE_KEY ?? Bun.env.ALPHAVANTAGE_KEY;
  if (!apiKey) {
    throw new Error("ALPHAVANTAGE_KEY environment variable is required");
  }

  const tier = (process.env.ALPHAVANTAGE_TIER as AlphaVantageClientConfig["tier"]) ?? "free";

  return new AlphaVantageClient({ apiKey, tier });
}
