/**
 * Macro Exposure Tool Implementation
 *
 * Queries macro entity exposure from the HelixDB macro graph.
 * Provides sensitivity analysis for companies to macro factors like
 * interest rates, commodities, currencies, and economic indicators.
 */

import { type ExecutionContext, isTest } from "@cream/domain";
import {
	createMacroGraphBuilder,
	type MacroCategory,
	PREDEFINED_MACRO_ENTITIES,
	SECTOR_DEFAULT_SENSITIVITIES,
} from "@cream/helix";
import { getHelixClient } from "../clients.js";

// ============================================
// Types
// ============================================

/**
 * Macro factor exposure result
 */
export interface MacroFactorExposure {
	/** Macro entity ID (e.g., "fed_funds_rate", "oil_wti") */
	entityId: string;
	/** Human-readable name */
	name: string;
	/** Description of the macro factor */
	description: string;
	/** Sensitivity score (0-1, where 1 = highly sensitive) */
	sensitivity: number;
	/** Category of the macro factor */
	category: MacroCategory;
}

/**
 * Company macro exposure query result
 */
export interface CompanyMacroExposureResult {
	/** The queried company symbol */
	symbol: string;
	/** Macro factors affecting this company, sorted by sensitivity */
	exposures: MacroFactorExposure[];
	/** Query execution time in milliseconds */
	executionTimeMs: number;
}

/**
 * Portfolio macro exposure result
 */
export interface PortfolioMacroExposureResult {
	/** Companies analyzed */
	symbols: string[];
	/** Aggregated exposure by macro factor */
	aggregatedExposures: {
		entityId: string;
		name: string;
		category: MacroCategory;
		/** Average sensitivity across portfolio */
		avgSensitivity: number;
		/** Number of companies exposed */
		companyCount: number;
		/** Companies with highest sensitivity to this factor */
		topExposed: { symbol: string; sensitivity: number }[];
	}[];
	/** Query execution time in milliseconds */
	executionTimeMs: number;
}

/**
 * Companies affected by macro factor
 */
export interface CompaniesAffectedResult {
	/** The macro factor entity ID */
	macroEntityId: string;
	/** Human-readable name */
	name: string;
	/** Companies affected, sorted by sensitivity */
	affectedCompanies: {
		symbol: string;
		sensitivity: number;
	}[];
	/** Query execution time in milliseconds */
	executionTimeMs: number;
}

/**
 * Available macro factors result
 */
export interface MacroFactorsResult {
	/** Available macro factors by category */
	factors: {
		entityId: string;
		name: string;
		description: string;
		category: MacroCategory;
		frequency: string;
		dataSymbol?: string;
	}[];
	/** Sectors with default sensitivities */
	sectorsWithDefaults: string[];
}

// ============================================
// Implementation
// ============================================

/**
 * Get macro factor exposures for a company
 *
 * Returns sensitivity scores for all macro factors affecting the company.
 * Higher sensitivity (closer to 1.0) means the company is more affected
 * by changes in that macro factor.
 *
 * @example
 * ```typescript
 * const result = await getCompanyMacroExposure(ctx, "XOM");
 *
 * // Energy companies are highly sensitive to oil prices
 * for (const exposure of result.exposures) {
 *   if (exposure.sensitivity > 0.7) {
 *     console.log(`${result.symbol} highly exposed to ${exposure.name}`);
 *   }
 * }
 * ```
 */
export async function getCompanyMacroExposure(
	ctx: ExecutionContext,
	symbol: string
): Promise<CompanyMacroExposureResult> {
	const startTime = performance.now();

	if (isTest(ctx)) {
		return {
			symbol: symbol.toUpperCase(),
			exposures: [],
			executionTimeMs: 0,
		};
	}

	const client = getHelixClient();
	const builder = createMacroGraphBuilder(client);

	const factors = await builder.getMacroFactorsForCompany(symbol.toUpperCase());

	const exposures: MacroFactorExposure[] = factors.map((f) => {
		const predefined = PREDEFINED_MACRO_ENTITIES.find((p) => p.entity_id === f.entityId);
		return {
			entityId: f.entityId,
			name: f.name,
			description: predefined?.description ?? "",
			sensitivity: f.sensitivity,
			category: predefined?.category ?? "ECONOMIC_INDICATORS",
		};
	});

	// Sort by sensitivity descending
	exposures.sort((a, b) => b.sensitivity - a.sensitivity);

	return {
		symbol: symbol.toUpperCase(),
		exposures,
		executionTimeMs: performance.now() - startTime,
	};
}

/**
 * Get portfolio-level macro exposure analysis
 *
 * Aggregates macro exposures across multiple companies to identify
 * concentrated risks and diversification opportunities.
 *
 * @example
 * ```typescript
 * const result = await getPortfolioMacroExposure(ctx, ["AAPL", "XOM", "JPM"]);
 *
 * // Find factors the portfolio is most exposed to
 * for (const agg of result.aggregatedExposures) {
 *   if (agg.avgSensitivity > 0.6 && agg.companyCount >= 2) {
 *     console.log(`Portfolio concentrated in ${agg.name}`);
 *   }
 * }
 * ```
 */
