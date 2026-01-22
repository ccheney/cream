/**
 * Position Enrichment Service
 *
 * Enriches broker positions with strategy, risk, and thesis metadata from the database.
 */

import type { ExecutionContext } from "@cream/domain";
import { PositionsRepository, type PositionWithMetadata } from "@cream/storage";
import type {
	EnrichedPortfolioPosition,
	PortfolioPosition,
	PositionRiskParams,
	PositionStrategy,
	PositionThesisContext,
} from "../types.js";

/**
 * Calculate the number of days a position has been held
 */
function calculateHoldingDays(openedAt: string): number {
	const openDate = new Date(openedAt);
	const now = new Date();
	const diffMs = now.getTime() - openDate.getTime();
	return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Map a DB position with metadata to an enriched portfolio position
 */
function mapDbPositionToEnriched(
	brokerPosition: PortfolioPosition,
	dbPosition: PositionWithMetadata,
): EnrichedPortfolioPosition {
	let strategy: PositionStrategy | null = null;
	if (dbPosition.strategy) {
		strategy = {
			strategyFamily: dbPosition.strategy.strategyFamily,
			timeHorizon: dbPosition.strategy.timeHorizon,
			confidenceScore: dbPosition.strategy.confidenceScore,
			riskScore: dbPosition.strategy.riskScore,
			rationale: dbPosition.strategy.rationale,
			bullishFactors: dbPosition.strategy.bullishFactors,
			bearishFactors: dbPosition.strategy.bearishFactors,
		};
	}

	let riskParams: PositionRiskParams | null = null;
	if (dbPosition.riskParams) {
		riskParams = {
			stopPrice: dbPosition.riskParams.stopPrice,
			targetPrice: dbPosition.riskParams.targetPrice,
			entryPrice: dbPosition.riskParams.entryPrice,
		};
	}

	let thesis: PositionThesisContext | null = null;
	if (dbPosition.thesis) {
		thesis = {
			thesisId: dbPosition.thesis.thesisId,
			state: dbPosition.thesis.state,
			entryThesis: dbPosition.thesis.entryThesis,
			invalidationConditions: dbPosition.thesis.invalidationConditions,
			conviction: dbPosition.thesis.conviction,
		};
	}

	return {
		...brokerPosition,
		positionId: dbPosition.id,
		decisionId: dbPosition.decisionId,
		openedAt: dbPosition.openedAt,
		holdingDays: calculateHoldingDays(dbPosition.openedAt),
		strategy,
		riskParams,
		thesis,
	};
}

/**
 * Create an unenriched position (when no DB record exists)
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
 * Enrich broker positions with database metadata
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

	const positionsRepo = new PositionsRepository();
	const dbPositions = await positionsRepo.findOpenWithMetadata(ctx.environment);

	// Create a map of DB positions by symbol for O(1) lookup
	const dbPositionsBySymbol = new Map<string, PositionWithMetadata>();
	for (const pos of dbPositions) {
		dbPositionsBySymbol.set(pos.symbol, pos);
	}

	// Merge broker positions with DB metadata
	return brokerPositions.map((brokerPos) => {
		const dbPos = dbPositionsBySymbol.get(brokerPos.symbol);

		if (dbPos) {
			return mapDbPositionToEnriched(brokerPos, dbPos);
		}

		return createUnenrichedPosition(brokerPos);
	});
}
