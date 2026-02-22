import { z } from "zod/v4";
import { DecisionPlanSchema, DecisionSchema } from "../decision.js";
import { Channel } from "./channel.js";
import {
	AgentOutputDataSchema,
	AgentStatusDataSchema,
	AggregateDataSchema,
	AlertDataSchema,
	CycleProgressDataSchema,
	CycleResultDataSchema,
	OrderDataSchema,
	PortfolioDataSchema,
	QuoteDataSchema,
	ReasoningChunkDataSchema,
	ScannerAlertDataSchema,
	ScannerStatusDataSchema,
	SystemStatusDataSchema,
	TextDeltaChunkDataSchema,
	ToolCallChunkDataSchema,
	ToolResultChunkDataSchema,
} from "./data-payloads.js";

export const QuoteMessageSchema = z.object({
	type: z.literal("quote"),
	data: QuoteDataSchema,
});

export type QuoteMessage = z.infer<typeof QuoteMessageSchema>;

export const AggregateMessageSchema = z.object({
	type: z.literal("aggregate"),
	data: AggregateDataSchema,
});

export type AggregateMessage = z.infer<typeof AggregateMessageSchema>;

export const OptionsQuoteDataSchema = z.object({
	contract: z.string(),
	underlying: z.string(),
	bid: z.number(),
	ask: z.number(),
	bidSize: z.number().optional(),
	askSize: z.number().optional(),
	last: z.number(),
	volume: z.number().optional(),
	openInterest: z.number().optional(),
	timestamp: z.string(),
});

export type OptionsQuoteData = z.infer<typeof OptionsQuoteDataSchema>;

export const OptionsQuoteMessageSchema = z.object({
	type: z.literal("options_quote"),
	data: OptionsQuoteDataSchema,
});

export type OptionsQuoteMessage = z.infer<typeof OptionsQuoteMessageSchema>;

export const OptionsAggregateDataSchema = z.object({
	contract: z.string(),
	underlying: z.string(),
	open: z.number(),
	high: z.number(),
	low: z.number(),
	close: z.number(),
	volume: z.number(),
	timestamp: z.string(),
});

export type OptionsAggregateData = z.infer<typeof OptionsAggregateDataSchema>;

export const OptionsAggregateMessageSchema = z.object({
	type: z.literal("options_aggregate"),
	data: OptionsAggregateDataSchema,
});

export type OptionsAggregateMessage = z.infer<typeof OptionsAggregateMessageSchema>;

export const OptionsTradeDataSchema = z.object({
	contract: z.string(),
	underlying: z.string(),
	price: z.number(),
	size: z.number(),
	timestamp: z.string(),
});

export type OptionsTradeData = z.infer<typeof OptionsTradeDataSchema>;

export const OptionsTradeMessageSchema = z.object({
	type: z.literal("options_trade"),
	data: OptionsTradeDataSchema,
});

export type OptionsTradeMessage = z.infer<typeof OptionsTradeMessageSchema>;

export const TradeDataSchema = z.object({
	ev: z.string(),
	sym: z.string(),
	p: z.number(),
	s: z.number(),
	x: z.number().optional(),
	c: z.array(z.number()).optional(),
	t: z.number(),
	i: z.string().optional(),
});

export type TradeData = z.infer<typeof TradeDataSchema>;

export const TradeMessageSchema = z.object({
	type: z.literal("trade"),
	data: TradeDataSchema,
});

export type TradeMessage = z.infer<typeof TradeMessageSchema>;

export const OrderMessageSchema = z.object({
	type: z.literal("order"),
	data: OrderDataSchema,
});

export type OrderMessage = z.infer<typeof OrderMessageSchema>;

export const DecisionMessageSchema = z.object({
	type: z.literal("decision"),
	data: DecisionSchema,
	cycleId: z.string(),
});

export type DecisionMessage = z.infer<typeof DecisionMessageSchema>;

export const DecisionPlanMessageSchema = z.object({
	type: z.literal("decision_plan"),
	data: DecisionPlanSchema,
});

export type DecisionPlanMessage = z.infer<typeof DecisionPlanMessageSchema>;

export const AgentOutputMessageSchema = z.object({
	type: z.literal("agent_output"),
	data: AgentOutputDataSchema,
});

export type AgentOutputMessage = z.infer<typeof AgentOutputMessageSchema>;

export const AgentToolCallMessageSchema = z.object({
	type: z.literal("agent_tool_call"),
	data: ToolCallChunkDataSchema,
});

export type AgentToolCallMessage = z.infer<typeof AgentToolCallMessageSchema>;

export const AgentToolResultMessageSchema = z.object({
	type: z.literal("agent_tool_result"),
	data: ToolResultChunkDataSchema,
});

export type AgentToolResultMessage = z.infer<typeof AgentToolResultMessageSchema>;

export const AgentReasoningMessageSchema = z.object({
	type: z.literal("agent_reasoning"),
	data: ReasoningChunkDataSchema,
});

