/**
 * Macro Graph Builder Service
 *
 * Populates macro entity relationship graph in HelixDB with:
 * - MacroEntity nodes for economic factors (rates, commodities, currencies, etc.)
 * - AFFECTED_BY edges linking companies to macro factors with sensitivity scores
 * - RELATES_TO_MACRO edges linking external events to macro factors
 *
 * @see docs/plans/04-memory-helixdb.md
 */

import type { AffectedByEdge, MacroEntity, RelatesToMacroEdge } from "@cream/helix-schema";

import type { HelixClient } from "../client.js";
import { batchCreateEdges, createEdge, type EdgeInput } from "../queries/mutations.js";

// ============================================
// Types
// ============================================

/**
 * Macro entity category for organization
 */
export type MacroCategory =
	| "INTEREST_RATES"
	| "COMMODITIES"
	| "CURRENCIES"
	| "VOLATILITY"
	| "CREDIT"
	| "ECONOMIC_INDICATORS";

/**
 * Predefined macro entity with category
 */
export interface PredefinedMacroEntity extends MacroEntity {
	category: MacroCategory;
	/** Symbol/ticker for data retrieval (e.g., "^TNX" for 10Y Treasury) */
	dataSymbol?: string;
}

/**
 * Company sensitivity to a macro factor
 */
export interface CompanySensitivity {
	companySymbol: string;
	macroEntityId: string;
	/** Sensitivity score (0-1) where 1 = highly sensitive */
	sensitivity: number;
	/** Whether this is a calculated or default sector sensitivity */
	source: "calculated" | "sector_default";
	/** Number of days used for calculation (if calculated) */
	lookbackDays?: number;
}

/**
 * Event-macro link for RELATES_TO_MACRO edges
 */
export interface EventMacroLink {
	eventId: string;
	macroEntityId: string;
}

/**
 * Build result statistics
 */
export interface MacroGraphBuildResult {
	macroEntitiesUpserted: number;
	sensitivityEdges: number;
	eventLinks: number;
	totalEdges: number;
	executionTimeMs: number;
	warnings: string[];
}

/**
 * Build options
 */
export interface MacroGraphBuildOptions {
	/** Batch size for edge creation (default: 100) */
	batchSize?: number;
}

// ============================================
// Predefined Macro Entities
// ============================================

/**
 * Standard macro entities that should be seeded
 */
