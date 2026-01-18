/**
 * Portfolio Snapshots Repository (Drizzle ORM)
 *
 * Data access for portfolio_snapshots table.
 *
 * @see docs/plans/ui/04-data-requirements.md
 */
import { and, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import { type Database, getDb } from "../db";
import { portfolioSnapshots } from "../schema/core-trading";

// ============================================
// Types
// ============================================

export interface PortfolioSnapshot {
	id: number;
	timestamp: string;
	environment: string;
	nav: number;
	cash: number;
	equity: number;
	grossExposure: number;
	netExposure: number;
	longExposure: number | null;
	shortExposure: number | null;
	openPositions: number | null;
	dayPnl: number | null;
	dayReturnPct: number | null;
	totalReturnPct: number | null;
	maxDrawdown: number | null;
}

export interface CreatePortfolioSnapshotInput {
	timestamp?: string;
	environment: string;
	nav: number;
	cash: number;
	equity: number;
	grossExposure: number;
	netExposure: number;
	longExposure?: number | null;
	shortExposure?: number | null;
	openPositions?: number | null;
	dayPnl?: number | null;
	dayReturnPct?: number | null;
	totalReturnPct?: number | null;
	maxDrawdown?: number | null;
}

export interface PortfolioSnapshotFilters {
	environment?: string;
	fromDate?: string;
	toDate?: string;
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

type SnapshotRow = typeof portfolioSnapshots.$inferSelect;

function mapSnapshotRow(row: SnapshotRow): PortfolioSnapshot {
	return {
		id: row.id,
		timestamp: row.timestamp.toISOString(),
		environment: row.environment,
		nav: Number(row.nav),
		cash: Number(row.cash),
		equity: Number(row.equity),
		grossExposure: Number(row.grossExposure),
		netExposure: Number(row.netExposure),
		longExposure: row.longExposure ? Number(row.longExposure) : null,
		shortExposure: row.shortExposure ? Number(row.shortExposure) : null,
		openPositions: row.openPositions,
		dayPnl: row.dayPnl ? Number(row.dayPnl) : null,
		dayReturnPct: row.dayReturnPct ? Number(row.dayReturnPct) : null,
		totalReturnPct: row.totalReturnPct ? Number(row.totalReturnPct) : null,
		maxDrawdown: row.maxDrawdown ? Number(row.maxDrawdown) : null,
	};
}

// ============================================
// Repository
// ============================================

export class PortfolioSnapshotsRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async create(input: CreatePortfolioSnapshotInput): Promise<PortfolioSnapshot> {
		const timestamp = input.timestamp ? new Date(input.timestamp) : new Date();

		const [row] = await this.db
			.insert(portfolioSnapshots)
			.values({
				timestamp,
				environment: input.environment as "PAPER" | "LIVE",
				nav: String(input.nav),
				cash: String(input.cash),
				equity: String(input.equity),
				grossExposure: String(input.grossExposure),
				netExposure: String(input.netExposure),
				longExposure: input.longExposure != null ? String(input.longExposure) : null,
				shortExposure: input.shortExposure != null ? String(input.shortExposure) : null,
				openPositions: input.openPositions ?? null,
				dayPnl: input.dayPnl != null ? String(input.dayPnl) : null,
				dayReturnPct: input.dayReturnPct != null ? String(input.dayReturnPct) : null,
				totalReturnPct: input.totalReturnPct != null ? String(input.totalReturnPct) : null,
				maxDrawdown: input.maxDrawdown != null ? String(input.maxDrawdown) : null,
			})
			.returning();

		if (!row) {
			throw new Error("Failed to create portfolio snapshot");
		}
		return mapSnapshotRow(row);
	}

	async findById(id: number): Promise<PortfolioSnapshot | null> {
		const [row] = await this.db
			.select()
			.from(portfolioSnapshots)
			.where(eq(portfolioSnapshots.id, id))
			.limit(1);

		return row ? mapSnapshotRow(row) : null;
	}

	async findMany(
		filters: PortfolioSnapshotFilters = {},
		pagination?: PaginationOptions
	): Promise<PaginatedResult<PortfolioSnapshot>> {
		const conditions = [];

		if (filters.environment) {
			conditions.push(
				eq(portfolioSnapshots.environment, filters.environment as "PAPER" | "LIVE")
			);
		}
		if (filters.fromDate) {
			conditions.push(gte(portfolioSnapshots.timestamp, new Date(filters.fromDate)));
		}
		if (filters.toDate) {
			conditions.push(lte(portfolioSnapshots.timestamp, new Date(filters.toDate)));
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
		const page = pagination?.page ?? 1;
		const pageSize = pagination?.pageSize ?? 50;
		const offset = (page - 1) * pageSize;

		const [countResult] = await this.db
			.select({ count: count() })
			.from(portfolioSnapshots)
			.where(whereClause);

		const rows = await this.db
			.select()
			.from(portfolioSnapshots)
			.where(whereClause)
			.orderBy(desc(portfolioSnapshots.timestamp))
			.limit(pageSize)
			.offset(offset);

		const total = countResult?.count ?? 0;

		return {
			data: rows.map(mapSnapshotRow),
			total,
			page,
			pageSize,
			totalPages: Math.ceil(total / pageSize),
		};
	}

	async getLatest(environment: string): Promise<PortfolioSnapshot | null> {
		const [row] = await this.db
			.select()
			.from(portfolioSnapshots)
			.where(eq(portfolioSnapshots.environment, environment as "PAPER" | "LIVE"))
			.orderBy(desc(portfolioSnapshots.timestamp))
			.limit(1);

		return row ? mapSnapshotRow(row) : null;
	}

	async getEquityCurve(
		environment: string,
		fromDate?: string,
		toDate?: string,
		limit = 1000
	): Promise<{ timestamp: string; nav: number; pnlPct: number }[]> {
		const conditions = [
			eq(portfolioSnapshots.environment, environment as "PAPER" | "LIVE"),
		];

		if (fromDate) {
			conditions.push(gte(portfolioSnapshots.timestamp, new Date(fromDate)));
		}
		if (toDate) {
			conditions.push(lte(portfolioSnapshots.timestamp, new Date(toDate)));
		}

		const rows = await this.db
			.select({
				timestamp: portfolioSnapshots.timestamp,
				nav: portfolioSnapshots.nav,
				pnlPct: portfolioSnapshots.totalReturnPct,
			})
			.from(portfolioSnapshots)
			.where(and(...conditions))
			.orderBy(portfolioSnapshots.timestamp)
			.limit(limit);

		return rows.map((row) => ({
			timestamp: row.timestamp.toISOString(),
			nav: Number(row.nav),
			pnlPct: row.pnlPct ? Number(row.pnlPct) : 0,
		}));
	}

	async getPerformanceMetrics(
		environment: string,
		days = 30
	): Promise<{
		startNav: number;
		endNav: number;
		periodReturn: number;
		periodReturnPct: number;
		maxNav: number;
		minNav: number;
		maxDrawdown: number;
		snapshotCount: number;
	}> {
		const fromDate = new Date();
		fromDate.setDate(fromDate.getDate() - days);

		const envType = environment as "PAPER" | "LIVE";

		// Get aggregates
		const [aggRow] = await this.db
			.select({
				maxNav: sql<string>`MAX(${portfolioSnapshots.nav}::numeric)`,
				minNav: sql<string>`MIN(${portfolioSnapshots.nav}::numeric)`,
				snapshotCount: count(),
			})
			.from(portfolioSnapshots)
			.where(
				and(
					eq(portfolioSnapshots.environment, envType),
					gte(portfolioSnapshots.timestamp, fromDate)
				)
			);

		// Get start NAV
		const [startRow] = await this.db
			.select({ nav: portfolioSnapshots.nav })
			.from(portfolioSnapshots)
			.where(
				and(
					eq(portfolioSnapshots.environment, envType),
					gte(portfolioSnapshots.timestamp, fromDate)
				)
			)
			.orderBy(portfolioSnapshots.timestamp)
			.limit(1);

		// Get end NAV
		const [endRow] = await this.db
			.select({ nav: portfolioSnapshots.nav })
			.from(portfolioSnapshots)
			.where(eq(portfolioSnapshots.environment, envType))
			.orderBy(desc(portfolioSnapshots.timestamp))
			.limit(1);

		const startNav = startRow?.nav ? Number(startRow.nav) : 0;
		const endNav = endRow?.nav ? Number(endRow.nav) : 0;
		const periodReturn = endNav - startNav;
		const periodReturnPct = startNav > 0 ? (periodReturn / startNav) * 100 : 0;
		const maxNav = aggRow?.maxNav ? Number(aggRow.maxNav) : 0;
		const minNav = aggRow?.minNav ? Number(aggRow.minNav) : 0;
		const maxDrawdown = maxNav > 0 ? ((maxNav - minNav) / maxNav) * 100 : 0;

		return {
			startNav,
			endNav,
			periodReturn,
			periodReturnPct,
			maxNav,
			minNav,
			maxDrawdown,
			snapshotCount: aggRow?.snapshotCount ?? 0,
		};
	}

	async deleteOlderThan(cutoffDate: string): Promise<number> {
		const result = await this.db
			.delete(portfolioSnapshots)
			.where(lte(portfolioSnapshots.timestamp, new Date(cutoffDate)))
			.returning({ id: portfolioSnapshots.id });

		return result.length;
	}

	async findByDate(environment: string, date: string): Promise<PortfolioSnapshot | null> {
		const startOfDay = new Date(date);
		startOfDay.setHours(0, 0, 0, 0);
		const endOfDay = new Date(date);
		endOfDay.setHours(23, 59, 59, 999);

		const [row] = await this.db
			.select()
			.from(portfolioSnapshots)
			.where(
				and(
					eq(portfolioSnapshots.environment, environment as "PAPER" | "LIVE"),
					gte(portfolioSnapshots.timestamp, startOfDay),
					lte(portfolioSnapshots.timestamp, endOfDay)
				)
			)
			.orderBy(desc(portfolioSnapshots.timestamp))
			.limit(1);

		return row ? mapSnapshotRow(row) : null;
	}

	async getFirst(environment: string): Promise<PortfolioSnapshot | null> {
		const [row] = await this.db
			.select()
			.from(portfolioSnapshots)
			.where(eq(portfolioSnapshots.environment, environment as "PAPER" | "LIVE"))
			.orderBy(portfolioSnapshots.timestamp)
			.limit(1);

		return row ? mapSnapshotRow(row) : null;
	}
}
