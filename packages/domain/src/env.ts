/**
 * Environment Variable Schema and Validation
 *
 * This module provides type-safe environment variable access with runtime validation.
 * All environment variables are validated at import time.
 *
 * Environments:
 * - BACKTEST: Historical simulation, minimal API keys required
 * - PAPER: Paper trading with real market data, broker credentials required
 * - LIVE: Real money trading, ALL credentials required + safety confirmations
 */

import { z } from "zod";

/**
 * Environment type - controls trading behavior and safety checks
 */
export const CreamEnvironment = z.enum(["BACKTEST", "PAPER", "LIVE"]);
export type CreamEnvironment = z.infer<typeof CreamEnvironment>;

/**
 * Broker type - currently only Alpaca supported
 */
export const CreamBroker = z.enum(["ALPACA"]);
export type CreamBroker = z.infer<typeof CreamBroker>;

/**
 * URL validation for database connections
 */
const urlSchema = z.string().refine(
  (val) => {
    try {
      // Allow file: URLs for local SQLite, http/https/ws for remote
      if (val.startsWith("file:")) {
        return true;
      }
      new URL(val);
      return true;
    } catch {
      return false;
    }
  },
  { message: "Invalid URL format" }
);

/**
 * Environment variable schema with conditional validation
 *
 * BACKTEST: Only CREAM_ENV required (uses mocks/fixtures)
 * PAPER: Requires broker credentials and market data keys
 * LIVE: Requires ALL credentials + additional safety confirmations
 */
const envSchema = z
  .object({
    // Core Configuration
    CREAM_ENV: CreamEnvironment.describe("Trading environment: BACKTEST | PAPER | LIVE"),
    CREAM_BROKER: CreamBroker.default("ALPACA").describe("Broker to use for trading"),

    // Database URLs
    TURSO_DATABASE_URL: urlSchema
      .optional()
      .default("http://localhost:8080")
      .describe("Turso/libsql database URL"),
    TURSO_AUTH_TOKEN: z.string().optional().describe("Turso Cloud authentication token"),
    HELIX_URL: urlSchema.optional().default("http://localhost:6969").describe("HelixDB server URL"),

    // Market Data Providers
    DATABENTO_KEY: z.string().optional().describe("Databento API key for execution-grade data"),
    POLYGON_KEY: z.string().optional().describe("Polygon/Massive API key for candles and options"),
    FMP_KEY: z.string().optional().describe("FMP API key for fundamentals and transcripts"),
    ALPHAVANTAGE_KEY: z.string().optional().describe("Alpha Vantage API key for macro indicators"),

    // Broker Credentials
    ALPACA_KEY: z.string().optional().describe("Alpaca API key"),
    ALPACA_SECRET: z.string().optional().describe("Alpaca API secret"),
    ALPACA_BASE_URL: urlSchema
      .optional()
      .describe("Alpaca API base URL (auto-set based on environment)"),

    // LLM Configuration
    GOOGLE_API_KEY: z.string().optional().describe("Google Gemini API key"),
  })
  .superRefine((data, ctx) => {
    const env = data.CREAM_ENV;

    // PAPER environment requires broker credentials and at least one market data source
    if (env === "PAPER") {
      if (!data.ALPACA_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "ALPACA_KEY is required for PAPER environment",
          path: ["ALPACA_KEY"],
        });
      }
      if (!data.ALPACA_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "ALPACA_SECRET is required for PAPER environment",
          path: ["ALPACA_SECRET"],
        });
      }
    }

    // LIVE environment requires ALL credentials
    if (env === "LIVE") {
      // Broker credentials
      if (!data.ALPACA_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "ALPACA_KEY is required for LIVE environment",
          path: ["ALPACA_KEY"],
        });
      }
      if (!data.ALPACA_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "ALPACA_SECRET is required for LIVE environment",
          path: ["ALPACA_SECRET"],
        });
      }

      // Market data providers
      if (!data.POLYGON_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "POLYGON_KEY is required for LIVE environment",
          path: ["POLYGON_KEY"],
        });
      }
      if (!data.DATABENTO_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "DATABENTO_KEY is required for LIVE environment",
          path: ["DATABENTO_KEY"],
        });
      }

      // LLM for agent network
      if (!data.GOOGLE_API_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "GOOGLE_API_KEY is required for LIVE environment",
          path: ["GOOGLE_API_KEY"],
        });
      }
    }
  });

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Parse and validate environment variables
 *
 * @throws {z.ZodError} If validation fails with detailed error messages
 */
