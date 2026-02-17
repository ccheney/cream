/**
 * Company Graph Builder Service
 *
 * Populates company relationship graph in HelixDB with:
 * - RELATED_TO edges for sector/industry peers and competitors
 * - DEPENDS_ON edges for supply chain relationships
 *
 * @see docs/plans/04-memory-helixdb.md
 */

import type { DependencyType, RelationshipType } from "@cream/helix-schema";

import type { HelixClient } from "../client.js";
import { batchCreateEdges, createEdge, type EdgeInput } from "../queries/mutations.js";
import {
	batchUpsertCompanyNodes,
	buildCorrelationPeerEdges,
	buildIndustryPeerEdges,
	buildSectorPeerEdges,
	buildSupplyChainEdges,
	calculateCorrelation,
	calculateReturns,
	getMarketCapBucket,
	toCompanyNodes,
} from "./company-graph-builder.helpers.js";

// ============================================
// Types
// ============================================

/**
 * Company data from universe resolution
 */
export interface CompanyData {
	symbol: string;
	name?: string;
	sector?: string;
	industry?: string;
	marketCap?: number;
}

/**
 * Supply chain relationship data
 */
export interface SupplyChainRelationship {
	sourceSymbol: string;
	targetSymbol: string;
	dependencyType: DependencyType;
	/** Revenue percentage or estimated dependency strength (0-1) */
	strength: number;
	/** Source of this data (e.g., "SEC_10K", "ALPACA") */
	source: string;
}

/**
 * Build result statistics
 */
export interface CompanyGraphBuildResult {
	companiesUpserted: number;
	sectorPeerEdges: number;
	industryPeerEdges: number;
	correlationPeerEdges: number;
	supplyChainEdges: number;
	totalEdges: number;
	executionTimeMs: number;
	warnings: string[];
}

/**
 * Build options
 */
export interface CompanyGraphBuildOptions {
	/** Maximum peer edges per company (default: 20) */
	maxPeersPerCompany?: number;
	/** Include industry peers (default: true) */
	includeIndustryPeers?: boolean;
	/** Correlation analysis options */
	correlationOptions?: CorrelationAnalysisOptions;
	/** Batch size for edge creation (default: 100) */
	batchSize?: number;
}

/**
 * Correlation pair data from price analysis
 */
export interface CorrelationPair {
	symbolA: string;
	symbolB: string;
	/** Pearson correlation coefficient (-1 to 1) */
	correlation: number;
	/** Number of days used in calculation */
	lookbackDays: number;
}

/**
 * Correlation analysis options
 */
export interface CorrelationAnalysisOptions {
	/** Minimum correlation threshold (default: 0.7) */
	minCorrelation?: number;
	/** Maximum pairs per symbol (default: 10) */
	maxPairsPerSymbol?: number;
}

export { getMarketCapBucket, calculateCorrelation, calculateReturns };

interface ResolvedBuildOptions {
	maxPeersPerCompany: number;
	includeIndustryPeers: boolean;
	correlationOptions: CorrelationAnalysisOptions;
	batchSize: number;
}

interface BuiltEdgeSets {
	sectorPeerEdges: EdgeInput[];
	industryPeerEdges: EdgeInput[];
	correlationEdges: EdgeInput[];
	supplyChainEdges: EdgeInput[];
	allEdges: EdgeInput[];
}

// ============================================
// Main Builder Class
// ============================================

/**
 * Company Graph Builder
 *
 * Populates and maintains company relationships in HelixDB.
 */
export class CompanyGraphBuilder {
	constructor(private readonly client: HelixClient) {}

	private resolveBuildOptions(options: CompanyGraphBuildOptions): ResolvedBuildOptions {
		return {
			maxPeersPerCompany: options.maxPeersPerCompany ?? 20,
			includeIndustryPeers: options.includeIndustryPeers ?? true,
			correlationOptions: options.correlationOptions ?? {},
			batchSize: options.batchSize ?? 100,
		};
	}

