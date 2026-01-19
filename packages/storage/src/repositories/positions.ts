/**
 * Positions Repository (Drizzle ORM)
 *
 * Data access for positions table.
 */
import { and, count, desc, eq, sql } from "drizzle-orm";
import { type Database, getDb } from "../db";
import { decisions, positions } from "../schema/core-trading";
import { thesisState } from "../schema/thesis";
import { RepositoryError } from "./base";

// ============================================
// Types
// ============================================

export type PositionSide = "long" | "short";
export type PositionStatus = "open" | "closed" | "pending";

export interface Position {
	id: string;
	symbol: string;
	side: PositionSide;
	quantity: number;
	avgEntryPrice: number;
	currentPrice: number | null;
	unrealizedPnl: number | null;
	unrealizedPnlPct: number | null;
	realizedPnl: number | null;
	marketValue: number | null;
	costBasis: number;
	thesisId: string | null;
	decisionId: string | null;
	status: PositionStatus;
	metadata: Record<string, unknown>;
	environment: string;
	openedAt: string;
	closedAt: string | null;
	updatedAt: string;
}

export interface CreatePositionInput {
	id?: string;
	symbol: string;
	side: PositionSide;
	quantity: number;
	avgEntryPrice: number;
	currentPrice?: number | null;
	thesisId?: string | null;
	decisionId?: string | null;
	metadata?: Record<string, unknown>;
	environment: string;
}

export interface PositionFilters {
	symbol?: string;
	side?: PositionSide;
	status?: PositionStatus;
	environment?: string;
	thesisId?: string;
}

export interface PositionWithMetadata extends Position {
	strategy: {
		strategyFamily: string | null;
		timeHorizon: string | null;
		confidenceScore: number | null;
		riskScore: number | null;
		rationale: string | null;
		bullishFactors: string[];
		bearishFactors: string[];
	} | null;
	riskParams: {
		stopPrice: number | null;
		targetPrice: number | null;
		entryPrice: number | null;
	} | null;
	thesis: {
		thesisId: string | null;
		state: string | null;
		entryThesis: string | null;
		invalidationConditions: string | null;
		conviction: number | null;
	} | null;
}

// ============================================
// Row Mapping
// ============================================

type PositionRow = typeof positions.$inferSelect;

function mapPositionRow(row: PositionRow): Position {
	return {
		id: row.id,
		symbol: row.symbol,
		side: row.side as PositionSide,
		quantity: Number(row.qty),
		avgEntryPrice: Number(row.avgEntry),
		currentPrice: row.currentPrice ? Number(row.currentPrice) : null,
		unrealizedPnl: row.unrealizedPnl ? Number(row.unrealizedPnl) : null,
		unrealizedPnlPct: row.unrealizedPnlPct ? Number(row.unrealizedPnlPct) : null,
		realizedPnl: row.realizedPnl ? Number(row.realizedPnl) : null,
		marketValue: row.marketValue ? Number(row.marketValue) : null,
		costBasis: row.costBasis ? Number(row.costBasis) : 0,
		thesisId: row.thesisId,
		decisionId: row.decisionId,
		status: row.status as PositionStatus,
		metadata: (row.metadata as Record<string, unknown>) ?? {},
		environment: row.environment,
		openedAt: row.openedAt.toISOString(),
		closedAt: row.closedAt?.toISOString() ?? null,
		updatedAt: row.updatedAt.toISOString(),
	};
}

// ============================================
// Repository
// ============================================

export class PositionsRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async create(input: CreatePositionInput): Promise<Position> {
		const costBasis = input.quantity * input.avgEntryPrice;

		const [row] = await this.db
			.insert(positions)
			.values({
				symbol: input.symbol,
				side: input.side,
				qty: String(input.quantity),
				avgEntry: String(input.avgEntryPrice),
				currentPrice:
					input.currentPrice != null ? String(input.currentPrice) : String(input.avgEntryPrice),
				costBasis: String(costBasis),
				thesisId: input.thesisId ?? null,
				decisionId: input.decisionId ?? null,
				status: "open",
				metadata: input.metadata ?? {},
				environment: input.environment as "PAPER" | "LIVE",
			})
			.returning();

