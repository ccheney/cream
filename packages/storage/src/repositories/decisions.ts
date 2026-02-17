/**
 * Decisions Repository (Drizzle ORM)
 *
 * Data access for trading decisions table.
 */
import { and, avg, count, desc, eq, gte, ilike, inArray, or, sql } from "drizzle-orm";
import { type Database, getDb } from "../db";
import { decisions } from "../schema/core-trading";
import { RepositoryError } from "./base";
import { buildDecisionAnalytics } from "./decisions.analytics";
import { buildDecisionFilterConditions } from "./decisions.filters";
import type {
	ConfidenceCalibrationBin,
	CreateDecisionInput,
	Decision,
	DecisionAction,
	DecisionAnalytics,
	DecisionDirection,
	DecisionFilters,
	DecisionStatus,
	SizeUnit,
	StrategyBreakdownItem,
} from "./decisions.types";
import { mapDecisionRow } from "./decisions.types";
import { buildDecisionUpdateData } from "./decisions.update";

export type {
	ConfidenceCalibrationBin,
	CreateDecisionInput,
	Decision,
	DecisionAction,
	DecisionAnalytics,
	DecisionDirection,
	DecisionFilters,
	DecisionStatus,
	SizeUnit,
	StrategyBreakdownItem,
};

export class DecisionsRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async create(input: CreateDecisionInput): Promise<Decision> {
		const [row] = await this.db
			.insert(decisions)
			.values({
				cycleId: input.cycleId,
				symbol: input.symbol,
				action: input.action,
				direction: input.direction,
				size: String(input.size),
				sizeUnit: input.sizeUnit ?? "SHARES",
				entryPrice: input.entryPrice != null ? String(input.entryPrice) : null,
				stopPrice: input.stopPrice != null ? String(input.stopPrice) : null,
				targetPrice: input.targetPrice != null ? String(input.targetPrice) : null,
				status: input.status ?? "pending",
				strategyFamily: input.strategyFamily ?? null,
				timeHorizon: input.timeHorizon ?? null,
				rationale: input.rationale ?? null,
				bullishFactors: input.bullishFactors ?? [],
				bearishFactors: input.bearishFactors ?? [],
				confidenceScore: input.confidenceScore != null ? String(input.confidenceScore) : null,
				riskScore: input.riskScore != null ? String(input.riskScore) : null,
				metadata: input.metadata ?? {},
				environment: input.environment as "PAPER" | "LIVE",
			})
			.returning();