	private collectNodeWarnings(nodeErrors: string[]): string[] {
		if (nodeErrors.length <= 10) {
			return [...nodeErrors];
		}

		return [...nodeErrors.slice(0, 10), `...and ${nodeErrors.length - 10} more node errors`];
	}

	private buildEdgeSets(
		companies: CompanyData[],
		correlationPairs: CorrelationPair[],
		supplyChainRelationships: SupplyChainRelationship[],
		options: ResolvedBuildOptions,
	): BuiltEdgeSets {
		const sectorPeerEdges = buildSectorPeerEdges(companies, options.maxPeersPerCompany);
		const existingEdges = new Set(
			sectorPeerEdges.map((edge) => [edge.sourceId, edge.targetId].toSorted().join("->")),
		);
		const industryPeerEdges = options.includeIndustryPeers
			? buildIndustryPeerEdges(companies, options.maxPeersPerCompany, existingEdges)
			: [];
		const correlationEdges = buildCorrelationPeerEdges(
			correlationPairs,
			options.correlationOptions,
			existingEdges,
		);
		const supplyChainEdges = buildSupplyChainEdges(supplyChainRelationships);
		const allEdges = [
			...sectorPeerEdges,
			...industryPeerEdges,
			...correlationEdges,
			...supplyChainEdges,
		];

		return { sectorPeerEdges, industryPeerEdges, correlationEdges, supplyChainEdges, allEdges };
	}

	private async createEdgesInBatches(
		edges: EdgeInput[],
		batchSize: number,
		warnings: string[],
	): Promise<number> {
		let totalEdgesCreated = 0;

		for (let i = 0; i < edges.length; i += batchSize) {
			const batch = edges.slice(i, i + batchSize);
			const batchResult = await batchCreateEdges(this.client, batch);
			totalEdgesCreated += batchResult.successful.length;

			if (batchResult.failed.length > 0) {
				warnings.push(
					`Batch ${Math.floor(i / batchSize) + 1}: ${batchResult.failed.length} edges failed`,
				);
			}
		}

		return totalEdgesCreated;
	}

	/**
	 * Build company graph from universe companies
	 *
	 * @param companies - Companies from universe resolution
	 * @param correlationPairs - Optional correlation data from price analysis
	 * @param supplyChainRelationships - Optional supply chain data
	 * @param options - Build options
	 */
	async build(
		companies: CompanyData[],
		correlationPairs: CorrelationPair[] = [],
		supplyChainRelationships: SupplyChainRelationship[] = [],
		options: CompanyGraphBuildOptions = {},
	): Promise<CompanyGraphBuildResult> {
		const startTime = performance.now();
		const warnings: string[] = [];
		const resolvedOptions = this.resolveBuildOptions(options);
		const companyNodes = toCompanyNodes(companies);
		const nodeResult = await batchUpsertCompanyNodes(this.client, companyNodes);
		warnings.push(...this.collectNodeWarnings(nodeResult.errors));

		const edgeSets = this.buildEdgeSets(
			companies,
			correlationPairs,
			supplyChainRelationships,
			resolvedOptions,
		);
		const totalEdgesCreated = await this.createEdgesInBatches(
			edgeSets.allEdges,
			resolvedOptions.batchSize,
			warnings,
		);

		return {
			companiesUpserted: nodeResult.successful,
			sectorPeerEdges: edgeSets.sectorPeerEdges.length,
			industryPeerEdges: edgeSets.industryPeerEdges.length,
			correlationPeerEdges: edgeSets.correlationEdges.length,
			supplyChainEdges: edgeSets.supplyChainEdges.length,
			totalEdges: totalEdgesCreated,
			executionTimeMs: performance.now() - startTime,
			warnings,
		};
	}

	/**
	 * Add a single relationship edge
	 */
	async addRelationship(
		sourceSymbol: string,
		targetSymbol: string,
		relationshipType: RelationshipType,
	): Promise<{ success: boolean; error?: string }> {
		const result = await createEdge(this.client, {
			sourceId: sourceSymbol,
			targetId: targetSymbol,
			edgeType: "RELATED_TO",
			properties: { relationship_type: relationshipType },
		});
		return { success: result.success, error: result.error };
	}

