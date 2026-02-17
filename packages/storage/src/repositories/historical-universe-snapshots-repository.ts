import { and, asc, desc, eq, lte, sql } from "drizzle-orm";
import { type Database, getDb } from "../db";
import { universeSnapshots } from "../schema/universe";
import { type IndexId, mapSnapshotRow, type UniverseSnapshot } from "./historical-universe.types";

export class UniverseSnapshotsRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async save(snapshot: Omit<UniverseSnapshot, "id" | "computedAt">): Promise<void> {
		const tickerCount = snapshot.tickers.length;

		await this.db
			.insert(universeSnapshots)
			.values({
				snapshotDate: new Date(snapshot.snapshotDate),
				indexId: snapshot.indexId,
				tickers: snapshot.tickers,
				tickerCount,
				sourceVersion: snapshot.sourceVersion ?? null,
				expiresAt: snapshot.expiresAt ? new Date(snapshot.expiresAt) : null,
			})
			.onConflictDoUpdate({
				target: [universeSnapshots.indexId, universeSnapshots.snapshotDate],
				set: {
					tickers: snapshot.tickers,
					tickerCount,
					sourceVersion: snapshot.sourceVersion ?? null,
					computedAt: new Date(),
					expiresAt: snapshot.expiresAt ? new Date(snapshot.expiresAt) : null,
				},
			});
	}

	async get(indexId: IndexId, snapshotDate: string): Promise<UniverseSnapshot | null> {
		const [row] = await this.db
			.select()
			.from(universeSnapshots)
			.where(
				and(
					eq(universeSnapshots.indexId, indexId),
					eq(universeSnapshots.snapshotDate, new Date(snapshotDate)),
				),
			)
			.limit(1);

		return row ? mapSnapshotRow(row) : null;
	}

	async getClosestBefore(indexId: IndexId, date: string): Promise<UniverseSnapshot | null> {
		const dateObj = new Date(date);

		const [row] = await this.db
			.select()
			.from(universeSnapshots)
			.where(
				and(eq(universeSnapshots.indexId, indexId), lte(universeSnapshots.snapshotDate, dateObj)),
			)
			.orderBy(desc(universeSnapshots.snapshotDate))
			.limit(1);

		return row ? mapSnapshotRow(row) : null;
	}

	async listDates(indexId: IndexId): Promise<string[]> {
		const rows = await this.db
			.select({ snapshotDate: universeSnapshots.snapshotDate })
			.from(universeSnapshots)
			.where(eq(universeSnapshots.indexId, indexId))
			.orderBy(asc(universeSnapshots.snapshotDate));

		return rows.map((row) => row.snapshotDate.toISOString());
	}

	async purgeExpired(): Promise<number> {
		const now = new Date();

		const result = await this.db
			.delete(universeSnapshots)
			.where(
				and(sql`${universeSnapshots.expiresAt} IS NOT NULL`, lte(universeSnapshots.expiresAt, now)),
			)
			.returning({ id: universeSnapshots.id });

		return result.length;
	}
}
