import { and, count, desc, eq, gte, ilike, or, sql } from "drizzle-orm";
import type { Database } from "../db";
import { thesisState } from "../schema/thesis";
import type { Thesis, ThesisState } from "./thesis-state.types";

export interface CooldownStatus {
	onCooldown: boolean;
	cooldownUntil: string | null;
	closeReason: string | null;
	hoursSinceClose: number | null;
}

export interface CooldownSymbol {
	instrumentId: string;
	cooldownUntil: string;
	closeReason: string | null;
	closedAt: string | null;
}

export interface ThesisStats {
	total: number;
	byState: Record<ThesisState, number>;
	avgHoldingDays: number;
	winRate: number;
}

export async function getCooldownStatus(
	db: Database,
	instrumentId: string,
	environment: string,
): Promise<CooldownStatus> {
	const [row] = await db
		.select()
		.from(thesisState)
		.where(
			and(
				eq(thesisState.instrumentId, instrumentId),
				eq(thesisState.environment, environment as typeof thesisState.$inferSelect.environment),
				eq(thesisState.state, "CLOSED"),
			),
		)
		.orderBy(desc(thesisState.closedAt))
		.limit(1);

	if (!row || !row.cooldownUntil) {
		return { onCooldown: false, cooldownUntil: null, closeReason: null, hoursSinceClose: null };
	}

	const now = new Date();
	const onCooldown = row.cooldownUntil > now;
	const hoursSinceClose = row.closedAt
		? (now.getTime() - row.closedAt.getTime()) / (1000 * 60 * 60)
		: null;

	return {
		onCooldown,
		cooldownUntil: row.cooldownUntil.toISOString(),
		closeReason: row.closeReason,
		hoursSinceClose: hoursSinceClose !== null ? Math.round(hoursSinceClose * 10) / 10 : null,
	};
}

export async function findSymbolsOnCooldown(
	db: Database,
	environment: string,
): Promise<CooldownSymbol[]> {
	const now = new Date();

	const rows = await db
		.select({
			instrumentId: thesisState.instrumentId,
			cooldownUntil: thesisState.cooldownUntil,
			closeReason: thesisState.closeReason,
			closedAt: thesisState.closedAt,
		})
		.from(thesisState)
		.where(
			and(
				eq(thesisState.environment, environment as typeof thesisState.$inferSelect.environment),
				eq(thesisState.state, "CLOSED"),
				gte(thesisState.cooldownUntil, now),
			),
		)
		.orderBy(desc(thesisState.closedAt));

	return rows.map((row) => ({
		instrumentId: row.instrumentId,
		cooldownUntil: row.cooldownUntil?.toISOString() ?? "",
		closeReason: row.closeReason,
		closedAt: row.closedAt?.toISOString() ?? null,
	}));
}

export async function getThesisStats(db: Database, environment: string): Promise<ThesisStats> {
	const envFilter = environment as typeof thesisState.$inferSelect.environment;

	const stateCountsResult = await db
		.select({
			total: count(),
			watching: sql<number>`SUM(CASE WHEN ${thesisState.state} = 'WATCHING' THEN 1 ELSE 0 END)::int`,
			entered: sql<number>`SUM(CASE WHEN ${thesisState.state} = 'ENTERED' THEN 1 ELSE 0 END)::int`,
			adding: sql<number>`SUM(CASE WHEN ${thesisState.state} = 'ADDING' THEN 1 ELSE 0 END)::int`,
			managing: sql<number>`SUM(CASE WHEN ${thesisState.state} = 'MANAGING' THEN 1 ELSE 0 END)::int`,
			exiting: sql<number>`SUM(CASE WHEN ${thesisState.state} = 'EXITING' THEN 1 ELSE 0 END)::int`,
			closed: sql<number>`SUM(CASE WHEN ${thesisState.state} = 'CLOSED' THEN 1 ELSE 0 END)::int`,
		})
		.from(thesisState)
		.where(eq(thesisState.environment, envFilter));

	const performanceResult = await db
		.select({
			avgHoldingDays: sql<number>`AVG(EXTRACT(EPOCH FROM (${thesisState.closedAt} - ${thesisState.entryDate})) / 86400)`,
			winRate: sql<number>`AVG(CASE WHEN ${thesisState.realizedPnl}::numeric > 0 THEN 1.0 ELSE 0.0 END)`,
		})
		.from(thesisState)
		.where(
			and(
				eq(thesisState.environment, envFilter),
				eq(thesisState.state, "CLOSED"),
				sql`${thesisState.entryDate} IS NOT NULL`,
			),
		);

	const stateCounts = stateCountsResult[0];
	const performance = performanceResult[0];

	return {
		total: stateCounts?.total ?? 0,
		byState: {
			WATCHING: stateCounts?.watching ?? 0,
			ENTERED: stateCounts?.entered ?? 0,
			ADDING: stateCounts?.adding ?? 0,
			MANAGING: stateCounts?.managing ?? 0,
			EXITING: stateCounts?.exiting ?? 0,
			CLOSED: stateCounts?.closed ?? 0,
		},
		avgHoldingDays: performance?.avgHoldingDays ?? 0,
		winRate: performance?.winRate ?? 0,
	};
}

export async function searchTheses(
	db: Database,
	query: string,
	limit = 5,
): Promise<Pick<Thesis, "thesisId" | "instrumentId" | "entryThesis">[]> {
	const rows = await db
		.select({
			thesisId: thesisState.thesisId,
			instrumentId: thesisState.instrumentId,
			entryThesis: thesisState.entryThesis,
		})
		.from(thesisState)
		.where(
			or(
				ilike(thesisState.instrumentId, `%${query}%`),
				ilike(thesisState.entryThesis, `%${query}%`),
			),
		)
		.orderBy(desc(thesisState.createdAt))
		.limit(limit);

	return rows.map((row) => ({
		thesisId: row.thesisId,
		instrumentId: row.instrumentId,
		entryThesis: row.entryThesis,
	}));
}
