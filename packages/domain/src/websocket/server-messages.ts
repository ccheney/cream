/**
 * Server → Client WebSocket Message Schemas
 *
 * Defines messages sent from the server to the client.
 *
 * @see docs/plans/ui/06-websocket.md lines 63-138
 */

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
	SystemStatusDataSchema,
	TextDeltaChunkDataSchema,
	ToolCallChunkDataSchema,
	ToolResultChunkDataSchema,
} from "./data-payloads.js";

// ============================================
// Quote Message
// ============================================

/**
 * Real-time quote update.
 *
 * @example
 * { type: "quote", data: { symbol: "AAPL", bid: 185.00, ask: 185.01, ... } }
 */
export const QuoteMessageSchema = z.object({
	type: z.literal("quote"),
	data: QuoteDataSchema,
});

export type QuoteMessage = z.infer<typeof QuoteMessageSchema>;

// ============================================
// Aggregate Message
// ============================================

/**
 * Real-time aggregate bar update.
 *
 * @example
 * { type: "aggregate", data: { symbol: "AAPL", open: 185.00, high: 185.50, ... } }
 */
export const AggregateMessageSchema = z.object({
	type: z.literal("aggregate"),
	data: AggregateDataSchema,
});

export type AggregateMessage = z.infer<typeof AggregateMessageSchema>;

// ============================================
// Options Quote Message
// ============================================

/**
 * Options quote data schema.
 */
export const OptionsQuoteDataSchema = z.object({
	/** OCC contract symbol */
	contract: z.string(),
	/** Underlying symbol */
	underlying: z.string(),
	/** Best bid price */
	bid: z.number(),
	/** Best ask price */
	ask: z.number(),
	/** Bid size (optional) */
	bidSize: z.number().optional(),
	/** Ask size (optional) */
	askSize: z.number().optional(),
	/** Last trade price */
	last: z.number(),
	/** Volume (optional) */
	volume: z.number().optional(),
	/** Open interest (optional) */
	openInterest: z.number().optional(),
	/** Timestamp */
	timestamp: z.string(),
});

export type OptionsQuoteData = z.infer<typeof OptionsQuoteDataSchema>;

/**
 * Real-time options quote update.
 *
 * @example
 * { type: "options_quote", data: { contract: "O:AAPL250117C00100000", bid: 5.00, ask: 5.10, ... } }
 */
export const OptionsQuoteMessageSchema = z.object({
	type: z.literal("options_quote"),
	data: OptionsQuoteDataSchema,
});

export type OptionsQuoteMessage = z.infer<typeof OptionsQuoteMessageSchema>;

// ============================================
// Options Aggregate Message
// ============================================

/**
 * Options aggregate data schema.
 */
export const OptionsAggregateDataSchema = z.object({
	/** OCC contract symbol */
	contract: z.string(),
	/** Underlying symbol */
	underlying: z.string(),
	/** Open price */
	open: z.number(),
	/** High price */
	high: z.number(),
	/** Low price */
	low: z.number(),
	/** Close price */
	close: z.number(),
	/** Volume */
	volume: z.number(),
	/** Timestamp */
	timestamp: z.string(),
});

export type OptionsAggregateData = z.infer<typeof OptionsAggregateDataSchema>;

/**
 * Options aggregate bar update.
 */
export const OptionsAggregateMessageSchema = z.object({
	type: z.literal("options_aggregate"),
	data: OptionsAggregateDataSchema,
});

export type OptionsAggregateMessage = z.infer<typeof OptionsAggregateMessageSchema>;

// ============================================
// Options Trade Message
// ============================================

/**
 * Options trade data schema.
 */
export const OptionsTradeDataSchema = z.object({
	/** OCC contract symbol */
	contract: z.string(),
	/** Underlying symbol */
	underlying: z.string(),
	/** Trade price */
	price: z.number(),
	/** Trade size */
	size: z.number(),
	/** Timestamp */
	timestamp: z.string(),
});

export type OptionsTradeData = z.infer<typeof OptionsTradeDataSchema>;

/**
 * Options trade execution.
 */
export const OptionsTradeMessageSchema = z.object({
	type: z.literal("options_trade"),
	data: OptionsTradeDataSchema,
});

