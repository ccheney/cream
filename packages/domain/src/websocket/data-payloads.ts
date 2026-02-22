import { z } from "zod/v4";
import {
	AgentType,
	AgentVote,
	AlertSeverity,
	CyclePhase,
	OrderStatus,
	SystemHealthStatus,
} from "./channel.js";

export const QuoteDataSchema = z.object({
	symbol: z.string().min(1).max(20),

	bid: z.number().nonnegative(),

	ask: z.number().nonnegative(),

	last: z.number().nonnegative(),

	bidSize: z.number().int().nonnegative().optional(),

	askSize: z.number().int().nonnegative().optional(),

	volume: z.number().int().nonnegative(),

	prevClose: z.number().nonnegative().optional(),

	changePercent: z.number().optional(),

	timestamp: z.string().datetime(),
});

export type QuoteData = z.infer<typeof QuoteDataSchema>;

export const AggregateDataSchema = z.object({
	symbol: z.string().min(1).max(20),

	open: z.number(),

	high: z.number(),

	low: z.number(),

	close: z.number(),

	volume: z.number(),

	vwap: z.number().optional(),

	timestamp: z.string().datetime(),

	endTimestamp: z.string().datetime().optional(),
});

export type AggregateData = z.infer<typeof AggregateDataSchema>;

export const OrderDataSchema = z.object({
	id: z.string().uuid(),

	clientOrderId: z.string().optional(),

	symbol: z.string().min(1).max(20),

	side: z.enum(["buy", "sell"]),

	orderType: z.enum(["market", "limit", "stop", "stop_limit"]),

	status: OrderStatus,

	quantity: z.number().int().positive(),

	filledQty: z.number().int().nonnegative(),

	remainingQty: z.number().int().nonnegative().optional(),

	limitPrice: z.number().nonnegative().optional(),

	stopPrice: z.number().nonnegative().optional(),

	avgPrice: z.number().nonnegative().optional(),

	timeInForce: z.enum(["day", "gtc", "ioc", "fok"]).optional(),

	timestamp: z.string().datetime(),

	rejectReason: z.string().optional(),
});

export type OrderData = z.infer<typeof OrderDataSchema>;

export const AgentOutputDataSchema = z.object({
	cycleId: z.string(),

	agentType: AgentType,

	symbol: z.string().min(1).max(20).optional(),

	status: z.enum(["running", "complete", "error"]),

	output: z.string(),

	vote: AgentVote.optional(),

	confidence: z.number().min(0).max(1).optional(),

	durationMs: z.number().int().nonnegative().optional(),

	error: z.string().optional(),

	timestamp: z.string().datetime(),
});

export type AgentOutputData = z.infer<typeof AgentOutputDataSchema>;

export const CycleProgressDataSchema = z.object({
	cycleId: z.string(),

	phase: CyclePhase,

	step: z.string(),

	progress: z.number().min(0).max(100),

	message: z.string(),

	activeSymbol: z.string().optional(),

	totalSymbols: z.number().int().nonnegative().optional(),

	completedSymbols: z.number().int().nonnegative().optional(),

	startedAt: z.string().datetime().optional(),

	estimatedCompletion: z.string().datetime().optional(),

	timestamp: z.string().datetime(),
});

export type CycleProgressData = z.infer<typeof CycleProgressDataSchema>;

export const DecisionSummarySchema = z.object({
	symbol: z.string(),
	action: z.enum(["BUY", "SELL", "HOLD"]),
	direction: z.enum(["LONG", "SHORT", "FLAT"]),
	confidence: z.number().min(0).max(1),
});

export type DecisionSummary = z.infer<typeof DecisionSummarySchema>;

export const OrderSummarySchema = z.object({
	orderId: z.string(),
	symbol: z.string(),
	side: z.enum(["buy", "sell"]),
	quantity: z.number(),
	status: z.enum(["submitted", "filled", "rejected"]),
});

export type OrderSummary = z.infer<typeof OrderSummarySchema>;

export const CycleResultDataSchema = z.object({
	cycleId: z.string(),

	environment: z.enum(["PAPER", "LIVE"]),

	status: z.enum(["completed", "failed"]),

	result: z
		.object({
			approved: z.boolean(),
			iterations: z.number().int().nonnegative(),
			decisions: z.array(DecisionSummarySchema),
			orders: z.array(OrderSummarySchema),
		})
		.optional(),

	error: z.string().optional(),

	durationMs: z.number().int().nonnegative(),

	configVersion: z.string().optional(),

	timestamp: z.string().datetime(),
});

export type CycleResultData = z.infer<typeof CycleResultDataSchema>;

export const AlertDataSchema = z.object({
	id: z.string().uuid(),

	severity: AlertSeverity,

	title: z.string(),

	message: z.string(),

	symbol: z.string().min(1).max(20).optional(),

	orderId: z.string().uuid().optional(),

	category: z.enum(["order", "position", "risk", "system", "agent", "market"]).optional(),

	acknowledged: z.boolean().default(false),

	timestamp: z.string().datetime(),
});

