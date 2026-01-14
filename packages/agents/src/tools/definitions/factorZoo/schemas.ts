/**
 * Factor Zoo Zod Schemas and Types
 *
 * Centralized schema definitions for all Factor Zoo tools.
 * Each tool has an input schema and output schema with derived TypeScript types.
 */

import { z } from "zod";
import { DecayAlertSchema } from "../../../services/decay-monitor.js";

// ============================================
// Update Daily Weights
// ============================================

export const UpdateDailyWeightsInputSchema = z.object({
	dryRun: z
		.boolean()
		.optional()
		.default(false)
		.describe("If true, calculate weights but don't persist them"),
});

export type UpdateDailyWeightsInput = z.infer<typeof UpdateDailyWeightsInputSchema>;

export const UpdateDailyWeightsOutputSchema = z.object({
	success: z.boolean(),
	qualifyingCount: z.number().describe("Number of factors meeting IC/ICIR thresholds"),
	selectedCount: z.number().describe("Number of factors selected for Mega-Alpha"),
	weights: z.record(z.string(), z.number()).describe("Factor ID to weight mapping"),
	zeroedFactors: z.array(z.string()).describe("Factors that were zeroed out"),
	updatedAt: z.string().describe("Timestamp of update"),
	message: z.string().describe("Human-readable status message"),
});

export type UpdateDailyWeightsOutput = z.infer<typeof UpdateDailyWeightsOutputSchema>;

// ============================================
// Compute Mega-Alpha
// ============================================

export const ComputeMegaAlphaInputSchema = z.object({
	signals: z
		.record(z.string(), z.number())
		.describe("Factor ID to signal value mapping for a single symbol"),
});

export type ComputeMegaAlphaInput = z.infer<typeof ComputeMegaAlphaInputSchema>;

export const ComputeMegaAlphaOutputSchema = z.object({
	value: z.number().describe("Combined Mega-Alpha signal value"),
	weights: z.record(z.string(), z.number()).describe("Factor weights used"),
	contributingFactors: z.array(z.string()).describe("Factors that contributed to signal"),
	signals: z.record(z.string(), z.number()).describe("Individual factor signals included"),
	message: z.string().describe("Human-readable description"),
});

export type ComputeMegaAlphaOutput = z.infer<typeof ComputeMegaAlphaOutputSchema>;

// ============================================
// Compute Mega-Alpha for Symbols
// ============================================

export const ComputeMegaAlphaForSymbolsInputSchema = z.object({
	symbolSignals: z
		.record(z.string(), z.record(z.string(), z.number()))
		.describe("Symbol to (factor ID to signal) mapping"),
});

export type ComputeMegaAlphaForSymbolsInput = z.infer<typeof ComputeMegaAlphaForSymbolsInputSchema>;

export const ComputeMegaAlphaForSymbolsOutputSchema = z.object({
	results: z
		.record(
			z.string(),
			z.object({
				value: z.number().describe("Combined Mega-Alpha signal for this symbol"),
				contributingFactors: z.array(z.string()).describe("Factor IDs that contributed to signal"),
			})
		)
		.describe("Symbol to Mega-Alpha result mapping"),
	totalSymbols: z.number().describe("Number of symbols processed"),
	message: z.string().describe("Human-readable summary"),
});

export type ComputeMegaAlphaForSymbolsOutput = z.infer<
	typeof ComputeMegaAlphaForSymbolsOutputSchema
>;

// ============================================
// Check Factor Decay
// ============================================

export const CheckFactorDecayInputSchema = z.object({
	factorId: z
		.string()
		.optional()
		.describe("Specific factor ID to check (optional - checks all active factors if omitted)"),
});

export type CheckFactorDecayInput = z.infer<typeof CheckFactorDecayInputSchema>;

export const CheckFactorDecayOutputSchema = z.object({
	decayingFactors: z
		.array(
			z.object({
				factorId: z.string().describe("Unique factor identifier"),
				isDecaying: z.boolean().describe("True if factor IC has dropped significantly from peak"),
				peakIC: z.number().describe("Highest historical Information Coefficient"),
				recentIC: z.number().describe("Current rolling IC value"),
				decayRate: z.number().describe("Rate of IC decline (negative = faster decay)"),
				daysInDecay: z.number().describe("Number of days since IC started declining"),
			})
		)
		.describe("Factors showing decay"),
	totalChecked: z.number().describe("Total number of factors evaluated for decay"),
	totalDecaying: z.number().describe("Count of factors currently in decay state"),
	message: z.string().describe("Human-readable summary"),
});

export type CheckFactorDecayOutput = z.infer<typeof CheckFactorDecayOutputSchema>;

// ============================================
// Get Factor Zoo Stats
// ============================================

export const GetFactorZooStatsInputSchema = z.object({});

export type GetFactorZooStatsInput = z.infer<typeof GetFactorZooStatsInputSchema>;

export const GetFactorZooStatsOutputSchema = z.object({
	totalFactors: z.number().describe("Total number of factors in the zoo"),
	activeFactors: z.number().describe("Factors currently contributing to Mega-Alpha"),
	decayingFactors: z.number().describe("Active factors with declining IC performance"),
	researchFactors: z.number().describe("Factors in research/validation stage"),
	retiredFactors: z.number().describe("Factors removed from active use"),
	averageIc: z.number().describe("Average Information Coefficient across active factors"),
	totalWeight: z.number().describe("Sum of all active factor weights (should be ~1.0)"),
	hypothesesValidated: z.number().describe("Hypotheses that passed validation pipeline"),
	hypothesesRejected: z.number().describe("Hypotheses that failed validation"),
	message: z.string().describe("Human-readable summary of zoo health"),
});