export type OptionsTradeMessage = z.infer<typeof OptionsTradeMessageSchema>;

// ============================================
// Equity Trade Message (Time & Sales)
// ============================================

/**
 * Equity trade execution data (Time & Sales).
 */
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

/**
 * Equity trade execution (Time & Sales).
 *
 * @example
 * { type: "trade", data: { ev: "T", sym: "AAPL", p: 150.25, s: 100, x: 1, t: 123456789, i: "trade-id" } }
 */
export const TradeMessageSchema = z.object({
	type: z.literal("trade"),
	data: TradeDataSchema,
});

export type TradeMessage = z.infer<typeof TradeMessageSchema>;

// ============================================
// Order Message
// ============================================

/**
 * Order status update.
 *
 * @example
 * { type: "order", data: { id: "uuid", symbol: "AAPL", status: "filled", ... } }
 */
export const OrderMessageSchema = z.object({
	type: z.literal("order"),
	data: OrderDataSchema,
});

export type OrderMessage = z.infer<typeof OrderMessageSchema>;

// ============================================
// Decision Message
// ============================================

/**
 * Trading decision from agents.
 *
 * @example
 * { type: "decision", data: { instrument: { ... }, action: "BUY", ... } }
 */
export const DecisionMessageSchema = z.object({
	type: z.literal("decision"),
	/** Full decision from agent network */
	data: DecisionSchema,
	/** Cycle ID */
	cycleId: z.string(),
});

export type DecisionMessage = z.infer<typeof DecisionMessageSchema>;

// ============================================
// Decision Plan Message
// ============================================

/**
 * Full decision plan from a trading cycle.
 *
 * @example
 * { type: "decision_plan", data: { cycleId: "...", decisions: [...] } }
 */
export const DecisionPlanMessageSchema = z.object({
	type: z.literal("decision_plan"),
	data: DecisionPlanSchema,
});

export type DecisionPlanMessage = z.infer<typeof DecisionPlanMessageSchema>;

// ============================================
// Agent Output Message
// ============================================

/**
 * Agent reasoning and output.
 *
 * @example
 * { type: "agent_output", data: { agentType: "trader", status: "complete", ... } }
 */
export const AgentOutputMessageSchema = z.object({
	type: z.literal("agent_output"),
	data: AgentOutputDataSchema,
});

export type AgentOutputMessage = z.infer<typeof AgentOutputMessageSchema>;

// ============================================
// Agent Streaming Messages
// ============================================

/**
 * Agent tool call event - emitted when an agent invokes a tool.
 *
 * @example
 * { type: "agent_tool_call", data: { agentType: "news", toolName: "get_quotes", ... } }
 */
export const AgentToolCallMessageSchema = z.object({
	type: z.literal("agent_tool_call"),
	data: ToolCallChunkDataSchema,
});

export type AgentToolCallMessage = z.infer<typeof AgentToolCallMessageSchema>;

/**
 * Agent tool result event - emitted when a tool execution completes.
 *
 * @example
 * { type: "agent_tool_result", data: { agentType: "news", toolName: "get_quotes", success: true, ... } }
 */
export const AgentToolResultMessageSchema = z.object({
	type: z.literal("agent_tool_result"),
	data: ToolResultChunkDataSchema,
});

export type AgentToolResultMessage = z.infer<typeof AgentToolResultMessageSchema>;

/**
 * Agent reasoning event - incremental reasoning/thought output.
 *
 * @example
 * { type: "agent_reasoning", data: { agentType: "trader", text: "Analyzing price action...", ... } }
 */
export const AgentReasoningMessageSchema = z.object({
	type: z.literal("agent_reasoning"),
	data: ReasoningChunkDataSchema,
});

export type AgentReasoningMessage = z.infer<typeof AgentReasoningMessageSchema>;

/**
 * Agent text delta event - incremental text output.
 *
 * @example
 * { type: "agent_text_delta", data: { agentType: "trader", text: "The ", ... } }
 */
export const AgentTextDeltaMessageSchema = z.object({
	type: z.literal("agent_text_delta"),
	data: TextDeltaChunkDataSchema,
});

export type AgentTextDeltaMessage = z.infer<typeof AgentTextDeltaMessageSchema>;

// ============================================
// Agent Status Message
// ============================================