export type AlertData = z.infer<typeof AlertDataSchema>;

export const SystemStatusDataSchema = z.object({
	health: SystemHealthStatus,

	uptimeSeconds: z.number().int().nonnegative(),

	activeConnections: z.number().int().nonnegative(),

	services: z.record(
		z.string(),
		z.object({
			status: SystemHealthStatus,
			latencyMs: z.number().nonnegative().optional(),
			lastCheck: z.string().datetime(),
		}),
	),

	environment: z.enum(["PAPER", "LIVE"]),

	activeCycleId: z.string().optional(),

	lastSuccessfulCycle: z.string().datetime().optional(),

	timestamp: z.string().datetime(),
});

export type SystemStatusData = z.infer<typeof SystemStatusDataSchema>;

export const PortfolioDataSchema = z.object({
	totalValue: z.number(),

	cash: z.number(),

	buyingPower: z.number(),

	dailyPnl: z.number(),

	dailyPnlPercent: z.number(),

	openPositions: z.number().int().nonnegative(),

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

	timestamp: z.string().datetime(),
});

export type PortfolioData = z.infer<typeof PortfolioDataSchema>;

export const ScannerSignalSchema = z.enum(["volume_spike", "price_move", "gap"]);

export type ScannerSignal = z.infer<typeof ScannerSignalSchema>;

export const ScannerAlertDataSchema = z.object({
	symbol: z.string().min(1).max(20),
	signals: z.array(ScannerSignalSchema).min(1),
	price: z.number().nonnegative(),
	volume: z.number().int().nonnegative(),
	avgVolume: z.number().int().nonnegative(),
	volumeRatio: z.number().nonnegative(),
	priceChangePct: z.number(),
	gapPct: z.number(),
	approxAtr: z.number().nonnegative(),
	timestamp: z.string().datetime(),
});

export type ScannerAlertData = z.infer<typeof ScannerAlertDataSchema>;

export const ScannerStatusDataSchema = z.object({
	active: z.boolean(),
	symbolsTracked: z.number().int().nonnegative(),
	totalAlerts: z.number().int().nonnegative(),
	alertsLastHour: z.number().int().nonnegative(),
	configVersion: z.string().optional(),
	timestamp: z.string().datetime(),
});

export type ScannerStatusData = z.infer<typeof ScannerStatusDataSchema>;

export const ToolCallChunkDataSchema = z.object({
	cycleId: z.string(),

	agentType: AgentType,

	toolName: z.string(),

	toolArgs: z.string(),

	toolCallId: z.string(),

	timestamp: z.string().datetime(),
});

export type ToolCallChunkData = z.infer<typeof ToolCallChunkDataSchema>;

export const ToolResultChunkDataSchema = z.object({
	cycleId: z.string(),

	agentType: AgentType,

	toolName: z.string(),

	toolCallId: z.string(),

	resultSummary: z.string(),

	success: z.boolean(),

	durationMs: z.number().int().nonnegative().optional(),

	timestamp: z.string().datetime(),
});

export type ToolResultChunkData = z.infer<typeof ToolResultChunkDataSchema>;

export const ReasoningChunkDataSchema = z.object({
	cycleId: z.string(),

	agentType: AgentType,

	text: z.string(),

	timestamp: z.string().datetime(),
});

export type ReasoningChunkData = z.infer<typeof ReasoningChunkDataSchema>;

export const TextDeltaChunkDataSchema = z.object({
	cycleId: z.string(),

	agentType: AgentType,

	text: z.string(),

	timestamp: z.string().datetime(),
});

export type TextDeltaChunkData = z.infer<typeof TextDeltaChunkDataSchema>;

export const AgentStatusDataSchema = z.object({
	type: AgentType,

	displayName: z.string(),

	status: z.enum(["idle", "processing", "error"]),

	lastOutputAt: z.string().datetime().nullable(),

	outputsToday: z.number().int().nonnegative(),

	avgConfidence: z.number().min(0).max(1),

	approvalRate: z.number().min(0).max(1),

	timestamp: z.string().datetime(),
});

export type AgentStatusData = z.infer<typeof AgentStatusDataSchema>;

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

export const PhaseStartDataSchema = z.object({
	cycleId: z.string(),

	phase: OODAPhaseSchema,

	timestamp: z.string().datetime(),
});

export type PhaseStartData = z.infer<typeof PhaseStartDataSchema>;

export const PhaseCompleteDataSchema = z.object({
	cycleId: z.string(),

	phase: OODAPhaseSchema,

	durationMs: z.number().int().nonnegative().optional(),

	timestamp: z.string().datetime(),
});

export type PhaseCompleteData = z.infer<typeof PhaseCompleteDataSchema>;

export const DataFlowDataSchema = z.object({
	cycleId: z.string(),

	from: z.string(),

	to: z.string(),

	label: z.string(),

	timestamp: z.string().datetime(),
});

export type DataFlowData = z.infer<typeof DataFlowDataSchema>;
