/**
 * Corporate Actions Repository (Drizzle ORM)
 *
 * Data access for stock splits, dividends, and other corporate actions.
 *
 * @see docs/plans/33-indicator-engine-v2.md
 */
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import { type Database, getDb } from "../db";
import { corporateActions } from "../schema/market-data";

// ============================================
// Zod Schemas
// ============================================

export const ActionTypeSchema = z.enum([
	"split",
	"reverse_split",
	"dividend",
	"special_dividend",
	"spinoff",
	"merger",
	"acquisition",
	"delisting",
	"name_change",
]);
export type ActionType = z.infer<typeof ActionTypeSchema>;

export interface CorporateAction {
	id: number;
	symbol: string;
	actionType: ActionType;
	exDate: string;
	recordDate: string | null;
	payDate: string | null;
	ratio: number | null;
	amount: number | null;
	details: string | null;
	provider: string;
	createdAt: string;
}

export interface CorporateActionInsert {
	symbol: string;
	actionType: ActionType;
	exDate: string;
	recordDate?: string | null;
	payDate?: string | null;
	ratio?: number | null;
	amount?: number | null;
	details?: string | null;
	provider?: string;
}

// ============================================
// Row Mapping
// ============================================

type CorporateActionRow = typeof corporateActions.$inferSelect;

function mapCorporateActionRow(row: CorporateActionRow): CorporateAction {
	return {
		id: row.id,
		symbol: row.symbol,
		actionType: row.actionType as ActionType,
		exDate: row.exDate.toISOString(),
		recordDate: row.recordDate?.toISOString() ?? null,
		payDate: row.payDate?.toISOString() ?? null,
		ratio: row.ratio ? Number(row.ratio) : null,
		amount: row.amount ? Number(row.amount) : null,
		details: row.details,
		provider: row.provider,
		createdAt: row.createdAt.toISOString(),
	};
}

// ============================================
// Repository
// ============================================

export class CorporateActionsRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async upsert(action: CorporateActionInsert): Promise<void> {
		await this.db
			.insert(corporateActions)
			.values({
				symbol: action.symbol,
				actionType: action.actionType as typeof corporateActions.$inferInsert.actionType,
				exDate: new Date(action.exDate),
				recordDate: action.recordDate ? new Date(action.recordDate) : null,
				payDate: action.payDate ? new Date(action.payDate) : null,
				ratio: action.ratio != null ? String(action.ratio) : null,
				amount: action.amount != null ? String(action.amount) : null,
				details: action.details ?? null,
				provider: action.provider ?? "alpaca",
			})
			.onConflictDoUpdate({
				target: [corporateActions.symbol, corporateActions.actionType, corporateActions.exDate],
				set: {
					recordDate: action.recordDate ? new Date(action.recordDate) : null,
					payDate: action.payDate ? new Date(action.payDate) : null,
					ratio: action.ratio != null ? String(action.ratio) : null,
					amount: action.amount != null ? String(action.amount) : null,
					details: action.details ?? null,
				},
			});
	}

	async getForSymbol(
		symbol: string,
		startDate?: string,
		endDate?: string,
	): Promise<CorporateAction[]> {
		const conditions = [eq(corporateActions.symbol, symbol)];

		if (startDate) {
			conditions.push(gte(corporateActions.exDate, new Date(startDate)));
		}
		if (endDate) {
			conditions.push(lte(corporateActions.exDate, new Date(endDate)));
		}

		const rows = await this.db
			.select()
			.from(corporateActions)
			.where(and(...conditions))
			.orderBy(desc(corporateActions.exDate));

		return rows.map(mapCorporateActionRow);
	}

	async getSplits(symbol: string, afterDate?: string): Promise<CorporateAction[]> {
		const conditions = [
			eq(corporateActions.symbol, symbol),
			inArray(corporateActions.actionType, [
				"split",
				"reverse_split",
			] as (typeof corporateActions.$inferSelect.actionType)[]),
		];

		if (afterDate) {
			conditions.push(gte(corporateActions.exDate, new Date(afterDate)));
		}

		const rows = await this.db
			.select()
			.from(corporateActions)
			.where(and(...conditions))
			.orderBy(corporateActions.exDate);

		return rows.map(mapCorporateActionRow);
	}

	async getDividends(symbol: string, afterDate?: string): Promise<CorporateAction[]> {
		const conditions = [
			eq(corporateActions.symbol, symbol),
			inArray(corporateActions.actionType, [
				"dividend",
				"special_dividend",
			] as (typeof corporateActions.$inferSelect.actionType)[]),
		];

		if (afterDate) {
			conditions.push(gte(corporateActions.exDate, new Date(afterDate)));
		}

		const rows = await this.db
			.select()
			.from(corporateActions)
			.where(and(...conditions))
			.orderBy(desc(corporateActions.exDate));

		return rows.map(mapCorporateActionRow);
	}

	async getByExDate(exDate: string): Promise<CorporateAction[]> {
		const dateStart = new Date(exDate);
		dateStart.setHours(0, 0, 0, 0);
		const dateEnd = new Date(exDate);
		dateEnd.setHours(23, 59, 59, 999);

		const rows = await this.db
			.select()
			.from(corporateActions)
			.where(and(gte(corporateActions.exDate, dateStart), lte(corporateActions.exDate, dateEnd)))
			.orderBy(corporateActions.symbol);

		return rows.map(mapCorporateActionRow);
	}

	async findByCreatedAtRange(
		startTime: string,
		endTime: string,
		limit = 100,
	): Promise<CorporateAction[]> {
		const rows = await this.db
			.select()
			.from(corporateActions)
			.where(
				and(
					gte(corporateActions.createdAt, new Date(startTime)),
					lte(corporateActions.createdAt, new Date(endTime)),
				),
			)
			.orderBy(desc(corporateActions.exDate), corporateActions.symbol)
			.limit(limit);

		return rows.map(mapCorporateActionRow);
	}
}
