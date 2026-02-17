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

type ActiveThesis = NonNullable<
	Awaited<ReturnType<ThesisStateRepository["findActiveForInstrument"]>>
>;

interface DecisionSnapshot {
	id: string;
	stopPrice: number | null;
	targetPrice: number | null;
	entryPrice: number | null;
}

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

async function fetchActiveThesesBySymbol(
	thesisRepo: ThesisStateRepository,
	symbols: string[],
	environment: ExecutionContext["environment"],
): Promise<Map<string, ActiveThesis>> {
	const thesisPromises = symbols.map((symbol) =>
		thesisRepo.findActiveForInstrument(symbol, environment),
	);
	const theses = await Promise.all(thesisPromises);
	const thesesBySymbol = new Map<string, ActiveThesis>();
	for (let i = 0; i < symbols.length; i++) {
		const thesis = theses[i];
		if (thesis) {
			thesesBySymbol.set(symbols[i] as string, thesis);
		}
	}
	return thesesBySymbol;
}

function toDecisionSnapshot(decision: {
	id: string;
	stopPrice: number | null;
	targetPrice: number | null;
	entryPrice: number | null;
}): DecisionSnapshot {
	return {
		id: decision.id,
		stopPrice: decision.stopPrice,
		targetPrice: decision.targetPrice,
		entryPrice: decision.entryPrice,
	};
}

async function fetchLatestDecisionsBySymbol(
	decisionsRepo: DecisionsRepository,
	symbols: string[],
): Promise<Map<string, DecisionSnapshot>> {
	const decisionResults = await Promise.all(
		symbols.map((symbol) => decisionsRepo.findMany({ symbol }, { limit: 1, offset: 0 })),
	);

	const decisionsBySymbol = new Map<string, DecisionSnapshot>();
	for (let i = 0; i < symbols.length; i++) {
		const decision = decisionResults[i]?.data[0];
		if (decision) {
			decisionsBySymbol.set(symbols[i] as string, toDecisionSnapshot(decision));
		}
	}
	return decisionsBySymbol;
}

function buildThesisContext(thesis: ActiveThesis): PositionThesisContext {
	return {
		thesisId: thesis.thesisId,
		state: thesis.state,
		entryThesis: thesis.entryThesis,
		invalidationConditions: thesis.invalidationConditions,
		conviction: thesis.conviction,
	};
}

function buildRiskParams(decision: DecisionSnapshot | undefined): PositionRiskParams | null {
	if (!decision) {
		return null;
	}
	return {
		stopPrice: decision.stopPrice,
		targetPrice: decision.targetPrice,
		entryPrice: decision.entryPrice,
	};
}

function buildStrategy(thesis: ActiveThesis): PositionStrategy | null {
	if (!thesis.conviction && !thesis.entryThesis) {
		return null;
	}
	return {
		strategyFamily: null,
		timeHorizon: null,
		confidenceScore: thesis.conviction ?? null,
		riskScore: null,
		rationale: thesis.entryThesis,
		bullishFactors: [],
		bearishFactors: [],
	};
}

function enrichBrokerPosition(
	brokerPosition: PortfolioPosition,
	thesesBySymbol: Map<string, ActiveThesis>,
	decisionsBySymbol: Map<string, DecisionSnapshot>,
): EnrichedPortfolioPosition {
	const thesis = thesesBySymbol.get(brokerPosition.symbol);
	if (!thesis) {
		return createUnenrichedPosition(brokerPosition);
	}

	const decision = decisionsBySymbol.get(brokerPosition.symbol);
	return {
		...brokerPosition,
		positionId: null,
		decisionId: decision?.id ?? null,
		openedAt: thesis.entryDate,
		holdingDays: thesis.entryDate ? calculateDaysSince(thesis.entryDate) : null,
		strategy: buildStrategy(thesis),
		riskParams: buildRiskParams(decision),
		thesis: buildThesisContext(thesis),
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
	const symbols = brokerPositions.map((p) => p.symbol);
	const thesesBySymbol = await fetchActiveThesesBySymbol(thesisRepo, symbols, ctx.environment);
	const decisionsBySymbol = await fetchLatestDecisionsBySymbol(decisionsRepo, [
		...thesesBySymbol.keys(),
	]);
	return brokerPositions.map((position) =>
		enrichBrokerPosition(position, thesesBySymbol, decisionsBySymbol),
	);
}
