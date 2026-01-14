/**
 * Company Graph Builder Service
 *
 * Populates company relationship graph in HelixDB with:
 * - RELATED_TO edges for sector/industry peers and competitors
 * - DEPENDS_ON edges for supply chain relationships
 *
 * @see docs/plans/04-memory-helixdb.md
 */

import type {
	Company,
	DependencyType,
	DependsOnEdge,
	MarketCapBucket,
	RelatedToEdge,
	RelationshipType,
} from "@cream/helix-schema";

import type { HelixClient } from "../client.js";
import { batchCreateEdges, createEdge, type EdgeInput } from "../queries/mutations.js";

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
	/** Source of this data (e.g., "SEC_10K", "FMP", "POLYGON") */
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

// ============================================
// Market Cap Bucket Mapping
// ============================================

/**
 * Map market cap to bucket classification
 */
export function getMarketCapBucket(marketCap: number | undefined): MarketCapBucket {
	if (!marketCap) {
		return "SMALL";
	}
	if (marketCap >= 200_000_000_000) {
		return "MEGA";
	}
	if (marketCap >= 10_000_000_000) {
		return "LARGE";
	}
	if (marketCap >= 2_000_000_000) {
		return "MID";
	}
	if (marketCap >= 300_000_000) {
		return "SMALL";
	}
	return "MICRO";
}

// ============================================
// Company Node Operations
// ============================================

/**
 * Upsert a company node in HelixDB
 */