/**
 * Agent status update - real-time status for dashboard display.
 *
 * @example
 * { type: "agent_status", data: { type: "technical", displayName: "Technical Analyst", status: "idle", ... } }
 */
export const AgentStatusMessageSchema = z.object({
	type: z.literal("agent_status"),
	data: AgentStatusDataSchema,
});

export type AgentStatusMessage = z.infer<typeof AgentStatusMessageSchema>;

// ============================================
// Cycle Progress Message
// ============================================

/**
 * Trading cycle progress update.
 *
 * @example
 * { type: "cycle_progress", data: { phase: "decide", progress: 75, ... } }
 */
export const CycleProgressMessageSchema = z.object({
	type: z.literal("cycle_progress"),
	data: CycleProgressDataSchema,
});

export type CycleProgressMessage = z.infer<typeof CycleProgressMessageSchema>;

// ============================================
// Cycle Result Message
// ============================================

/**
 * Trading cycle final result.
 *
 * @example
 * { type: "cycle_result", data: { cycleId: "...", status: "completed", ... } }
 */
export const CycleResultMessageSchema = z.object({
	type: z.literal("cycle_result"),
	data: CycleResultDataSchema,
});

export type CycleResultMessage = z.infer<typeof CycleResultMessageSchema>;

// ============================================
// Alert Message
// ============================================

/**
 * System alert or notification.
 *
 * @example
 * { type: "alert", data: { severity: "warning", title: "...", ... } }
 */
export const AlertMessageSchema = z.object({
	type: z.literal("alert"),
	data: AlertDataSchema,
});

export type AlertMessage = z.infer<typeof AlertMessageSchema>;

// ============================================
// System Status Message
// ============================================

/**
 * System health status update.
 *
 * @example
 * { type: "system_status", data: { health: "healthy", ... } }
 */
export const SystemStatusMessageSchema = z.object({
	type: z.literal("system_status"),
	data: SystemStatusDataSchema,
});

export type SystemStatusMessage = z.infer<typeof SystemStatusMessageSchema>;

// ============================================
// Portfolio Message
// ============================================

/**
 * Portfolio summary update.
 *
 * @example
 * { type: "portfolio", data: { totalValue: 100000, ... } }
 */
export const PortfolioMessageSchema = z.object({
	type: z.literal("portfolio"),
	data: PortfolioDataSchema,
});

export type PortfolioMessage = z.infer<typeof PortfolioMessageSchema>;

// ============================================
// Pong Message
// ============================================

/**
 * Heartbeat pong response.
 *
 * @example
 * { type: "pong", timestamp: "2026-01-04T14:00:00Z" }
 */
export const PongMessageSchema = z.object({
	type: z.literal("pong"),
	/** Server timestamp */
	timestamp: z.string().datetime(),
});

export type PongMessage = z.infer<typeof PongMessageSchema>;

// ============================================
// Subscribed Message
// ============================================

/**
 * Confirmation of channel subscription.
 *
 * @example
 * { type: "subscribed", channels: ["quotes", "orders"] }
 */
export const SubscribedMessageSchema = z.object({
	type: z.literal("subscribed"),
	/** Channels successfully subscribed to */
	channels: z.array(Channel),
});

export type SubscribedMessage = z.infer<typeof SubscribedMessageSchema>;

// ============================================
// Unsubscribed Message
// ============================================

/**
 * Confirmation of channel unsubscription.
 *
 * @example
 * { type: "unsubscribed", channels: ["quotes"] }
 */
export const UnsubscribedMessageSchema = z.object({
	type: z.literal("unsubscribed"),
	/** Channels successfully unsubscribed from */
	channels: z.array(Channel),
});

export type UnsubscribedMessage = z.infer<typeof UnsubscribedMessageSchema>;

// ============================================
// Error Message
// ============================================

/**
 * Error response from server.
 *
 * @example
 * { type: "error", code: "INVALID_MESSAGE", message: "..." }
 */
export const ErrorMessageSchema = z.object({
	type: z.literal("error"),
	/** Error code */
	code: z.string(),
	/** Human-readable error message */
	message: z.string(),
	/** Original message that caused error (optional) */
	originalMessage: z.unknown().optional(),
});

export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;

// ============================================
// Backtest Messages
// ============================================

/**
 * Backtest progress data.
 */
