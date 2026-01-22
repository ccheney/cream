/**
 * Decide Phase - Stub Agents
 *
 * Stub agent implementations for test mode.
 * These provide deterministic, fast responses without LLM calls.
 */

import type {
	Approval,
	FundamentalsAnalysis,
	Research,
	SentimentAnalysis,
	WorkflowDecisionPlan,
} from "./types.js";

// ============================================
// Analyst Stubs
// ============================================

export async function runNewsAnalystStub(instruments: string[]): Promise<SentimentAnalysis[]> {
	return instruments.map((instrument) => ({
		instrument_id: instrument,
		event_impacts: [],
		overall_sentiment: "NEUTRAL",
		sentiment_strength: 0.5,
		duration_expectation: "DAYS",
		linked_event_ids: [],
	}));
}

export async function runFundamentalsAnalystStub(
	instruments: string[],
): Promise<FundamentalsAnalysis[]> {
	return instruments.map((instrument) => ({
		instrument_id: instrument,
		fundamental_drivers: ["Strong earnings growth"],
		fundamental_headwinds: ["High valuation"],
		valuation_context: "Trading at 25x P/E",
		macro_context: "Fed on hold, stable rates",
		event_risk: [],
		fundamental_thesis: "Fundamentally sound but priced for perfection.",
		linked_event_ids: [],
	}));
}

// ============================================
// Researcher Stubs
// ============================================

export async function runBullishResearcherStub(instruments: string[]): Promise<Research[]> {
	return instruments.map((instrument) => ({
		instrument_id: instrument,
		thesis: "Potential for breakout if resistance breaks.",
		supporting_factors: [
			{ factor: "Strong earnings", source: "FUNDAMENTAL", strength: "MODERATE" },
		],
		conviction_level: 0.4,
		memory_case_ids: [],
		strongest_counterargument: "High valuation limits upside",
	}));
}

export async function runBearishResearcherStub(instruments: string[]): Promise<Research[]> {
	return instruments.map((instrument) => ({
		instrument_id: instrument,
		thesis: "Elevated valuation creates downside risk.",
		supporting_factors: [{ factor: "High P/E", source: "FUNDAMENTAL", strength: "MODERATE" }],
		conviction_level: 0.4,
		memory_case_ids: [],
		strongest_counterargument: "Strong earnings momentum",
	}));
}

// ============================================
// Trader Stub
// ============================================

export async function runTraderAgentStub(
	cycleId: string,
	bullish: Research[],
	_bearish: Research[],
): Promise<WorkflowDecisionPlan> {
	return {
		cycleId,
		timestamp: new Date().toISOString(),
		decisions: bullish.map((br) => ({
			decisionId: `dec-${br.instrument_id}-${Date.now()}`,
			instrumentId: br.instrument_id,
			action: "HOLD" as const,
			direction: "FLAT" as const,
			size: { value: 0, unit: "SHARES" },
			strategyFamily: "EQUITY_LONG",
			timeHorizon: "SWING",
			rationale: {
				summary: "No clear edge. Bull and bear cases balanced.",
				bullishFactors: ["Strong earnings"],
				bearishFactors: ["High valuation"],
				decisionLogic: "Conviction delta < 0.2, staying flat",
				memoryReferences: [],
			},
			thesisState: "WATCHING",
			confidence: br.conviction_level,
		})),
		portfolioNotes: "No new positions. Monitoring for clearer setups.",
	};
}

// ============================================
// Approver Stubs
// ============================================

export async function runRiskManagerStub(plan: WorkflowDecisionPlan): Promise<Approval> {
	return {
		verdict: "APPROVE",
		approvedDecisionIds: plan.decisions.map((d) => d.decisionId),
		rejectedDecisionIds: [],
		violations: [],
		required_changes: [],
		notes: "HOLD decisions carry no new risk.",
	};
}

export async function runCriticStub(plan: WorkflowDecisionPlan): Promise<Approval> {
	return {
		verdict: "APPROVE",
		approvedDecisionIds: plan.decisions.map((d) => d.decisionId),
		rejectedDecisionIds: [],
		violations: [],
		required_changes: [],
		notes: "Plan is logically consistent.",
	};
}
