/**
 * Environment Variable Schema and Validation
 *
 * This module provides type-safe environment variable access with runtime validation.
 * All environment variables are validated at import time.
 *
 * IMPORTANT: Trading environment (BACKTEST/PAPER/LIVE) is NOT determined by environment
 * variables. Instead, use ExecutionContext which is created at system boundaries
 * (HTTP handlers, worker entrypoints, test setup) and threaded through all operations.
 *
 * @see packages/domain/src/context.ts for ExecutionContext
 */

import { z } from "zod";
import type { ExecutionContext } from "./context";

/**
 * Environment type - controls trading behavior and safety checks
 *
 * This is a pure type definition. The actual environment is determined
 * by ExecutionContext, not by environment variables.
 */
export const CreamEnvironment = z.enum(["BACKTEST", "PAPER", "LIVE"]);
export type CreamEnvironment = z.infer<typeof CreamEnvironment>;

/**
 * Broker type - currently only Alpaca supported
 */
export const CreamBroker = z.enum(["ALPACA"]);
export type CreamBroker = z.infer<typeof CreamBroker>;

/**
 * URL validation helper function
 */
function isValidUrl(val: string): boolean {
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
}

/**
 * Optional URL schema with default - validates only when a value is provided
 * In Zod v4, we need to handle the optional case separately to apply defaults first
 */
function optionalUrlWithDefault(defaultValue: string) {
  return z
    .string()
    .optional()
    .transform((val) => val ?? defaultValue)
    .refine(isValidUrl, { message: "Invalid URL format" });
}

/**
 * Environment variable schema
 *
 * Note: CREAM_ENV is no longer part of the schema. Environment is determined
 * by ExecutionContext, not by environment variables.
 */
