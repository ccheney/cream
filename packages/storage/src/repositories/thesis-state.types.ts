import type { thesisState, thesisStateHistory } from "../schema/thesis";

export type ThesisState = "WATCHING" | "ENTERED" | "ADDING" | "MANAGING" | "EXITING" | "CLOSED";

export type CloseReason =
	| "STOP_HIT"
	| "TARGET_HIT"
	| "INVALIDATED"
	| "MANUAL"
	| "TIME_DECAY"
	| "CORRELATION"
	| "REBALANCE";

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
	cooldownUntil: string | null;
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

export function mapThesisRow(row: ThesisRow): Thesis {
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
		cooldownUntil: row.cooldownUntil?.toISOString() ?? null,
	};
}

export function mapHistoryRow(row: HistoryRow): ThesisStateHistoryEntry {
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
