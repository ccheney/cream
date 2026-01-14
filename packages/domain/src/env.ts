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
import { log } from "./logger.js";

/**
 * Environment type - controls trading behavior and safety checks
 *
 * This is a pure type definition. The actual environment is determined
 * by ExecutionContext, not by environment variables.
 */
export const CreamEnvironment = z.enum(["BACKTEST", "PAPER", "LIVE"]);
export type CreamEnvironment = z.infer<typeof CreamEnvironment>;

/**
 * Validates and returns CREAM_ENV from environment. Throws if not set or invalid.
 *
 * Use this at startup/system boundaries when transitioning from env var to ExecutionContext.
 * This replaces fallback patterns like `process.env.CREAM_ENV || "BACKTEST"`.
 *
 * @throws {Error} If CREAM_ENV is not set
 * @throws {Error} If CREAM_ENV is not one of: BACKTEST, PAPER, LIVE
 * @returns The validated CREAM_ENV value
 *
 * @example
 * ```ts
 * // Instead of: process.env.CREAM_ENV || "BACKTEST"
 * const env = requireEnv(); // Throws if not set
 *
 * // Then create context at system boundary
 * const ctx = createContext(env, "scheduled");
 * ```
 */
export function requireEnv(): CreamEnvironment {
	const envValue = Bun.env.CREAM_ENV ?? process.env.CREAM_ENV;

	if (!envValue) {
		throw new Error(
			"CREAM_ENV environment variable is required. " + "Set it to one of: BACKTEST, PAPER, LIVE"
		);
	}

	const result = CreamEnvironment.safeParse(envValue);
	if (!result.success) {
		throw new Error(
			`Invalid CREAM_ENV value: "${envValue}". Must be one of: BACKTEST, PAPER, LIVE`
		);
	}

	return result.data;
}

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
	// Database URLs
	TURSO_DATABASE_URL:
		optionalUrlWithDefault("http://localhost:8080").describe("Turso database URL"),
	TURSO_AUTH_TOKEN: z.string().optional().describe("Turso Cloud authentication token"),
	HELIX_URL: optionalUrlWithDefault("http://localhost:6969").describe("HelixDB server URL"),
	// Alternative HelixDB config (host:port vs URL)
	HELIX_HOST: z.string().optional().describe("HelixDB host (alternative to HELIX_URL)"),
	HELIX_PORT: z.coerce.number().optional().describe("HelixDB port (alternative to HELIX_URL)"),

	// Market Data Providers (Alpaca is unified provider via ALPACA_KEY/ALPACA_SECRET)
	ALPHAVANTAGE_KEY: z.string().optional().describe("Alpha Vantage API key for macro indicators"),
	FRED_API_KEY: z.string().optional().describe("FRED API key for economic data"),

	// Broker Credentials
	ALPACA_KEY: z.string().optional().describe("Alpaca API key"),
	ALPACA_SECRET: z.string().optional().describe("Alpaca API secret"),
	ALPACA_BASE_URL: z
		.string()
		.optional()
		.refine((val) => val === undefined || isValidUrl(val), { message: "Invalid URL format" })
		.describe("Alpaca API base URL (override for testing)"),

	// LLM Configuration
	// OODA agents use Gemini exclusively; ANTHROPIC_API_KEY is only for claude-agent-sdk
	ANTHROPIC_API_KEY: z.string().optional().describe("Anthropic API key (claude-agent-sdk only)"),
	GOOGLE_GENERATIVE_AI_API_KEY: z
		.string()
		.optional()
		.describe("Google Gemini API key (required for OODA agents)"),

	// LLM Model Selection (optional - checked at runtime when needed)
	LLM_PROVIDER: z.string().optional().describe("LLM provider (e.g., google)"),
	LLM_MODEL_ID: z.string().optional().describe("LLM model ID"),

	// Prediction Markets
	KALSHI_API_KEY_ID: z.string().optional().describe("Kalshi API key ID"),
	KALSHI_PRIVATE_KEY_PATH: z.string().optional().describe("Path to Kalshi private key file"),

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
		TURSO_DATABASE_URL: Bun.env.TURSO_DATABASE_URL ?? process.env.TURSO_DATABASE_URL,
		TURSO_AUTH_TOKEN: Bun.env.TURSO_AUTH_TOKEN ?? process.env.TURSO_AUTH_TOKEN,
		HELIX_URL: Bun.env.HELIX_URL ?? process.env.HELIX_URL,
		HELIX_HOST: Bun.env.HELIX_HOST ?? process.env.HELIX_HOST,
		HELIX_PORT: Bun.env.HELIX_PORT ?? process.env.HELIX_PORT,
		ALPHAVANTAGE_KEY: Bun.env.ALPHAVANTAGE_KEY ?? process.env.ALPHAVANTAGE_KEY,
		FRED_API_KEY: Bun.env.FRED_API_KEY ?? process.env.FRED_API_KEY,
		ALPACA_KEY: Bun.env.ALPACA_KEY ?? process.env.ALPACA_KEY,
		ALPACA_SECRET: Bun.env.ALPACA_SECRET ?? process.env.ALPACA_SECRET,
		ALPACA_BASE_URL: Bun.env.ALPACA_BASE_URL ?? process.env.ALPACA_BASE_URL,
		ANTHROPIC_API_KEY: Bun.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY,
		GOOGLE_GENERATIVE_AI_API_KEY:
			Bun.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY,
		LLM_PROVIDER: Bun.env.LLM_PROVIDER ?? process.env.LLM_PROVIDER,
		LLM_MODEL_ID: Bun.env.LLM_MODEL_ID ?? process.env.LLM_MODEL_ID,
		KALSHI_API_KEY_ID: Bun.env.KALSHI_API_KEY_ID ?? process.env.KALSHI_API_KEY_ID,
		KALSHI_PRIVATE_KEY_PATH: Bun.env.KALSHI_PRIVATE_KEY_PATH ?? process.env.KALSHI_PRIVATE_KEY_PATH,
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
 * Check if web search capability is available (Gemini grounding via GOOGLE_GENERATIVE_AI_API_KEY)
 */