export const BacktestProgressDataSchema = z.object({
	/** Backtest ID */
	backtestId: z.string(),
	/** Progress percentage (0-100) */
	progress: z.number(),
	/** Current timestamp being processed */
	currentTimestamp: z.string().optional(),
	/** Number of bars processed */
	barsProcessed: z.number().optional(),
	/** Total bars to process */
	totalBars: z.number().optional(),
});

export type BacktestProgressData = z.infer<typeof BacktestProgressDataSchema>;

/**
 * Backtest trade data (executed during backtest).
 */
export const BacktestTradeDataSchema = z.object({
	/** Backtest ID */
	backtestId: z.string(),
	/** Trade timestamp */
	timestamp: z.string(),
	/** Symbol traded */
	symbol: z.string(),
	/** Trade action */
	action: z.enum(["BUY", "SELL", "SHORT", "COVER"]),
	/** Quantity */
	quantity: z.number(),
	/** Execution price */
	price: z.number(),
	/** P/L for this trade (if closing) */
	pnl: z.number().nullable(),
});

export type BacktestTradeData = z.infer<typeof BacktestTradeDataSchema>;

/**
 * Backtest equity point (for real-time chart updates).
 */
export const BacktestEquityDataSchema = z.object({
	/** Backtest ID */
	backtestId: z.string(),
	/** Timestamp */
	timestamp: z.string(),
	/** Net asset value */
	nav: z.number(),
	/** Drawdown amount */
	drawdown: z.number().optional(),
	/** Drawdown percentage */
	drawdownPct: z.number().optional(),
});

export type BacktestEquityData = z.infer<typeof BacktestEquityDataSchema>;

/**
 * Backtest completion data.
 */
export const BacktestCompletedDataSchema = z.object({
	/** Backtest ID */
	backtestId: z.string(),
	/** Final metrics */
	metrics: z
		.object({
			totalReturn: z.number(),
			sharpeRatio: z.number(),
			maxDrawdown: z.number(),
			winRate: z.number(),
			totalTrades: z.number(),
		})
		.optional(),
});

export type BacktestCompletedData = z.infer<typeof BacktestCompletedDataSchema>;

/**
 * Backtest error data.
 */
export const BacktestErrorDataSchema = z.object({
	/** Backtest ID */
	backtestId: z.string(),
	/** Error message */
	error: z.string(),
});

export type BacktestErrorData = z.infer<typeof BacktestErrorDataSchema>;

/**
 * Backtest started message.
 */
export const BacktestStartedMessageSchema = z.object({
	type: z.literal("backtest:started"),
	payload: z.object({
		backtestId: z.string(),
	}),
});

export type BacktestStartedMessage = z.infer<typeof BacktestStartedMessageSchema>;

/**
 * Backtest progress message.
 */
export const BacktestProgressMessageSchema = z.object({
	type: z.literal("backtest:progress"),
	payload: BacktestProgressDataSchema,
});

export type BacktestProgressMessage = z.infer<typeof BacktestProgressMessageSchema>;

/**
 * Backtest trade message.
 */
export const BacktestTradeMessageSchema = z.object({
	type: z.literal("backtest:trade"),
	payload: BacktestTradeDataSchema,
});

export type BacktestTradeMessage = z.infer<typeof BacktestTradeMessageSchema>;

/**
 * Backtest equity message.
 */
export const BacktestEquityMessageSchema = z.object({
	type: z.literal("backtest:equity"),
	payload: BacktestEquityDataSchema,
});

export type BacktestEquityMessage = z.infer<typeof BacktestEquityMessageSchema>;

/**
 * Backtest completed message.
 */
export const BacktestCompletedMessageSchema = z.object({
	type: z.literal("backtest:completed"),
	payload: BacktestCompletedDataSchema,
});

export type BacktestCompletedMessage = z.infer<typeof BacktestCompletedMessageSchema>;

/**
 * Backtest error message.
 */
export const BacktestErrorMessageSchema = z.object({
	type: z.literal("backtest:error"),
	payload: BacktestErrorDataSchema,
});

export type BacktestErrorMessage = z.infer<typeof BacktestErrorMessageSchema>;

// ============================================
// Indicator Message
// ============================================

/**
 * Real-time indicator data schema.
 */
