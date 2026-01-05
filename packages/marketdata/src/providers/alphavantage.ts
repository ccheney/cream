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
    return this.client.get(
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
    return this.client.get(
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
   * Get latest value for an economic indicator.
   */
  static getLatestValue(response: EconomicIndicatorResponse): number | null {
    const latest = response.data[0];
    if (!latest || latest.value === null) {
      return null;
    }
    return latest.value;
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