export type GetFactorZooStatsOutput = z.infer<typeof GetFactorZooStatsOutputSchema>;

// ============================================
// Get Current Weights
// ============================================

export const GetCurrentWeightsInputSchema = z.object({});

export type GetCurrentWeightsInput = z.infer<typeof GetCurrentWeightsInputSchema>;

export const GetCurrentWeightsOutputSchema = z.object({
	weights: z
		.record(z.string(), z.number())
		.describe("Factor ID to weight mapping. Weights sum to ~1.0"),
	totalFactors: z.number().describe("Total factors in weight map"),
	nonZeroFactors: z.number().describe("Factors with non-zero weights"),
	message: z.string().describe("Human-readable summary"),
});

export type GetCurrentWeightsOutput = z.infer<typeof GetCurrentWeightsOutputSchema>;

// ============================================
// Get Factor Context
// ============================================

export const GetFactorContextInputSchema = z.object({
	factorId: z.string().describe("The factor ID to get context for"),
});

export type GetFactorContextInput = z.infer<typeof GetFactorContextInputSchema>;

export const GetFactorContextOutputSchema = z.object({
	factorId: z.string().describe("Unique factor identifier"),
	name: z.string().describe("Human-readable factor name"),
	hypothesisId: z
		.string()
		.nullable()
		.describe("Linked hypothesis ID if factor was agent-generated"),
	status: z.string().describe("Current status: active, research, decaying, retired"),
	currentWeight: z.number().describe("Factor's weight in Mega-Alpha (0 if not active)"),
	performance: z
		.object({
			recentIC: z.number().describe("Average IC over last 5 days"),
			rolling30IC: z.number().describe("Average IC over 30 days"),
			icTrend: z.enum(["improving", "stable", "declining"]).describe("Direction of IC movement"),
			isDecaying: z.boolean().describe("True if factor is in decay state"),
			decayRate: z.number().nullable().describe("IC decay rate if decaying, null otherwise"),
		})
		.describe("Recent performance metrics"),
	validation: z
		.object({
			stage1Sharpe: z.number().nullable().describe("Backtest Sharpe ratio (null if not validated)"),
			stage2PBO: z.number().nullable().describe("Probability of Backtest Overfitting"),
			stage2WFE: z.number().nullable().describe("Walk-Forward Efficiency"),
			paperValidationPassed: z.boolean().describe("Whether factor passed paper trading validation"),
		})
		.describe("Validation pipeline results"),
	found: z.boolean().describe("Whether the factor was found in the zoo"),
	message: z.string().describe("Human-readable summary"),
});

export type GetFactorContextOutput = z.infer<typeof GetFactorContextOutputSchema>;

// ============================================
// Get Active Factors
// ============================================

export const GetActiveFactorsInputSchema = z.object({
	includeDetails: z
		.boolean()
		.optional()
		.default(false)
		.describe("Include performance details for each factor"),
});

export type GetActiveFactorsInput = z.infer<typeof GetActiveFactorsInputSchema>;

export const GetActiveFactorsOutputSchema = z.object({
	factors: z
		.array(
			z.object({
				factorId: z.string().describe("Unique factor identifier"),
				name: z.string().describe("Human-readable factor name"),
				weight: z.number().describe("Factor's weight in Mega-Alpha"),
				lastIC: z.number().nullable().describe("Most recent IC value, null if not calculated"),
				status: z.string().describe("Factor status: active, decaying"),
			})
		)
		.describe("List of active factors with their details"),
	totalActive: z.number().describe("Total count of active factors"),
	totalWeight: z.number().describe("Sum of all active factor weights"),
	message: z.string().describe("Human-readable summary"),
});

export type GetActiveFactorsOutput = z.infer<typeof GetActiveFactorsOutputSchema>;

// ============================================
// Run Decay Monitor
// ============================================

export const RunDecayMonitorInputSchema = z.object({
	sendAlerts: z
		.boolean()
		.optional()
		.default(true)
		.describe("Whether to send alerts via alert service"),
});

export type RunDecayMonitorInput = z.infer<typeof RunDecayMonitorInputSchema>;

export const RunDecayMonitorOutputSchema = z.object({
	alerts: z
		.array(DecayAlertSchema)
		.describe("Generated alerts for decay, crowding, correlation issues"),
	factorsChecked: z.number().describe("Total number of factors evaluated"),
	decayingFactors: z.array(z.string()).describe("Factor IDs showing IC decay"),
	crowdedFactors: z.array(z.string()).describe("Factor IDs with crowding indicators"),
	correlatedPairs: z
		.array(
			z.object({
				factor1: z.string().describe("First factor ID in correlated pair"),
				factor2: z.string().describe("Second factor ID in correlated pair"),
				correlation: z.number().describe("Correlation coefficient between factors"),
			})
		)
		.describe("Highly correlated factor pairs (>0.8 correlation)"),
	hasAlerts: z.boolean().describe("True if any alerts were generated"),
	message: z.string().describe("Human-readable summary of monitor run"),
});

export type RunDecayMonitorOutput = z.infer<typeof RunDecayMonitorOutputSchema>;
