/**
 * Indicator Sync Runs Repository (Drizzle ORM)
 *
 * Data access for indicator_sync_runs table - tracking batch indicator
 * sync jobs (fundamentals, short_interest, sentiment, corporate_actions).
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { type Database, getDb } from "../db";
import { indicatorSyncRuns } from "../schema/indicators";

// ============================================
// Types
// ============================================

export type SyncRunType =
	| "fundamentals"
	| "short_interest"
	| "sentiment"
	| "corporate_actions"
	| "macro_watch"
	| "newspaper"
	| "filings_sync"
	| "prediction_markets"
	| "indicator_synthesis";

export type SyncRunStatus = "running" | "completed" | "failed";

export interface IndicatorSyncRun {
	id: string;
	runType: SyncRunType;
	startedAt: string;
	completedAt: string | null;
	symbolsProcessed: number;
	symbolsFailed: number;
	status: SyncRunStatus;
	errorMessage: string | null;
	environment: string;
}

export interface CreateIndicatorSyncRunInput {
	id?: string;
	runType: SyncRunType;
	environment: string;
	errorMessage?: string;
}

export interface UpdateIndicatorSyncRunInput {
	status?: SyncRunStatus;
	symbolsProcessed?: number;
	symbolsFailed?: number;
	errorMessage?: string;
}

export interface SyncRunSummary {
	totalRuns: number;
	running: number;
	completed: number;
	failed: number;
	lastCompleted: Record<SyncRunType, string | null>;
}

export interface SyncRunFilters {
	runType?: SyncRunType;
	status?: SyncRunStatus;
	environment?: string;
}

// ============================================
// Row Mapping
// ============================================

type SyncRunRow = typeof indicatorSyncRuns.$inferSelect;

function mapRow(row: SyncRunRow): IndicatorSyncRun {
	return {
		id: row.id,
		runType: row.runType as SyncRunType,
		startedAt: row.startedAt.toISOString(),
		completedAt: row.completedAt?.toISOString() ?? null,
		symbolsProcessed: row.symbolsProcessed ?? 0,
		symbolsFailed: row.symbolsFailed ?? 0,
		status: row.status as SyncRunStatus,
		errorMessage: row.errorMessage,
		environment: row.environment,
	};
}

// ============================================
// Repository
// ============================================

export class IndicatorSyncRunsRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async create(input: CreateIndicatorSyncRunInput): Promise<IndicatorSyncRun> {
		const values: typeof indicatorSyncRuns.$inferInsert = {
			runType: input.runType,
			startedAt: new Date(),
			status: "running",
			symbolsProcessed: 0,
			symbolsFailed: 0,
			environment: input.environment as (typeof indicatorSyncRuns.$inferInsert)["environment"],
			errorMessage: input.errorMessage ?? null,
		};

		if (input.id) {
			values.id = input.id;
		}

		const [row] = await this.db.insert(indicatorSyncRuns).values(values).returning();

		if (!row) {
			throw new Error("Failed to create indicator sync run");
		}
		return mapRow(row);
	}

	async findById(id: string): Promise<IndicatorSyncRun | null> {
		const [row] = await this.db
			.select()
			.from(indicatorSyncRuns)
			.where(eq(indicatorSyncRuns.id, id))
			.limit(1);

		return row ? mapRow(row) : null;
	}

	async findMany(filters?: SyncRunFilters, limit = 20): Promise<IndicatorSyncRun[]> {
		const conditions = [];

		if (filters?.runType) {
			conditions.push(eq(indicatorSyncRuns.runType, filters.runType));
		}
		if (filters?.status) {
			conditions.push(
				eq(indicatorSyncRuns.status, filters.status as typeof indicatorSyncRuns.$inferSelect.status)
			);
		}
		if (filters?.environment) {
			conditions.push(
				eq(
					indicatorSyncRuns.environment,
					filters.environment as typeof indicatorSyncRuns.$inferSelect.environment
				)
			);
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		const rows = await this.db
			.select()
			.from(indicatorSyncRuns)
			.where(whereClause)
			.orderBy(desc(indicatorSyncRuns.startedAt))
			.limit(limit);

		return rows.map(mapRow);
	}

	async findRunningByType(runType: SyncRunType): Promise<IndicatorSyncRun | null> {
		const [row] = await this.db
			.select()
			.from(indicatorSyncRuns)
			.where(and(eq(indicatorSyncRuns.runType, runType), eq(indicatorSyncRuns.status, "running")))
			.limit(1);

		return row ? mapRow(row) : null;
	}

	async update(id: string, input: UpdateIndicatorSyncRunInput): Promise<IndicatorSyncRun | null> {
		const updates: Partial<typeof indicatorSyncRuns.$inferInsert> = {};

		if (input.status !== undefined) {
			updates.status = input.status as typeof indicatorSyncRuns.$inferInsert.status;
			if (input.status === "completed" || input.status === "failed") {
				updates.completedAt = new Date();
			}
		}
		if (input.symbolsProcessed !== undefined) {
			updates.symbolsProcessed = input.symbolsProcessed;
		}
		if (input.symbolsFailed !== undefined) {
			updates.symbolsFailed = input.symbolsFailed;
		}
		if (input.errorMessage !== undefined) {
			updates.errorMessage = input.errorMessage;
		}

		if (Object.keys(updates).length === 0) {
			return this.findById(id);
		}

		const [row] = await this.db
			.update(indicatorSyncRuns)
			.set(updates)
			.where(eq(indicatorSyncRuns.id, id))
			.returning();

		return row ? mapRow(row) : null;
	}

	async cancel(id: string): Promise<IndicatorSyncRun | null> {
		return this.update(id, {
			status: "failed",
			errorMessage: "Cancelled by user",
		});
	}

	async getSummary(): Promise<SyncRunSummary> {
		const [countResult] = await this.db
			.select({
				total: count(),
				running: sql<number>`SUM(CASE WHEN ${indicatorSyncRuns.status} = 'running' THEN 1 ELSE 0 END)::int`,
				completed: sql<number>`SUM(CASE WHEN ${indicatorSyncRuns.status} = 'completed' THEN 1 ELSE 0 END)::int`,
				failed: sql<number>`SUM(CASE WHEN ${indicatorSyncRuns.status} = 'failed' THEN 1 ELSE 0 END)::int`,
			})
			.from(indicatorSyncRuns);

		const lastCompletedRows = await this.db
			.select({
				runType: indicatorSyncRuns.runType,
				lastCompleted: sql<Date>`MAX(${indicatorSyncRuns.completedAt})`,
			})
			.from(indicatorSyncRuns)
			.where(eq(indicatorSyncRuns.status, "completed"))
			.groupBy(indicatorSyncRuns.runType);

		const lastCompleted: Record<SyncRunType, string | null> = {
			fundamentals: null,
			short_interest: null,
			sentiment: null,
			corporate_actions: null,
			macro_watch: null,
			newspaper: null,
			filings_sync: null,
			prediction_markets: null,
			indicator_synthesis: null,
		};

		for (const row of lastCompletedRows) {
			lastCompleted[row.runType as SyncRunType] = row.lastCompleted?.toISOString() ?? null;
		}

		return {
			totalRuns: countResult?.total ?? 0,
			running: countResult?.running ?? 0,
			completed: countResult?.completed ?? 0,
			failed: countResult?.failed ?? 0,
			lastCompleted,
		};
	}

	async findAllRunning(): Promise<IndicatorSyncRun[]> {
		const rows = await this.db
			.select()
			.from(indicatorSyncRuns)
			.where(eq(indicatorSyncRuns.status, "running"));

		return rows.map(mapRow);
	}

	async getLastRunByType(): Promise<Map<SyncRunType, IndicatorSyncRun>> {
		const rows = await this.db
			.selectDistinctOn([indicatorSyncRuns.runType])
			.from(indicatorSyncRuns)
			.where(
				inArray(indicatorSyncRuns.status, [
					"completed" as typeof indicatorSyncRuns.$inferSelect.status,
					"failed" as typeof indicatorSyncRuns.$inferSelect.status,
				])
			)
			.orderBy(indicatorSyncRuns.runType, desc(indicatorSyncRuns.startedAt));

		const result = new Map<SyncRunType, IndicatorSyncRun>();
		for (const row of rows) {
			result.set(row.runType as SyncRunType, mapRow(row));
		}
		return result;
	}

	async countByFilters(filters?: SyncRunFilters): Promise<number> {
		const conditions = [];

		if (filters?.runType) {
			conditions.push(eq(indicatorSyncRuns.runType, filters.runType));
		}
		if (filters?.status) {
			conditions.push(
				eq(indicatorSyncRuns.status, filters.status as typeof indicatorSyncRuns.$inferSelect.status)
			);
		}
		if (filters?.environment) {
			conditions.push(
				eq(
					indicatorSyncRuns.environment,
					filters.environment as typeof indicatorSyncRuns.$inferSelect.environment
				)
			);
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		const [result] = await this.db
			.select({ count: count() })
			.from(indicatorSyncRuns)
			.where(whereClause);

		return result?.count ?? 0;
	}
}
