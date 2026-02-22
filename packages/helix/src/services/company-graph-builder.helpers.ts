import type {
	Company,
	DependencyType,
	DependsOnEdge,
	MarketCapBucket,
	RelatedToEdge,
	RelationshipType,
} from "@cream/helix-schema";

import type { HelixClient } from "../client.js";
import type { EdgeInput } from "../queries/mutations.js";
import type {
	CompanyData,
	CorrelationAnalysisOptions,
	CorrelationPair,
	SupplyChainRelationship,
} from "./company-graph-builder.js";

function createEdgeKey(sourceSymbol: string, targetSymbol: string): string {
	return [sourceSymbol, targetSymbol].toSorted().join("->");
}

function groupCompaniesByKey(
	companies: CompanyData[],
	getGroupKey: (company: CompanyData) => string,
): Map<string, CompanyData[]> {
	const groups = new Map<string, CompanyData[]>();

	for (const company of companies) {
		const groupKey = getGroupKey(company);
		const existing = groups.get(groupKey) ?? [];
		existing.push(company);
		groups.set(groupKey, existing);
	}

	return groups;
}

function addPeerEdgesForGroup(
	peers: CompanyData[],
	maxPeersPerCompany: number,
	existingEdges: Set<string>,
	edges: EdgeInput[],
): void {
	if (peers.length < 2) {
		return;
	}

	for (const [sourceIndex, source] of peers.entries()) {
		if (source) {
			addPeerEdgesForSource(source, sourceIndex, peers, maxPeersPerCompany, existingEdges, edges);
		}
	}
}

function addPeerEdgesForSource(
	source: CompanyData,
	sourceIndex: number,
	peers: CompanyData[],
	maxPeersPerCompany: number,
	existingEdges: Set<string>,
	edges: EdgeInput[],
): void {
	let edgesCreated = 0;
	for (const [targetIndex, target] of peers.entries()) {
		if (edgesCreated >= maxPeersPerCompany) {
			break;
		}
		if (!target || sourceIndex === targetIndex) {
			continue;
		}
		if (tryAddPeerEdge(source, target, existingEdges, edges)) {
			edgesCreated++;
		}
	}
}

function tryAddPeerEdge(
	source: CompanyData,
	target: CompanyData,
	existingEdges: Set<string>,
	edges: EdgeInput[],
): boolean {
	const edgeKey = createEdgeKey(source.symbol, target.symbol);
	if (existingEdges.has(edgeKey)) {
		return false;
	}
	existingEdges.add(edgeKey);

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
	return true;
}

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

export function toCompanyNodes(companies: CompanyData[]): Company[] {
	return companies.map((company) => ({
		symbol: company.symbol,
		name: company.name ?? company.symbol,
		sector: company.sector ?? "Unknown",
		industry: company.industry ?? "Unknown",
		market_cap_bucket: getMarketCapBucket(company.marketCap),
	}));
}

async function upsertCompanyNode(
	client: HelixClient,
	company: Company,
): Promise<{ success: boolean; error?: string }> {
	try {
		await client.query("InsertCompany", {
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

export async function batchUpsertCompanyNodes(
	client: HelixClient,
	companies: Company[],
): Promise<{ successful: number; failed: number; errors: string[] }> {
	const errors: string[] = [];
	let successful = 0;
	let failed = 0;

	for (const company of companies) {
		const result = await upsertCompanyNode(client, company);
		if (result.success) {
			successful++;
			continue;
		}
		failed++;
		if (result.error) {
			errors.push(`${company.symbol}: ${result.error}`);
		}
	}

	return { successful, failed, errors };
}

export function buildSectorPeerEdges(
	companies: CompanyData[],
	maxPeersPerCompany: number,
): EdgeInput[] {
	const edges: EdgeInput[] = [];
	const existingEdges = new Set<string>();
	const sectorGroups = groupCompaniesByKey(companies, (company) => company.sector ?? "Unknown");

	for (const peers of sectorGroups.values()) {
		addPeerEdgesForGroup(peers, maxPeersPerCompany, existingEdges, edges);
	}

	return edges;
}

export function buildIndustryPeerEdges(
	companies: CompanyData[],
	maxPeersPerCompany: number,
	existingEdges: Set<string>,
): EdgeInput[] {
	const edges: EdgeInput[] = [];
	const industryGroups = groupCompaniesByKey(companies, (company) => company.industry ?? "Unknown");

	for (const peers of industryGroups.values()) {
		addPeerEdgesForGroup(peers, maxPeersPerCompany, existingEdges, edges);
	}

	return edges;
}

export function buildCorrelationPeerEdges(
	pairs: CorrelationPair[],
	options: CorrelationAnalysisOptions,
	existingEdges: Set<string>,
): EdgeInput[] {
	const edges: EdgeInput[] = [];
	const minCorrelation = options.minCorrelation ?? 0.7;
	const maxPairsPerSymbol = options.maxPairsPerSymbol ?? 10;

	const validPairs = pairs.filter((pair) => Math.abs(pair.correlation) >= minCorrelation);
	const sortedPairs = validPairs.toSorted(
		(a, b) => Math.abs(b.correlation) - Math.abs(a.correlation),
	);
	const edgesPerSymbol = new Map<string, number>();

	for (const pair of sortedPairs) {
		const countA = edgesPerSymbol.get(pair.symbolA) ?? 0;
		const countB = edgesPerSymbol.get(pair.symbolB) ?? 0;
		if (countA >= maxPairsPerSymbol || countB >= maxPairsPerSymbol) {
			continue;
		}

		const edgeKey = createEdgeKey(pair.symbolA, pair.symbolB);
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

export function buildSupplyChainEdges(relationships: SupplyChainRelationship[]): EdgeInput[] {
	return relationships.map((relationship) => {
		const edgeData: DependsOnEdge = {
			source_id: relationship.sourceSymbol,
			target_id: relationship.targetSymbol,
			relationship_type: relationship.dependencyType as DependencyType,
			strength: Math.max(0, Math.min(1, relationship.strength)),
		};

		return {
			sourceId: edgeData.source_id,
			targetId: edgeData.target_id,
			edgeType: "DEPENDS_ON",
			properties: {
				relationship_type: edgeData.relationship_type,
				strength: edgeData.strength,
			},
		};
	});
}
