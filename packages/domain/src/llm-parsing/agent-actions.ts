import type { AgentType, ParseAttempt, ParseResult } from "./types";

const CRITICAL_AGENTS: AgentType[] = ["RiskManagerAgent", "CriticAgent"];
const TRADER_AGENT: AgentType = "TraderAgent";
const RESEARCH_AGENTS: AgentType[] = [
	"TechnicalAnalyst",
	"NewsSentimentAnalyst",
	"FundamentalsMacroAnalyst",
	"BullishResearchAgent",
	"BearishResearchAgent",
];

function getFailureAction(agentType?: AgentType): "REJECT" | "SKIP" {
	if (!agentType) {
		return "REJECT";
	}

	if (CRITICAL_AGENTS.includes(agentType) || agentType === TRADER_AGENT) {
		return "REJECT";
	}

	if (RESEARCH_AGENTS.includes(agentType)) {
		return "SKIP";
	}

	return "REJECT";
}

export function createFailureResult<T>(
	attempts: ParseAttempt[],
	finalError: string,
	agentType?: AgentType,
): ParseResult<T> {
	return {
		success: false,
		attempts,
		finalError,
		agentAction: getFailureAction(agentType),
	};
}

export function requiresRejectionOnFailure(agentType: AgentType): boolean {
	return CRITICAL_AGENTS.includes(agentType) || agentType === TRADER_AGENT;
}

export function allowsSkipOnFailure(agentType: AgentType): boolean {
	return RESEARCH_AGENTS.includes(agentType);
}
