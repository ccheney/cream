/**
 * Universe Graph Sync Service
 *
 * Synchronizes trading universe with company relationship graph in HelixDB.
 * Call this when the universe is updated to refresh company nodes and relationships.
 *
 * @see docs/plans/04-memory-helixdb.md
 */

import type { HelixClient } from "../client.js";
import {
	type CompanyData,
	type CompanyGraphBuildOptions,
	type CompanyGraphBuildResult,
	type CorrelationPair,
	createCompanyGraphBuilder,
	type SupplyChainRelationship,
} from "./company-graph-builder.js";

// ============================================
// Types
// ============================================

/**
 * Resolved instrument from universe package
 * Matches the ResolvedInstrument interface from @cream/universe
 */
export interface ResolvedInstrument {
	symbol: string;
	source: string;
	name?: string;
	sector?: string;
	industry?: string;
	marketCap?: number;
	avgVolume?: number;
	price?: number;
}

/**
 * Universe sync options
 */
export interface UniverseSyncOptions extends CompanyGraphBuildOptions {
	/** Correlation pairs from price analysis (optional) */
	correlationPairs?: CorrelationPair[];
	/** Supply chain relationships from external data (optional) */
	supplyChainRelationships?: SupplyChainRelationship[];
}

/**
 * Universe sync result
 */
export interface UniverseSyncResult extends CompanyGraphBuildResult {
	/** Symbols that were synced */
	syncedSymbols: string[];
}

// ============================================
// Transform Functions
// ============================================

/**
 * Transform resolved instruments to company data for graph builder
 */
export function instrumentsToCompanyData(instruments: ResolvedInstrument[]): CompanyData[] {
	return instruments.map((i) => ({
		symbol: i.symbol,
		name: i.name,
		sector: i.sector,
		industry: i.industry,
		marketCap: i.marketCap,
	}));
}

// ============================================
// Sync Functions
// ============================================

/**
 * Sync universe to company graph
 *
 * Creates/updates company nodes and builds peer relationships
 * based on sector and industry groupings.
 *
 * @param client - HelixDB client
 * @param instruments - Resolved instruments from universe
 * @param options - Sync options
 */
export async function syncUniverseToGraph(
	client: HelixClient,
	instruments: ResolvedInstrument[],
	options: UniverseSyncOptions = {}
): Promise<UniverseSyncResult> {
	const builder = createCompanyGraphBuilder(client);
	const companyData = instrumentsToCompanyData(instruments);

	const result = await builder.build(
		companyData,
		options.correlationPairs ?? [],
		options.supplyChainRelationships ?? [],
		{
			maxPeersPerCompany: options.maxPeersPerCompany,
			includeIndustryPeers: options.includeIndustryPeers,
			correlationOptions: options.correlationOptions,
			batchSize: options.batchSize,
		}
	);

	return {
		...result,
		syncedSymbols: instruments.map((i) => i.symbol),
	};
}

/**
 * Incremental sync - add new companies without rebuilding all relationships
 *
 * Use this for adding individual companies rather than full universe refresh.
 */
export async function syncCompaniesToGraph(
	client: HelixClient,
	companies: CompanyData[]
): Promise<{ successful: number; failed: number; errors: string[] }> {
	const builder = createCompanyGraphBuilder(client);

	// Build with empty relationships - just upsert company nodes
	const result = await builder.build(companies, [], [], {
		maxPeersPerCompany: 0,
		includeIndustryPeers: false,
	});

	return {
		successful: result.companiesUpserted,
		failed: companies.length - result.companiesUpserted,
		errors: result.warnings,
	};
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a universe sync function bound to a specific client
 */
export function createUniverseSyncer(client: HelixClient) {
	return {
		sync: (instruments: ResolvedInstrument[], options?: UniverseSyncOptions) =>
			syncUniverseToGraph(client, instruments, options),
		syncCompanies: (companies: CompanyData[]) => syncCompaniesToGraph(client, companies),
	};
}