function parseEnv(): EnvConfig {
  // Access environment variables using Bun.env or process.env
  const rawEnv = {
    CREAM_ENV: Bun.env.CREAM_ENV ?? process.env.CREAM_ENV,
    CREAM_BROKER: Bun.env.CREAM_BROKER ?? process.env.CREAM_BROKER,
    TURSO_DATABASE_URL: Bun.env.TURSO_DATABASE_URL ?? process.env.TURSO_DATABASE_URL,
    TURSO_AUTH_TOKEN: Bun.env.TURSO_AUTH_TOKEN ?? process.env.TURSO_AUTH_TOKEN,
    HELIX_URL: Bun.env.HELIX_URL ?? process.env.HELIX_URL,
    DATABENTO_KEY: Bun.env.DATABENTO_KEY ?? process.env.DATABENTO_KEY,
    POLYGON_KEY: Bun.env.POLYGON_KEY ?? process.env.POLYGON_KEY,
    FMP_KEY: Bun.env.FMP_KEY ?? process.env.FMP_KEY,
    ALPHAVANTAGE_KEY: Bun.env.ALPHAVANTAGE_KEY ?? process.env.ALPHAVANTAGE_KEY,
    ALPACA_KEY: Bun.env.ALPACA_KEY ?? process.env.ALPACA_KEY,
    ALPACA_SECRET: Bun.env.ALPACA_SECRET ?? process.env.ALPACA_SECRET,
    ALPACA_BASE_URL: Bun.env.ALPACA_BASE_URL ?? process.env.ALPACA_BASE_URL,
    GOOGLE_API_KEY: Bun.env.GOOGLE_API_KEY ?? process.env.GOOGLE_API_KEY,
  };

  const result = envSchema.safeParse(rawEnv);

  if (!result.success) {
    throw result.error;
  }

  return result.data;
}

/**
 * Validated environment configuration
 *
 * @example
 * ```ts
 * import { env, isLive } from "@cream/domain/env";
 *
 * if (isLive()) {
 *   // Additional safety checks
 * }
 *
 * const dbUrl = env.TURSO_DATABASE_URL;
 * ```
 */
export const env: EnvConfig = parseEnv();

// ============================================
// Environment Helper Functions
// ============================================

/**
 * Check if running in BACKTEST environment
 */
export function isBacktest(): boolean {
  return env.CREAM_ENV === "BACKTEST";
}

/**
 * Check if running in PAPER environment
 */
export function isPaper(): boolean {
  return env.CREAM_ENV === "PAPER";
}

/**
 * Check if running in LIVE environment
 *
 * ⚠️ CRITICAL: LIVE environment requires additional safety confirmations
 * See packages/domain/src/safety.ts for required safety mechanisms
 */
export function isLive(): boolean {
  return env.CREAM_ENV === "LIVE";
}

/**
 * Get the appropriate Alpaca base URL for the current environment
 *
 * Paper: https://paper-api.alpaca.markets
 * Live: https://api.alpaca.markets
 */
export function getAlpacaBaseUrl(): string {
  if (env.ALPACA_BASE_URL) {
    return env.ALPACA_BASE_URL;
  }
  return isLive() ? "https://api.alpaca.markets" : "https://paper-api.alpaca.markets";
}

/**
 * Get environment-specific database URL suffix for state isolation
 *
 * This ensures BACKTEST, PAPER, and LIVE data are never mixed
 */
export function getEnvDatabaseSuffix(): string {
  return `_${env.CREAM_ENV.toLowerCase()}`;
}

// Re-export schema for testing
export { envSchema };