export const IndicatorDataSchema = z.object({
	/** Symbol */
	symbol: z.string(),
	/** Timestamp */
	timestamp: z.string(),
	/** Price-based indicators */
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

/**
 * Real-time indicator update.
 *
 * @example
 * { type: "indicator", data: { symbol: "AAPL", price: { rsi_14: 55.2, ... } } }
 */
export const IndicatorMessageSchema = z.object({
	type: z.literal("indicator"),
	data: IndicatorDataSchema,
});

export type IndicatorMessage = z.infer<typeof IndicatorMessageSchema>;

// ============================================
// Account Update Message (from Alpaca trade stream)
// ============================================

/**
 * Account update data - triggered when account balance changes.
 */
export const AccountUpdateDataSchema = z.object({
	/** Account cash balance */
	cash: z.number(),
	/** Account equity */
	equity: z.number(),
	/** Buying power */
	buyingPower: z.number(),
	/** Timestamp of the update */
	timestamp: z.string(),
});

export type AccountUpdateData = z.infer<typeof AccountUpdateDataSchema>;

/**
 * Account update message - broadcasted when account balance changes.
 *
 * @example
 * { type: "account_update", data: { cash: 50000, equity: 150000, ... } }
 */
export const AccountUpdateMessageSchema = z.object({
	type: z.literal("account_update"),
	data: AccountUpdateDataSchema,
});

export type AccountUpdateMessage = z.infer<typeof AccountUpdateMessageSchema>;

// ============================================
// Position Update Message (from Alpaca trade stream)
// ============================================

/**
 * Position update data - triggered when position changes (order fills).
 */
export const PositionUpdateDataSchema = z.object({
	/** Symbol */
	symbol: z.string(),
	/** Position side (LONG or SHORT) */
	side: z.enum(["LONG", "SHORT"]),
	/** New quantity */
	qty: z.number(),
	/** Average entry price */
	avgEntry: z.number(),
	/** Current market value */
	marketValue: z.number(),
	/** Unrealized P&L */
	unrealizedPnl: z.number(),
	/** Event that triggered this update */
	event: z.enum(["fill", "partial_fill", "close"]),
	/** Order ID that caused this update */
	orderId: z.string(),
	/** Timestamp of the update */
	timestamp: z.string(),
});

export type PositionUpdateData = z.infer<typeof PositionUpdateDataSchema>;

/**
 * Position update message - broadcasted when positions change.
 *
 * @example
 * { type: "position_update", data: { symbol: "AAPL", qty: 100, ... } }
 */
export const PositionUpdateMessageSchema = z.object({
	type: z.literal("position_update"),
	data: PositionUpdateDataSchema,
	/** TanStack Query cache keys to invalidate on the client */
	invalidates: z.array(z.string()).optional(),
});

export type PositionUpdateMessage = z.infer<typeof PositionUpdateMessageSchema>;

// ============================================
// Order Update Message (from Alpaca trade stream)
// ============================================

/**
 * Order update data - triggered on order status changes.
 */
export const OrderUpdateDataSchema = z.object({
	/** Order ID */
	orderId: z.string(),
	/** Client order ID */
	clientOrderId: z.string(),
	/** Symbol */
	symbol: z.string(),
	/** Order side */
	side: z.enum(["buy", "sell"]),
	/** Order type */
	orderType: z.string(),
	/** Order status */
	status: z.string(),
	/** Quantity ordered */
	qty: z.string().nullable(),
	/** Quantity filled */
	filledQty: z.string(),
	/** Average fill price */
	filledAvgPrice: z.string().nullable(),
	/** Event type that triggered this update */
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
	/** Timestamp of the event */
	timestamp: z.string(),
});

export type OrderUpdateData = z.infer<typeof OrderUpdateDataSchema>;

/**
 * Order update message - broadcasted on order status changes.
 *
 * @example
 * { type: "order_update", data: { orderId: "...", event: "fill", ... } }
 */
export const OrderUpdateMessageSchema = z.object({
	type: z.literal("order_update"),
	data: OrderUpdateDataSchema,
	/** TanStack Query cache keys to invalidate on the client */
	invalidates: z.array(z.string()).optional(),
});

export type OrderUpdateMessage = z.infer<typeof OrderUpdateMessageSchema>;

// ============================================
// Synthesis Progress Message
// ============================================

/**
 * Synthesis phase enumeration.
 */
export const SynthesisPhaseSchema = z.enum([
	"gathering_context",
	"generating_hypothesis",
	"implementing",
	"validating",
	"initiating_paper_trading",
]);

export type SynthesisPhase = z.infer<typeof SynthesisPhaseSchema>;

/**
 * Synthesis progress data - triggered during indicator synthesis workflow.
 */
export const SynthesisProgressDataSchema = z.object({
	/** Cycle ID that triggered synthesis */
	cycleId: z.string(),
	/** Current synthesis phase */
	phase: SynthesisPhaseSchema,
	/** Indicator name (if hypothesis generated) */
	indicatorName: z.string().optional(),
	/** Progress percentage (0-100) */
	progress: z.number().min(0).max(100).optional(),
	/** Human-readable status message */
	message: z.string(),
	/** Timestamp */
	timestamp: z.string(),
});

export type SynthesisProgressData = z.infer<typeof SynthesisProgressDataSchema>;

/**
 * Synthesis progress message - broadcasted during indicator synthesis.
 *
 * @example
 * { type: "synthesis_progress", data: { cycleId: "...", phase: "implementing", progress: 50, ... } }
 */
export const SynthesisProgressMessageSchema = z.object({
	type: z.literal("synthesis_progress"),
	data: SynthesisProgressDataSchema,
});

export type SynthesisProgressMessage = z.infer<typeof SynthesisProgressMessageSchema>;

// ============================================
// Synthesis Complete Message
// ============================================

/**
 * Synthesis result status.
 */
export const SynthesisStatusSchema = z.enum([
	"paper_trading_started",
	"validation_failed",
	"implementation_failed",
	"hypothesis_failed",
	"error",
]);

export type SynthesisStatus = z.infer<typeof SynthesisStatusSchema>;

/**
 * Synthesis complete data - triggered when indicator synthesis finishes.
 */
export const SynthesisCompleteDataSchema = z.object({
	/** Cycle ID that triggered synthesis */
	cycleId: z.string(),
	/** Whether synthesis succeeded */
	success: z.boolean(),
	/** Indicator ID (if created) */
	indicatorId: z.string().optional(),
	/** Indicator name (if created) */
	indicatorName: z.string().optional(),
	/** Final status */
	status: SynthesisStatusSchema,
	/** Human-readable result message */
	message: z.string(),
	/** Phase completion flags */
	phases: z.object({
		hypothesisGenerated: z.boolean(),
		implementationSucceeded: z.boolean(),
		validationPassed: z.boolean(),
		paperTradingStarted: z.boolean(),
	}),
	/** Timestamp */
	timestamp: z.string(),
});

export type SynthesisCompleteData = z.infer<typeof SynthesisCompleteDataSchema>;

/**
 * Synthesis complete message - broadcasted when indicator synthesis finishes.
 *
 * @example
 * { type: "synthesis_complete", data: { cycleId: "...", success: true, indicatorName: "...", ... } }
 */
export const SynthesisCompleteMessageSchema = z.object({
	type: z.literal("synthesis_complete"),
	data: SynthesisCompleteDataSchema,
});

export type SynthesisCompleteMessage = z.infer<typeof SynthesisCompleteMessageSchema>;

// ============================================
// Server Message Union
// ============================================

/**
 * Discriminated union of all server → client messages.
 */
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
	AgentStatusMessageSchema,
	CycleProgressMessageSchema,
	CycleResultMessageSchema,
	AlertMessageSchema,
	SystemStatusMessageSchema,
	PortfolioMessageSchema,
	PongMessageSchema,
	SubscribedMessageSchema,
	UnsubscribedMessageSchema,
	ErrorMessageSchema,
	BacktestStartedMessageSchema,
	BacktestProgressMessageSchema,
	BacktestTradeMessageSchema,
	BacktestEquityMessageSchema,
	BacktestCompletedMessageSchema,
	BacktestErrorMessageSchema,
	AccountUpdateMessageSchema,
	PositionUpdateMessageSchema,
	OrderUpdateMessageSchema,
	SynthesisProgressMessageSchema,
	SynthesisCompleteMessageSchema,
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;
