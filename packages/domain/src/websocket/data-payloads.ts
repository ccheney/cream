/**
 * WebSocket Data Payload Schemas
 *
 * Defines the data structures for WebSocket message payloads.
 *
 * @see docs/plans/ui/06-websocket.md lines 63-138
 */

import { z } from "zod/v4";
import {
	AgentType,
	AgentVote,
	AlertSeverity,
	CyclePhase,
	OrderStatus,
	SystemHealthStatus,
} from "./channel.js";

// ============================================
// Quote Data
// ============================================

/**
 * Real-time quote data for a symbol.
 */
export const QuoteDataSchema = z.object({
	/** Ticker symbol */
	symbol: z.string().min(1).max(20),

	/** Best bid price */
	bid: z.number().nonnegative(),

	/** Best ask price */
	ask: z.number().nonnegative(),

	/** Last trade price */
	last: z.number().nonnegative(),

	/** Bid size (shares) */
	bidSize: z.number().int().nonnegative().optional(),

	/** Ask size (shares) */
	askSize: z.number().int().nonnegative().optional(),

	/** Today's volume */
	volume: z.number().int().nonnegative(),

	/** Previous close price */
	prevClose: z.number().nonnegative().optional(),

	/** Percent change from previous close */
	changePercent: z.number().optional(),

	/** ISO 8601 timestamp */
	timestamp: z.string().datetime(),
});

export type QuoteData = z.infer<typeof QuoteDataSchema>;

// ============================================
// Aggregate Data (Candles)
// ============================================

/**
 * Real-time aggregate bar (candle) data.
 */
export const AggregateDataSchema = z.object({
	/** Ticker symbol */
	symbol: z.string().min(1).max(20),

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

	/** VWAP */
	vwap: z.number().optional(),

	/** Start timestamp */
	timestamp: z.string().datetime(),

	/** End timestamp */
	endTimestamp: z.string().datetime().optional(),
});

export type AggregateData = z.infer<typeof AggregateDataSchema>;

// ============================================
// Order Data
// ============================================

/**
 * Order status update data.
 */
export const OrderDataSchema = z.object({
	/** Order ID */
	id: z.string().uuid(),

	/** Client order ID (optional) */
	clientOrderId: z.string().optional(),

	/** Ticker symbol */
	symbol: z.string().min(1).max(20),

	/** Order side */
	side: z.enum(["buy", "sell"]),

	/** Order type */
	orderType: z.enum(["market", "limit", "stop", "stop_limit"]),

	/** Order status */
	status: OrderStatus,

	/** Requested quantity */
	quantity: z.number().int().positive(),

	/** Filled quantity */
	filledQty: z.number().int().nonnegative(),

	/** Remaining quantity */
	remainingQty: z.number().int().nonnegative().optional(),

	/** Limit price (for limit orders) */
	limitPrice: z.number().nonnegative().optional(),

	/** Stop price (for stop orders) */
	stopPrice: z.number().nonnegative().optional(),

	/** Average fill price */
	avgPrice: z.number().nonnegative().optional(),

	/** Time in force */
	timeInForce: z.enum(["day", "gtc", "ioc", "fok"]).optional(),

	/** ISO 8601 timestamp */
	timestamp: z.string().datetime(),

	/** Rejection reason (if rejected) */
	rejectReason: z.string().optional(),
});

export type OrderData = z.infer<typeof OrderDataSchema>;

// ============================================
// Agent Output Data
// ============================================

/**
 * Agent reasoning and output data.
 */
