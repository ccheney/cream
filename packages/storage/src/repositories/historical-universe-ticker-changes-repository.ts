import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { type Database, getDb } from "../db";
import { tickerChanges } from "../schema/historical-universe";
import { mapTickerChangeRow, type TickerChange } from "./historical-universe.types";

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
					and(eq(tickerChanges.newSymbol, historical), sql`${tickerChanges.changeDate} > ${asOf}`),
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
