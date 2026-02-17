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
import type {
	CreateCycleEventInput,
	CreateCycleInput,
	Cycle,
	CycleAnalytics,
	CycleAnalyticsFilters,
	CycleEvent,
	CycleEventType,
	CyclePhase,
	CycleStatus,
	DecisionSummary,
	OrderSummary,
	PaginatedResult,
	PaginationOptions,
	ReconstructedAgentState,
	ReconstructedStreamingState,
	ReconstructedToolCall,
	UpdateCycleInput,
} from "./cycles.types";
import { mapCycleEventRow, mapCycleRow } from "./cycles.types";
import { buildCycleUpdateData } from "./cycles.update";
import { reconstructStreamingState, STREAMING_EVENT_TYPES } from "./cycles-streaming";

export { STREAMING_EVENT_TYPES, reconstructStreamingState };

export type {
	CreateCycleEventInput,
	CreateCycleInput,
	Cycle,
	CycleAnalytics,
	CycleAnalyticsFilters,
	CycleEvent,
	CycleEventType,
	CyclePhase,
	CycleStatus,
	DecisionSummary,
	OrderSummary,
	PaginatedResult,
	PaginationOptions,
	ReconstructedAgentState,
	ReconstructedStreamingState,
	ReconstructedToolCall,
	UpdateCycleInput,
};

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
		const updateData = buildCycleUpdateData(input);

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