export const AgentOutputDataSchema = z.object({
	/** Cycle ID */
	cycleId: z.string(),

	/** Agent type */
	agentType: AgentType,

	/** Symbol being analyzed (optional for some agents) */
	symbol: z.string().min(1).max(20).optional(),

	/** Processing status */
	status: z.enum(["running", "complete", "error"]),

	/** Agent output text/reasoning */
	output: z.string(),

	/** Agent vote (for risk manager, critic) */
	vote: AgentVote.optional(),

	/** Confidence score (0-1) */
	confidence: z.number().min(0).max(1).optional(),

	/** Processing duration in milliseconds */
	durationMs: z.number().int().nonnegative().optional(),

	/** Error message (if status is error) */
	error: z.string().optional(),

	/** ISO 8601 timestamp */
	timestamp: z.string().datetime(),
});

export type AgentOutputData = z.infer<typeof AgentOutputDataSchema>;

// ============================================
// Cycle Progress Data
// ============================================

/**
 * Trading cycle progress update data.
 */
export const CycleProgressDataSchema = z.object({
	/** Cycle ID */
	cycleId: z.string(),

	/** Current phase */
	phase: CyclePhase,

	/** Current step within phase */
	step: z.string(),

	/** Progress percentage (0-100) */
	progress: z.number().min(0).max(100),

	/** Human-readable progress message */
	message: z.string(),

	/** Active symbol being processed */
	activeSymbol: z.string().optional(),

	/** Total symbols in cycle */
	totalSymbols: z.number().int().nonnegative().optional(),

	/** Completed symbols count */
	completedSymbols: z.number().int().nonnegative().optional(),

	/** Cycle start time */
	startedAt: z.string().datetime().optional(),

	/** Estimated completion time */
	estimatedCompletion: z.string().datetime().optional(),

	/** ISO 8601 timestamp */
	timestamp: z.string().datetime(),
});

export type CycleProgressData = z.infer<typeof CycleProgressDataSchema>;

// ============================================
// Cycle Result Data
// ============================================

/**
 * Decision summary for cycle results.
 */
export const DecisionSummarySchema = z.object({
	/** Symbol */
	symbol: z.string(),
	/** Action taken */
	action: z.enum(["BUY", "SELL", "HOLD"]),
	/** Direction */
	direction: z.enum(["LONG", "SHORT", "FLAT"]),
	/** Confidence score */
	confidence: z.number().min(0).max(1),
});

export type DecisionSummary = z.infer<typeof DecisionSummarySchema>;

/**
 * Order summary for cycle results.
 */
export const OrderSummarySchema = z.object({
	/** Order ID */
	orderId: z.string(),
	/** Symbol */
	symbol: z.string(),
	/** Side */
	side: z.enum(["buy", "sell"]),
	/** Quantity */
	quantity: z.number(),
	/** Status */
	status: z.enum(["submitted", "filled", "rejected"]),
});

export type OrderSummary = z.infer<typeof OrderSummarySchema>;

/**
 * Trading cycle final result data.
 */
export const CycleResultDataSchema = z.object({
	/** Cycle ID */
	cycleId: z.string(),

	/** Environment */
	environment: z.enum(["PAPER", "LIVE"]),

	/** Final status */
	status: z.enum(["completed", "failed"]),

	/** Result details (if completed) */
	result: z
		.object({
			/** Whether the cycle was approved by consensus */
			approved: z.boolean(),
			/** Number of consensus iterations */
			iterations: z.number().int().nonnegative(),
			/** Decision summaries */
			decisions: z.array(DecisionSummarySchema),
			/** Order summaries */
			orders: z.array(OrderSummarySchema),
		})
		.optional(),

	/** Error message (if failed) */
	error: z.string().optional(),

	/** Cycle duration in milliseconds */
	durationMs: z.number().int().nonnegative(),

	/** Config version used */
	configVersion: z.string().optional(),

	/** ISO 8601 timestamp */
	timestamp: z.string().datetime(),
});

export type CycleResultData = z.infer<typeof CycleResultDataSchema>;

// ============================================
// Alert Data
// ============================================

/**
 * Alert notification data.
 */
