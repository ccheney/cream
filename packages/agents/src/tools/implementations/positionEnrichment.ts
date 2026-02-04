/**
 * Position Enrichment Service
 *
 * Enriches broker positions with thesis metadata from the database.
 * Alpaca is the sole source of truth for positions - thesis data is joined by symbol.
 */

import type { ExecutionContext } from "@cream/domain";
import { DecisionsRepository, ThesisStateRepository } from "@cream/storage";
import type {
	EnrichedPortfolioPosition,
	PortfolioPosition,
	PositionRiskParams,
	PositionStrategy,
	PositionThesisContext,
} from "../types.js";

/**
 * Calculate the number of days since a date
 */
function calculateDaysSince(date: string | Date): number {
	const start = new Date(date);
	const now = new Date();
	const diffMs = now.getTime() - start.getTime();
	return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Create an unenriched position (when no thesis exists)
 */
function createUnenrichedPosition(brokerPosition: PortfolioPosition): EnrichedPortfolioPosition {
	return {
		...brokerPosition,
		positionId: null,
		decisionId: null,
		openedAt: null,
		holdingDays: null,
		strategy: null,
		riskParams: null,
		thesis: null,
	};
}

/**
 * Enrich broker positions with thesis and decision metadata
 *
 * @param brokerPositions - Positions from broker API
 * @param ctx - Execution context for environment
 * @returns Enriched positions with strategy/thesis metadata
 */
export async function enrichPositions(
	brokerPositions: PortfolioPosition[],
	ctx: ExecutionContext,
): Promise<EnrichedPortfolioPosition[]> {
	if (brokerPositions.length === 0) {
		return [];
	}

	const thesisRepo = new ThesisStateRepository();
	const decisionsRepo = new DecisionsRepository();

	// Get all symbols from broker positions
	const symbols = brokerPositions.map((p) => p.symbol);

	// Fetch active theses for all symbols in parallel
	const thesisPromises = symbols.map((symbol) =>
		thesisRepo.findActiveForInstrument(symbol, ctx.environment),
	);
	const theses = await Promise.all(thesisPromises);

	// Create a map of theses by symbol
	const thesesBySymbol = new Map<string, NonNullable<(typeof theses)[0]>>();
	for (let i = 0; i < symbols.length; i++) {
		const thesis = theses[i];
		if (thesis) {
			thesesBySymbol.set(symbols[i] as string, thesis);
		}
	}

	// Fetch recent decisions for symbols with theses
	const symbolsWithTheses = [...thesesBySymbol.keys()];
	const decisionPromises = symbolsWithTheses.map((symbol) =>
		decisionsRepo.findMany({ symbol }, { limit: 1, offset: 0 }),
	);
	const decisionResults = await Promise.all(decisionPromises);

	// Create a map of decisions by symbol
	const decisionsBySymbol = new Map<
		string,
		{ id: string; stopPrice: number | null; targetPrice: number | null; entryPrice: number | null }
	>();
	for (let i = 0; i < symbolsWithTheses.length; i++) {
		const result = decisionResults[i];
		const decision = result?.data[0];
		if (decision) {
			decisionsBySymbol.set(symbolsWithTheses[i] as string, {
				id: decision.id,
				stopPrice: decision.stopPrice,
				targetPrice: decision.targetPrice,
				entryPrice: decision.entryPrice,
			});
		}
	}

	// Enrich each broker position
	return brokerPositions.map((brokerPos) => {
		const thesis = thesesBySymbol.get(brokerPos.symbol);
		const decision = decisionsBySymbol.get(brokerPos.symbol);

		if (!thesis) {
			return createUnenrichedPosition(brokerPos);
		}

		// Build thesis context
		const thesisContext: PositionThesisContext = {
			thesisId: thesis.thesisId,
			state: thesis.state,
			entryThesis: thesis.entryThesis,
			invalidationConditions: thesis.invalidationConditions,
			conviction: thesis.conviction,
		};

		// Build risk params from decision if available
		let riskParams: PositionRiskParams | null = null;
		if (decision) {
			riskParams = {
				stopPrice: decision.stopPrice,
				targetPrice: decision.targetPrice,
				entryPrice: decision.entryPrice,
			};
		}

		// Build strategy from thesis conviction and rationale
		let strategy: PositionStrategy | null = null;
		if (thesis.conviction || thesis.entryThesis) {
			strategy = {
				strategyFamily: null,
				timeHorizon: null,
				confidenceScore: thesis.conviction ?? null,
				riskScore: null,
				rationale: thesis.entryThesis,
				bullishFactors: [],
				bearishFactors: [],
			};
		}

		return {
			...brokerPos,
			positionId: null, // No DB position ID - Alpaca is source of truth
			decisionId: decision?.id ?? null,
			openedAt: thesis.entryDate,
			holdingDays: thesis.entryDate ? calculateDaysSince(thesis.entryDate) : null,
			strategy,
			riskParams,
			thesis: thesisContext,
		};
	});
}