export async function getPortfolioMacroExposure(
	ctx: ExecutionContext,
	symbols: string[]
): Promise<PortfolioMacroExposureResult> {
	const startTime = performance.now();

	if (isTest(ctx) || symbols.length === 0) {
		return {
			symbols,
			aggregatedExposures: [],
			executionTimeMs: 0,
		};
	}

	const client = getHelixClient();
	const builder = createMacroGraphBuilder(client);

	// Collect exposures for all companies
	const allExposures: { symbol: string; entityId: string; name: string; sensitivity: number }[] =
		[];

	for (const symbol of symbols) {
		const factors = await builder.getMacroFactorsForCompany(symbol.toUpperCase());
		for (const f of factors) {
			allExposures.push({
				symbol: symbol.toUpperCase(),
				entityId: f.entityId,
				name: f.name,
				sensitivity: f.sensitivity,
			});
		}
	}

	// Aggregate by macro factor
	const byFactor = Map.groupBy(allExposures, (e) => e.entityId);

	const aggregatedExposures = [...byFactor.entries()].map(([entityId, exposures]) => {
		const first = exposures[0];
		const predefined = PREDEFINED_MACRO_ENTITIES.find((p) => p.entity_id === entityId);

		const avgSensitivity = exposures.reduce((sum, e) => sum + e.sensitivity, 0) / exposures.length;

		const sorted = [...exposures].sort((a, b) => b.sensitivity - a.sensitivity);
		const topExposed = sorted.slice(0, 3).map((e) => ({
			symbol: e.symbol,
			sensitivity: e.sensitivity,
		}));

		return {
			entityId,
			name: first?.name ?? entityId,
			category: predefined?.category ?? ("ECONOMIC_INDICATORS" as MacroCategory),
			avgSensitivity,
			companyCount: exposures.length,
			topExposed,
		};
	});

	// Sort by average sensitivity
	aggregatedExposures.sort((a, b) => b.avgSensitivity - a.avgSensitivity);

	return {
		symbols: symbols.map((s) => s.toUpperCase()),
		aggregatedExposures,
		executionTimeMs: performance.now() - startTime,
	};
}

/**
 * Get companies affected by a specific macro factor
 *
 * Useful for understanding which holdings would be impacted by
 * changes in a specific macro factor (e.g., interest rate hike).
 *
 * @example
 * ```typescript
 * const result = await getCompaniesAffectedByMacro(ctx, "fed_funds_rate");
 *
 * // Find companies most sensitive to Fed rate changes
 * for (const company of result.affectedCompanies) {
 *   if (company.sensitivity > 0.8) {
 *     console.log(`${company.symbol} highly rate-sensitive`);
 *   }
 * }
 * ```
 */
export async function getCompaniesAffectedByMacro(
	ctx: ExecutionContext,
	macroEntityId: string
): Promise<CompaniesAffectedResult> {
	const startTime = performance.now();

	const predefined = PREDEFINED_MACRO_ENTITIES.find((p) => p.entity_id === macroEntityId);

	if (isTest(ctx)) {
		return {
			macroEntityId,
			name: predefined?.name ?? macroEntityId,
			affectedCompanies: [],
			executionTimeMs: 0,
		};
	}

	const client = getHelixClient();
	const builder = createMacroGraphBuilder(client);

	const affected = await builder.getCompaniesAffectedByMacro(macroEntityId);

	return {
		macroEntityId,
		name: predefined?.name ?? macroEntityId,
		affectedCompanies: affected.sort((a, b) => b.sensitivity - a.sensitivity),
		executionTimeMs: performance.now() - startTime,
	};
}

/**
 * Get available macro factors and categories
 *
 * Lists all predefined macro factors with their metadata.
 * Useful for agents to understand what factors can be queried.
 */
export function getAvailableMacroFactors(): MacroFactorsResult {
	return {
		factors: PREDEFINED_MACRO_ENTITIES.map((p) => ({
			entityId: p.entity_id,
			name: p.name,
			description: p.description ?? "",
			category: p.category,
			frequency: p.frequency,
			dataSymbol: p.dataSymbol,
		})),
		sectorsWithDefaults: Object.keys(SECTOR_DEFAULT_SENSITIVITIES),
	};
}

/**
 * Get macro factors by category
 */
export function getMacroFactorsByCategory(category: MacroCategory): MacroFactorsResult["factors"] {
	return PREDEFINED_MACRO_ENTITIES.filter((p) => p.category === category).map((p) => ({
		entityId: p.entity_id,
		name: p.name,
		description: p.description ?? "",
		category: p.category,
		frequency: p.frequency,
		dataSymbol: p.dataSymbol,
	}));
}
