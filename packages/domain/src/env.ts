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
    // Alternative HelixDB config (host:port vs URL)
    HELIX_HOST: z.string().optional().describe("HelixDB host (alternative to HELIX_URL)"),
    HELIX_PORT: z.coerce.number().optional().describe("HelixDB port (alternative to HELIX_URL)"),

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
    ANTHROPIC_API_KEY: z.string().optional().describe("Anthropic API key for Claude"),
    GOOGLE_API_KEY: z.string().optional().describe("Google Gemini API key"),

    // Prediction Markets
    KALSHI_API_KEY_ID: z.string().optional().describe("Kalshi API key ID"),
    KALSHI_PRIVATE_KEY_PATH: z.string().optional().describe("Path to Kalshi private key file"),

    // Web Search
    TAVILY_API_KEY: z.string().optional().describe("Tavily API key for web search"),
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

      // LLM for agent network (require at least one)
      if (!data.ANTHROPIC_API_KEY && !data.GOOGLE_API_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "ANTHROPIC_API_KEY or GOOGLE_API_KEY is required for LIVE environment",
          path: ["ANTHROPIC_API_KEY"],
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
    HELIX_HOST: Bun.env.HELIX_HOST ?? process.env.HELIX_HOST,
    HELIX_PORT: Bun.env.HELIX_PORT ?? process.env.HELIX_PORT,
    DATABENTO_KEY: Bun.env.DATABENTO_KEY ?? process.env.DATABENTO_KEY,
    POLYGON_KEY: Bun.env.POLYGON_KEY ?? process.env.POLYGON_KEY,
    FMP_KEY: Bun.env.FMP_KEY ?? process.env.FMP_KEY,
    ALPHAVANTAGE_KEY: Bun.env.ALPHAVANTAGE_KEY ?? process.env.ALPHAVANTAGE_KEY,
    ALPACA_KEY: Bun.env.ALPACA_KEY ?? process.env.ALPACA_KEY,
    ALPACA_SECRET: Bun.env.ALPACA_SECRET ?? process.env.ALPACA_SECRET,
    ALPACA_BASE_URL: Bun.env.ALPACA_BASE_URL ?? process.env.ALPACA_BASE_URL,
    ANTHROPIC_API_KEY: Bun.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY,
    GOOGLE_API_KEY: Bun.env.GOOGLE_API_KEY ?? process.env.GOOGLE_API_KEY,
    KALSHI_API_KEY_ID: Bun.env.KALSHI_API_KEY_ID ?? process.env.KALSHI_API_KEY_ID,
    KALSHI_PRIVATE_KEY_PATH: Bun.env.KALSHI_PRIVATE_KEY_PATH ?? process.env.KALSHI_PRIVATE_KEY_PATH,
    TAVILY_API_KEY: Bun.env.TAVILY_API_KEY ?? process.env.TAVILY_API_KEY,
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

/**
 * Get the HelixDB URL from either HELIX_URL or HELIX_HOST/HELIX_PORT
 */
export function getHelixUrl(): string {
  if (env.HELIX_URL) {
    return env.HELIX_URL;
  }
  if (env.HELIX_HOST && env.HELIX_PORT) {
    return `http://${env.HELIX_HOST}:${env.HELIX_PORT}`;
  }
  return "http://localhost:6969";
}

/**
 * Check if web search capability is available (Tavily API key configured)
 */
export function hasWebSearchCapability(): boolean {
  return !!env.TAVILY_API_KEY;
}

// ============================================
// Startup Validation Utilities
// ============================================

/**
 * Environment validation result
 */
export interface EnvValidationResult {
  valid: boolean;
  environment: CreamEnvironment;
  errors: string[];
  warnings: string[];
}

/**
 * Validate environment at startup with formatted error output.
 * Call this at the beginning of your service's main function.
 *
 * @param serviceName - Name of the service for logging
 * @param additionalRequirements - Additional env vars required by this service
 * @returns Validation result with errors and warnings
 *
 * @example
 * ```ts
 * const result = validateEnvironment("api", ["ANTHROPIC_API_KEY"]);
 * if (!result.valid) {
 *   console.error("Environment validation failed:", result.errors);
 *   process.exit(1);
 * }
 * ```
 */
export function validateEnvironment(
  serviceName: string,
  additionalRequirements: (keyof EnvConfig)[] = []
): EnvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check additional service-specific requirements
  for (const key of additionalRequirements) {
    const value = env[key];
    if (value === undefined || value === null || value === "") {
      errors.push(`${key} is required for ${serviceName}`);
    }
  }

  return {
    valid: errors.length === 0,
    environment: env.CREAM_ENV,
    errors,
    warnings,
  };
}

