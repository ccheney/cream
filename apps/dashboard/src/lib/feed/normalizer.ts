/**
 * Event Normalizer
 *
 * Main normalizer that dispatches WebSocket messages to appropriate parsers.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 3.1
 */

import {
	normalizeAgentOutput,
	normalizeAgentReasoning,
	normalizeAgentStatus,
	normalizeAgentTextDelta,
	normalizeAgentToolCall,
	normalizeAgentToolResult,
	normalizeAggregate,
	normalizeAlert,
	normalizeCycleProgress,
	normalizeCycleResult,
	normalizeDecision,
	normalizeDecisionPlan,
	normalizeOptionsQuote,
	normalizeOptionsTrade,
	normalizeOrder,
	normalizeQuote,
	normalizeSystem,
	normalizeTrade,
} from "./parsers/index";
import type {
	AgentOutputData,
	AgentReasoningData,
	AgentStatusData,
	AgentTextDeltaData,
	AgentToolCallData,
	AgentToolResultData,
	AggregateData,
	AlertData,
	CycleProgressData,
	CycleResultData,
	DecisionData,
	DecisionPlanData,
	NormalizedEvent,
	OptionsQuoteData,
	OptionsTradeData,
	OrderData,
	QuoteData,
	TradeData,
	WebSocketMessage,
} from "./types";

const IGNORED_MESSAGE_TYPES = new Set([
	"pong",
	"subscribed",
	"unsubscribed",
	"portfolio",
	"system_status",
	"options_aggregate",
]);

export function normalizeEvent(message: WebSocketMessage): NormalizedEvent | null {
	const timestamp = new Date();
	const data = message.data as unknown;

	switch (message.type) {
		case "quote":
			return normalizeQuote(data as QuoteData, timestamp);

		case "trade":
			return normalizeTrade(data as TradeData, timestamp);

		case "options_quote":
			return normalizeOptionsQuote(data as OptionsQuoteData, timestamp);

		case "options_trade":
			return normalizeOptionsTrade(data as OptionsTradeData, timestamp);

		case "decision":
			return normalizeDecision(data as DecisionData, timestamp);

		case "order":
			return normalizeOrder(data as OrderData, timestamp);

		case "alert":
			return normalizeAlert(data as AlertData, timestamp);

		case "agent_output":
			return normalizeAgentOutput(data as AgentOutputData, timestamp);

		case "cycle_progress":
			return normalizeCycleProgress(data as CycleProgressData, timestamp);

		case "aggregate":
			return normalizeAggregate(data as AggregateData, timestamp);

		case "agent_tool_call":
			return normalizeAgentToolCall(data as AgentToolCallData, timestamp);

		case "agent_tool_result":
			return normalizeAgentToolResult(data as AgentToolResultData, timestamp);

		case "agent_reasoning":
			return normalizeAgentReasoning(data as AgentReasoningData, timestamp);

		case "agent_text_delta":
			return normalizeAgentTextDelta(data as AgentTextDeltaData, timestamp);

		case "agent_status":
			return normalizeAgentStatus(data as AgentStatusData, timestamp);

		case "cycle_result":
			return normalizeCycleResult(data as CycleResultData, timestamp);

		case "decision_plan":
			return normalizeDecisionPlan(data as DecisionPlanData, timestamp);

		default:
			if (IGNORED_MESSAGE_TYPES.has(message.type)) {
				return null;
			}
			return normalizeSystem(message.data, message.type, timestamp);
	}
}