export const AlertDataSchema = z.object({
	/** Alert ID */
	id: z.string().uuid(),

	/** Alert severity */
	severity: AlertSeverity,

	/** Alert title */
	title: z.string(),

	/** Alert message */
	message: z.string(),

	/** Related symbol (optional) */
	symbol: z.string().min(1).max(20).optional(),

	/** Related order ID (optional) */
	orderId: z.string().uuid().optional(),

	/** Alert category */
	category: z.enum(["order", "position", "risk", "system", "agent", "market"]).optional(),

	/** Whether alert has been acknowledged */
	acknowledged: z.boolean().default(false),

	/** ISO 8601 timestamp */
	timestamp: z.string().datetime(),
});

export type AlertData = z.infer<typeof AlertDataSchema>;

// ============================================
// System Status Data
// ============================================

/**
 * System health status data.
 */
export const SystemStatusDataSchema = z.object({
	/** Overall system health */
	health: SystemHealthStatus,

	/** System uptime in seconds */
	uptimeSeconds: z.number().int().nonnegative(),

	/** Active WebSocket connections */
	activeConnections: z.number().int().nonnegative(),

	/** Service statuses */
	services: z.record(
		z.string(),
		z.object({
			status: SystemHealthStatus,
			latencyMs: z.number().nonnegative().optional(),
			lastCheck: z.string().datetime(),
		}),
	),

	/** Current environment */
	environment: z.enum(["PAPER", "LIVE"]),

	/** Active cycle ID (if any) */
	activeCycleId: z.string().optional(),

	/** Last successful cycle timestamp */
	lastSuccessfulCycle: z.string().datetime().optional(),

	/** ISO 8601 timestamp */
	timestamp: z.string().datetime(),
});

export type SystemStatusData = z.infer<typeof SystemStatusDataSchema>;

// ============================================
// Portfolio Data
// ============================================

/**
 * Portfolio summary data.
 */
export const PortfolioDataSchema = z.object({
	/** Total portfolio value */
	totalValue: z.number(),

	/** Cash balance */
	cash: z.number(),

	/** Buying power */
	buyingPower: z.number(),

	/** Daily P&L */
	dailyPnl: z.number(),

	/** Daily P&L percentage */
	dailyPnlPercent: z.number(),

	/** Open positions count */
	openPositions: z.number().int().nonnegative(),

	/** Positions by symbol */
	positions: z.array(
		z.object({
			symbol: z.string(),
			quantity: z.number(),
			marketValue: z.number(),
			unrealizedPnl: z.number(),
			unrealizedPnlPercent: z.number(),
			costBasis: z.number(),
		}),
	),

	/** ISO 8601 timestamp */
	timestamp: z.string().datetime(),
});

export type PortfolioData = z.infer<typeof PortfolioDataSchema>;

// ============================================
// Agent Streaming Chunk Data
// ============================================

/**
 * Tool call chunk data - emitted when an agent invokes a tool.
 */
export const ToolCallChunkDataSchema = z.object({
	/** Cycle ID */
	cycleId: z.string(),

	/** Agent type */
	agentType: AgentType,

	/** Tool name being called */
	toolName: z.string(),

	/** Tool arguments (JSON string for display) */
	toolArgs: z.string(),

	/** Unique tool call ID */
	toolCallId: z.string(),

	/** ISO 8601 timestamp */
	timestamp: z.string().datetime(),
});

export type ToolCallChunkData = z.infer<typeof ToolCallChunkDataSchema>;

/**
 * Tool result chunk data - emitted when tool execution completes.
 */
export const ToolResultChunkDataSchema = z.object({
	/** Cycle ID */
	cycleId: z.string(),

	/** Agent type */
	agentType: AgentType,

	/** Tool name */
	toolName: z.string(),

	/** Tool call ID (matches ToolCallChunkData) */
	toolCallId: z.string(),

	/** Result summary (truncated for display) */
	resultSummary: z.string(),

	/** Whether tool succeeded */
	success: z.boolean(),

	/** Execution duration in milliseconds */
	durationMs: z.number().int().nonnegative().optional(),

	/** ISO 8601 timestamp */
	timestamp: z.string().datetime(),
});