	/**
	 * Add a supply chain dependency edge
	 */
	async addDependency(
		sourceSymbol: string,
		targetSymbol: string,
		dependencyType: DependencyType,
		strength: number,
	): Promise<{ success: boolean; error?: string }> {
		const result = await createEdge(this.client, {
			sourceId: sourceSymbol,
			targetId: targetSymbol,
			edgeType: "DEPENDS_ON",
			properties: {
				relationship_type: dependencyType,
				strength: Math.max(0, Math.min(1, strength)),
			},
		});
		return { success: result.success, error: result.error };
	}

	/**
	 * Get related companies for a symbol
	 */
	async getRelatedCompanies(
		symbol: string,
		relationshipTypes?: RelationshipType[],
	): Promise<{ symbol: string; relationshipType: RelationshipType }[]> {
		try {
			const result = await this.client.query<
				Array<{ target_symbol: string; relationship_type: RelationshipType }>
			>("getRelatedCompanies", {
				symbol,
				relationship_types: relationshipTypes ?? [
					"SECTOR_PEER",
					"COMPETITOR",
					"CUSTOMER",
					"SUPPLY_CHAIN",
				],
			});

			return result.data.map((row) => ({
				symbol: row.target_symbol,
				relationshipType: row.relationship_type,
			}));
		} catch {
			return [];
		}
	}

	/**
	 * Get company dependencies (supply chain)
	 */
	async getCompanyDependencies(
		symbol: string,
	): Promise<{ symbol: string; dependencyType: DependencyType; strength: number }[]> {
		try {
			const result = await this.client.query<
				Array<{ target_symbol: string; relationship_type: DependencyType; strength: number }>
			>("getCompanyDependencies", { symbol });

			return result.data.map((row) => ({
				symbol: row.target_symbol,
				dependencyType: row.relationship_type,
				strength: row.strength,
			}));
		} catch {
			return [];
		}
	}

	/**
	 * Get companies that depend on a given company
	 */
	async getDependentCompanies(
		symbol: string,
	): Promise<{ symbol: string; dependencyType: DependencyType; strength: number }[]> {
		try {
			const result = await this.client.query<
				Array<{ source_symbol: string; relationship_type: DependencyType; strength: number }>
			>("getDependentCompanies", { symbol });

			return result.data.map((row) => ({
				symbol: row.source_symbol,
				dependencyType: row.relationship_type,
				strength: row.strength,
			}));
		} catch {
			return [];
		}
	}

	/**
	 * Batch add supply chain relationships
	 * Use this to import supply chain data from external sources (SEC filings, APIs)
	 */
	async addSupplyChainRelationships(
		relationships: SupplyChainRelationship[],
	): Promise<{ successful: number; failed: number; errors: string[] }> {
		const edges = buildSupplyChainEdges(relationships);
		const batchResult = await batchCreateEdges(this.client, edges);

		return {
			successful: batchResult.successful.length,
			failed: batchResult.failed.length,
			errors: batchResult.failed.map((failure) => failure.error ?? failure.id),
		};
	}

	/**
	 * Add correlation-based relationships from price analysis
	 */
	async addCorrelationRelationships(
		pairs: CorrelationPair[],
		options: CorrelationAnalysisOptions = {},
	): Promise<{ successful: number; failed: number; errors: string[] }> {
		const existingEdges = new Set<string>();
		const edges = buildCorrelationPeerEdges(pairs, options, existingEdges);
		const batchResult = await batchCreateEdges(this.client, edges);

		return {
			successful: batchResult.successful.length,
			failed: batchResult.failed.length,
			errors: batchResult.failed.map((failure) => failure.error ?? failure.id),
		};
	}
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a CompanyGraphBuilder instance
 */
export function createCompanyGraphBuilder(client: HelixClient): CompanyGraphBuilder {
	return new CompanyGraphBuilder(client);
}