export const PREDEFINED_MACRO_ENTITIES: PredefinedMacroEntity[] = [
	// Interest Rates
	{
		entity_id: "fed_funds_rate",
		name: "Federal Funds Rate",
		description: "Target interest rate set by the Federal Open Market Committee",
		frequency: "IRREGULAR",
		category: "INTEREST_RATES",
		dataSymbol: "FEDFUNDS",
	},
	{
		entity_id: "treasury_10y",
		name: "10-Year Treasury Yield",
		description: "Yield on 10-year US Treasury bonds, benchmark for long-term rates",
		frequency: "MONTHLY",
		category: "INTEREST_RATES",
		dataSymbol: "^TNX",
	},
	{
		entity_id: "treasury_2y",
		name: "2-Year Treasury Yield",
		description: "Yield on 2-year US Treasury bonds, sensitive to Fed policy",
		frequency: "MONTHLY",
		category: "INTEREST_RATES",
		dataSymbol: "^IRX",
	},
	{
		entity_id: "yield_curve",
		name: "Yield Curve (10Y-2Y)",
		description: "Spread between 10Y and 2Y Treasury yields, recession indicator",
		frequency: "MONTHLY",
		category: "INTEREST_RATES",
	},

	// Commodities
	{
		entity_id: "oil_wti",
		name: "WTI Crude Oil",
		description: "West Texas Intermediate crude oil price, energy sector driver",
		frequency: "MONTHLY",
		category: "COMMODITIES",
		dataSymbol: "CL=F",
	},
	{
		entity_id: "gold",
		name: "Gold",
		description: "Gold spot price, safe-haven asset and inflation hedge",
		frequency: "MONTHLY",
		category: "COMMODITIES",
		dataSymbol: "GC=F",
	},
	{
		entity_id: "copper",
		name: "Copper",
		description: "Copper price, industrial activity indicator (Dr. Copper)",
		frequency: "MONTHLY",
		category: "COMMODITIES",
		dataSymbol: "HG=F",
	},

	// Currencies
	{
		entity_id: "dxy",
		name: "US Dollar Index (DXY)",
		description: "Trade-weighted index of US dollar vs major currencies",
		frequency: "MONTHLY",
		category: "CURRENCIES",
		dataSymbol: "DX-Y.NYB",
	},
	{
		entity_id: "eurusd",
		name: "EUR/USD",
		description: "Euro to US Dollar exchange rate",
		frequency: "MONTHLY",
		category: "CURRENCIES",
		dataSymbol: "EURUSD=X",
	},
	{
		entity_id: "usdjpy",
		name: "USD/JPY",
		description: "US Dollar to Japanese Yen exchange rate, carry trade indicator",
		frequency: "MONTHLY",
		category: "CURRENCIES",
		dataSymbol: "USDJPY=X",
	},

	// Volatility
	{
		entity_id: "vix",
		name: "VIX",
		description: "CBOE Volatility Index, market fear gauge",
		frequency: "MONTHLY",
		category: "VOLATILITY",
		dataSymbol: "^VIX",
	},
	{
		entity_id: "move",
		name: "MOVE Index",
		description: "Bond market volatility index",
		frequency: "MONTHLY",
		category: "VOLATILITY",
	},

	// Credit
	{
		entity_id: "hy_spread",
		name: "High Yield Spread",
		description: "Spread between high yield bonds and treasuries, risk appetite indicator",
		frequency: "MONTHLY",
		category: "CREDIT",
	},
	{
		entity_id: "ig_spread",
		name: "Investment Grade Spread",
		description: "Spread between investment grade bonds and treasuries",
		frequency: "MONTHLY",
		category: "CREDIT",
	},

	// Economic Indicators
	{
		entity_id: "gdp",
		name: "GDP Growth",
		description: "US Gross Domestic Product growth rate",
		frequency: "QUARTERLY",
		category: "ECONOMIC_INDICATORS",
		dataSymbol: "GDP",
	},
	{
		entity_id: "cpi",
		name: "Consumer Price Index",
		description: "Inflation measure based on consumer prices",
		frequency: "MONTHLY",
		category: "ECONOMIC_INDICATORS",
		dataSymbol: "CPIAUCSL",
	},
	{
		entity_id: "unemployment",
		name: "Unemployment Rate",
		description: "US unemployment rate",
		frequency: "MONTHLY",
		category: "ECONOMIC_INDICATORS",
		dataSymbol: "UNRATE",
	},
	{
		entity_id: "pmi_manufacturing",
		name: "ISM Manufacturing PMI",
		description: "Purchasing Managers Index for manufacturing sector",
		frequency: "MONTHLY",
		category: "ECONOMIC_INDICATORS",
	},
	{
		entity_id: "pmi_services",
		name: "ISM Services PMI",
		description: "Purchasing Managers Index for services sector",
		frequency: "MONTHLY",
		category: "ECONOMIC_INDICATORS",
	},
];

// ============================================
// Sector Default Sensitivities
// ============================================

/**
 * Default sensitivities by sector to common macro factors
 * Values are approximate and should be refined with actual data
 */
export const SECTOR_DEFAULT_SENSITIVITIES: Record<string, Record<string, number>> = {
	"Financial Services": {
		fed_funds_rate: 0.9,
		treasury_10y: 0.85,
		treasury_2y: 0.8,
		yield_curve: 0.8,
		hy_spread: 0.7,
		ig_spread: 0.6,
	},
	Technology: {
		treasury_10y: 0.7,
		dxy: 0.5,
		vix: 0.6,
		gdp: 0.5,
	},
	Energy: {
		oil_wti: 0.95,
		dxy: 0.6,
		gdp: 0.6,
	},
	"Basic Materials": {
		copper: 0.8,
		gold: 0.6,
		dxy: 0.5,
		gdp: 0.6,
	},
	"Consumer Cyclical": {
		unemployment: 0.7,
		gdp: 0.7,
		cpi: 0.5,
	},
	"Consumer Defensive": {
		cpi: 0.6,
		unemployment: 0.4,
	},
	Healthcare: {
		treasury_10y: 0.4,
		gdp: 0.3,
	},
	Utilities: {
		treasury_10y: 0.8,
		fed_funds_rate: 0.7,
	},
	"Real Estate": {
		treasury_10y: 0.9,
		fed_funds_rate: 0.85,
		yield_curve: 0.6,
	},
	Industrials: {
		copper: 0.6,
		pmi_manufacturing: 0.8,
		gdp: 0.65,
		oil_wti: 0.5,
	},
	"Communication Services": {
		treasury_10y: 0.5,
		gdp: 0.5,
	},
};