export type ToolResultChunkData = z.infer<typeof ToolResultChunkDataSchema>;

/**
 * Reasoning chunk data - incremental reasoning/thought output.
 */
export const ReasoningChunkDataSchema = z.object({
	/** Cycle ID */
	cycleId: z.string(),

	/** Agent type */
	agentType: AgentType,

	/** Incremental reasoning text */
	text: z.string(),

	/** ISO 8601 timestamp */
	timestamp: z.string().datetime(),
});

export type ReasoningChunkData = z.infer<typeof ReasoningChunkDataSchema>;

/**
 * Text delta chunk data - incremental text output.
 */
export const TextDeltaChunkDataSchema = z.object({
	/** Cycle ID */
	cycleId: z.string(),

	/** Agent type */
	agentType: AgentType,

	/** Incremental text */
	text: z.string(),

	/** ISO 8601 timestamp */
	timestamp: z.string().datetime(),
});

export type TextDeltaChunkData = z.infer<typeof TextDeltaChunkDataSchema>;

// ============================================
// Agent Status Data
// ============================================

/**
 * Agent status data for real-time status updates.
 */
export const AgentStatusDataSchema = z.object({
	/** Agent type */
	type: AgentType,

	/** Human-readable display name */
	displayName: z.string(),

	/** Current processing status */
	status: z.enum(["idle", "processing", "error"]),

	/** Last output timestamp (null if never) */
	lastOutputAt: z.string().datetime().nullable(),

	/** Number of outputs today */
	outputsToday: z.number().int().nonnegative(),

	/** Average confidence score (0-1) */
	avgConfidence: z.number().min(0).max(1),

	/** Approval rate (0-1) */
	approvalRate: z.number().min(0).max(1),

	/** ISO 8601 timestamp */
	timestamp: z.string().datetime(),
});

export type AgentStatusData = z.infer<typeof AgentStatusDataSchema>;

// ============================================
// Phase Transition Data
// ============================================

/**
 * OODA workflow phase enumeration (extended from CyclePhase for visualization)
 */
export const OODAPhaseSchema = z.enum([
	"observe",
	"orient",
	"grounding",
	"analysts",
	"debate",
	"trader",
	"consensus",
	"act",
]);

export type OODAPhase = z.infer<typeof OODAPhaseSchema>;

/**
 * Phase start event data - emitted when a workflow phase begins.
 */
export const PhaseStartDataSchema = z.object({
	/** Cycle ID */
	cycleId: z.string(),

	/** OODA phase starting */
	phase: OODAPhaseSchema,

	/** ISO 8601 timestamp */
	timestamp: z.string().datetime(),
});

export type PhaseStartData = z.infer<typeof PhaseStartDataSchema>;

/**
 * Phase complete event data - emitted when a workflow phase completes.
 */
export const PhaseCompleteDataSchema = z.object({
	/** Cycle ID */
	cycleId: z.string(),

	/** OODA phase that completed */
	phase: OODAPhaseSchema,

	/** Phase duration in milliseconds */
	durationMs: z.number().int().nonnegative().optional(),

	/** ISO 8601 timestamp */
	timestamp: z.string().datetime(),
});

export type PhaseCompleteData = z.infer<typeof PhaseCompleteDataSchema>;

/**
 * Data flow event data - emitted when data flows between phases/agents.
 */
export const DataFlowDataSchema = z.object({
	/** Cycle ID */
	cycleId: z.string(),

	/** Source phase or agent */
	from: z.string(),

	/** Destination phase or agent */
	to: z.string(),

	/** Human-readable label for the data being transferred */
	label: z.string(),

	/** ISO 8601 timestamp */
	timestamp: z.string().datetime(),
});

export type DataFlowData = z.infer<typeof DataFlowDataSchema>;
