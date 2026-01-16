/**
 * Decisions Repository (Drizzle ORM)
 *
 * Data access for trading decisions table.
 */
import { and, count, desc, eq, gte, ilike, inArray, lte, or } from "drizzle-orm";
import { type Database, getDb } from "../db";
import { decisions } from "../schema/core-trading";
import { RepositoryError } from "./base";

// ============================================
// Types
// ============================================

export type DecisionStatus =
	| "pending"
	| "approved"
	| "rejected"
	| "executed"
	| "cancelled"
	| "expired";

export type DecisionAction = "BUY" | "SELL" | "HOLD" | "CLOSE" | "INCREASE" | "REDUCE" | "NO_TRADE";
export type SizeUnit = "SHARES" | "CONTRACTS" | "DOLLARS" | "PCT_EQUITY";
export type DecisionDirection = "LONG" | "SHORT" | "FLAT";

export interface Decision {
	id: string;
	cycleId: string;
	symbol: string;
	action: DecisionAction;
	direction: DecisionDirection;
	size: number;
	sizeUnit: SizeUnit;
	entryPrice: number | null;
	stopPrice: number | null;
	targetPrice: number | null;
	status: DecisionStatus;
	strategyFamily: string | null;
	timeHorizon: string | null;
	rationale: string | null;
	bullishFactors: string[];
	bearishFactors: string[];
	confidenceScore: number | null;
	riskScore: number | null;
	metadata: Record<string, unknown>;
	environment: string;
	createdAt: string;
	updatedAt: string;
}

export interface CreateDecisionInput {
	id?: string;
	cycleId: string;
	symbol: string;
	action: DecisionAction;
	direction: DecisionDirection;
	size: number;
	sizeUnit?: SizeUnit;
	entryPrice?: number | null;
	stopPrice?: number | null;
	targetPrice?: number | null;
	status?: DecisionStatus;
	strategyFamily?: string | null;
	timeHorizon?: string | null;
	rationale?: string | null;
	bullishFactors?: string[];
	bearishFactors?: string[];
	confidenceScore?: number | null;
	riskScore?: number | null;
	metadata?: Record<string, unknown>;
	environment: string;
}

export interface DecisionFilters {
	symbol?: string;
	status?: DecisionStatus | DecisionStatus[];
	action?: DecisionAction;
	direction?: DecisionDirection;
	environment?: string;
	cycleId?: string;
	fromDate?: string;
	toDate?: string;
}

// ============================================
// Row Mapping
// ============================================

type DecisionRow = typeof decisions.$inferSelect;

function mapDecisionRow(row: DecisionRow): Decision {
	return {
		id: row.id,
		cycleId: row.cycleId,
		symbol: row.symbol,
		action: row.action as DecisionAction,
		direction: row.direction as DecisionDirection,
		size: Number(row.size),
		sizeUnit: row.sizeUnit as SizeUnit,
		entryPrice: row.entryPrice ? Number(row.entryPrice) : null,
		stopPrice: row.stopPrice ? Number(row.stopPrice) : null,
		targetPrice: row.targetPrice ? Number(row.targetPrice) : null,
		status: row.status as DecisionStatus,
		strategyFamily: row.strategyFamily,
		timeHorizon: row.timeHorizon,
		rationale: row.rationale,
		bullishFactors: (row.bullishFactors as string[]) ?? [],
		bearishFactors: (row.bearishFactors as string[]) ?? [],
		confidenceScore: row.confidenceScore ? Number(row.confidenceScore) : null,
		riskScore: row.riskScore ? Number(row.riskScore) : null,
		metadata: (row.metadata as Record<string, unknown>) ?? {},
		environment: row.environment,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

// ============================================
// Repository
// ============================================

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
				environment: input.environment as "BACKTEST" | "PAPER" | "LIVE",
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
		pagination?: { limit?: number; offset?: number }
	): Promise<{ data: Decision[]; total: number; limit: number; offset: number }> {
		const conditions = [];

		if (filters.symbol) {
			conditions.push(eq(decisions.symbol, filters.symbol));
		}
		if (filters.status) {
			if (Array.isArray(filters.status)) {
				conditions.push(inArray(decisions.status, filters.status));
			} else {
				conditions.push(eq(decisions.status, filters.status));
			}
		}
		if (filters.action) {
			conditions.push(eq(decisions.action, filters.action));
		}
		if (filters.direction) {
			conditions.push(eq(decisions.direction, filters.direction));
		}
		if (filters.environment) {
			conditions.push(
				eq(decisions.environment, filters.environment as "BACKTEST" | "PAPER" | "LIVE")
			);
		}
		if (filters.cycleId) {
			conditions.push(eq(decisions.cycleId, filters.cycleId));
		}
		if (filters.fromDate) {
			conditions.push(gte(decisions.createdAt, new Date(filters.fromDate)));
		}
		if (filters.toDate) {
			conditions.push(lte(decisions.createdAt, new Date(filters.toDate)));
		}

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
			.where(eq(decisions.environment, environment as "BACKTEST" | "PAPER" | "LIVE"))
			.orderBy(desc(decisions.createdAt))
			.limit(limit);

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
		updates: Partial<Omit<CreateDecisionInput, "id" | "cycleId" | "environment">>
	): Promise<Decision> {
		const updateData: Partial<typeof decisions.$inferInsert> = {
			updatedAt: new Date(),
		};

		if (updates.symbol !== undefined) {
			updateData.symbol = updates.symbol;
		}
		if (updates.action !== undefined) {
			updateData.action = updates.action;
		}
		if (updates.direction !== undefined) {
			updateData.direction = updates.direction;
		}
		if (updates.size !== undefined) {
			updateData.size = String(updates.size);
		}
		if (updates.sizeUnit !== undefined) {
			updateData.sizeUnit = updates.sizeUnit;
		}
		if (updates.entryPrice !== undefined) {
			updateData.entryPrice = updates.entryPrice != null ? String(updates.entryPrice) : null;
		}
		if (updates.stopPrice !== undefined) {
			updateData.stopPrice = updates.stopPrice != null ? String(updates.stopPrice) : null;
		}
		if (updates.targetPrice !== undefined) {
			updateData.targetPrice = updates.targetPrice != null ? String(updates.targetPrice) : null;
		}
		if (updates.status !== undefined) {
			updateData.status = updates.status;
		}
		if (updates.rationale !== undefined) {
			updateData.rationale = updates.rationale;
		}
		if (updates.bullishFactors !== undefined) {
			updateData.bullishFactors = updates.bullishFactors;
		}
		if (updates.bearishFactors !== undefined) {
			updateData.bearishFactors = updates.bearishFactors;
		}
		if (updates.confidenceScore !== undefined) {
			updateData.confidenceScore =
				updates.confidenceScore != null ? String(updates.confidenceScore) : null;
		}
		if (updates.riskScore !== undefined) {
			updateData.riskScore = updates.riskScore != null ? String(updates.riskScore) : null;
		}
		if (updates.metadata !== undefined) {
			updateData.metadata = updates.metadata;
		}

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
			.where(eq(decisions.environment, environment as "BACKTEST" | "PAPER" | "LIVE"))
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

		return rows.map((r) => ({
			id: r.id,
			symbol: r.symbol,
			action: r.action as DecisionAction,
		}));
	}
}