async function upsertCompanyNode(
	client: HelixClient,
	company: Company
): Promise<{ success: boolean; error?: string }> {
	try {
		await client.query("upsertCompany", {
			symbol: company.symbol,
			name: company.name,
			sector: company.sector,
			industry: company.industry,
			market_cap_bucket: company.market_cap_bucket,
		});
		return { success: true };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

/**
 * Batch upsert company nodes
 */
async function batchUpsertCompanyNodes(
	client: HelixClient,
	companies: Company[]
): Promise<{ successful: number; failed: number; errors: string[] }> {
	const errors: string[] = [];
	let successful = 0;
	let failed = 0;

	for (const company of companies) {
		const result = await upsertCompanyNode(client, company);
		if (result.success) {
			successful++;
		} else {
			failed++;
			if (result.error) {
				errors.push(`${company.symbol}: ${result.error}`);
			}
		}
	}

	return { successful, failed, errors };
}

// ============================================
// Peer Relationship Building
// ============================================

/**
 * Group companies by sector
 */
function groupBySector(companies: CompanyData[]): Map<string, CompanyData[]> {
	const groups = new Map<string, CompanyData[]>();

	for (const company of companies) {
		const sector = company.sector ?? "Unknown";
		const existing = groups.get(sector) ?? [];
		existing.push(company);
		groups.set(sector, existing);
	}

	return groups;
}

/**
 * Group companies by industry
 */
function groupByIndustry(companies: CompanyData[]): Map<string, CompanyData[]> {
	const groups = new Map<string, CompanyData[]>();

	for (const company of companies) {
		const industry = company.industry ?? "Unknown";
		const existing = groups.get(industry) ?? [];
		existing.push(company);
		groups.set(industry, existing);
	}

	return groups;
}

/**
 * Build sector peer edges (RELATED_TO with SECTOR_PEER type)
 * Creates bidirectional peer relationships within each sector
 */
function buildSectorPeerEdges(companies: CompanyData[], maxPeersPerCompany: number): EdgeInput[] {
	const edges: EdgeInput[] = [];
	const sectorGroups = groupBySector(companies);
	const edgeSet = new Set<string>();

	for (const [_sector, peers] of sectorGroups) {
		if (peers.length < 2) {
			continue;
		}

		// For each company in the sector, create edges to other peers
		// Limit to maxPeersPerCompany to avoid hub explosion
		for (let i = 0; i < peers.length; i++) {
			const source = peers[i];
			if (!source) {
				continue;
			}

			let edgesCreated = 0;
			for (let j = 0; j < peers.length && edgesCreated < maxPeersPerCompany; j++) {
				if (i === j) {
					continue;
				}

				const target = peers[j];
				if (!target) {
					continue;
				}

				// Create deterministic edge key to avoid duplicates
				const edgeKey = [source.symbol, target.symbol].sort().join("->");
				if (edgeSet.has(edgeKey)) {
					continue;
				}

				edgeSet.add(edgeKey);

				const edgeData: RelatedToEdge = {
					source_id: source.symbol,
					target_id: target.symbol,
					relationship_type: "SECTOR_PEER" as RelationshipType,
				};

				edges.push({
					sourceId: edgeData.source_id,
					targetId: edgeData.target_id,
					edgeType: "RELATED_TO",
					properties: {
						relationship_type: edgeData.relationship_type,
					},
				});

				edgesCreated++;
			}
		}
	}

	return edges;
}

/**
 * Build industry peer edges (more specific than sector peers)
 * Uses SECTOR_PEER type but with industry-level grouping
 */
function buildIndustryPeerEdges(
	companies: CompanyData[],
	maxPeersPerCompany: number,
	existingEdges: Set<string>
): EdgeInput[] {
	const edges: EdgeInput[] = [];
	const industryGroups = groupByIndustry(companies);

	for (const [_industry, peers] of industryGroups) {
		if (peers.length < 2) {
			continue;
		}

		for (let i = 0; i < peers.length; i++) {
			const source = peers[i];
			if (!source) {
				continue;
			}

			let edgesCreated = 0;
			for (let j = 0; j < peers.length && edgesCreated < maxPeersPerCompany; j++) {
				if (i === j) {
					continue;
				}

				const target = peers[j];
				if (!target) {
					continue;
				}

				const edgeKey = [source.symbol, target.symbol].sort().join("->");
				if (existingEdges.has(edgeKey)) {
					continue;
				}

				existingEdges.add(edgeKey);

				edges.push({
					sourceId: source.symbol,
					targetId: target.symbol,
					edgeType: "RELATED_TO",
					properties: {
						relationship_type: "SECTOR_PEER" as RelationshipType,
					},
				});

				edgesCreated++;
			}
		}
	}

	return edges;
}

// ============================================
// Correlation-Based Relationship Building
// ============================================

/**
 * Calculate Pearson correlation coefficient between two return series
 */
export function calculateCorrelation(returnsA: number[], returnsB: number[]): number {
	if (returnsA.length !== returnsB.length || returnsA.length < 2) {
		return 0;
	}

	const n = returnsA.length;
	const meanA = returnsA.reduce((sum, v) => sum + v, 0) / n;
	const meanB = returnsB.reduce((sum, v) => sum + v, 0) / n;

	let numerator = 0;
	let sumSqA = 0;
	let sumSqB = 0;

	for (let i = 0; i < n; i++) {
		const devA = (returnsA[i] ?? 0) - meanA;
		const devB = (returnsB[i] ?? 0) - meanB;
		numerator += devA * devB;
		sumSqA += devA * devA;
		sumSqB += devB * devB;
	}

	const denominator = Math.sqrt(sumSqA * sumSqB);
	if (denominator === 0) {
		return 0;
	}

	return numerator / denominator;
}

/**
 * Calculate daily returns from price series
 */
export function calculateReturns(prices: number[]): number[] {
	const returns: number[] = [];
	for (let i = 1; i < prices.length; i++) {
		const prev = prices[i - 1];
		const curr = prices[i];
		if (prev && prev > 0 && curr !== undefined) {
			returns.push((curr - prev) / prev);
		}
	}
	return returns;
}

/**
 * Build correlation pair edges (RELATED_TO with COMPETITOR type)
 * High correlation suggests competitive or co-movement relationship
 */
function buildCorrelationPeerEdges(
	pairs: CorrelationPair[],
	options: CorrelationAnalysisOptions,
	existingEdges: Set<string>
): EdgeInput[] {
	const edges: EdgeInput[] = [];
	const minCorrelation = options.minCorrelation ?? 0.7;
	const maxPairsPerSymbol = options.maxPairsPerSymbol ?? 10;

	// Filter pairs above threshold
	const validPairs = pairs.filter((p) => Math.abs(p.correlation) >= minCorrelation);

	// Sort by absolute correlation (strongest first)
	const sortedPairs = validPairs.toSorted(
		(a, b) => Math.abs(b.correlation) - Math.abs(a.correlation)
	);

	// Track edges per symbol to respect limit
	const edgesPerSymbol = new Map<string, number>();

	for (const pair of sortedPairs) {
		const countA = edgesPerSymbol.get(pair.symbolA) ?? 0;
		const countB = edgesPerSymbol.get(pair.symbolB) ?? 0;

		if (countA >= maxPairsPerSymbol || countB >= maxPairsPerSymbol) {
			continue;
		}

		const edgeKey = [pair.symbolA, pair.symbolB].sort().join("->");
		if (existingEdges.has(edgeKey)) {
			continue;
		}

		existingEdges.add(edgeKey);
		edgesPerSymbol.set(pair.symbolA, countA + 1);
		edgesPerSymbol.set(pair.symbolB, countB + 1);

		edges.push({
			sourceId: pair.symbolA,
			targetId: pair.symbolB,
			edgeType: "RELATED_TO",
			properties: {
				relationship_type: "COMPETITOR" as RelationshipType,
			},
		});
	}

	return edges;
}

// ============================================
// Supply Chain Relationship Building
// ============================================

/**
 * Build supply chain edges (DEPENDS_ON)
 */
function buildSupplyChainEdges(relationships: SupplyChainRelationship[]): EdgeInput[] {
	const edges: EdgeInput[] = [];

	for (const rel of relationships) {
		const edgeData: DependsOnEdge = {
			source_id: rel.sourceSymbol,
			target_id: rel.targetSymbol,
			relationship_type: rel.dependencyType,
			strength: Math.max(0, Math.min(1, rel.strength)),
		};

		edges.push({
			sourceId: edgeData.source_id,
			targetId: edgeData.target_id,
			edgeType: "DEPENDS_ON",
			properties: {
				relationship_type: edgeData.relationship_type,
				strength: edgeData.strength,
			},
		});
	}

	return edges;
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
		options: CompanyGraphBuildOptions = {}
	): Promise<CompanyGraphBuildResult> {
		const startTime = performance.now();
		const warnings: string[] = [];

		const maxPeersPerCompany = options.maxPeersPerCompany ?? 20;
		const includeIndustryPeers = options.includeIndustryPeers ?? true;
		const correlationOptions = options.correlationOptions ?? {};
		const batchSize = options.batchSize ?? 100;

		// Step 1: Upsert company nodes
		const companyNodes: Company[] = companies.map((c) => ({
			symbol: c.symbol,
			name: c.name ?? c.symbol,
			sector: c.sector ?? "Unknown",
			industry: c.industry ?? "Unknown",
			market_cap_bucket: getMarketCapBucket(c.marketCap),
		}));

		const nodeResult = await batchUpsertCompanyNodes(this.client, companyNodes);
		if (nodeResult.errors.length > 0) {
			warnings.push(...nodeResult.errors.slice(0, 10));
			if (nodeResult.errors.length > 10) {
				warnings.push(`...and ${nodeResult.errors.length - 10} more node errors`);
			}
		}

		// Step 2: Build sector peer edges
		const sectorPeerEdges = buildSectorPeerEdges(companies, maxPeersPerCompany);
		const existingEdges = new Set(
			sectorPeerEdges.map((e) => [e.sourceId, e.targetId].sort().join("->"))
		);

		// Step 3: Build industry peer edges (if enabled)
		let industryPeerEdges: EdgeInput[] = [];
		if (includeIndustryPeers) {
			industryPeerEdges = buildIndustryPeerEdges(companies, maxPeersPerCompany, existingEdges);
		}

		// Step 4: Build correlation-based peer edges
		const correlationEdges = buildCorrelationPeerEdges(
			correlationPairs,
			correlationOptions,
			existingEdges
		);

		// Step 5: Build supply chain edges
		const supplyChainEdges = buildSupplyChainEdges(supplyChainRelationships);

		// Step 6: Batch create all edges
		const allEdges = [
			...sectorPeerEdges,
			...industryPeerEdges,
			...correlationEdges,
			...supplyChainEdges,
		];

		let totalEdgesCreated = 0;
		for (let i = 0; i < allEdges.length; i += batchSize) {
			const batch = allEdges.slice(i, i + batchSize);
			const batchResult = await batchCreateEdges(this.client, batch);
			totalEdgesCreated += batchResult.successful.length;

			if (batchResult.failed.length > 0) {
				const failedCount = batchResult.failed.length;
				warnings.push(`Batch ${Math.floor(i / batchSize) + 1}: ${failedCount} edges failed`);
			}
		}

		return {
			companiesUpserted: nodeResult.successful,
			sectorPeerEdges: sectorPeerEdges.length,
			industryPeerEdges: industryPeerEdges.length,
			correlationPeerEdges: correlationEdges.length,
			supplyChainEdges: supplyChainEdges.length,
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
		relationshipType: RelationshipType
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
		strength: number
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
		relationshipTypes?: RelationshipType[]
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

			return result.data.map((r) => ({
				symbol: r.target_symbol,
				relationshipType: r.relationship_type,
			}));
		} catch {
			return [];
		}
	}

	/**
	 * Get company dependencies (supply chain)
	 */
	async getCompanyDependencies(
		symbol: string
	): Promise<{ symbol: string; dependencyType: DependencyType; strength: number }[]> {
		try {
			const result = await this.client.query<
				Array<{ target_symbol: string; relationship_type: DependencyType; strength: number }>
			>("getCompanyDependencies", { symbol });

			return result.data.map((r) => ({
				symbol: r.target_symbol,
				dependencyType: r.relationship_type,
				strength: r.strength,
			}));
		} catch {
			return [];
		}
	}

	/**
	 * Get companies that depend on a given company
	 */
	async getDependentCompanies(
		symbol: string
	): Promise<{ symbol: string; dependencyType: DependencyType; strength: number }[]> {
		try {
			const result = await this.client.query<
				Array<{ source_symbol: string; relationship_type: DependencyType; strength: number }>
			>("getDependentCompanies", { symbol });

			return result.data.map((r) => ({
				symbol: r.source_symbol,
				dependencyType: r.relationship_type,
				strength: r.strength,
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
		relationships: SupplyChainRelationship[]
	): Promise<{ successful: number; failed: number; errors: string[] }> {
		const edges = buildSupplyChainEdges(relationships);
		const batchResult = await batchCreateEdges(this.client, edges);

		return {
			successful: batchResult.successful.length,
			failed: batchResult.failed.length,
			errors: batchResult.failed.map((f) => f.error ?? f.id),
		};
	}

	/**
	 * Add correlation-based relationships from price analysis
	 */
	async addCorrelationRelationships(
		pairs: CorrelationPair[],
		options: CorrelationAnalysisOptions = {}
	): Promise<{ successful: number; failed: number; errors: string[] }> {
		const existingEdges = new Set<string>();
		const edges = buildCorrelationPeerEdges(pairs, options, existingEdges);
		const batchResult = await batchCreateEdges(this.client, edges);

		return {
			successful: batchResult.successful.length,
			failed: batchResult.failed.length,
			errors: batchResult.failed.map((f) => f.error ?? f.id),
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
