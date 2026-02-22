import { and, asc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { type Database, getDb } from "../db";
import { indexConstituents } from "../schema/historical-universe";
import {
	type IndexConstituent,
	type IndexId,
	mapConstituentRow,
} from "./historical-universe.types";

export class IndexConstituentsRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async upsert(
		constituent: Omit<IndexConstituent, "id" | "createdAt" | "updatedAt">,
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
		constituents: Omit<IndexConstituent, "id" | "createdAt" | "updatedAt">[],
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
					or(
						isNull(indexConstituents.dateRemoved),
						sql`${indexConstituents.dateRemoved} > ${asOf}`,
					),
				),
			)
			.orderBy(asc(indexConstituents.symbol));

		return rows.map((row) => row.symbol);
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
						sql`${indexConstituents.dateRemoved} > ${dateObj}`,
					),
				),
			);

		return (result?.cnt ?? 0) > 0;
	}

	async getChangesInRange(
		indexId: IndexId,
		startDate: string,
		endDate: string,
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
					lte(indexConstituents.dateAdded, end),
				),
			)
			.orderBy(asc(indexConstituents.dateAdded));

		const removals = await this.db
			.select()
			.from(indexConstituents)
			.where(
				and(
					eq(indexConstituents.indexId, indexId),
					gte(indexConstituents.dateRemoved, start),
					lte(indexConstituents.dateRemoved, end),
				),
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
							sql`${indexConstituents.dateRemoved} > ${asOf}`,
						),
					),
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
