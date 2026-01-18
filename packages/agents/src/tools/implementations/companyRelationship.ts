/**
 * Company Relationship Tool Implementation
 *
 * Queries company relationships from the HelixDB company graph.
 * Provides peer companies, competitors, and supply chain dependencies.
 */

import { type ExecutionContext, isTest } from "@cream/domain";
import { createCompanyGraphBuilder } from "@cream/helix";
import { getHelixClient } from "../clients.js";

// ============================================
// Types
// ============================================

/**
 * Related company result
 */
export interface RelatedCompanyResult {
	symbol: string;
	relationshipType: "SECTOR_PEER" | "SUPPLY_CHAIN" | "COMPETITOR" | "CUSTOMER";
}

/**
 * Dependency result
 */
export interface DependencyResult {
	symbol: string;
	dependencyType: "SUPPLIER" | "CUSTOMER" | "PARTNER";
	/** Strength of the dependency (0-1) */
	strength: number;
}

/**
 * Company relationships query result
 */
export interface CompanyRelationshipsResult {
	/** The queried company symbol */
	symbol: string;
	/** Related companies (peers, competitors) */
	relatedCompanies: RelatedCompanyResult[];
	/** Companies this company depends on */
	dependencies: DependencyResult[];
	/** Companies that depend on this company */
	dependents: DependencyResult[];
	/** Query execution time in milliseconds */
	executionTimeMs: number;
}

// ============================================
// Implementation
// ============================================

/**
 * Empty result for test mode
 */
function emptyResult(symbol: string): CompanyRelationshipsResult {
	return {
		symbol,
		relatedCompanies: [],
		dependencies: [],
		dependents: [],
		executionTimeMs: 0,
	};
}

/**
 * Query company relationships from HelixDB
 *
 * Returns:
 * - Related companies (SECTOR_PEER, COMPETITOR, CUSTOMER, SUPPLY_CHAIN)
 * - Supply chain dependencies (what this company depends on)
 * - Dependents (what companies depend on this company)
 *
 * @param ctx - ExecutionContext
 * @param symbol - Company ticker symbol
 * @returns Company relationships
 *
 * @example
 * ```typescript
 * const result = await getCompanyRelationships(ctx, "AAPL");
 *
 * // See sector peers and competitors
 * for (const related of result.relatedCompanies) {
 *   console.log(`${related.symbol} (${related.relationshipType})`);
 * }
 *
 * // See suppliers
 * for (const dep of result.dependencies) {
 *   if (dep.dependencyType === "SUPPLIER") {
 *     console.log(`Supplier: ${dep.symbol} (strength: ${dep.strength})`);
 *   }
 * }
 * ```
 */
export async function getCompanyRelationships(
	ctx: ExecutionContext,
	symbol: string
): Promise<CompanyRelationshipsResult> {
	if (isTest(ctx)) {
		return emptyResult(symbol);
	}

	const startTime = performance.now();
	const client = getHelixClient();
	const builder = createCompanyGraphBuilder(client);

	const [relatedCompanies, dependencies, dependents] = await Promise.all([
		builder.getRelatedCompanies(symbol.toUpperCase()),
		builder.getCompanyDependencies(symbol.toUpperCase()),
		builder.getDependentCompanies(symbol.toUpperCase()),
	]);

	return {
		symbol: symbol.toUpperCase(),
		relatedCompanies: relatedCompanies.map((r) => ({
			symbol: r.symbol,
			relationshipType: r.relationshipType,
		})),
		dependencies: dependencies.map((d) => ({
			symbol: d.symbol,
			dependencyType: d.dependencyType,
			strength: d.strength,
		})),
		dependents: dependents.map((d) => ({
			symbol: d.symbol,
			dependencyType: d.dependencyType,
			strength: d.strength,
		})),
		executionTimeMs: performance.now() - startTime,
	};
}

/**
 * Get sector peers for a company
 */
export async function getSectorPeers(
	ctx: ExecutionContext,
	symbol: string
): Promise<{ symbol: string; peers: string[] }> {
	if (isTest(ctx)) {
		return { symbol, peers: [] };
	}

	const client = getHelixClient();
	const builder = createCompanyGraphBuilder(client);

	const related = await builder.getRelatedCompanies(symbol.toUpperCase(), ["SECTOR_PEER"]);

	return {
		symbol: symbol.toUpperCase(),
		peers: related.map((r) => r.symbol),
	};
}

/**
 * Get supply chain for a company (both upstream suppliers and downstream customers)
 */
export async function getSupplyChain(
	ctx: ExecutionContext,
	symbol: string
): Promise<{
	symbol: string;
	suppliers: DependencyResult[];
	customers: DependencyResult[];
}> {
	if (isTest(ctx)) {
		return { symbol, suppliers: [], customers: [] };
	}

	const client = getHelixClient();
	const builder = createCompanyGraphBuilder(client);

	const [dependencies, dependents] = await Promise.all([
		builder.getCompanyDependencies(symbol.toUpperCase()),
		builder.getDependentCompanies(symbol.toUpperCase()),
	]);

	return {
		symbol: symbol.toUpperCase(),
		suppliers: dependencies
			.filter((d) => d.dependencyType === "SUPPLIER")
			.map((d) => ({
				symbol: d.symbol,
				dependencyType: d.dependencyType,
				strength: d.strength,
			})),
		customers: dependents
			.filter((d) => d.dependencyType === "CUSTOMER")
			.map((d) => ({
				symbol: d.symbol,
				dependencyType: d.dependencyType,
				strength: d.strength,
			})),
	};
}