// ============================================
// Helper Functions
// ============================================

/**
 * Calculate rolling correlation between two return series
 */
export function calculateRollingCorrelation(returnsA: number[], returnsB: number[]): number {
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
 * Convert correlation to sensitivity score (0-1)
 * Takes absolute value since both positive and negative correlations indicate sensitivity
 */
export function correlationToSensitivity(correlation: number): number {
	return Math.min(1, Math.abs(correlation));
}

/**
 * Get default sensitivities for a company based on sector
 */
export function getSectorDefaultSensitivities(sector: string): CompanySensitivity[] {
	const sectorSensitivities = SECTOR_DEFAULT_SENSITIVITIES[sector];
	if (!sectorSensitivities) {
		return [];
	}

	return Object.entries(sectorSensitivities).map(([macroEntityId, sensitivity]) => ({
		companySymbol: "", // Will be filled in by caller
		macroEntityId,
		sensitivity,
		source: "sector_default" as const,
	}));
}

// ============================================
// Macro Node Operations
// ============================================

/**
 * Upsert a macro entity node in HelixDB
 */
async function upsertMacroEntity(
	client: HelixClient,
	entity: MacroEntity
): Promise<{ success: boolean; error?: string }> {
	try {
		await client.query("upsertMacroEntity", {
			entity_id: entity.entity_id,
			name: entity.name,
			description: entity.description,
			frequency: entity.frequency,
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
 * Batch upsert macro entity nodes
 */
async function batchUpsertMacroEntities(
	client: HelixClient,
	entities: MacroEntity[]
): Promise<{ successful: number; failed: number; errors: string[] }> {
	const errors: string[] = [];
	let successful = 0;
	let failed = 0;

	for (const entity of entities) {
		const result = await upsertMacroEntity(client, entity);
		if (result.success) {
			successful++;
		} else {
			failed++;
			if (result.error) {
				errors.push(`${entity.entity_id}: ${result.error}`);
			}
		}
	}

	return { successful, failed, errors };
}

// ============================================
// Edge Building Functions
// ============================================

/**
 * Build AFFECTED_BY edges from company sensitivities
 */
function buildAffectedByEdges(sensitivities: CompanySensitivity[]): EdgeInput[] {
	return sensitivities.map((s) => {
		const edgeData: AffectedByEdge = {
			source_id: s.companySymbol,
			target_id: s.macroEntityId,
			sensitivity: Math.max(0, Math.min(1, s.sensitivity)),
		};

		return {
			sourceId: edgeData.source_id,
			targetId: edgeData.target_id,
			edgeType: "AFFECTED_BY",
			properties: {
				sensitivity: edgeData.sensitivity,
			},
		};
	});
}

/**
 * Build RELATES_TO_MACRO edges from event-macro links
 */
function buildRelatesToMacroEdges(links: EventMacroLink[]): EdgeInput[] {
	return links.map((link) => {
		const edgeData: RelatesToMacroEdge = {
			source_id: link.eventId,
			target_id: link.macroEntityId,
		};

		return {
			sourceId: edgeData.source_id,
			targetId: edgeData.target_id,
			edgeType: "RELATES_TO_MACRO",
			properties: {},
		};
	});
}

// ============================================
// Main Builder Class
// ============================================

/**
 * Macro Graph Builder
 *
 * Populates and maintains macro entity relationships in HelixDB.
 */
export class MacroGraphBuilder {
	constructor(private readonly client: HelixClient) {}

	/**
	 * Seed predefined macro entities
	 */
	async seedMacroEntities(): Promise<{ successful: number; failed: number; errors: string[] }> {
		const entities: MacroEntity[] = PREDEFINED_MACRO_ENTITIES.map((e) => ({
			entity_id: e.entity_id,
			name: e.name,
			description: e.description,
			frequency: e.frequency,
		}));

		return batchUpsertMacroEntities(this.client, entities);
	}

	/**
	 * Build macro graph with sensitivities
	 *
	 * @param sensitivities - Company sensitivity data
	 * @param eventLinks - Event-macro relationships
	 * @param options - Build options
	 */
	async build(
		sensitivities: CompanySensitivity[],
		eventLinks: EventMacroLink[] = [],
		options: MacroGraphBuildOptions = {}
	): Promise<MacroGraphBuildResult> {
		const startTime = performance.now();
		const warnings: string[] = [];
		const batchSize = options.batchSize ?? 100;

		// Step 1: Seed macro entities
		const entityResult = await this.seedMacroEntities();
		if (entityResult.errors.length > 0) {
			warnings.push(...entityResult.errors.slice(0, 10));
			if (entityResult.errors.length > 10) {
				warnings.push(`...and ${entityResult.errors.length - 10} more entity errors`);
			}
		}

		// Step 2: Build AFFECTED_BY edges
		const sensitivityEdges = buildAffectedByEdges(sensitivities);

		// Step 3: Build RELATES_TO_MACRO edges
		const eventEdges = buildRelatesToMacroEdges(eventLinks);

		// Step 4: Batch create all edges
		const allEdges = [...sensitivityEdges, ...eventEdges];

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
			macroEntitiesUpserted: entityResult.successful,
			sensitivityEdges: sensitivityEdges.length,
			eventLinks: eventEdges.length,
			totalEdges: totalEdgesCreated,
			executionTimeMs: performance.now() - startTime,
			warnings,
		};
	}

	/**
	 * Add sensitivity edge for a company
	 */
	async addCompanySensitivity(
		companySymbol: string,
		macroEntityId: string,
		sensitivity: number
	): Promise<{ success: boolean; error?: string }> {
		const result = await createEdge(this.client, {
			sourceId: companySymbol,
			targetId: macroEntityId,
			edgeType: "AFFECTED_BY",
			properties: {
				sensitivity: Math.max(0, Math.min(1, sensitivity)),
			},
		});
		return { success: result.success, error: result.error };
	}

	/**
	 * Add sector default sensitivities for a company
	 */
	async addSectorDefaults(
		companySymbol: string,
		sector: string
	): Promise<{ successful: number; failed: number }> {
		const defaults = getSectorDefaultSensitivities(sector);
		if (defaults.length === 0) {
			return { successful: 0, failed: 0 };
		}

		const sensitivities = defaults.map((d) => ({
			...d,
			companySymbol,
		}));

		const edges = buildAffectedByEdges(sensitivities);
		const result = await batchCreateEdges(this.client, edges);

		return {
			successful: result.successful.length,
			failed: result.failed.length,
		};
	}

	/**
	 * Link an event to a macro entity
	 */
	async linkEventToMacro(
		eventId: string,
		macroEntityId: string
	): Promise<{ success: boolean; error?: string }> {
		const result = await createEdge(this.client, {
			sourceId: eventId,
			targetId: macroEntityId,
			edgeType: "RELATES_TO_MACRO",
			properties: {},
		});
		return { success: result.success, error: result.error };
	}

	/**
	 * Get companies affected by a macro entity
	 */
	async getCompaniesAffectedByMacro(
		macroEntityId: string
	): Promise<{ symbol: string; sensitivity: number }[]> {
		try {
			const result = await this.client.query<Array<{ source_symbol: string; sensitivity: number }>>(
				"getCompaniesAffectedByMacro",
				{ macro_entity_id: macroEntityId }
			);

			return result.data.map((r) => ({
				symbol: r.source_symbol,
				sensitivity: r.sensitivity,
			}));
		} catch {
			return [];
		}
	}

	/**
	 * Get macro factors affecting a company
	 */
	async getMacroFactorsForCompany(
		companySymbol: string
	): Promise<{ entityId: string; name: string; sensitivity: number }[]> {
		try {
			const result = await this.client.query<
				Array<{ entity_id: string; name: string; sensitivity: number }>
			>("getMacroFactorsForCompany", { symbol: companySymbol });

			return result.data.map((r) => ({
				entityId: r.entity_id,
				name: r.name,
				sensitivity: r.sensitivity,
			}));
		} catch {
			return [];
		}
	}

	/**
	 * Get all macro entities
	 */
	async getAllMacroEntities(): Promise<MacroEntity[]> {
		try {
			const result = await this.client.query<MacroEntity[]>("getAllMacroEntities", {});
			return result.data;
		} catch {
			return [];
		}
	}

	/**
	 * Get macro entities by category
	 */
	getMacroEntitiesByCategory(category: MacroCategory): PredefinedMacroEntity[] {
		return PREDEFINED_MACRO_ENTITIES.filter((e) => e.category === category);
	}
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a MacroGraphBuilder instance
 */
export function createMacroGraphBuilder(client: HelixClient): MacroGraphBuilder {
	return new MacroGraphBuilder(client);
}