export type AgentReasoningMessage = z.infer<typeof AgentReasoningMessageSchema>;

export const AgentTextDeltaMessageSchema = z.object({
	type: z.literal("agent_text_delta"),
	data: TextDeltaChunkDataSchema,
});

export type AgentTextDeltaMessage = z.infer<typeof AgentTextDeltaMessageSchema>;

export const AgentSourceDataSchema = z.object({
	cycleId: z.string(),
	agentType: z.string(),
	sourceType: z.enum(["url", "x"]),
	url: z.string(),
	title: z.string().optional(),
	domain: z.string().optional(),
	logoUrl: z.string().optional(),
	timestamp: z.string(),
});

export type AgentSourceData = z.infer<typeof AgentSourceDataSchema>;

export const AgentSourceMessageSchema = z.object({
	type: z.literal("agent_source"),
	data: AgentSourceDataSchema,
});

export type AgentSourceMessage = z.infer<typeof AgentSourceMessageSchema>;

export const AgentStatusMessageSchema = z.object({
	type: z.literal("agent_status"),
	data: AgentStatusDataSchema,
});

export type AgentStatusMessage = z.infer<typeof AgentStatusMessageSchema>;

export const CycleProgressMessageSchema = z.object({
	type: z.literal("cycle_progress"),
	data: CycleProgressDataSchema,
});

export type CycleProgressMessage = z.infer<typeof CycleProgressMessageSchema>;

export const CycleResultMessageSchema = z.object({
	type: z.literal("cycle_result"),
	data: CycleResultDataSchema,
});

export type CycleResultMessage = z.infer<typeof CycleResultMessageSchema>;

export const AlertMessageSchema = z.object({
	type: z.literal("alert"),
	data: AlertDataSchema,
});

export type AlertMessage = z.infer<typeof AlertMessageSchema>;

export const SystemStatusMessageSchema = z.object({
	type: z.literal("system_status"),
	data: SystemStatusDataSchema,
});

export type SystemStatusMessage = z.infer<typeof SystemStatusMessageSchema>;

export const PortfolioMessageSchema = z.object({
	type: z.literal("portfolio"),
	data: PortfolioDataSchema,
});

export type PortfolioMessage = z.infer<typeof PortfolioMessageSchema>;

export const ScannerAlertMessageSchema = z.object({
	type: z.literal("scanner_alert"),
	data: ScannerAlertDataSchema,
});

export type ScannerAlertMessage = z.infer<typeof ScannerAlertMessageSchema>;

export const ScannerStatusMessageSchema = z.object({
	type: z.literal("scanner_status"),
	data: ScannerStatusDataSchema,
});

export type ScannerStatusMessage = z.infer<typeof ScannerStatusMessageSchema>;

export const PongMessageSchema = z.object({
	type: z.literal("pong"),
	timestamp: z.string().datetime(),
});

export type PongMessage = z.infer<typeof PongMessageSchema>;

export const SubscribedMessageSchema = z.object({
	type: z.literal("subscribed"),
	channels: z.array(Channel),
});

export type SubscribedMessage = z.infer<typeof SubscribedMessageSchema>;

export const UnsubscribedMessageSchema = z.object({
	type: z.literal("unsubscribed"),
	channels: z.array(Channel),
});

export type UnsubscribedMessage = z.infer<typeof UnsubscribedMessageSchema>;

export const ErrorMessageSchema = z.object({
	type: z.literal("error"),
	code: z.string(),
	message: z.string(),
	originalMessage: z.unknown().optional(),
});

export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;

export const IndicatorDataSchema = z.object({
	symbol: z.string(),
	timestamp: z.string(),
	price: z.object({
		rsi_14: z.number().nullable(),
		atr_14: z.number().nullable(),
		sma_20: z.number().nullable(),
		sma_50: z.number().nullable(),
		sma_200: z.number().nullable(),
		ema_9: z.number().nullable(),
		ema_12: z.number().nullable(),
		ema_21: z.number().nullable(),
		macd_line: z.number().nullable(),
		macd_signal: z.number().nullable(),
		macd_histogram: z.number().nullable(),
		bollinger_upper: z.number().nullable(),
		bollinger_middle: z.number().nullable(),
		bollinger_lower: z.number().nullable(),
		bollinger_bandwidth: z.number().nullable(),
		stochastic_k: z.number().nullable(),
		stochastic_d: z.number().nullable(),
		momentum_1m: z.number().nullable(),
		momentum_3m: z.number().nullable(),
		momentum_12m: z.number().nullable(),
		realized_vol_20d: z.number().nullable(),
	}),
});

export type IndicatorData = z.infer<typeof IndicatorDataSchema>;

export const IndicatorMessageSchema = z.object({
	type: z.literal("indicator"),
	data: IndicatorDataSchema,
});

