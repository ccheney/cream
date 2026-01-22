/**
 * Cycles Repository (Drizzle ORM)
 *
 * Data access for OODA trading cycles and cycle events.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md
 */
import { and, avg, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { type Database, getDb } from "../db";
import { cycleEvents, cycles } from "../schema/core-trading";
import { RepositoryError } from "./base";

// ============================================
// Types
// ============================================

export type CycleStatus = "running" | "completed" | "failed";
export type CyclePhase = "observe" | "orient" | "decide" | "act" | "complete";

export interface DecisionSummary {
	symbol: string;
	action: "BUY" | "SELL" | "HOLD";
	direction: "LONG" | "SHORT" | "FLAT";
	confidence: number;
}

export interface OrderSummary {
	orderId: string;
	symbol: string;
	side: "buy" | "sell";
	quantity: number;
	status: "submitted" | "filled" | "rejected";
}

export interface Cycle {
	id: string;
	environment: string;
	status: CycleStatus;
	startedAt: string;
	completedAt: string | null;
	durationMs: number | null;
	currentPhase: CyclePhase | null;
	phaseStartedAt: string | null;
	totalSymbols: number;
	completedSymbols: number;
	progressPct: number;
	approved: boolean | null;
	iterations: number | null;
	decisionsCount: number;
	ordersCount: number;
	decisions: DecisionSummary[];
	orders: OrderSummary[];
	errorMessage: string | null;
	errorStack: string | null;
	configVersion: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface CreateCycleInput {
	id?: string;
	environment: string;
	totalSymbols?: number;
	configVersion?: string;
}

export interface UpdateCycleInput {
	status?: CycleStatus;
	completedAt?: string;
	durationMs?: number;
	currentPhase?: CyclePhase;
	phaseStartedAt?: string;
	completedSymbols?: number;
	progressPct?: number;
	approved?: boolean;
	iterations?: number;
	decisionsCount?: number;
	ordersCount?: number;
	decisions?: DecisionSummary[];
	orders?: OrderSummary[];
	errorMessage?: string;
	errorStack?: string;
}

export type CycleEventType =
	| "phase_change"
	| "agent_start"
	| "agent_complete"
	| "decision"
	| "order"
	| "error"
	| "progress"
	| "tool_call"
	| "tool_result"
	| "reasoning_delta"
	| "text_delta";

export interface CycleEvent {
	id: number;
	cycleId: string;
	eventType: CycleEventType;
	phase: CyclePhase | null;
	agentType: string | null;
	symbol: string | null;
	message: string | null;
	data: Record<string, unknown>;
	timestamp: string;
	durationMs: number | null;
}

export interface CreateCycleEventInput {
	cycleId: string;
	eventType: CycleEventType;
	phase?: CyclePhase;
	agentType?: string;
	symbol?: string;
	message?: string;
	data?: Record<string, unknown>;
	durationMs?: number;
}

export interface PaginationOptions {
	page?: number;
	pageSize?: number;
}

export interface PaginatedResult<T> {
	data: T[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
}

// ============================================
// Streaming Event Types
// ============================================

export const STREAMING_EVENT_TYPES: CycleEventType[] = [
	"tool_call",
	"tool_result",
	"reasoning_delta",
	"text_delta",
	"agent_start",
	"agent_complete",
];

// ============================================
// Streaming State Types
// ============================================

export interface ReconstructedToolCall {
	toolCallId: string;
	toolName: string;
	toolArgs: string;
	status: "pending" | "complete" | "error";
	resultSummary?: string;
	durationMs?: number;
	timestamp: string;
}

export interface ReconstructedAgentState {
	status: "idle" | "processing" | "complete" | "error";
	toolCalls: ReconstructedToolCall[];
	reasoningText: string;
	textOutput: string;
	error?: string;
	lastUpdate: string | null;
	startedAt: string | null;
}

export interface ReconstructedStreamingState {
	agents: Record<string, ReconstructedAgentState>;
	cycleId: string;
}

// ============================================
// Helper Functions
// ============================================

export function reconstructStreamingState(events: CycleEvent[]): ReconstructedStreamingState {
	const agents: Record<string, ReconstructedAgentState> = {};

	const getOrCreateAgent = (agentType: string): ReconstructedAgentState => {
		if (!agents[agentType]) {
			agents[agentType] = {
				status: "idle",
				toolCalls: [],
				reasoningText: "",
				textOutput: "",
				lastUpdate: null,
				startedAt: null,
			};
		}
		return agents[agentType] as ReconstructedAgentState;
	};

	const toolCallMap = new Map<string, ReconstructedToolCall>();

	for (const event of events) {
		if (!event.agentType) {
			continue;
		}

		const agent = getOrCreateAgent(event.agentType);
		agent.lastUpdate = event.timestamp;

		switch (event.eventType) {
			case "agent_start":
				agent.status = "processing";
				agent.startedAt = event.timestamp;
				break;

			case "agent_complete":
				agent.status = "complete";
				break;

			case "tool_call": {
				agent.status = "processing";
				const data = event.data as {
					toolCallId?: string;
					toolName?: string;
					toolArgs?: string;
				};
				if (data.toolCallId) {
					const toolCall: ReconstructedToolCall = {
						toolCallId: data.toolCallId,
						toolName: data.toolName ?? "unknown",
						toolArgs: data.toolArgs ?? "{}",
						status: "pending",
						timestamp: event.timestamp,
					};
					toolCallMap.set(data.toolCallId, toolCall);
				}
				break;
			}

			case "tool_result": {
				const data = event.data as {
					toolCallId?: string;
					success?: boolean;
					resultSummary?: string;
					durationMs?: number;
				};
				const existing = data.toolCallId ? toolCallMap.get(data.toolCallId) : undefined;
				if (existing) {
					existing.status = data.success ? "complete" : "error";
					existing.resultSummary = data.resultSummary;
					existing.durationMs = data.durationMs;
				}
				break;
			}

			case "reasoning_delta": {
				agent.status = "processing";
				const data = event.data as { text?: string };
				if (data.text) {
					agent.reasoningText += data.text;
				}
				break;
			}

			case "text_delta": {
				agent.status = "processing";
				const data = event.data as { text?: string };
				if (data.text) {
					agent.textOutput += data.text;
				}
				break;
			}

			case "error": {
				agent.status = "error";
				agent.error = event.message ?? "Unknown error";
				break;
			}
		}
	}

	for (const agent of Object.values(agents)) {
		const agentToolCalls = Array.from(toolCallMap.values()).filter((tc) => {
			const toolEvent = events.find(
				(e) =>
					e.eventType === "tool_call" &&
					(e.data as { toolCallId?: string }).toolCallId === tc.toolCallId,
			);
			return toolEvent?.agentType && agents[toolEvent.agentType] === agent;
		});
		agent.toolCalls = agentToolCalls.toSorted(
			(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
		);
	}

	const cycleId = events[0]?.cycleId ?? "";
	return { agents, cycleId };
}

// ============================================
// Row Mapping
// ============================================

type CycleRow = typeof cycles.$inferSelect;
type CycleEventRow = typeof cycleEvents.$inferSelect;

function mapCycleRow(row: CycleRow): Cycle {
	return {
		id: row.id,
		environment: row.environment,
		status: row.status as CycleStatus,
		startedAt: row.startedAt.toISOString(),
		completedAt: row.completedAt?.toISOString() ?? null,
		durationMs: row.durationMs,
		currentPhase: row.currentPhase as CyclePhase | null,
		phaseStartedAt: row.phaseStartedAt?.toISOString() ?? null,
		totalSymbols: row.totalSymbols ?? 0,
		completedSymbols: row.completedSymbols ?? 0,
		progressPct: row.progressPct ? Number(row.progressPct) : 0,
		approved: row.approved,
		iterations: row.iterations,
		decisionsCount: row.decisionsCount ?? 0,
		ordersCount: row.ordersCount ?? 0,
		decisions: (row.decisionsJson as DecisionSummary[]) ?? [],
		orders: (row.ordersJson as OrderSummary[]) ?? [],
		errorMessage: row.errorMessage,
		errorStack: row.errorStack,
		configVersion: row.configVersion,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

function mapCycleEventRow(row: CycleEventRow): CycleEvent {
	return {
		id: row.id,
		cycleId: row.cycleId,
		eventType: row.eventType as CycleEventType,
		phase: row.phase as CyclePhase | null,
		agentType: row.agentType,
		symbol: row.symbol,
		message: row.message,
		data: (row.dataJson as Record<string, unknown>) ?? {},
		timestamp: row.timestamp.toISOString(),
		durationMs: row.durationMs,
	};
}

// ============================================
// Repository
// ============================================

export class CyclesRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async create(input: CreateCycleInput): Promise<Cycle> {
		const now = new Date();

		const values: typeof cycles.$inferInsert = {
			environment: input.environment as "PAPER" | "LIVE",
			status: "running",
			startedAt: now,
			totalSymbols: input.totalSymbols ?? 0,
			configVersion: input.configVersion ?? null,
		};

		// Only include id if explicitly provided; otherwise let DB generate via uuidv7()
		if (input.id) {
			values.id = input.id;
		}

		const [row] = await this.db.insert(cycles).values(values).returning();

		if (!row) {
			throw new Error("Failed to create cycle");
		}
		return mapCycleRow(row);
	}

	async findById(id: string): Promise<Cycle | null> {
		const [row] = await this.db.select().from(cycles).where(eq(cycles.id, id)).limit(1);

		return row ? mapCycleRow(row) : null;
	}

	async findByIdOrThrow(id: string): Promise<Cycle> {
		const cycle = await this.findById(id);
		if (!cycle) {
			throw RepositoryError.notFound("cycles", id);
		}
		return cycle;
	}

	async update(id: string, input: UpdateCycleInput): Promise<Cycle> {
		const updateData: Partial<typeof cycles.$inferInsert> = {
			updatedAt: new Date(),
		};

		if (input.status !== undefined) {
			updateData.status = input.status;
		}
		if (input.completedAt !== undefined) {
			updateData.completedAt = new Date(input.completedAt);
		}
		if (input.durationMs !== undefined) {
			updateData.durationMs = input.durationMs;
		}
		if (input.currentPhase !== undefined) {
			updateData.currentPhase = input.currentPhase;
		}
		if (input.phaseStartedAt !== undefined) {
			updateData.phaseStartedAt = new Date(input.phaseStartedAt);
		}
		if (input.completedSymbols !== undefined) {
			updateData.completedSymbols = input.completedSymbols;
		}
		if (input.progressPct !== undefined) {
			updateData.progressPct = String(input.progressPct);
		}
		if (input.approved !== undefined) {
			updateData.approved = input.approved;
		}
		if (input.iterations !== undefined) {
			updateData.iterations = input.iterations;
		}
		if (input.decisionsCount !== undefined) {
			updateData.decisionsCount = input.decisionsCount;
		}
		if (input.ordersCount !== undefined) {
			updateData.ordersCount = input.ordersCount;
		}
		if (input.decisions !== undefined) {
			updateData.decisionsJson = input.decisions;
		}
		if (input.orders !== undefined) {
			updateData.ordersJson = input.orders;
		}
		if (input.errorMessage !== undefined) {
			updateData.errorMessage = input.errorMessage;
		}
		if (input.errorStack !== undefined) {
			updateData.errorStack = input.errorStack;
		}

		const [row] = await this.db.update(cycles).set(updateData).where(eq(cycles.id, id)).returning();

		if (!row) {
			throw RepositoryError.notFound("cycles", id);
		}

		return mapCycleRow(row);
	}

	async findMany(options?: {
		environment?: string;
		status?: CycleStatus;
		pagination?: PaginationOptions;
	}): Promise<PaginatedResult<Cycle>> {
		const conditions = [];

		if (options?.environment) {
			conditions.push(eq(cycles.environment, options.environment as "PAPER" | "LIVE"));
		}
		if (options?.status) {
			conditions.push(eq(cycles.status, options.status));
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
		const page = options?.pagination?.page ?? 1;
		const pageSize = options?.pagination?.pageSize ?? 50;
		const offset = (page - 1) * pageSize;

		const [countResult] = await this.db.select({ count: count() }).from(cycles).where(whereClause);

		const rows = await this.db
			.select()
			.from(cycles)
			.where(whereClause)
			.orderBy(desc(cycles.startedAt))
			.limit(pageSize)
			.offset(offset);

		const total = countResult?.count ?? 0;

		return {
			data: rows.map(mapCycleRow),
			total,
			page,
			pageSize,
			totalPages: Math.ceil(total / pageSize),
		};
	}

	async findRecent(environment: string, limit = 10): Promise<Cycle[]> {
		const rows = await this.db
			.select()
			.from(cycles)
			.where(eq(cycles.environment, environment as "PAPER" | "LIVE"))
			.orderBy(desc(cycles.startedAt))
			.limit(limit);

		return rows.map(mapCycleRow);
	}

	async markOrphanedAsFailed(): Promise<number> {
		const now = new Date();

		const result = await this.db
			.update(cycles)
			.set({
				status: "failed",
				completedAt: now,
				errorMessage: "Server restarted - cycle orphaned",
				updatedAt: now,
			})
			.where(eq(cycles.status, "running"))
			.returning({ id: cycles.id });

		return result.length;
	}

	// Cycle Events

	async addEvent(input: CreateCycleEventInput): Promise<CycleEvent> {
		const [row] = await this.db
			.insert(cycleEvents)
			.values({
				cycleId: input.cycleId,
				eventType: input.eventType as typeof cycleEvents.$inferInsert.eventType,
				phase: input.phase as typeof cycleEvents.$inferInsert.phase,
				agentType: input.agentType as typeof cycleEvents.$inferInsert.agentType,
				symbol: input.symbol ?? null,
				message: input.message ?? null,
				dataJson: input.data ?? null,
				durationMs: input.durationMs ?? null,
			})
			.returning();

		if (!row) {
			throw new Error("Failed to add cycle event");
		}
		return mapCycleEventRow(row);
	}

	async addEventsBatch(events: CreateCycleEventInput[]): Promise<void> {
		if (events.length === 0) {
			return;
		}

		const values = events.map((input) => ({
			cycleId: input.cycleId,
			eventType: input.eventType as typeof cycleEvents.$inferInsert.eventType,
			phase: input.phase as typeof cycleEvents.$inferInsert.phase,
			agentType: input.agentType as typeof cycleEvents.$inferInsert.agentType,
			symbol: input.symbol ?? null,
			message: input.message ?? null,
			dataJson: input.data ?? null,
			durationMs: input.durationMs ?? null,
		}));

		await this.db.insert(cycleEvents).values(values);
	}

	async findEvents(
		cycleId: string,
		options?: { eventType?: CycleEventType },
	): Promise<CycleEvent[]> {
		const conditions = [eq(cycleEvents.cycleId, cycleId)];

		if (options?.eventType) {
			conditions.push(
				eq(cycleEvents.eventType, options.eventType as typeof cycleEvents.$inferInsert.eventType),
			);
		}

		const rows = await this.db
			.select()
			.from(cycleEvents)
			.where(and(...conditions))
			.orderBy(cycleEvents.timestamp);

		return rows.map(mapCycleEventRow);
	}

	async findStreamingEvents(cycleId: string): Promise<CycleEvent[]> {
		const rows = await this.db
			.select()
			.from(cycleEvents)
			.where(
				and(
					eq(cycleEvents.cycleId, cycleId),
					inArray(
						cycleEvents.eventType,
						STREAMING_EVENT_TYPES as (typeof cycleEvents.$inferInsert.eventType)[],
					),
				),
			)
			.orderBy(cycleEvents.timestamp);

		return rows.map(mapCycleEventRow);
	}

	// Convenience methods

	async start(
		environment: string,
		totalSymbols = 0,
		configVersion?: string,
		id?: string,
	): Promise<Cycle> {
		return this.create({ id, environment, totalSymbols, configVersion });
	}

	async updateProgress(
		id: string,
		phase: CyclePhase,
		completedSymbols: number,
		progressPct: number,
		message?: string,
	): Promise<void> {
		await this.update(id, {
			currentPhase: phase,
			phaseStartedAt: new Date().toISOString(),
			completedSymbols,
			progressPct,
		});

		if (message) {
			await this.addEvent({
				cycleId: id,
				eventType: "progress",
				phase,
				message,
			});
		}
	}

	async complete(
		id: string,
		result: {
			approved: boolean;
			iterations: number;
			decisions: DecisionSummary[];
			orders: OrderSummary[];
			durationMs: number;
		},
	): Promise<Cycle> {
		return this.update(id, {
			status: "completed",
			completedAt: new Date().toISOString(),
			durationMs: result.durationMs,
			currentPhase: "complete",
			approved: result.approved,
			iterations: result.iterations,
			decisionsCount: result.decisions.length,
			ordersCount: result.orders.length,
			decisions: result.decisions,
			orders: result.orders,
			progressPct: 100,
		});
	}

	async fail(id: string, error: string, stack?: string, durationMs?: number): Promise<Cycle> {
		return this.update(id, {
			status: "failed",
			completedAt: new Date().toISOString(),
			durationMs,
			errorMessage: error,
			errorStack: stack,
		});
	}

	async getCycleAnalytics(filters: CycleAnalyticsFilters = {}): Promise<CycleAnalytics> {
		const conditions = this.buildFilterConditions(filters);
		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		const [statusCounts, avgStats] = await Promise.all([
			this.db
				.select({ status: cycles.status, count: count() })
				.from(cycles)
				.where(whereClause)
				.groupBy(cycles.status),
			this.db
				.select({
					total: count(),
					avgDuration: avg(cycles.durationMs),
					totalDecisions: sql<string>`SUM(${cycles.decisionsCount})`.as("total_decisions"),
					totalOrders: sql<string>`SUM(${cycles.ordersCount})`.as("total_orders"),
					approvedCount: sql<number>`COUNT(*) FILTER (WHERE ${cycles.approved} = true)`.as(
						"approved_count",
					),
				})
				.from(cycles)
				.where(whereClause),
		]);

		const statusDistribution: Record<string, number> = {
			running: 0,
			completed: 0,
			failed: 0,
		};
		for (const row of statusCounts) {
			statusDistribution[row.status] = row.count;
		}

		const total = avgStats[0]?.total ?? 0;
		const completed = statusDistribution.completed ?? 0;
		const approved = Number(avgStats[0]?.approvedCount ?? 0);

		const completionRate = total > 0 ? (completed / total) * 100 : 0;
		const approvalRate = completed > 0 ? (approved / completed) * 100 : 0;

		return {
			totalCycles: total,
			completionRate,
			approvalRate,
			avgDurationMs: avgStats[0]?.avgDuration ? Number(avgStats[0].avgDuration) : null,
			totalDecisions: avgStats[0]?.totalDecisions ? Number(avgStats[0].totalDecisions) : 0,
			totalOrders: avgStats[0]?.totalOrders ? Number(avgStats[0].totalOrders) : 0,
			statusDistribution,
		};
	}

	private buildFilterConditions(filters: CycleAnalyticsFilters) {
		const conditions = [];

		if (filters.environment) {
			conditions.push(eq(cycles.environment, filters.environment as "PAPER" | "LIVE"));
		}
		if (filters.status) {
			conditions.push(eq(cycles.status, filters.status));
		}
		if (filters.fromDate) {
			conditions.push(gte(cycles.startedAt, new Date(filters.fromDate)));
		}
		if (filters.toDate) {
			conditions.push(lte(cycles.startedAt, new Date(filters.toDate)));
		}

		return conditions;
	}
}

// ============================================
// Analytics Types
// ============================================

export interface CycleAnalyticsFilters {
	environment?: string;
	status?: CycleStatus;
	fromDate?: string;
	toDate?: string;
}

export interface CycleAnalytics {
	totalCycles: number;
	completionRate: number;
	approvalRate: number;
	avgDurationMs: number | null;
	totalDecisions: number;
	totalOrders: number;
	statusDistribution: Record<string, number>;
}
