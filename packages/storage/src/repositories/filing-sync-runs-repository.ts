import { desc, eq } from "drizzle-orm";
import { type Database, getDb } from "../db";
import { filingSyncRuns } from "../schema/external";
import {
	type CreateSyncRunInput,
	type FilingSyncRun,
	mapSyncRunRow,
	type UpdateSyncRunProgress,
} from "./filings.types";

export class FilingSyncRunsRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async start(input: CreateSyncRunInput): Promise<FilingSyncRun> {
		const [row] = await this.db
			.insert(filingSyncRuns)
			.values({
				startedAt: new Date(),
				symbolsRequested: input.symbolsRequested,
				filingTypes: input.filingTypes,
				dateRangeStart: input.dateRangeStart ? new Date(input.dateRangeStart) : null,
				dateRangeEnd: input.dateRangeEnd ? new Date(input.dateRangeEnd) : null,
				symbolsTotal: input.symbolsTotal,
				triggerSource: input.triggerSource as typeof filingSyncRuns.$inferInsert.triggerSource,
				environment: input.environment as typeof filingSyncRuns.$inferInsert.environment,
				status: "running",
			})
			.returning();

		if (!row) {
			throw new Error("Failed to start sync run");
		}
		return mapSyncRunRow(row);
	}

	async findById(id: string): Promise<FilingSyncRun | null> {
		const [row] = await this.db
			.select()
			.from(filingSyncRuns)
			.where(eq(filingSyncRuns.id, id))
			.limit(1);

		return row ? mapSyncRunRow(row) : null;
	}

	async updateProgress(id: string, progress: UpdateSyncRunProgress): Promise<void> {
		const updates: Record<string, unknown> = {
			updatedAt: new Date(),
		};

		if (progress.symbolsProcessed !== undefined) {
			updates.symbolsProcessed = progress.symbolsProcessed;
		}
		if (progress.filingsFetched !== undefined) {
			updates.filingsFetched = progress.filingsFetched;
		}
		if (progress.filingsIngested !== undefined) {
			updates.filingsIngested = progress.filingsIngested;
		}
		if (progress.chunksCreated !== undefined) {
			updates.chunksCreated = progress.chunksCreated;
		}

		await this.db.update(filingSyncRuns).set(updates).where(eq(filingSyncRuns.id, id));
	}

	async complete(
		id: string,
		stats: { filingsIngested: number; chunksCreated: number },
	): Promise<void> {
		await this.db
			.update(filingSyncRuns)
			.set({
				status: "completed",
				completedAt: new Date(),
				filingsIngested: stats.filingsIngested,
				chunksCreated: stats.chunksCreated,
				updatedAt: new Date(),
			})
			.where(eq(filingSyncRuns.id, id));
	}

	async fail(id: string, errorMessage: string): Promise<void> {
		await this.db
			.update(filingSyncRuns)
			.set({
				status: "failed",
				completedAt: new Date(),
				errorMessage,
				updatedAt: new Date(),
			})
			.where(eq(filingSyncRuns.id, id));
	}

	async findRecent(limit = 10): Promise<FilingSyncRun[]> {
		const rows = await this.db
			.select()
			.from(filingSyncRuns)
			.orderBy(desc(filingSyncRuns.startedAt))
			.limit(limit);

		return rows.map(mapSyncRunRow);
	}

	async findRunning(): Promise<FilingSyncRun | null> {
		const [row] = await this.db
			.select()
			.from(filingSyncRuns)
			.where(eq(filingSyncRuns.status, "running"))
			.orderBy(desc(filingSyncRuns.startedAt))
			.limit(1);

		return row ? mapSyncRunRow(row) : null;
	}

	async getLastSuccessful(): Promise<FilingSyncRun | null> {
		const [row] = await this.db
			.select()
			.from(filingSyncRuns)
			.where(eq(filingSyncRuns.status, "completed"))
			.orderBy(desc(filingSyncRuns.completedAt))
			.limit(1);

		return row ? mapSyncRunRow(row) : null;
	}
}
