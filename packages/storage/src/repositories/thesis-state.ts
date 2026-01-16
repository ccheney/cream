/**
 * Thesis State Repository (Drizzle ORM)
 *
 * Manages thesis lifecycle tracking across OODA cycles.
 * Theses track position state from WATCHING through CLOSED.
 *
 * @see docs/plans/05-agents.md - Thesis State Management section
 */
import { and, asc, count, desc, eq, gte, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { type Database, getDb } from "../db";
import { thesisState, thesisStateHistory } from "../schema/thesis";

// ============================================
// Types
// ============================================

export type ThesisState = "WATCHING" | "ENTERED" | "ADDING" | "MANAGING" | "EXITING" | "CLOSED";

export type CloseReason =
	| "STOP_HIT"
	| "TARGET_HIT"
	| "INVALIDATED"
	| "MANUAL"
	| "TIME_DECAY"
	| "CORRELATION";

export interface Thesis {
	thesisId: string;
	instrumentId: string;
	state: ThesisState;
	entryPrice: number | null;
	entryDate: string | null;
	currentStop: number | null;
	currentTarget: number | null;
	conviction: number | null;
	entryThesis: string | null;
	invalidationConditions: string | null;
	addCount: number;
	maxPositionReached: boolean;
	peakUnrealizedPnl: number | null;
	closeReason: CloseReason | null;
	exitPrice: number | null;
	realizedPnl: number | null;
	realizedPnlPct: number | null;
	environment: string;
	notes: Record<string, unknown>;
	lastUpdated: string;
	createdAt: string;
	closedAt: string | null;
}

export interface ThesisContext {
	instrumentId: string;
	currentState: ThesisState;
	entryPrice: number | null;
	entryDate: string | null;
	currentPnL: number | null;
	stopLoss: number | null;
	takeProfit: number | null;
	addCount: number;
	maxPositionReached: boolean;
	daysHeld: number;
}

export interface CreateThesisInput {
	thesisId?: string;
	instrumentId: string;
	state?: ThesisState;
	entryThesis?: string;
	invalidationConditions?: string;
	conviction?: number;
	currentStop?: number;
	currentTarget?: number;
	environment: string;
	notes?: Record<string, unknown>;
}

export interface StateTransitionInput {
	toState: ThesisState;
	triggerReason?: string;
	cycleId?: string;
	priceAtTransition?: number;
	notes?: string;
}

export interface ThesisFilters {
	instrumentId?: string;
	state?: ThesisState;
	states?: ThesisState[];
	environment?: string;
	closedAfter?: string;
	createdAfter?: string;
}

export interface ThesisStateHistoryEntry {
	id: number;
	thesisId: string;
	fromState: ThesisState;
	toState: ThesisState;
	triggerReason: string | null;
	cycleId: string | null;
	priceAtTransition: number | null;
	convictionAtTransition: number | null;
	notes: string | null;
	createdAt: string;
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
// State Transition Validation
// ============================================

const VALID_TRANSITIONS: Record<ThesisState, ThesisState[]> = {
	WATCHING: ["ENTERED", "CLOSED"],
	ENTERED: ["ADDING", "MANAGING", "EXITING", "CLOSED"],
	ADDING: ["MANAGING", "EXITING", "CLOSED"],
	MANAGING: ["ADDING", "EXITING", "CLOSED"],
	EXITING: ["MANAGING", "CLOSED"],
	CLOSED: ["WATCHING"],
};

export function isValidTransition(from: ThesisState, to: ThesisState): boolean {
	return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ============================================
// Row Mapping
// ============================================

type ThesisRow = typeof thesisState.$inferSelect;
type HistoryRow = typeof thesisStateHistory.$inferSelect;

function parseNotes(notes: string | null): Record<string, unknown> {
	if (!notes) {
		return {};
	}
	try {
		return JSON.parse(notes) as Record<string, unknown>;
	} catch {
		return {};
	}
}

function mapThesisRow(row: ThesisRow): Thesis {
	return {
		thesisId: row.thesisId,
		instrumentId: row.instrumentId,
		state: row.state as ThesisState,
		entryPrice: row.entryPrice ? Number(row.entryPrice) : null,
		entryDate: row.entryDate?.toISOString() ?? null,
		currentStop: row.currentStop ? Number(row.currentStop) : null,
		currentTarget: row.currentTarget ? Number(row.currentTarget) : null,
		conviction: row.conviction ? Number(row.conviction) : null,
		entryThesis: row.entryThesis,
		invalidationConditions: row.invalidationConditions,
		addCount: row.addCount,
		maxPositionReached: row.maxPositionReached === 1,
		peakUnrealizedPnl: row.peakUnrealizedPnl ? Number(row.peakUnrealizedPnl) : null,
		closeReason: row.closeReason as CloseReason | null,
		exitPrice: row.exitPrice ? Number(row.exitPrice) : null,
		realizedPnl: row.realizedPnl ? Number(row.realizedPnl) : null,
		realizedPnlPct: row.realizedPnlPct ? Number(row.realizedPnlPct) : null,
		environment: row.environment,
		notes: parseNotes(row.notes),
		lastUpdated: row.lastUpdated.toISOString(),
		createdAt: row.createdAt.toISOString(),
		closedAt: row.closedAt?.toISOString() ?? null,
	};
}

function mapHistoryRow(row: HistoryRow): ThesisStateHistoryEntry {
	return {
		id: row.id,
		thesisId: row.thesisId,
		fromState: row.fromState as ThesisState,
		toState: row.toState as ThesisState,
		triggerReason: row.triggerReason,
		cycleId: row.cycleId,
		priceAtTransition: row.priceAtTransition ? Number(row.priceAtTransition) : null,
		convictionAtTransition: row.convictionAtTransition ? Number(row.convictionAtTransition) : null,
		notes: row.notes,
		createdAt: row.createdAt.toISOString(),
	};
}

// ============================================
// Repository
// ============================================

export class ThesisStateRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async create(input: CreateThesisInput): Promise<Thesis> {
		const [row] = await this.db
			.insert(thesisState)
			.values({
				thesisId: input.thesisId,
				instrumentId: input.instrumentId,
				state: (input.state ?? "WATCHING") as typeof thesisState.$inferInsert.state,
				entryThesis: input.entryThesis ?? null,
				invalidationConditions: input.invalidationConditions ?? null,
				conviction: input.conviction?.toString() ?? null,
				currentStop: input.currentStop?.toString() ?? null,
				currentTarget: input.currentTarget?.toString() ?? null,
				environment: input.environment as typeof thesisState.$inferInsert.environment,
				notes: JSON.stringify(input.notes ?? {}),
			})
			.returning();

		if (!row) {
			throw new Error("Failed to create thesis state");
		}
		return mapThesisRow(row);
	}

	async findById(thesisId: string): Promise<Thesis | null> {
		const [row] = await this.db
			.select()
			.from(thesisState)
			.where(eq(thesisState.thesisId, thesisId))
			.limit(1);

		return row ? mapThesisRow(row) : null;
	}

	async findByIdOrThrow(thesisId: string): Promise<Thesis> {
		const thesis = await this.findById(thesisId);
		if (!thesis) {
			throw new Error(`Thesis not found: ${thesisId}`);
		}
		return thesis;
	}

	async findActiveForInstrument(instrumentId: string, environment: string): Promise<Thesis | null> {
		const [row] = await this.db
			.select()
			.from(thesisState)
			.where(
				and(
					eq(thesisState.instrumentId, instrumentId),
					eq(thesisState.environment, environment as typeof thesisState.$inferSelect.environment),
					ne(thesisState.state, "CLOSED")
				)
			)
			.orderBy(desc(thesisState.createdAt))
			.limit(1);

		return row ? mapThesisRow(row) : null;
	}

	async findMany(
		filters: ThesisFilters = {},
		pagination?: PaginationOptions
	): Promise<PaginatedResult<Thesis>> {
		const conditions = [];

		if (filters.instrumentId) {
			conditions.push(eq(thesisState.instrumentId, filters.instrumentId));
		}
		if (filters.state) {
			conditions.push(
				eq(thesisState.state, filters.state as typeof thesisState.$inferSelect.state)
			);
		}
		if (filters.states && filters.states.length > 0) {
			conditions.push(
				inArray(thesisState.state, filters.states as (typeof thesisState.$inferSelect.state)[])
			);
		}
		if (filters.environment) {
			conditions.push(
				eq(
					thesisState.environment,
					filters.environment as typeof thesisState.$inferSelect.environment
				)
			);
		}
		if (filters.closedAfter) {
			conditions.push(gte(thesisState.closedAt, new Date(filters.closedAfter)));
		}
		if (filters.createdAfter) {
			conditions.push(gte(thesisState.createdAt, new Date(filters.createdAfter)));
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
		const page = pagination?.page ?? 1;
		const pageSize = pagination?.pageSize ?? 50;
		const offset = (page - 1) * pageSize;

		const [countResult] = await this.db
			.select({ count: count() })
			.from(thesisState)
			.where(whereClause);

		const rows = await this.db
			.select()
			.from(thesisState)
			.where(whereClause)
			.orderBy(desc(thesisState.createdAt))
			.limit(pageSize)
			.offset(offset);

		const total = countResult?.count ?? 0;

		return {
			data: rows.map(mapThesisRow),
			total,
			page,
			pageSize,
			totalPages: Math.ceil(total / pageSize),
		};
	}

	async findActive(environment: string): Promise<Thesis[]> {
		const rows = await this.db
			.select()
			.from(thesisState)
			.where(
				and(
					eq(thesisState.environment, environment as typeof thesisState.$inferSelect.environment),
					ne(thesisState.state, "CLOSED")
				)
			)
			.orderBy(desc(thesisState.createdAt));

		return rows.map(mapThesisRow);
	}

	async findByStates(states: ThesisState[], environment: string): Promise<Thesis[]> {
		const rows = await this.db
			.select()
			.from(thesisState)
			.where(
				and(
					eq(thesisState.environment, environment as typeof thesisState.$inferSelect.environment),
					inArray(thesisState.state, states as (typeof thesisState.$inferSelect.state)[])
				)
			)
			.orderBy(desc(thesisState.createdAt));

		return rows.map(mapThesisRow);
	}

	async transitionState(thesisId: string, transition: StateTransitionInput): Promise<Thesis> {
		const thesis = await this.findByIdOrThrow(thesisId);
		const fromState = thesis.state;
		const { toState } = transition;

		if (!isValidTransition(fromState, toState)) {
			throw new Error(`Invalid state transition: ${fromState} -> ${toState}`);
		}

		const now = new Date();

		await this.db
			.update(thesisState)
			.set({
				state: toState as typeof thesisState.$inferInsert.state,
				lastUpdated: now,
				closedAt: toState === "CLOSED" ? now : undefined,
			})
			.where(eq(thesisState.thesisId, thesisId));

		await this.db.insert(thesisStateHistory).values({
			thesisId,
			fromState: fromState as typeof thesisStateHistory.$inferInsert.fromState,
			toState: toState as typeof thesisStateHistory.$inferInsert.toState,
			triggerReason: transition.triggerReason ?? null,
			cycleId: transition.cycleId ?? null,
			priceAtTransition: transition.priceAtTransition?.toString() ?? null,
			convictionAtTransition: thesis.conviction?.toString() ?? null,
			notes: transition.notes ?? null,
		});

		return this.findByIdOrThrow(thesisId);
	}

	async enterPosition(
		thesisId: string,
		entryPrice: number,
		stopLoss: number,
		target?: number,
		cycleId?: string
	): Promise<Thesis> {
		const thesis = await this.findByIdOrThrow(thesisId);

		if (thesis.state !== "WATCHING") {
			throw new Error(`Cannot enter position from state: ${thesis.state}`);
		}

		const now = new Date();

		await this.db
			.update(thesisState)
			.set({
				state: "ENTERED" as typeof thesisState.$inferInsert.state,
				entryPrice: entryPrice.toString(),
				entryDate: now,
				currentStop: stopLoss.toString(),
				currentTarget: target?.toString() ?? null,
				lastUpdated: now,
			})
			.where(eq(thesisState.thesisId, thesisId));

		await this.db.insert(thesisStateHistory).values({
			thesisId,
			fromState: "WATCHING" as typeof thesisStateHistory.$inferInsert.fromState,
			toState: "ENTERED" as typeof thesisStateHistory.$inferInsert.toState,
			triggerReason: "Entry conditions met",
			cycleId: cycleId ?? null,
			priceAtTransition: entryPrice.toString(),
			convictionAtTransition: thesis.conviction?.toString() ?? null,
		});

		return this.findByIdOrThrow(thesisId);
	}

	async close(
		thesisId: string,
		reason: CloseReason,
		exitPrice?: number,
		realizedPnl?: number,
		cycleId?: string
	): Promise<Thesis> {
		const thesis = await this.findByIdOrThrow(thesisId);

		if (thesis.state === "CLOSED") {
			throw new Error("Thesis is already closed");
		}

		const now = new Date();
		const pnlPct =
			realizedPnl !== undefined && thesis.entryPrice
				? (realizedPnl / thesis.entryPrice) * 100
				: null;

		await this.db
			.update(thesisState)
			.set({
				state: "CLOSED" as typeof thesisState.$inferInsert.state,
				closeReason: reason,
				exitPrice: exitPrice?.toString() ?? null,
				realizedPnl: realizedPnl?.toString() ?? null,
				realizedPnlPct: pnlPct?.toString() ?? null,
				lastUpdated: now,
				closedAt: now,
			})
			.where(eq(thesisState.thesisId, thesisId));

		await this.db.insert(thesisStateHistory).values({
			thesisId,
			fromState: thesis.state as typeof thesisStateHistory.$inferInsert.fromState,
			toState: "CLOSED" as typeof thesisStateHistory.$inferInsert.toState,
			triggerReason: reason,
			cycleId: cycleId ?? null,
			priceAtTransition: exitPrice?.toString() ?? null,
			convictionAtTransition: thesis.conviction?.toString() ?? null,
		});

		return this.findByIdOrThrow(thesisId);
	}

	async updateConviction(thesisId: string, conviction: number): Promise<Thesis> {
		if (conviction < 0 || conviction > 1) {
			throw new Error("Conviction must be between 0 and 1");
		}

		await this.db
			.update(thesisState)
			.set({
				conviction: conviction.toString(),
				lastUpdated: new Date(),
			})
			.where(eq(thesisState.thesisId, thesisId));

		return this.findByIdOrThrow(thesisId);
	}

	async updateLevels(thesisId: string, stopLoss?: number, target?: number): Promise<Thesis> {
		const updates: Record<string, unknown> = {
			lastUpdated: new Date(),
		};

		if (stopLoss !== undefined) {
			updates.currentStop = stopLoss.toString();
		}
		if (target !== undefined) {
			updates.currentTarget = target.toString();
		}

		await this.db.update(thesisState).set(updates).where(eq(thesisState.thesisId, thesisId));

		return this.findByIdOrThrow(thesisId);
	}

	async incrementAddCount(thesisId: string): Promise<Thesis> {
		await this.db
			.update(thesisState)
			.set({
				addCount: sql`${thesisState.addCount} + 1`,
				lastUpdated: new Date(),
			})
			.where(eq(thesisState.thesisId, thesisId));

		return this.findByIdOrThrow(thesisId);
	}

	async markMaxPositionReached(thesisId: string): Promise<Thesis> {
		await this.db
			.update(thesisState)
			.set({
				maxPositionReached: 1,
				lastUpdated: new Date(),
			})
			.where(eq(thesisState.thesisId, thesisId));

		return this.findByIdOrThrow(thesisId);
	}

	async updatePeakPnl(thesisId: string, peakPnl: number): Promise<Thesis> {
		await this.db
			.update(thesisState)
			.set({
				peakUnrealizedPnl: sql`GREATEST(COALESCE(${thesisState.peakUnrealizedPnl}, ${peakPnl}), ${peakPnl})`,
				lastUpdated: new Date(),
			})
			.where(eq(thesisState.thesisId, thesisId));

		return this.findByIdOrThrow(thesisId);
	}

	async addNotes(thesisId: string, key: string, value: unknown): Promise<Thesis> {
		const thesis = await this.findByIdOrThrow(thesisId);
		const notes = { ...thesis.notes, [key]: value };

		await this.db
			.update(thesisState)
			.set({
				notes: JSON.stringify(notes),
				lastUpdated: new Date(),
			})
			.where(eq(thesisState.thesisId, thesisId));

		return this.findByIdOrThrow(thesisId);
	}

	async getContext(thesisId: string, currentPrice?: number): Promise<ThesisContext> {
		const thesis = await this.findByIdOrThrow(thesisId);

		const daysHeld = thesis.entryDate
			? Math.floor((Date.now() - new Date(thesis.entryDate).getTime()) / (1000 * 60 * 60 * 24))
			: 0;

		const currentPnL =
			currentPrice !== undefined && thesis.entryPrice !== null
				? currentPrice - thesis.entryPrice
				: null;

		return {
			instrumentId: thesis.instrumentId,
			currentState: thesis.state,
			entryPrice: thesis.entryPrice,
			entryDate: thesis.entryDate,
			currentPnL,
			stopLoss: thesis.currentStop,
			takeProfit: thesis.currentTarget,
			addCount: thesis.addCount,
			maxPositionReached: thesis.maxPositionReached,
			daysHeld,
		};
	}

	async getHistory(thesisId: string): Promise<ThesisStateHistoryEntry[]> {
		const rows = await this.db
			.select()
			.from(thesisStateHistory)
			.where(eq(thesisStateHistory.thesisId, thesisId))
			.orderBy(asc(thesisStateHistory.createdAt));

		return rows.map(mapHistoryRow);
	}

	async delete(thesisId: string): Promise<boolean> {
		const result = await this.db
			.delete(thesisState)
			.where(eq(thesisState.thesisId, thesisId))
			.returning({ id: thesisState.thesisId });

		return result.length > 0;
	}

	async getStats(environment: string): Promise<{
		total: number;
		byState: Record<ThesisState, number>;
		avgHoldingDays: number;
		winRate: number;
	}> {
		const envFilter = environment as typeof thesisState.$inferSelect.environment;

		const stateCountsResult = await this.db
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

		const performanceResult = await this.db
			.select({
				avgHoldingDays: sql<number>`AVG(EXTRACT(EPOCH FROM (${thesisState.closedAt} - ${thesisState.entryDate})) / 86400)`,
				winRate: sql<number>`AVG(CASE WHEN ${thesisState.realizedPnl}::numeric > 0 THEN 1.0 ELSE 0.0 END)`,
			})
			.from(thesisState)
			.where(
				and(
					eq(thesisState.environment, envFilter),
					eq(thesisState.state, "CLOSED"),
					sql`${thesisState.entryDate} IS NOT NULL`
				)
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

	async search(
		query: string,
		limit = 5
	): Promise<Pick<Thesis, "thesisId" | "instrumentId" | "entryThesis">[]> {
		const rows = await this.db
			.select({
				thesisId: thesisState.thesisId,
				instrumentId: thesisState.instrumentId,
				entryThesis: thesisState.entryThesis,
			})
			.from(thesisState)
			.where(
				or(
					ilike(thesisState.instrumentId, `%${query}%`),
					ilike(thesisState.entryThesis, `%${query}%`)
				)
			)
			.orderBy(desc(thesisState.createdAt))
			.limit(limit);

		return rows.map((r) => ({
			thesisId: r.thesisId,
			instrumentId: r.instrumentId,
			entryThesis: r.entryThesis,
		}));
	}
}