export type IndicatorMessage = z.infer<typeof IndicatorMessageSchema>;

export const AccountUpdateDataSchema = z.object({
	cash: z.number(),
	equity: z.number(),
	buyingPower: z.number(),
	timestamp: z.string(),
});

export type AccountUpdateData = z.infer<typeof AccountUpdateDataSchema>;

export const AccountUpdateMessageSchema = z.object({
	type: z.literal("account_update"),
	data: AccountUpdateDataSchema,
});

export type AccountUpdateMessage = z.infer<typeof AccountUpdateMessageSchema>;

export const PositionUpdateDataSchema = z.object({
	symbol: z.string(),
	side: z.enum(["LONG", "SHORT"]),
	qty: z.number(),
	avgEntry: z.number(),
	marketValue: z.number(),
	unrealizedPnl: z.number(),
	event: z.enum(["fill", "partial_fill", "close"]),
	orderId: z.string(),
	timestamp: z.string(),
});

export type PositionUpdateData = z.infer<typeof PositionUpdateDataSchema>;

export const PositionUpdateMessageSchema = z.object({
	type: z.literal("position_update"),
	data: PositionUpdateDataSchema,
	invalidates: z.array(z.string()).optional(),
});

export type PositionUpdateMessage = z.infer<typeof PositionUpdateMessageSchema>;

export const OrderUpdateDataSchema = z.object({
	orderId: z.string(),
	clientOrderId: z.string(),
	symbol: z.string(),
	side: z.enum(["buy", "sell"]),
	orderType: z.string(),
	status: z.string(),
	qty: z.string().nullable(),
	filledQty: z.string(),
	filledAvgPrice: z.string().nullable(),
	event: z.enum([
		"new",
		"fill",
		"partial_fill",
		"canceled",
		"expired",
		"done_for_day",
		"replaced",
		"rejected",
		"pending_new",
		"stopped",
		"pending_cancel",
		"pending_replace",
		"calculated",
		"suspended",
		"order_replace_rejected",
		"order_cancel_rejected",
	]),
	timestamp: z.string(),
});

export type OrderUpdateData = z.infer<typeof OrderUpdateDataSchema>;

export const OrderUpdateMessageSchema = z.object({
	type: z.literal("order_update"),
	data: OrderUpdateDataSchema,
	invalidates: z.array(z.string()).optional(),
});

export type OrderUpdateMessage = z.infer<typeof OrderUpdateMessageSchema>;

export const WorkerRunStatusSchema = z.enum(["pending", "running", "completed", "failed"]);

export type WorkerRunStatus = z.infer<typeof WorkerRunStatusSchema>;

export const WorkerServiceNameSchema = z.enum([
	"macro_watch",
	"newspaper",
	"filings_sync",
	"short_interest",
	"sentiment",
	"corporate_actions",
	"prediction_markets",
]);

export type WorkerServiceName = z.infer<typeof WorkerServiceNameSchema>;

export const WorkerRunUpdateDataSchema = z.object({
	runId: z.string(),
	service: WorkerServiceNameSchema,
	status: WorkerRunStatusSchema,
	startedAt: z.string(),
	completedAt: z.string().nullable(),
	duration: z.number().nullable(),
	result: z.string().nullable(),
	error: z.string().nullable(),
	timestamp: z.string(),
});

export type WorkerRunUpdateData = z.infer<typeof WorkerRunUpdateDataSchema>;

export const WorkerRunUpdateMessageSchema = z.object({
	type: z.literal("worker_run_update"),
	data: WorkerRunUpdateDataSchema,
});

export type WorkerRunUpdateMessage = z.infer<typeof WorkerRunUpdateMessageSchema>;

export const ServerMessageSchema = z.discriminatedUnion("type", [
	QuoteMessageSchema,
	AggregateMessageSchema,
	TradeMessageSchema,
	OptionsQuoteMessageSchema,
	OptionsAggregateMessageSchema,
	OptionsTradeMessageSchema,
	IndicatorMessageSchema,
	OrderMessageSchema,
	DecisionMessageSchema,
	DecisionPlanMessageSchema,
	AgentOutputMessageSchema,
	AgentToolCallMessageSchema,
	AgentToolResultMessageSchema,
	AgentReasoningMessageSchema,
	AgentTextDeltaMessageSchema,
	AgentSourceMessageSchema,
	AgentStatusMessageSchema,
	CycleProgressMessageSchema,
	CycleResultMessageSchema,
	AlertMessageSchema,
	SystemStatusMessageSchema,
	PortfolioMessageSchema,
	ScannerAlertMessageSchema,
	ScannerStatusMessageSchema,
	PongMessageSchema,
	SubscribedMessageSchema,
	UnsubscribedMessageSchema,
	ErrorMessageSchema,
	AccountUpdateMessageSchema,
	PositionUpdateMessageSchema,
	OrderUpdateMessageSchema,
	WorkerRunUpdateMessageSchema,
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;
