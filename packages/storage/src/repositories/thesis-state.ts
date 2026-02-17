import { and, asc, count, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { type Database, getDb } from "../db";
import { thesisState, thesisStateHistory } from "../schema/thesis";
import {
	type CooldownStatus,
	type CooldownSymbol,
	findSymbolsOnCooldown as findSymbolsOnCooldownQuery,
	getCooldownStatus,
	getThesisStats,
	searchTheses,
	type ThesisStats,
} from "./thesis-state.queries";
import type {
	CloseReason,
	CreateThesisInput,
	PaginatedResult,
	PaginationOptions,
	StateTransitionInput,
	Thesis,
	ThesisContext,
	ThesisFilters,
	ThesisState,
	ThesisStateHistoryEntry,
} from "./thesis-state.types";
import { isValidTransition, mapHistoryRow, mapThesisRow } from "./thesis-state.types";

export {
	type CloseReason,
	type CreateThesisInput,
	isValidTransition,
	type PaginatedResult,
	type PaginationOptions,
	type StateTransitionInput,
	type Thesis,
	type ThesisContext,
	type ThesisFilters,
	type ThesisState,
	type ThesisStateHistoryEntry,
} from "./thesis-state.types";

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
					ne(thesisState.state, "CLOSED"),
				),
			)
			.orderBy(desc(thesisState.createdAt))
			.limit(1);

		return row ? mapThesisRow(row) : null;
	}

	async findMany(
		filters: ThesisFilters = {},
		pagination?: PaginationOptions,
	): Promise<PaginatedResult<Thesis>> {
		const conditions = [];

		if (filters.instrumentId) {
			conditions.push(eq(thesisState.instrumentId, filters.instrumentId));
		}
		if (filters.state) {
			conditions.push(
				eq(thesisState.state, filters.state as typeof thesisState.$inferSelect.state),
			);
		}
		if (filters.states && filters.states.length > 0) {
			conditions.push(
				inArray(thesisState.state, filters.states as (typeof thesisState.$inferSelect.state)[]),
			);
		}
		if (filters.environment) {
			conditions.push(
				eq(
					thesisState.environment,
					filters.environment as typeof thesisState.$inferSelect.environment,
				),
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
					ne(thesisState.state, "CLOSED"),
				),
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
					inArray(thesisState.state, states as (typeof thesisState.$inferSelect.state)[]),
				),
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
		cycleId?: string,
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

	static readonly DEFAULT_COOLDOWN_HOURS = 4;
	async close(
		thesisId: string,
		reason: CloseReason,
		exitPrice?: number,
		realizedPnl?: number,
		cycleId?: string,
		cooldownHours?: number,
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

		const cooldownMs =
			(cooldownHours ?? ThesisStateRepository.DEFAULT_COOLDOWN_HOURS) * 60 * 60 * 1000;
		const cooldownUntil = new Date(now.getTime() + cooldownMs);

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
				cooldownUntil,
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

	async isOnCooldown(instrumentId: string, environment: string): Promise<CooldownStatus> {
		return getCooldownStatus(this.db, instrumentId, environment);
	}

	async findSymbolsOnCooldown(environment: string): Promise<CooldownSymbol[]> {
		return findSymbolsOnCooldownQuery(this.db, environment);
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

	async updateCloseReason(thesisId: string, closeReason: CloseReason): Promise<Thesis> {
		await this.db
			.update(thesisState)
			.set({
				closeReason,
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

	async getStats(environment: string): Promise<ThesisStats> {
		return getThesisStats(this.db, environment);
	}

	async search(
		query: string,
		limit = 5,
	): Promise<Pick<Thesis, "thesisId" | "instrumentId" | "entryThesis">[]> {
		return searchTheses(this.db, query, limit);
	}
}
