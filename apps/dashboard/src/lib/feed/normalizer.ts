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

type EventNormalizer = (data: unknown, timestamp: Date) => NormalizedEvent;

const EVENT_NORMALIZERS: Partial<Record<WebSocketMessage["type"], EventNormalizer>> = {
	quote: (data, timestamp) => normalizeQuote(data as QuoteData, timestamp),
	trade: (data, timestamp) => normalizeTrade(data as TradeData, timestamp),
	options_quote: (data, timestamp) => normalizeOptionsQuote(data as OptionsQuoteData, timestamp),
	options_trade: (data, timestamp) => normalizeOptionsTrade(data as OptionsTradeData, timestamp),
	decision: (data, timestamp) => normalizeDecision(data as DecisionData, timestamp),
	order: (data, timestamp) => normalizeOrder(data as OrderData, timestamp),
	alert: (data, timestamp) => normalizeAlert(data as AlertData, timestamp),
	agent_output: (data, timestamp) => normalizeAgentOutput(data as AgentOutputData, timestamp),
	cycle_progress: (data, timestamp) => normalizeCycleProgress(data as CycleProgressData, timestamp),
	aggregate: (data, timestamp) => normalizeAggregate(data as AggregateData, timestamp),
	agent_tool_call: (data, timestamp) =>
		normalizeAgentToolCall(data as AgentToolCallData, timestamp),
	agent_tool_result: (data, timestamp) =>
		normalizeAgentToolResult(data as AgentToolResultData, timestamp),
	agent_reasoning: (data, timestamp) =>
		normalizeAgentReasoning(data as AgentReasoningData, timestamp),
	agent_text_delta: (data, timestamp) =>
		normalizeAgentTextDelta(data as AgentTextDeltaData, timestamp),
	agent_status: (data, timestamp) => normalizeAgentStatus(data as AgentStatusData, timestamp),
	cycle_result: (data, timestamp) => normalizeCycleResult(data as CycleResultData, timestamp),
	decision_plan: (data, timestamp) => normalizeDecisionPlan(data as DecisionPlanData, timestamp),
};

export function normalizeEvent(message: WebSocketMessage): NormalizedEvent | null {
	const timestamp = new Date();
	const normalizer = EVENT_NORMALIZERS[message.type];
	if (normalizer) {
		return normalizer(message.data, timestamp);
	}

	return IGNORED_MESSAGE_TYPES.has(message.type)
		? null
		: normalizeSystem(message.data, message.type, timestamp);
}
