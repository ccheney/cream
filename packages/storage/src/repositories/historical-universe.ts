/**
 * Historical Universe Repository (Drizzle ORM)
 *
 * Stores and retrieves point-in-time universe data for survivorship-bias-free backtesting.
 * Tracks historical index compositions, ticker changes, and universe snapshots.
 *
 * @see docs/plans/12-backtest.md - Survivorship Bias Prevention
 */
import { and, asc, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { type Database, getDb } from "../db";
import { indexConstituents, tickerChanges, universeSnapshots } from "../schema/universe";

// ============================================
// Types
// ============================================

export const IndexIdSchema = z.enum([
	"SP500",
	"NASDAQ100",
	"DOWJONES",
	"RUSSELL2000",
	"RUSSELL3000",
	"SP400",
	"SP600",
]);
export type IndexId = z.infer<typeof IndexIdSchema>;

export const ChangeTypeSchema = z.enum([
	"rename",
	"merger",
	"spinoff",
	"acquisition",
	"restructure",
]);
export type ChangeType = z.infer<typeof ChangeTypeSchema>;

export const IndexConstituentSchema = z.object({
	id: z.number().optional(),
	indexId: IndexIdSchema,
	symbol: z.string().min(1),
	dateAdded: z.string().describe("Date symbol was added to index in ISO8601 format"),
	dateRemoved: z.string().nullable().optional(),
	reasonAdded: z.string().nullable().optional(),
	reasonRemoved: z.string().nullable().optional(),
	sector: z.string().nullable().optional(),
	industry: z.string().nullable().optional(),
	marketCapAtAdd: z.number().nullable().optional(),
	provider: z.string().default("alpaca"),
	createdAt: z.string().optional(),
	updatedAt: z.string().optional(),
});
export type IndexConstituent = z.infer<typeof IndexConstituentSchema>;

export const TickerChangeSchema = z.object({
	id: z.number().optional(),
	oldSymbol: z.string().min(1),
	newSymbol: z.string().min(1),
	changeDate: z.string().describe("Date of ticker change in ISO8601 format"),
	changeType: ChangeTypeSchema,
	conversionRatio: z.number().nullable().optional(),
	reason: z.string().nullable().optional(),
	acquiringCompany: z.string().nullable().optional(),
	provider: z.string().default("alpaca"),
	createdAt: z.string().optional(),
});
export type TickerChange = z.infer<typeof TickerChangeSchema>;

export const UniverseSnapshotSchema = z.object({
	id: z.number().optional(),
	snapshotDate: z.string().describe("Point-in-time date of universe snapshot in ISO8601 format"),
	indexId: IndexIdSchema,
	tickers: z.array(z.string()),
	tickerCount: z.number(),
	sourceVersion: z.string().nullable().optional(),
	computedAt: z.string().optional(),
	expiresAt: z.string().nullable().optional(),
});
export type UniverseSnapshot = z.infer<typeof UniverseSnapshotSchema>;

// ============================================
// Row Mapping
// ============================================

type IndexConstituentRow = typeof indexConstituents.$inferSelect;
type TickerChangeRow = typeof tickerChanges.$inferSelect;
type UniverseSnapshotRow = typeof universeSnapshots.$inferSelect;

function mapConstituentRow(row: IndexConstituentRow): IndexConstituent {
	return {
		id: row.id,
		indexId: row.indexId as IndexId,
		symbol: row.symbol,
		dateAdded: row.dateAdded.toISOString(),
		dateRemoved: row.dateRemoved?.toISOString() ?? null,
		reasonAdded: row.reasonAdded,
		reasonRemoved: row.reasonRemoved,
		sector: row.sector,
		industry: row.industry,
		marketCapAtAdd: row.marketCapAtAdd ? Number(row.marketCapAtAdd) : null,
		provider: row.provider,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

function mapTickerChangeRow(row: TickerChangeRow): TickerChange {
	return {
		id: row.id,
		oldSymbol: row.oldSymbol,
		newSymbol: row.newSymbol,
		changeDate: row.changeDate.toISOString(),
		changeType: row.changeType as ChangeType,
		conversionRatio: row.conversionRatio ? Number(row.conversionRatio) : null,
		reason: row.reason,
		acquiringCompany: row.acquiringCompany,
		provider: row.provider,
		createdAt: row.createdAt.toISOString(),
	};
}

function mapSnapshotRow(row: UniverseSnapshotRow): UniverseSnapshot {
	return {
		id: row.id,
		snapshotDate: row.snapshotDate.toISOString(),
		indexId: row.indexId as IndexId,
		tickers: (row.tickers as string[]) ?? [],
		tickerCount: row.tickerCount,
		sourceVersion: row.sourceVersion,
		computedAt: row.computedAt.toISOString(),
		expiresAt: row.expiresAt?.toISOString() ?? null,
	};
}

// ============================================
// IndexConstituentsRepository
// ============================================

export class IndexConstituentsRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async upsert(
		constituent: Omit<IndexConstituent, "id" | "createdAt" | "updatedAt">
	): Promise<void> {
		await this.db
			.insert(indexConstituents)
			.values({
				indexId: constituent.indexId,
				symbol: constituent.symbol,
				dateAdded: new Date(constituent.dateAdded),
				dateRemoved: constituent.dateRemoved ? new Date(constituent.dateRemoved) : null,
				reasonAdded: constituent.reasonAdded ?? null,
				reasonRemoved: constituent.reasonRemoved ?? null,
				sector: constituent.sector ?? null,
				industry: constituent.industry ?? null,
				marketCapAtAdd: constituent.marketCapAtAdd?.toString() ?? null,
				provider: constituent.provider ?? "alpaca",
			})
			.onConflictDoUpdate({
				target: [indexConstituents.indexId, indexConstituents.symbol, indexConstituents.dateAdded],
				set: {
					dateRemoved: constituent.dateRemoved ? new Date(constituent.dateRemoved) : null,
					reasonRemoved: constituent.reasonRemoved ?? null,
					updatedAt: new Date(),
				},
			});
	}

	async bulkInsert(
		constituents: Omit<IndexConstituent, "id" | "createdAt" | "updatedAt">[]
	): Promise<number> {
		if (constituents.length === 0) {
			return 0;
		}

		let inserted = 0;
		for (const constituent of constituents) {
			await this.upsert(constituent);
			inserted++;
		}
		return inserted;
	}

	async getConstituentsAsOf(indexId: IndexId, asOfDate: string): Promise<string[]> {
		const asOf = new Date(asOfDate);

		const rows = await this.db
			.selectDistinct({ symbol: indexConstituents.symbol })
			.from(indexConstituents)
			.where(
				and(
					eq(indexConstituents.indexId, indexId),
					lte(indexConstituents.dateAdded, asOf),
					or(isNull(indexConstituents.dateRemoved), sql`${indexConstituents.dateRemoved} > ${asOf}`)
				)
			)
			.orderBy(asc(indexConstituents.symbol));

		return rows.map((r) => r.symbol);
	}

	async getCurrentConstituents(indexId: IndexId): Promise<IndexConstituent[]> {
		const rows = await this.db
			.select()
			.from(indexConstituents)
			.where(and(eq(indexConstituents.indexId, indexId), isNull(indexConstituents.dateRemoved)))
			.orderBy(asc(indexConstituents.symbol));

		return rows.map(mapConstituentRow);
	}

	async getSymbolHistory(symbol: string): Promise<IndexConstituent[]> {
		const rows = await this.db
			.select()
			.from(indexConstituents)
			.where(eq(indexConstituents.symbol, symbol))
			.orderBy(asc(indexConstituents.indexId), asc(indexConstituents.dateAdded));

		return rows.map(mapConstituentRow);
	}

	async wasInIndexOnDate(indexId: IndexId, symbol: string, date: string): Promise<boolean> {
		const dateObj = new Date(date);

		const [result] = await this.db
			.select({ cnt: sql<number>`COUNT(*)::int` })
			.from(indexConstituents)
			.where(
				and(
					eq(indexConstituents.indexId, indexId),
					eq(indexConstituents.symbol, symbol),
					lte(indexConstituents.dateAdded, dateObj),
					or(
						isNull(indexConstituents.dateRemoved),
						sql`${indexConstituents.dateRemoved} > ${dateObj}`
					)
				)
			);

		return (result?.cnt ?? 0) > 0;
	}

	async getChangesInRange(
		indexId: IndexId,
		startDate: string,
		endDate: string
	): Promise<{ additions: IndexConstituent[]; removals: IndexConstituent[] }> {
		const start = new Date(startDate);
		const end = new Date(endDate);

		const additions = await this.db
			.select()
			.from(indexConstituents)
			.where(
				and(
					eq(indexConstituents.indexId, indexId),
					gte(indexConstituents.dateAdded, start),
					lte(indexConstituents.dateAdded, end)
				)
			)
			.orderBy(asc(indexConstituents.dateAdded));

		const removals = await this.db
			.select()
			.from(indexConstituents)
			.where(
				and(
					eq(indexConstituents.indexId, indexId),
					gte(indexConstituents.dateRemoved, start),
					lte(indexConstituents.dateRemoved, end)
				)
			)
			.orderBy(asc(indexConstituents.dateRemoved));

		return {
			additions: additions.map(mapConstituentRow),
			removals: removals.map(mapConstituentRow),
		};
	}

	async getConstituentCount(indexId: IndexId, asOfDate?: string): Promise<number> {
		if (asOfDate) {
			const asOf = new Date(asOfDate);

			const [result] = await this.db
				.select({ cnt: sql<number>`COUNT(DISTINCT ${indexConstituents.symbol})::int` })
				.from(indexConstituents)
				.where(
					and(
						eq(indexConstituents.indexId, indexId),
						lte(indexConstituents.dateAdded, asOf),
						or(
							isNull(indexConstituents.dateRemoved),
							sql`${indexConstituents.dateRemoved} > ${asOf}`
						)
					)
				);

			return result?.cnt ?? 0;
		}

		const [result] = await this.db
			.select({ cnt: sql<number>`COUNT(*)::int` })
			.from(indexConstituents)
			.where(and(eq(indexConstituents.indexId, indexId), isNull(indexConstituents.dateRemoved)));

		return result?.cnt ?? 0;
	}
}

// ============================================
// TickerChangesRepository
// ============================================

export class TickerChangesRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async insert(change: Omit<TickerChange, "id" | "createdAt">): Promise<void> {
		await this.db
			.insert(tickerChanges)
			.values({
				oldSymbol: change.oldSymbol,
				newSymbol: change.newSymbol,
				changeDate: new Date(change.changeDate),
				changeType: change.changeType as typeof tickerChanges.$inferInsert.changeType,
				conversionRatio: change.conversionRatio?.toString() ?? null,
				reason: change.reason ?? null,
				acquiringCompany: change.acquiringCompany ?? null,
				provider: change.provider ?? "alpaca",
			})
			.onConflictDoNothing();
	}

	async getChangesFromSymbol(oldSymbol: string): Promise<TickerChange[]> {
		const rows = await this.db
			.select()
			.from(tickerChanges)
			.where(eq(tickerChanges.oldSymbol, oldSymbol))
			.orderBy(asc(tickerChanges.changeDate));

		return rows.map(mapTickerChangeRow);
	}

	async getChangesToSymbol(newSymbol: string): Promise<TickerChange[]> {
		const rows = await this.db
			.select()
			.from(tickerChanges)
			.where(eq(tickerChanges.newSymbol, newSymbol))
			.orderBy(asc(tickerChanges.changeDate));

		return rows.map(mapTickerChangeRow);
	}

	async resolveToCurrentSymbol(historicalSymbol: string): Promise<string> {
		let current = historicalSymbol;
		const visited = new Set<string>();

		while (!visited.has(current)) {
			visited.add(current);

			const [row] = await this.db
				.select({ newSymbol: tickerChanges.newSymbol })
				.from(tickerChanges)
				.where(eq(tickerChanges.oldSymbol, current))
				.orderBy(desc(tickerChanges.changeDate))
				.limit(1);

			if (!row) {
				break;
			}
			current = row.newSymbol;
		}

		return current;
	}

	async resolveToHistoricalSymbol(currentSymbol: string, asOfDate: string): Promise<string> {
		let historical = currentSymbol;
		const visited = new Set<string>();
		const asOf = new Date(asOfDate);

		while (!visited.has(historical)) {
			visited.add(historical);

			const [row] = await this.db
				.select({ oldSymbol: tickerChanges.oldSymbol })
				.from(tickerChanges)
				.where(
					and(eq(tickerChanges.newSymbol, historical), sql`${tickerChanges.changeDate} > ${asOf}`)
				)
				.orderBy(asc(tickerChanges.changeDate))
				.limit(1);

			if (!row) {
				break;
			}
			historical = row.oldSymbol;
		}

		return historical;
	}

	async getChangesInRange(startDate: string, endDate: string): Promise<TickerChange[]> {
		const start = new Date(startDate);
		const end = new Date(endDate);

		const rows = await this.db
			.select()
			.from(tickerChanges)
			.where(and(gte(tickerChanges.changeDate, start), lte(tickerChanges.changeDate, end)))
			.orderBy(asc(tickerChanges.changeDate));

		return rows.map(mapTickerChangeRow);
	}
}

// ============================================
// UniverseSnapshotsRepository
// ============================================

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
					eq(universeSnapshots.snapshotDate, new Date(snapshotDate))
				)
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
				and(eq(universeSnapshots.indexId, indexId), lte(universeSnapshots.snapshotDate, dateObj))
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

		return rows.map((r) => r.snapshotDate.toISOString());
	}

	async purgeExpired(): Promise<number> {
		const now = new Date();

		const result = await this.db
			.delete(universeSnapshots)
			.where(
				and(sql`${universeSnapshots.expiresAt} IS NOT NULL`, lte(universeSnapshots.expiresAt, now))
			)
			.returning({ id: universeSnapshots.id });

		return result.length;
	}
}
