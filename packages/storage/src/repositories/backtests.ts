/**
 * Backtests Repository (Drizzle ORM)
 *
 * Data access for backtests and related tables.
 *
 * @see docs/plans/ui/04-data-requirements.md
 */
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, type Database } from "../db";
import { backtests, backtestTrades, backtestEquity } from "../schema/dashboard";

// ============================================
// Types
// ============================================

export type BacktestStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface Backtest {
	id: string;
	name: string;
	description: string | null;
	startDate: string;
	endDate: string;
	initialCapital: number;
	universe: string[];
	config: Record<string, unknown>;
	status: BacktestStatus;
	progressPct: number;
	totalReturn: number | null;
	cagr: number | null;
	sharpeRatio: number | null;
	sortinoRatio: number | null;
	calmarRatio: number | null;
	maxDrawdown: number | null;
	winRate: number | null;
	profitFactor: number | null;
	totalTrades: number | null;
	avgTradePnl: number | null;
	metrics: Record<string, unknown>;
	errorMessage: string | null;
	createdAt: string;
	startedAt: string | null;
	completedAt: string | null;
	createdBy: string | null;
}

export interface CreateBacktestInput {
	id: string;
	name: string;
	description?: string | null;
	startDate: string;
	endDate: string;
	initialCapital: number;
	universe?: string[];
	config?: Record<string, unknown>;
	createdBy?: string | null;
}

export interface BacktestTrade {
	id: number;
	backtestId: string;
	timestamp: string;
	symbol: string;
	action: "BUY" | "SELL" | "SHORT" | "COVER";
	quantity: number;
	price: number;
	commission: number;
	pnl: number | null;
	pnlPct: number | null;
	decisionRationale: string | null;
}

export interface BacktestEquityPoint {
	id: number;
	backtestId: string;
	timestamp: string;
	nav: number;
	cash: number;
	equity: number;
	drawdown: number | null;
	drawdownPct: number | null;
	dayReturnPct: number | null;
	cumulativeReturnPct: number | null;
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
// Row Mapping
// ============================================

type BacktestRow = typeof backtests.$inferSelect;
type TradeRow = typeof backtestTrades.$inferSelect;
type EquityRow = typeof backtestEquity.$inferSelect;

function mapBacktestRow(row: BacktestRow): Backtest {
	const universeValue = row.universe;
	let universeArray: string[] = [];
	if (universeValue) {
		try {
			universeArray = typeof universeValue === "string" ? JSON.parse(universeValue) : [];
		} catch {
			universeArray = [];
		}
	}

	return {
		id: row.id,
		name: row.name,
		description: row.description,
		startDate: row.startDate.toISOString(),
		endDate: row.endDate.toISOString(),
		initialCapital: Number(row.initialCapital),
		universe: universeArray,
		config: (row.configJson as Record<string, unknown>) ?? {},
		status: row.status as BacktestStatus,
		progressPct: row.progressPct ? Number(row.progressPct) : 0,
		totalReturn: row.totalReturn ? Number(row.totalReturn) : null,
		cagr: row.cagr ? Number(row.cagr) : null,
		sharpeRatio: row.sharpeRatio ? Number(row.sharpeRatio) : null,
		sortinoRatio: row.sortinoRatio ? Number(row.sortinoRatio) : null,
		calmarRatio: row.calmarRatio ? Number(row.calmarRatio) : null,
		maxDrawdown: row.maxDrawdown ? Number(row.maxDrawdown) : null,
		winRate: row.winRate ? Number(row.winRate) : null,
		profitFactor: row.profitFactor ? Number(row.profitFactor) : null,
		totalTrades: row.totalTrades,
		avgTradePnl: row.avgTradePnl ? Number(row.avgTradePnl) : null,
		metrics: (row.metricsJson as Record<string, unknown>) ?? {},
		errorMessage: row.errorMessage,
		createdAt: row.createdAt.toISOString(),
		startedAt: row.startedAt?.toISOString() ?? null,
		completedAt: row.completedAt?.toISOString() ?? null,
		createdBy: row.createdBy,
	};
}

function mapTradeRow(row: TradeRow): BacktestTrade {
	return {
		id: row.id,
		backtestId: row.backtestId,
		timestamp: row.timestamp.toISOString(),
		symbol: row.symbol,
		action: row.action as BacktestTrade["action"],
		quantity: Number(row.qty),
		price: Number(row.price),
		commission: row.commission ? Number(row.commission) : 0,
		pnl: row.pnl ? Number(row.pnl) : null,
		pnlPct: row.pnlPct ? Number(row.pnlPct) : null,
		decisionRationale: row.decisionRationale,
	};
}

function mapEquityRow(row: EquityRow): BacktestEquityPoint {
	return {
		id: row.id,
		backtestId: row.backtestId,
		timestamp: row.timestamp.toISOString(),
		nav: Number(row.nav),
		cash: Number(row.cash),
		equity: Number(row.equity),
		drawdown: row.drawdown ? Number(row.drawdown) : null,
		drawdownPct: row.drawdownPct ? Number(row.drawdownPct) : null,
		dayReturnPct: row.dayReturnPct ? Number(row.dayReturnPct) : null,
		cumulativeReturnPct: row.cumulativeReturnPct ? Number(row.cumulativeReturnPct) : null,
	};
}

// ============================================
// Repository
// ============================================

export class BacktestsRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	// ----------------------------------------
	// Backtest CRUD
	// ----------------------------------------