/**
 * Validate environment and exit with error if validation fails.
 * This is a convenience wrapper that prints formatted errors and exits.
 *
 * @param serviceName - Name of the service for logging
 * @param additionalRequirements - Additional env vars required by this service
 *
 * @example
 * ```ts
 * // At the top of your main function:
 * validateEnvironmentOrExit("dashboard-api", ["TURSO_DATABASE_URL"]);
 * // If validation fails, process exits with code 1
 * ```
 */
export function validateEnvironmentOrExit(
  serviceName: string,
  additionalRequirements: (keyof EnvConfig)[] = []
): void {
  const result = validateEnvironment(serviceName, additionalRequirements);

  if (!result.valid) {
    // biome-ignore lint/suspicious/noConsole: Intentional - startup validation output
    console.error(`\n❌ Environment validation failed for ${serviceName}:\n`);
    for (const error of result.errors) {
      // biome-ignore lint/suspicious/noConsole: Intentional - startup validation output
      console.error(`   • ${error}`);
    }
    // biome-ignore lint/suspicious/noConsole: Intentional - startup validation output
    console.error(`\nEnvironment: ${result.environment}`);
    // biome-ignore lint/suspicious/noConsole: Intentional - startup validation output
    console.error("\nPlease set the required environment variables and restart.\n");
    process.exit(1);
  }

  if (result.warnings.length > 0) {
    // biome-ignore lint/suspicious/noConsole: Intentional - startup validation output
    console.warn(`\n⚠️  Environment warnings for ${serviceName}:\n`);
    for (const warning of result.warnings) {
      // biome-ignore lint/suspicious/noConsole: Intentional - startup validation output
      console.warn(`   • ${warning}`);
    }
    // biome-ignore lint/suspicious/noConsole: Intentional - startup validation output
    console.warn("");
  }
}

/**
 * Get list of all environment variables defined in the schema.
 * Useful for documentation and debugging.
 */
export function getEnvVarDocumentation(): Array<{
  name: string;
  required: boolean;
  description: string;
}> {
  return [
    {
      name: "CREAM_ENV",
      required: true,
      description: "Trading environment: BACKTEST | PAPER | LIVE",
    },
    { name: "CREAM_BROKER", required: false, description: "Broker to use (default: ALPACA)" },
    { name: "TURSO_DATABASE_URL", required: false, description: "Turso/libsql database URL" },
    { name: "TURSO_AUTH_TOKEN", required: false, description: "Turso Cloud authentication token" },
    { name: "HELIX_URL", required: false, description: "HelixDB server URL" },
    { name: "HELIX_HOST", required: false, description: "HelixDB host (alternative to HELIX_URL)" },
    { name: "HELIX_PORT", required: false, description: "HelixDB port (alternative to HELIX_URL)" },
    {
      name: "DATABENTO_KEY",
      required: false,
      description: "Databento API key (required for LIVE)",
    },
    {
      name: "POLYGON_KEY",
      required: false,
      description: "Polygon/Massive API key (required for LIVE)",
    },
    { name: "FMP_KEY", required: false, description: "FMP API key for fundamentals" },
    {
      name: "ALPHAVANTAGE_KEY",
      required: false,
      description: "Alpha Vantage API key for macro data",
    },
    {
      name: "ALPACA_KEY",
      required: false,
      description: "Alpaca API key (required for PAPER/LIVE)",
    },
    {
      name: "ALPACA_SECRET",
      required: false,
      description: "Alpaca API secret (required for PAPER/LIVE)",
    },
    { name: "ALPACA_BASE_URL", required: false, description: "Alpaca API base URL (auto-set)" },
    { name: "ANTHROPIC_API_KEY", required: false, description: "Anthropic API key for Claude" },
    { name: "GOOGLE_API_KEY", required: false, description: "Google Gemini API key" },
    { name: "KALSHI_API_KEY_ID", required: false, description: "Kalshi API key ID" },
    {
      name: "KALSHI_PRIVATE_KEY_PATH",
      required: false,
      description: "Path to Kalshi private key file",
    },
    {
      name: "TAVILY_API_KEY",
      required: false,
      description: "Tavily API key for web search",
    },
  ];
}

// Re-export schema for testing
export { envSchema };
