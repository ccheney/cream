/**
 * Configuration Validation
 *
 * Complete configuration schema and validation logic.
 * Combines all sub-schemas into a unified CreamConfigSchema.
 *
 * @see docs/plans/11-configuration.md for full specification
 */

import { z } from "zod";
import { AgentsConfigSchema } from "./schemas/agents";
import { ConstraintsConfigSchema } from "./schemas/constraints";
// Import all sub-schemas
import { CoreConfigSchema } from "./schemas/core";
import { ExecutionConfigSchema } from "./schemas/execution";
import { NormalizationConfigSchema } from "./schemas/features";
import { IndicatorsConfigSchema } from "./schemas/indicators";
import { MemoryConfigSchema } from "./schemas/memory";
import { MetricsConfigSchema } from "./schemas/metrics";
import { PredictionMarketsConfigSchema } from "./schemas/prediction_markets";
import { RegimeConfigSchema } from "./schemas/regime";
import { ScannerConfigSchema } from "./schemas/scanner";

// ============================================
// Complete Configuration Schema
// ============================================

/**
 * Complete Cream configuration schema
 *
 * Combines all sub-schemas into a unified configuration.
 */
export const CreamConfigSchema = z.object({
	/**
	 * Core settings (environment, LLM, timeframes)
	 */
	core: CoreConfigSchema,

	/**
	 * Technical indicators configuration
	 */
	indicators: IndicatorsConfigSchema.optional(),

	/**
	 * Feature normalization transforms
	 */
	normalization: NormalizationConfigSchema.optional(),

	/**
	 * Regime classifier configuration
	 */
	regime: RegimeConfigSchema.optional(),

	/**
	 * Risk constraints configuration
	 */
	constraints: ConstraintsConfigSchema.optional(),

	/**
	 * Memory and retrieval configuration
	 */
	memory: MemoryConfigSchema.optional(),

	/**
	 * Agent network configuration
	 */
	agents: AgentsConfigSchema.optional(),

	/**
	 * Autonomous scanner configuration
	 */
	scanner: ScannerConfigSchema.optional(),

	/**
	 * Execution and broker configuration
	 */
	execution: ExecutionConfigSchema.optional(),

	/**
	 * Performance metrics configuration
	 */
	metrics: MetricsConfigSchema.optional(),

	/**
	 * Prediction markets configuration (Kalshi, Polymarket)
	 */
	prediction_markets: PredictionMarketsConfigSchema.optional(),
});
export type CreamConfig = z.infer<typeof CreamConfigSchema>;

// ============================================
// Validation Functions
// ============================================

/**
 * Validation result with detailed errors
 */
export interface ValidationResult {
	success: boolean;
	data?: CreamConfig;
	errors: string[];
}

/**
 * Validate configuration object
 *
 * @param config - Raw configuration object to validate
 * @returns Validation result with parsed data or errors
 */
export function validateConfig(config: unknown): ValidationResult {
	const result = CreamConfigSchema.safeParse(config);

	if (result.success) {
		return {
			success: true,
			data: result.data,
			errors: [],
		};
	}

	return {
		success: false,
		errors: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
	};
}

/**
 * Validate configuration and throw on error
 *
 * @param config - Raw configuration object to validate
 * @returns Validated configuration
 * @throws ZodError if validation fails
 */
export function validateConfigOrThrow(config: unknown): CreamConfig {
	return CreamConfigSchema.parse(config);
}

/**
 * Validate partial configuration (for overrides)
 *
 * @param config - Partial configuration object
 * @returns Validation result
 */
export function validatePartialConfig(config: unknown): ValidationResult {
	const partialSchema = CreamConfigSchema.partial();
	const result = partialSchema.safeParse(config);

	if (result.success) {
		return {
			success: true,
			data: result.data as CreamConfig,
			errors: [],
		};
	}

	return {
		success: false,
		errors: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
	};
}

// ============================================
// Startup Validation
// ============================================

/**
 * Validate configuration at startup
 *
 * Performs comprehensive validation including:
 * 1. Schema validation
 * 2. Cross-field consistency checks
 * 3. Environment-specific requirements
 *
 * @param config - Configuration to validate
 * @returns Validation result with warnings
 */
export function validateAtStartup(config: unknown): ValidationResult & { warnings: string[] } {
	const baseResult = validateConfig(config);
	const warnings: string[] = [];

	if (!baseResult.success || baseResult.data === undefined) {
		return { ...baseResult, warnings };
	}

	const cfg = baseResult.data;
	warnings.push(...getLiveEnvironmentWarnings(cfg));
	pushModelWarning(cfg, warnings);
	pushRegimeWarning(cfg, warnings);

	return {
		success: true,
		data: cfg,
		errors: [],
		warnings,
	};
}

function getLiveEnvironmentWarnings(cfg: CreamConfig): string[] {
	if (cfg.core.environment !== "LIVE") {
		return [];
	}

	const warnings: string[] = [];
	if (!cfg.scanner) {
		warnings.push("LIVE environment without scanner configuration - no symbols to trigger");
	}
	if (
		cfg.constraints?.per_instrument?.max_pct_equity !== undefined &&
		cfg.constraints.per_instrument.max_pct_equity > 0.2
	) {
		warnings.push("LIVE: per_instrument.max_pct_equity > 20% is risky");
	}
	if (
		cfg.constraints?.portfolio?.max_gross_pct_equity !== undefined &&
		cfg.constraints.portfolio.max_gross_pct_equity > 3.0
	) {
		warnings.push("LIVE: portfolio leverage > 3x is very risky");
	}

	return warnings;
}

function pushModelWarning(cfg: CreamConfig, warnings: string[]): void {
	if (cfg.core.environment !== "LIVE" || !cfg.core.llm.model_id.includes("flash")) {
		return;
	}
	warnings.push("LIVE environment using flash model - consider pro for production");
}

function pushRegimeWarning(cfg: CreamConfig, warnings: string[]): void {
	if (cfg.regime?.classifier_type === "hmm" && !cfg.regime.hmm) {
		warnings.push("HMM classifier selected but no HMM config provided");
	}
}