		if (!row) {
			throw new RepositoryError("Failed to create position", "CONSTRAINT_VIOLATION", "positions");
		}
		return mapPositionRow(row);
	}

	async findById(id: string): Promise<Position | null> {
		const [row] = await this.db.select().from(positions).where(eq(positions.id, id)).limit(1);

		return row ? mapPositionRow(row) : null;
	}

	async findByIdOrThrow(id: string): Promise<Position> {
		const position = await this.findById(id);
		if (!position) {
			throw RepositoryError.notFound("positions", id);
		}
		return position;
	}

	async findMany(
		filters: PositionFilters = {},
		pagination?: { limit?: number; offset?: number }
	): Promise<{ data: Position[]; total: number; limit: number; offset: number }> {
		const conditions = [];

		if (filters.symbol) {
			conditions.push(eq(positions.symbol, filters.symbol));
		}
		if (filters.side) {
			conditions.push(eq(positions.side, filters.side));
		}
		if (filters.status) {
			conditions.push(eq(positions.status, filters.status));
		}
		if (filters.environment) {
			conditions.push(eq(positions.environment, filters.environment as "PAPER" | "LIVE"));
		}
		if (filters.thesisId) {
			conditions.push(eq(positions.thesisId, filters.thesisId));
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
		const limit = pagination?.limit ?? 20;
		const offset = pagination?.offset ?? 0;

		const [countResult] = await this.db
			.select({ count: count() })
			.from(positions)
			.where(whereClause);

		const rows = await this.db
			.select()
			.from(positions)
			.where(whereClause)
			.orderBy(desc(positions.openedAt))
			.limit(limit)
			.offset(offset);

		return {
			data: rows.map(mapPositionRow),
			total: countResult?.count ?? 0,
			limit,
			offset,
		};
	}

	async findOpen(environment: string): Promise<Position[]> {
		const rows = await this.db
			.select()
			.from(positions)
			.where(
				and(
					eq(positions.environment, environment as "PAPER" | "LIVE"),
					eq(positions.status, "open")
				)
			)
			.orderBy(desc(positions.openedAt));

		return rows.map(mapPositionRow);
	}

	async findOpenWithMetadata(environment: string): Promise<PositionWithMetadata[]> {
		const rows = await this.db
			.select({
				// Position fields
				id: positions.id,
				symbol: positions.symbol,
				side: positions.side,
				qty: positions.qty,
				avgEntry: positions.avgEntry,
				currentPrice: positions.currentPrice,
				unrealizedPnl: positions.unrealizedPnl,
				unrealizedPnlPct: positions.unrealizedPnlPct,
				realizedPnl: positions.realizedPnl,
				marketValue: positions.marketValue,
				costBasis: positions.costBasis,
				thesisId: positions.thesisId,
				decisionId: positions.decisionId,
				status: positions.status,
				metadata: positions.metadata,
				environment: positions.environment,
				openedAt: positions.openedAt,
				closedAt: positions.closedAt,
				updatedAt: positions.updatedAt,
				// Decision fields for strategy
				strategyFamily: decisions.strategyFamily,
				timeHorizon: decisions.timeHorizon,
				confidenceScore: decisions.confidenceScore,
				riskScore: decisions.riskScore,
				rationale: decisions.rationale,
				bullishFactors: decisions.bullishFactors,
				bearishFactors: decisions.bearishFactors,
				stopPrice: decisions.stopPrice,
				targetPrice: decisions.targetPrice,
				entryPrice: decisions.entryPrice,
				// Thesis fields
				thesisState: thesisState.state,
				thesisEntryThesis: thesisState.entryThesis,
				thesisInvalidationConditions: thesisState.invalidationConditions,
				thesisConviction: thesisState.conviction,
			})
			.from(positions)
			.leftJoin(decisions, eq(positions.decisionId, decisions.id))
			.leftJoin(thesisState, eq(positions.thesisId, thesisState.thesisId))
			.where(
				and(
					eq(positions.environment, environment as "PAPER" | "LIVE"),
					eq(positions.status, "open")
				)
			)
			.orderBy(desc(positions.openedAt));

		return rows.map((row) => {
			const basePosition = mapPositionRow({
				id: row.id,
				symbol: row.symbol,
				side: row.side,
				qty: row.qty,
				avgEntry: row.avgEntry,
				currentPrice: row.currentPrice,
				unrealizedPnl: row.unrealizedPnl,
				unrealizedPnlPct: row.unrealizedPnlPct,
				realizedPnl: row.realizedPnl,
				marketValue: row.marketValue,
				costBasis: row.costBasis,
				thesisId: row.thesisId,
				decisionId: row.decisionId,
				status: row.status,
				metadata: row.metadata,
				environment: row.environment,
				openedAt: row.openedAt,
				closedAt: row.closedAt,
				updatedAt: row.updatedAt,
			});

			const hasDecisionData =
				row.strategyFamily !== null || row.timeHorizon !== null || row.confidenceScore !== null;

			const hasThesisData =
				row.thesisState !== null || row.thesisEntryThesis !== null || row.thesisConviction !== null;

			return {
				...basePosition,
				strategy: hasDecisionData
					? {
							strategyFamily: row.strategyFamily,
							timeHorizon: row.timeHorizon,
							confidenceScore: row.confidenceScore ? Number(row.confidenceScore) : null,
							riskScore: row.riskScore ? Number(row.riskScore) : null,
							rationale: row.rationale,
							bullishFactors: (row.bullishFactors as string[]) ?? [],
							bearishFactors: (row.bearishFactors as string[]) ?? [],
						}
					: null,
				riskParams: hasDecisionData
					? {
							stopPrice: row.stopPrice ? Number(row.stopPrice) : null,
							targetPrice: row.targetPrice ? Number(row.targetPrice) : null,
							entryPrice: row.entryPrice ? Number(row.entryPrice) : null,
						}
					: null,
				thesis: hasThesisData
					? {
							thesisId: row.thesisId,
							state: row.thesisState,
							entryThesis: row.thesisEntryThesis,
							invalidationConditions: row.thesisInvalidationConditions,
							conviction: row.thesisConviction ? Number(row.thesisConviction) : null,
						}
					: null,
			};
		});
	}

	async findBySymbol(symbol: string, environment: string): Promise<Position | null> {
		const [row] = await this.db
			.select()
			.from(positions)
			.where(
				and(
					eq(positions.symbol, symbol),
					eq(positions.environment, environment as "PAPER" | "LIVE"),
					eq(positions.status, "open")
				)
			)
			.limit(1);

		return row ? mapPositionRow(row) : null;
	}

	async updatePrice(id: string, currentPrice: number): Promise<Position> {
		const position = await this.findByIdOrThrow(id);

		const marketValue = position.quantity * currentPrice;
		const unrealizedPnl =
			position.side === "long"
				? marketValue - position.costBasis
				: position.costBasis - marketValue;
		const unrealizedPnlPct = (unrealizedPnl / position.costBasis) * 100;

		const [row] = await this.db
			.update(positions)
			.set({
				currentPrice: String(currentPrice),
				marketValue: String(marketValue),
				unrealizedPnl: String(unrealizedPnl),
				unrealizedPnlPct: String(unrealizedPnlPct),
				updatedAt: new Date(),
			})
			.where(eq(positions.id, id))
			.returning();

		if (!row) {
			throw RepositoryError.notFound("positions", id);
		}
		return mapPositionRow(row);
	}

	async updateQuantity(id: string, newQuantity: number, avgPrice: number): Promise<Position> {
		const position = await this.findByIdOrThrow(id);

		const oldValue = position.quantity * position.avgEntryPrice;
		const changeValue = (newQuantity - position.quantity) * avgPrice;
		const newAvgEntry = (oldValue + changeValue) / newQuantity;
		const newCostBasis = newQuantity * newAvgEntry;

		const [row] = await this.db
			.update(positions)
			.set({
				qty: String(newQuantity),
				avgEntry: String(newAvgEntry),
				costBasis: String(newCostBasis),
				updatedAt: new Date(),
			})
			.where(eq(positions.id, id))
			.returning();

		if (!row) {
			throw RepositoryError.notFound("positions", id);
		}
		return mapPositionRow(row);
	}

	async close(id: string, exitPrice: number): Promise<Position> {
		const position = await this.findByIdOrThrow(id);

		const realizedPnl =
			position.side === "long"
				? (exitPrice - position.avgEntryPrice) * position.quantity
				: (position.avgEntryPrice - exitPrice) * position.quantity;

		const now = new Date();

		const [row] = await this.db
			.update(positions)
			.set({
				status: "closed",
				currentPrice: String(exitPrice),
				realizedPnl: String(realizedPnl),
				unrealizedPnl: "0",
				unrealizedPnlPct: "0",
				closedAt: now,
				updatedAt: now,
			})
			.where(eq(positions.id, id))
			.returning();

		if (!row) {
			throw RepositoryError.notFound("positions", id);
		}
		return mapPositionRow(row);
	}

	async delete(id: string): Promise<boolean> {
		const result = await this.db
			.delete(positions)
			.where(eq(positions.id, id))
			.returning({ id: positions.id });

		return result.length > 0;
	}

	async getPortfolioSummary(environment: string): Promise<{
		totalPositions: number;
		longPositions: number;
		shortPositions: number;
		totalMarketValue: number;
		totalUnrealizedPnl: number;
		totalCostBasis: number;
	}> {
		const rows = await this.db
			.select({
				count: count(),
				side: positions.side,
				totalMarketValue: sql<string>`COALESCE(SUM(${positions.marketValue}::numeric), 0)`,
				totalUnrealizedPnl: sql<string>`COALESCE(SUM(${positions.unrealizedPnl}::numeric), 0)`,
				totalCostBasis: sql<string>`COALESCE(SUM(${positions.costBasis}::numeric), 0)`,
			})
			.from(positions)
			.where(
				and(
					eq(positions.environment, environment as "PAPER" | "LIVE"),
					eq(positions.status, "open")
				)
			)
			.groupBy(positions.side);

		let totalPositions = 0;
		let longPositions = 0;
		let shortPositions = 0;
		let totalMarketValue = 0;
		let totalUnrealizedPnl = 0;
		let totalCostBasis = 0;

		for (const row of rows) {
			totalPositions += row.count;
			totalMarketValue += Number(row.totalMarketValue);
			totalUnrealizedPnl += Number(row.totalUnrealizedPnl);
			totalCostBasis += Number(row.totalCostBasis);

			if (row.side === "long") {
				longPositions = row.count;
			} else if (row.side === "short") {
				shortPositions = row.count;
			}
		}

		return {
			totalPositions,
			longPositions,
			shortPositions,
			totalMarketValue,
			totalUnrealizedPnl,
			totalCostBasis,
		};
	}
}