	async create(input: CreateBacktestInput): Promise<Backtest> {
		const [row] = await this.db
			.insert(backtests)
			.values({
				id: input.id,
				name: input.name,
				description: input.description ?? null,
				startDate: new Date(input.startDate),
				endDate: new Date(input.endDate),
				initialCapital: String(input.initialCapital),
				universe: JSON.stringify(input.universe ?? []),
				configJson: input.config ?? {},
				status: "pending",
				createdBy: input.createdBy ?? null,
			})
			.returning();

		return mapBacktestRow(row);
	}

	async findById(id: string): Promise<Backtest | null> {
		const [row] = await this.db
			.select()
			.from(backtests)
			.where(eq(backtests.id, id))
			.limit(1);

		return row ? mapBacktestRow(row) : null;
	}

	async findByIdOrThrow(id: string): Promise<Backtest> {
		const backtest = await this.findById(id);
		if (!backtest) {
			throw new Error(`Backtest not found: ${id}`);
		}
		return backtest;
	}

	async findMany(
		status?: BacktestStatus | BacktestStatus[],
		pagination?: PaginationOptions
	): Promise<PaginatedResult<Backtest>> {
		const conditions = [];

		if (status) {
			if (Array.isArray(status)) {
				conditions.push(inArray(backtests.status, status as typeof backtests.$inferSelect.status[]));
			} else {
				conditions.push(eq(backtests.status, status as typeof backtests.$inferSelect.status));
			}
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
		const page = pagination?.page ?? 1;
		const pageSize = pagination?.pageSize ?? 50;
		const offset = (page - 1) * pageSize;

		const [countResult] = await this.db
			.select({ count: count() })
			.from(backtests)
			.where(whereClause);

		const rows = await this.db
			.select()
			.from(backtests)
			.where(whereClause)
			.orderBy(desc(backtests.createdAt))
			.limit(pageSize)
			.offset(offset);

		const total = countResult?.count ?? 0;

		return {
			data: rows.map(mapBacktestRow),
			total,
			page,
			pageSize,
			totalPages: Math.ceil(total / pageSize),
		};
	}

	async findRecent(limit = 10): Promise<Backtest[]> {
		const rows = await this.db
			.select()
			.from(backtests)
			.orderBy(desc(backtests.createdAt))
			.limit(limit);

		return rows.map(mapBacktestRow);
	}

	async start(id: string): Promise<Backtest> {
		const [row] = await this.db
			.update(backtests)
			.set({
				status: "running",
				startedAt: new Date(),
				progressPct: "0",
			})
			.where(eq(backtests.id, id))
			.returning();

		if (!row) {
			throw new Error(`Backtest not found: ${id}`);
		}

		return mapBacktestRow(row);
	}

	async updateProgress(id: string, progressPct: number): Promise<void> {
		await this.db
			.update(backtests)
			.set({ progressPct: String(Math.min(100, Math.max(0, progressPct))) })
			.where(eq(backtests.id, id));
	}

	async complete(
		id: string,
		metrics: {
			totalReturn?: number;
			cagr?: number;
			sharpeRatio?: number;
			sortinoRatio?: number;
			calmarRatio?: number;
			maxDrawdown?: number;
			winRate?: number;
			profitFactor?: number;
			totalTrades?: number;
			avgTradePnl?: number;
			additionalMetrics?: Record<string, unknown>;
		}
	): Promise<Backtest> {
		const [row] = await this.db
			.update(backtests)
			.set({
				status: "completed",
				progressPct: "100",
				completedAt: new Date(),
				totalReturn: metrics.totalReturn != null ? String(metrics.totalReturn) : null,
				cagr: metrics.cagr != null ? String(metrics.cagr) : null,
				sharpeRatio: metrics.sharpeRatio != null ? String(metrics.sharpeRatio) : null,
				sortinoRatio: metrics.sortinoRatio != null ? String(metrics.sortinoRatio) : null,
				calmarRatio: metrics.calmarRatio != null ? String(metrics.calmarRatio) : null,
				maxDrawdown: metrics.maxDrawdown != null ? String(metrics.maxDrawdown) : null,
				winRate: metrics.winRate != null ? String(metrics.winRate) : null,
				profitFactor: metrics.profitFactor != null ? String(metrics.profitFactor) : null,
				totalTrades: metrics.totalTrades ?? null,
				avgTradePnl: metrics.avgTradePnl != null ? String(metrics.avgTradePnl) : null,
				metricsJson: metrics.additionalMetrics ?? {},
			})
			.where(eq(backtests.id, id))
			.returning();

		if (!row) {
			throw new Error(`Backtest not found: ${id}`);
		}

		return mapBacktestRow(row);
	}

	async fail(id: string, errorMessage: string): Promise<Backtest> {
		const [row] = await this.db
			.update(backtests)
			.set({
				status: "failed",
				completedAt: new Date(),
				errorMessage,
			})
			.where(eq(backtests.id, id))
			.returning();

		if (!row) {
			throw new Error(`Backtest not found: ${id}`);
		}

		return mapBacktestRow(row);
	}

	async cancel(id: string): Promise<Backtest> {
		const [row] = await this.db
			.update(backtests)
			.set({ status: "cancelled" })
			.where(eq(backtests.id, id))
			.returning();

		if (!row) {
			throw new Error(`Backtest not found: ${id}`);
		}

		return mapBacktestRow(row);
	}

	async delete(id: string): Promise<boolean> {
		const result = await this.db
			.delete(backtests)
			.where(eq(backtests.id, id))
			.returning({ id: backtests.id });

		return result.length > 0;
	}

	// ----------------------------------------
	// Backtest Trades
	// ----------------------------------------

	async addTrade(
		backtestId: string,
		trade: Omit<BacktestTrade, "id" | "backtestId">
	): Promise<BacktestTrade> {
		const [row] = await this.db
			.insert(backtestTrades)
			.values({
				backtestId,
				timestamp: new Date(trade.timestamp),
				symbol: trade.symbol,
				action: trade.action,
				qty: String(trade.quantity),
				price: String(trade.price),
				commission: String(trade.commission),
				pnl: trade.pnl != null ? String(trade.pnl) : null,
				pnlPct: trade.pnlPct != null ? String(trade.pnlPct) : null,
				decisionRationale: trade.decisionRationale ?? null,
			})
			.returning();

		return mapTradeRow(row);
	}

	async getTrades(backtestId: string): Promise<BacktestTrade[]> {
		const rows = await this.db
			.select()
			.from(backtestTrades)
			.where(eq(backtestTrades.backtestId, backtestId))
			.orderBy(backtestTrades.timestamp);

		return rows.map(mapTradeRow);
	}

	// ----------------------------------------
	// Backtest Equity
	// ----------------------------------------

	async addEquityPoint(
		backtestId: string,
		point: Omit<BacktestEquityPoint, "id" | "backtestId">
	): Promise<void> {
		await this.db.insert(backtestEquity).values({
			backtestId,
			timestamp: new Date(point.timestamp),
			nav: String(point.nav),
			cash: String(point.cash),
			equity: String(point.equity),
			drawdown: point.drawdown != null ? String(point.drawdown) : null,
			drawdownPct: point.drawdownPct != null ? String(point.drawdownPct) : null,
			dayReturnPct: point.dayReturnPct != null ? String(point.dayReturnPct) : null,
			cumulativeReturnPct: point.cumulativeReturnPct != null ? String(point.cumulativeReturnPct) : null,
		});
	}

	async getEquityCurve(backtestId: string): Promise<BacktestEquityPoint[]> {
		const rows = await this.db
			.select()
			.from(backtestEquity)
			.where(eq(backtestEquity.backtestId, backtestId))
			.orderBy(backtestEquity.timestamp);

		return rows.map(mapEquityRow);
	}
}