		if (!row) {
			throw new Error("Failed to create decision");
		}
		return mapDecisionRow(row);
	}

	async findById(id: string): Promise<Decision | null> {
		const [row] = await this.db.select().from(decisions).where(eq(decisions.id, id)).limit(1);

		return row ? mapDecisionRow(row) : null;
	}

	async findByIdOrThrow(id: string): Promise<Decision> {
		const decision = await this.findById(id);
		if (!decision) {
			throw RepositoryError.notFound("decisions", id);
		}
		return decision;
	}

	async findMany(
		filters: DecisionFilters = {},
		pagination?: { limit?: number; offset?: number },
	): Promise<{ data: Decision[]; total: number; limit: number; offset: number }> {
		const conditions = buildDecisionFilterConditions(filters);
		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
		const limit = pagination?.limit ?? 20;
		const offset = pagination?.offset ?? 0;

		const [countResult] = await this.db
			.select({ count: count() })
			.from(decisions)
			.where(whereClause);

		const rows = await this.db
			.select()
			.from(decisions)
			.where(whereClause)
			.orderBy(desc(decisions.createdAt))
			.limit(limit)
			.offset(offset);

		return {
			data: rows.map(mapDecisionRow),
			total: countResult?.count ?? 0,
			limit,
			offset,
		};
	}

	async findBySymbol(symbol: string, limit = 20): Promise<Decision[]> {
		const rows = await this.db
			.select()
			.from(decisions)
			.where(eq(decisions.symbol, symbol))
			.orderBy(desc(decisions.createdAt))
			.limit(limit);

		return rows.map(mapDecisionRow);
	}

	async findByCycle(cycleId: string): Promise<Decision[]> {
		const rows = await this.db
			.select()
			.from(decisions)
			.where(eq(decisions.cycleId, cycleId))
			.orderBy(desc(decisions.createdAt));

		return rows.map(mapDecisionRow);
	}

	async findRecent(environment: string, limit = 10): Promise<Decision[]> {
		const rows = await this.db
			.select()
			.from(decisions)
			.where(eq(decisions.environment, environment as "PAPER" | "LIVE"))
			.orderBy(desc(decisions.createdAt))
			.limit(limit);

		return rows.map(mapDecisionRow);
	}

	/**
	 * Find recent decisions within a lookback window, optionally filtered by action.
	 * Useful for cross-cycle context (e.g., finding recent CLOSE decisions to prevent re-entry).
	 */
	async findRecentWithinWindow(
		environment: string,
		lookbackHours: number,
		options?: {
			actions?: DecisionAction[];
			status?: DecisionStatus[];
			symbols?: string[];
		},
	): Promise<Decision[]> {
		const cutoffTime = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);

		const conditions = [
			eq(decisions.environment, environment as "PAPER" | "LIVE"),
			gte(decisions.createdAt, cutoffTime),
		];

		if (options?.actions && options.actions.length > 0) {
			conditions.push(inArray(decisions.action, options.actions));
		}

		if (options?.status && options.status.length > 0) {
			conditions.push(inArray(decisions.status, options.status));
		}

		if (options?.symbols && options.symbols.length > 0) {
			conditions.push(inArray(decisions.symbol, options.symbols));
		}

		const rows = await this.db
			.select()
			.from(decisions)
			.where(and(...conditions))
			.orderBy(desc(decisions.createdAt));

		return rows.map(mapDecisionRow);
	}

	async updateStatus(id: string, status: DecisionStatus): Promise<Decision> {
		const [row] = await this.db
			.update(decisions)
			.set({ status, updatedAt: new Date() })
			.where(eq(decisions.id, id))
			.returning();

		if (!row) {
			throw RepositoryError.notFound("decisions", id);
		}

		return mapDecisionRow(row);
	}

	async update(
		id: string,
		updates: Partial<Omit<CreateDecisionInput, "id" | "cycleId" | "environment">>,
	): Promise<Decision> {
		const updateData = buildDecisionUpdateData(updates);

		const [row] = await this.db
			.update(decisions)
			.set(updateData)
			.where(eq(decisions.id, id))
			.returning();

		if (!row) {
			throw RepositoryError.notFound("decisions", id);
		}

		return mapDecisionRow(row);
	}

	async delete(id: string): Promise<boolean> {
		const result = await this.db
			.delete(decisions)
			.where(eq(decisions.id, id))
			.returning({ id: decisions.id });

		return result.length > 0;
	}

	async countByStatus(environment: string): Promise<Record<DecisionStatus, number>> {
		const rows = await this.db
			.select({ status: decisions.status, count: count() })
			.from(decisions)
			.where(eq(decisions.environment, environment as "PAPER" | "LIVE"))
			.groupBy(decisions.status);

		const result: Record<string, number> = {
			pending: 0,
			approved: 0,
			rejected: 0,
			executed: 0,
			cancelled: 0,
			expired: 0,
		};

		for (const row of rows) {
			result[row.status] = row.count;
		}

		return result as Record<DecisionStatus, number>;
	}

	async search(query: string, limit = 5): Promise<Pick<Decision, "id" | "symbol" | "action">[]> {
		const rows = await this.db
			.select({
				id: decisions.id,
				symbol: decisions.symbol,
				action: decisions.action,
			})
			.from(decisions)
			.where(or(ilike(decisions.symbol, `%${query}%`), ilike(decisions.action, `%${query}%`)))
			.orderBy(desc(decisions.createdAt))
			.limit(limit);

		return rows.map((row) => ({
			id: row.id,
			symbol: row.symbol,
			action: row.action as DecisionAction,
		}));
	}

	async getDecisionAnalytics(filters: DecisionFilters = {}): Promise<DecisionAnalytics> {
		const conditions = buildDecisionFilterConditions(filters);
		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		const [statusCounts, actionCounts, directionCounts, avgScores] = await Promise.all([
			this.db
				.select({ status: decisions.status, count: count() })
				.from(decisions)
				.where(whereClause)
				.groupBy(decisions.status),
			this.db
				.select({ action: decisions.action, count: count() })
				.from(decisions)
				.where(whereClause)
				.groupBy(decisions.action),
			this.db
				.select({ direction: decisions.direction, count: count() })
				.from(decisions)
				.where(whereClause)
				.groupBy(decisions.direction),
			this.db
				.select({
					avgConfidence: avg(decisions.confidenceScore),
					avgRisk: avg(decisions.riskScore),
					total: count(),
				})
				.from(decisions)
				.where(whereClause),
		]);

		return buildDecisionAnalytics(statusCounts, actionCounts, directionCounts, avgScores[0]);
	}

	async getConfidenceCalibration(
		filters: DecisionFilters = {},
	): Promise<ConfidenceCalibrationBin[]> {
		const conditions = buildDecisionFilterConditions(filters);
		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		const rows = await this.db
			.select({
				confidenceBin: sql<string>`
					CASE
						WHEN ${decisions.confidenceScore}::numeric < 0.2 THEN '0-20'
						WHEN ${decisions.confidenceScore}::numeric < 0.4 THEN '20-40'
						WHEN ${decisions.confidenceScore}::numeric < 0.6 THEN '40-60'
						WHEN ${decisions.confidenceScore}::numeric < 0.8 THEN '60-80'
						ELSE '80-100'
					END
				`.as("confidence_bin"),
				total: count(),
				executed:
					sql<number>`COUNT(*) FILTER (WHERE ${decisions.status} IN ('executed', 'approved'))`.as(
						"executed",
					),
			})
			.from(decisions)
			.where(and(whereClause, sql`${decisions.confidenceScore} IS NOT NULL`))
			.groupBy(
				sql`CASE
					WHEN ${decisions.confidenceScore}::numeric < 0.2 THEN '0-20'
					WHEN ${decisions.confidenceScore}::numeric < 0.4 THEN '20-40'
					WHEN ${decisions.confidenceScore}::numeric < 0.6 THEN '40-60'
					WHEN ${decisions.confidenceScore}::numeric < 0.8 THEN '60-80'
					ELSE '80-100'
				END`,
			)
			.orderBy(sql.raw(`"confidence_bin" ASC`));

		return rows.map((row) => ({
			bin: row.confidenceBin,
			total: row.total,
			executed: Number(row.executed),
			executionRate: row.total > 0 ? (Number(row.executed) / row.total) * 100 : 0,
		}));
	}

	async getStrategyBreakdown(filters: DecisionFilters = {}): Promise<StrategyBreakdownItem[]> {
		const conditions = buildDecisionFilterConditions(filters);
		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		const rows = await this.db
			.select({
				strategyFamily: sql<string>`COALESCE(${decisions.strategyFamily}, 'Unknown')`.as(
					"strategy_family",
				),
				total: count(),
				executed:
					sql<number>`COUNT(*) FILTER (WHERE ${decisions.status} IN ('executed', 'approved'))`.as(
						"executed",
					),
				avgConfidence: avg(decisions.confidenceScore),
				avgRisk: avg(decisions.riskScore),
			})
			.from(decisions)
			.where(whereClause)
			.groupBy(sql`COALESCE(${decisions.strategyFamily}, 'Unknown')`)
			.orderBy(desc(count()));

		return rows.map((row) => ({
			strategyFamily: row.strategyFamily,
			count: row.total,
			executedCount: Number(row.executed),
			approvalRate: row.total > 0 ? (Number(row.executed) / row.total) * 100 : 0,
			avgConfidence: row.avgConfidence ? Number(row.avgConfidence) : null,
			avgRisk: row.avgRisk ? Number(row.avgRisk) : null,
		}));
	}
}
