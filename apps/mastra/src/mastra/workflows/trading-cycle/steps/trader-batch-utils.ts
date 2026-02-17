import type { z } from "zod";
import type {
	CandleSummarySchema,
	Constraints,
	DecisionSchema,
	EnrichedPosition,
	FundamentalsAnalysisSchema,
	MemoryCaseSchema,
	PredictionMarketSignalsSchema,
	QuoteDataSchema,
	RecentClose,
	RegimeDataSchema,
	ResearchSchema,
	SentimentAnalysisSchema,
} from "../schemas.js";
import { buildTraderPrompt } from "./trader-prompts.js";

export type NormalizedTraderInput = {
	regimeLabels: Record<string, z.infer<typeof RegimeDataSchema>>;
	constraints: Constraints | undefined;
	newsAnalysis: z.infer<typeof SentimentAnalysisSchema>[];
	fundamentalsAnalysis: z.infer<typeof FundamentalsAnalysisSchema>[];
	bullishResearch: z.infer<typeof ResearchSchema>[];
	bearishResearch: z.infer<typeof ResearchSchema>[];
	recentCloses: RecentClose[];
	quotes: Record<string, z.infer<typeof QuoteDataSchema>>;
	memoryCases: z.infer<typeof MemoryCaseSchema>[];
	candleSummaries: z.infer<typeof CandleSummarySchema>[];
	predictionMarketSignals: z.infer<typeof PredictionMarketSignalsSchema> | undefined;
	positions: EnrichedPosition[];
};

export type TraderBatchState = {
	batch: string[];
	batchIndex: number;
	batchCount: number;
	batchSet: Set<string>;
	batchPositions: EnrichedPosition[];
	batchQuotes: Record<string, z.infer<typeof QuoteDataSchema>>;
	batchRecentCloses: RecentClose[];
};

export type TraderBatchOutcome = {
	decisions: z.infer<typeof DecisionSchema>[];
	portfolioNotes?: string;
	error?: string;
};

export function createBatchState(
	batch: string[],
	batchIndex: number,
	batchCount: number,
	input: NormalizedTraderInput,
): TraderBatchState {
	const batchSet = new Set(batch);
	return {
		batch,
		batchIndex,
		batchCount,
		batchSet,
		batchPositions: input.positions.filter((p) => batchSet.has(p.symbol)),
		batchQuotes: Object.fromEntries(
			Object.entries(input.quotes).filter(([symbol]) => batchSet.has(symbol)),
		),
		batchRecentCloses: input.recentCloses.filter((c) => batchSet.has(c.symbol)),
	};
}

export function buildBatchPrompt(
	cycleId: string,
	batchState: TraderBatchState,
	input: NormalizedTraderInput,
	priorDecisions: z.infer<typeof DecisionSchema>[],
): string {
	return buildTraderPrompt(
		cycleId,
		batchState.batch,
		input.regimeLabels,
		input.constraints,
		input.newsAnalysis,
		input.fundamentalsAnalysis,
		input.bullishResearch,
		input.bearishResearch,
		batchState.batchRecentCloses,
		batchState.batchQuotes,
		input.memoryCases,
		input.candleSummaries,
		input.predictionMarketSignals,
		batchState.batchPositions,
		priorDecisions,
	);
}

export function isDecisionPlan(
	value: unknown,
): value is { decisions: z.infer<typeof DecisionSchema>[] } {
	return (
		!!value &&
		typeof value === "object" &&
		"decisions" in value &&
		Array.isArray((value as Record<string, unknown>).decisions)
	);
}

export function logOffBatchDecisions(
	batchState: TraderBatchState,
	allDecisions: z.infer<typeof DecisionSchema>[],
	batchDecisions: z.infer<typeof DecisionSchema>[],
): {
	offBatchCount: number;
	offBatchSymbols: string[];
} | null {
	const offBatchCount = allDecisions.length - batchDecisions.length;
	if (offBatchCount <= 0) return null;
	const offBatchSymbols = allDecisions
		.filter((decision) => !batchState.batchSet.has(decision.instrumentId))
		.map((decision) => decision.instrumentId);
	return { offBatchCount, offBatchSymbols };
}