export function hasWebSearchCapability(): boolean {
	return !!env.GOOGLE_GENERATIVE_AI_API_KEY;
}

/**
 * Get the LLM model ID from environment
 * Returns a default value for tests (BACKTEST environment)
 * @throws {Error} If LLM_MODEL_ID is not set and not in BACKTEST
 */
export function getLLMModelId(): string {
	if (!env.LLM_MODEL_ID) {
		// Use default for tests (CREAM_ENV is not in env schema, check raw env)
		const creamEnv = Bun.env.CREAM_ENV ?? process.env.CREAM_ENV;
		if (creamEnv === "BACKTEST") {
			return "llm-model-id";
		}
		throw new Error("LLM_MODEL_ID environment variable is required");
	}
	return env.LLM_MODEL_ID;
}

/**
 * Get the LLM provider from environment
 * @throws {Error} If LLM_PROVIDER is not set
 */
export function getLLMProvider(): string {
	if (!env.LLM_PROVIDER) {
		throw new Error("LLM_PROVIDER environment variable is required");
	}
	return env.LLM_PROVIDER;
}

/**
 * Get the full model ID with provider prefix (e.g., "google/gemini-2.0-flash")
 * @throws {Error} If LLM_PROVIDER or LLM_MODEL_ID is not set
 */
export function getFullModelId(): string {
	return `${getLLMProvider()}/${getLLMModelId()}`;
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
	LIVE: ["ALPACA_KEY", "ALPACA_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
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

	// Check Gemini key for LIVE (required for OODA agents)
	// Note: ANTHROPIC_API_KEY is only for claude-agent-sdk, not OODA agents
	if (ctx.environment === "LIVE" && !env.GOOGLE_GENERATIVE_AI_API_KEY) {
		errors.push("GOOGLE_GENERATIVE_AI_API_KEY is required for LIVE environment (OODA agents)");
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
		log.error(
			{
				serviceName,
				errors: result.errors,
				environment: ctx.environment,
				source: ctx.source,
				traceId: ctx.traceId,
			},
			"Environment validation failed"
		);
		process.exit(1);
	}

	if (result.warnings.length > 0) {
		log.warn(
			{
				serviceName,
				warnings: result.warnings,
			},
			"Environment validation warnings"
		);
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
		{ name: "TURSO_DATABASE_URL", required: "no", description: "Turso database URL" },
		{ name: "TURSO_AUTH_TOKEN", required: "no", description: "Turso Cloud authentication token" },
		{ name: "HELIX_URL", required: "no", description: "HelixDB server URL" },
		{ name: "HELIX_HOST", required: "no", description: "HelixDB host (alternative to HELIX_URL)" },
		{ name: "HELIX_PORT", required: "no", description: "HelixDB port (alternative to HELIX_URL)" },
		{
			name: "ALPHAVANTAGE_KEY",
			required: "no",
			description: "Alpha Vantage API key for macro data",
		},
		{ name: "FRED_API_KEY", required: "no", description: "FRED API key for economic data" },
		{ name: "ALPACA_KEY", required: "PAPER/LIVE", description: "Alpaca API key" },
		{ name: "ALPACA_SECRET", required: "PAPER/LIVE", description: "Alpaca API secret" },
		{ name: "ALPACA_BASE_URL", required: "no", description: "Alpaca API base URL (override)" },
		{
			name: "ANTHROPIC_API_KEY",
			required: "no",
			description: "Anthropic API key (claude-agent-sdk only, not OODA)",
		},
		{
			name: "GOOGLE_GENERATIVE_AI_API_KEY",
			required: "LIVE",
			description: "Google Gemini API key (required for OODA agents)",
		},
		{ name: "LLM_PROVIDER", required: "runtime", description: "LLM provider (checked when used)" },
		{
			name: "LLM_MODEL_ID",
			required: "runtime",
			description: "LLM model ID (checked when used)",
		},
		{ name: "KALSHI_API_KEY_ID", required: "no", description: "Kalshi API key ID" },
		{ name: "KALSHI_PRIVATE_KEY_PATH", required: "no", description: "Path to Kalshi private key" },
		{ name: "GOOGLE_CLIENT_ID", required: "PAPER/LIVE", description: "Google OAuth client ID" },
		{ name: "GOOGLE_CLIENT_SECRET", required: "PAPER/LIVE", description: "Google OAuth secret" },
		{ name: "BETTER_AUTH_URL", required: "no", description: "Better Auth base URL for OAuth" },
	];
}

// Re-export schema for testing
export { envSchema };