const envSchema = z.object({
  // Core Configuration
  CREAM_BROKER: CreamBroker.default("ALPACA").describe("Broker to use for trading"),

  // Database URLs
  TURSO_DATABASE_URL:
    optionalUrlWithDefault("http://localhost:8080").describe("Turso database URL"),
  TURSO_AUTH_TOKEN: z.string().optional().describe("Turso Cloud authentication token"),
  HELIX_URL: optionalUrlWithDefault("http://localhost:6969").describe("HelixDB server URL"),
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
  ALPACA_BASE_URL: z
    .string()
    .optional()
    .refine((val) => val === undefined || isValidUrl(val), { message: "Invalid URL format" })
    .describe("Alpaca API base URL (override for testing)"),

  // LLM Configuration
  ANTHROPIC_API_KEY: z.string().optional().describe("Anthropic API key for Claude"),
  GOOGLE_API_KEY: z.string().optional().describe("Google Gemini API key"),

  // Prediction Markets
  KALSHI_API_KEY_ID: z.string().optional().describe("Kalshi API key ID"),
  KALSHI_PRIVATE_KEY_PATH: z.string().optional().describe("Path to Kalshi private key file"),

  // Web Search
  TAVILY_API_KEY: z.string().optional().describe("Tavily API key for web search"),

  // Authentication (OAuth)
  GOOGLE_CLIENT_ID: z.string().optional().describe("Google OAuth client ID"),
  GOOGLE_CLIENT_SECRET: z.string().optional().describe("Google OAuth client secret"),
  BETTER_AUTH_URL: z
    .string()
    .optional()
    .refine((val) => val === undefined || isValidUrl(val), { message: "Invalid URL format" })
    .describe("Better Auth base URL for OAuth callbacks"),
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
    GOOGLE_CLIENT_ID: Bun.env.GOOGLE_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: Bun.env.GOOGLE_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET,
    BETTER_AUTH_URL: Bun.env.BETTER_AUTH_URL ?? process.env.BETTER_AUTH_URL,
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
 * Contains API keys, database URLs, and other configuration.
 * Does NOT contain trading environment - use ExecutionContext for that.
 *
 * @example
 * ```ts
 * import { env } from "@cream/domain/env";
 * import { createContext, isLive } from "@cream/domain";
 *
 * // Environment comes from ExecutionContext, not env vars
 * const ctx = createContext("PAPER", "manual");
 * if (isLive(ctx)) {
 *   // Additional safety checks
 * }
 *
 * // API keys come from env
 * const apiKey = env.ALPACA_KEY;
 * ```
 */
export const env: EnvConfig = parseEnv();

// ============================================
// Context-Aware Helper Functions
// ============================================

/**
 * Check if context is BACKTEST environment
 *
 * @param ctx - ExecutionContext containing environment info
 */
export function isBacktest(ctx: ExecutionContext): boolean {
  return ctx.environment === "BACKTEST";
}

/**
 * Check if context is PAPER environment
 *
 * @param ctx - ExecutionContext containing environment info
 */
export function isPaper(ctx: ExecutionContext): boolean {
  return ctx.environment === "PAPER";
}

/**
 * Check if context is LIVE environment
 *
 * @param ctx - ExecutionContext containing environment info
 *
 * CRITICAL: LIVE environment requires additional safety confirmations
 * See packages/domain/src/safety.ts for required safety mechanisms
 */
export function isLive(ctx: ExecutionContext): boolean {
  return ctx.environment === "LIVE";
}

/**
 * Get the appropriate Alpaca base URL for the given context
 *
 * Paper/Backtest: https://paper-api.alpaca.markets
 * Live: https://api.alpaca.markets
 *
 * @param ctx - ExecutionContext containing environment info
 * @see https://docs.alpaca.markets/docs/paper-trading
 */
export function getAlpacaBaseUrl(ctx: ExecutionContext): string {
  // Allow override via env var for testing
  if (env.ALPACA_BASE_URL) {
    return env.ALPACA_BASE_URL;
  }
  return isLive(ctx) ? "https://api.alpaca.markets" : "https://paper-api.alpaca.markets";
}

/**
 * Get environment-specific database URL suffix for state isolation
 *
 * This ensures BACKTEST, PAPER, and LIVE data are never mixed.
 *
 * @param ctx - ExecutionContext containing environment info
 * @returns Suffix like "_backtest", "_paper", or "_live"
 */
export function getEnvDatabaseSuffix(ctx: ExecutionContext): string {
  return `_${ctx.environment.toLowerCase()}`;
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
  errors: string[];
  warnings: string[];
}

/**
 * Requirements for different trading environments
 */
const ENVIRONMENT_REQUIREMENTS: Record<CreamEnvironment, (keyof EnvConfig)[]> = {
  BACKTEST: [],
  PAPER: ["ALPACA_KEY", "ALPACA_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  LIVE: [
    "ALPACA_KEY",
    "ALPACA_SECRET",
    "POLYGON_KEY",
    "DATABENTO_KEY",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
  ],
};

/**
 * Validate environment variables for a given trading environment.
 *
 * Call this at service startup after determining the execution context.
 *
 * @param ctx - ExecutionContext containing environment info
 * @param serviceName - Name of the service for logging
 * @param additionalRequirements - Additional env vars required by this service
 * @returns Validation result with errors and warnings
 *
 * @example
 * ```ts
 * const ctx = createContext("PAPER", "scheduled");
 * const result = validateEnvironment(ctx, "api", ["ANTHROPIC_API_KEY"]);
 * if (!result.valid) {
 *   console.error("Environment validation failed:", result.errors);
 *   process.exit(1);
 * }
 * ```
 */
export function validateEnvironment(
  ctx: ExecutionContext,
  serviceName: string,
  additionalRequirements: (keyof EnvConfig)[] = []
): EnvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Get requirements for this environment
  const envRequirements = ENVIRONMENT_REQUIREMENTS[ctx.environment];
  const allRequirements = [...envRequirements, ...additionalRequirements];

  // Check all requirements
  for (const key of allRequirements) {
    const value = env[key];
    if (value === undefined || value === null || value === "") {
      errors.push(`${key} is required for ${serviceName} in ${ctx.environment} environment`);
    }
  }

  // Check LLM key for LIVE (at least one required)
  if (ctx.environment === "LIVE" && !env.ANTHROPIC_API_KEY && !env.GOOGLE_API_KEY) {
    errors.push("ANTHROPIC_API_KEY or GOOGLE_API_KEY is required for LIVE environment");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate environment and exit with error if validation fails.
 *
 * @param ctx - ExecutionContext containing environment info
 * @param serviceName - Name of the service for logging
 * @param additionalRequirements - Additional env vars required by this service
 *
 * @example
 * ```ts
 * const ctx = createContext("PAPER", "scheduled");
 * validateEnvironmentOrExit(ctx, "dashboard-api", ["TURSO_DATABASE_URL"]);
 * ```
 */
export function validateEnvironmentOrExit(
  ctx: ExecutionContext,
  serviceName: string,
  additionalRequirements: (keyof EnvConfig)[] = []
): void {
  const result = validateEnvironment(ctx, serviceName, additionalRequirements);

  if (!result.valid) {
    // biome-ignore lint/suspicious/noConsole: Intentional - startup validation output
    console.error(`\n❌ Environment validation failed for ${serviceName}:\n`);
    for (const error of result.errors) {
      // biome-ignore lint/suspicious/noConsole: Intentional - startup validation output
      console.error(`   • ${error}`);
    }
    // biome-ignore lint/suspicious/noConsole: Intentional - startup validation output
    console.error(`\nEnvironment: ${ctx.environment}`);
    // biome-ignore lint/suspicious/noConsole: Intentional - startup validation output
    console.error(`Source: ${ctx.source}`);
    // biome-ignore lint/suspicious/noConsole: Intentional - startup validation output
    console.error(`TraceId: ${ctx.traceId}`);
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
  required: string;
  description: string;
}> {
  return [
    { name: "CREAM_BROKER", required: "no", description: "Broker to use (default: ALPACA)" },
    { name: "TURSO_DATABASE_URL", required: "no", description: "Turso database URL" },
    { name: "TURSO_AUTH_TOKEN", required: "no", description: "Turso Cloud authentication token" },
    { name: "HELIX_URL", required: "no", description: "HelixDB server URL" },
    { name: "HELIX_HOST", required: "no", description: "HelixDB host (alternative to HELIX_URL)" },
    { name: "HELIX_PORT", required: "no", description: "HelixDB port (alternative to HELIX_URL)" },
    { name: "DATABENTO_KEY", required: "LIVE", description: "Databento API key" },
    { name: "POLYGON_KEY", required: "LIVE", description: "Polygon/Massive API key" },
    { name: "FMP_KEY", required: "no", description: "FMP API key for fundamentals" },
    {
      name: "ALPHAVANTAGE_KEY",
      required: "no",
      description: "Alpha Vantage API key for macro data",
    },
    { name: "ALPACA_KEY", required: "PAPER/LIVE", description: "Alpaca API key" },
    { name: "ALPACA_SECRET", required: "PAPER/LIVE", description: "Alpaca API secret" },
    { name: "ALPACA_BASE_URL", required: "no", description: "Alpaca API base URL (override)" },
    { name: "ANTHROPIC_API_KEY", required: "LIVE*", description: "Anthropic API key for Claude" },
    { name: "GOOGLE_API_KEY", required: "LIVE*", description: "Google Gemini API key" },
    { name: "KALSHI_API_KEY_ID", required: "no", description: "Kalshi API key ID" },
    { name: "KALSHI_PRIVATE_KEY_PATH", required: "no", description: "Path to Kalshi private key" },
    { name: "TAVILY_API_KEY", required: "no", description: "Tavily API key for web search" },
    { name: "GOOGLE_CLIENT_ID", required: "PAPER/LIVE", description: "Google OAuth client ID" },
    { name: "GOOGLE_CLIENT_SECRET", required: "PAPER/LIVE", description: "Google OAuth secret" },
    { name: "BETTER_AUTH_URL", required: "no", description: "Better Auth base URL for OAuth" },
  ];
}

// Re-export schema for testing
export { envSchema };
