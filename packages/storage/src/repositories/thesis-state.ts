/**
 * Thesis State Repository
 *
 * Manages thesis lifecycle tracking across OODA cycles.
 * Theses track position state from WATCHING through CLOSED.
 *
 * @see docs/plans/05-agents.md - Thesis State Management section
 */

import type { Row, TursoClient } from "../turso.js";
import {
  type PaginatedResult,
  type PaginationOptions,
  paginate,
  parseJson,
  query,
  RepositoryError,
  toBoolean,
  toJson,
} from "./base.js";

// ============================================
// Types
// ============================================

/**
 * Thesis state enum
 */
export type ThesisState = "WATCHING" | "ENTERED" | "ADDING" | "MANAGING" | "EXITING" | "CLOSED";

/**
 * Close reason enum
 */
export type CloseReason =
  | "STOP_HIT"
  | "TARGET_HIT"
  | "INVALIDATED"
  | "MANUAL"
  | "TIME_DECAY"
  | "CORRELATION";

/**
 * Thesis entity
 */
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

/**
 * Thesis context for agents (subset of Thesis with computed fields)
 */
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

/**
 * Create thesis input
 */
export interface CreateThesisInput {
  thesisId: string;
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

/**
 * State transition input
 */
export interface StateTransitionInput {
  toState: ThesisState;
  triggerReason?: string;
  cycleId?: string;
  priceAtTransition?: number;
  notes?: string;
}

/**
 * Thesis filter options
 */
export interface ThesisFilters {
  instrumentId?: string;
  state?: ThesisState;
  states?: ThesisState[];
  environment?: string;
  closedAfter?: string;
  createdAfter?: string;
}

/**
 * State transition history entry
 */
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

// ============================================
// State Transition Validation
// ============================================

/**
 * Valid state transitions
 */
const VALID_TRANSITIONS: Record<ThesisState, ThesisState[]> = {
  WATCHING: ["ENTERED", "CLOSED"], // Can enter or remove from watchlist
  ENTERED: ["ADDING", "MANAGING", "EXITING", "CLOSED"], // Can add, manage, exit, or stop out
  ADDING: ["MANAGING", "EXITING", "CLOSED"], // Position complete, change view, or stop out
  MANAGING: ["ADDING", "EXITING", "CLOSED"], // Increase, take profits, or exit
  EXITING: ["MANAGING", "CLOSED"], // Re-enter remaining or fully exit
  CLOSED: ["WATCHING"], // New opportunity same instrument
};

/**
 * Check if state transition is valid
 */
export function isValidTransition(from: ThesisState, to: ThesisState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ============================================
// Row Mapper
// ============================================

function mapThesisRow(row: Row): Thesis {
  return {
    thesisId: row.thesis_id as string,
    instrumentId: row.instrument_id as string,
    state: row.state as ThesisState,
    entryPrice: row.entry_price as number | null,
    entryDate: row.entry_date as string | null,
    currentStop: row.current_stop as number | null,
    currentTarget: row.current_target as number | null,
    conviction: row.conviction as number | null,
    entryThesis: row.entry_thesis as string | null,
    invalidationConditions: row.invalidation_conditions as string | null,
    addCount: row.add_count as number,
    maxPositionReached: toBoolean(row.max_position_reached),
    peakUnrealizedPnl: row.peak_unrealized_pnl as number | null,
    closeReason: row.close_reason as CloseReason | null,
    exitPrice: row.exit_price as number | null,
    realizedPnl: row.realized_pnl as number | null,
    realizedPnlPct: row.realized_pnl_pct as number | null,
    environment: row.environment as string,
    notes: parseJson<Record<string, unknown>>(row.notes, {}),
    lastUpdated: row.last_updated as string,
    createdAt: row.created_at as string,
    closedAt: row.closed_at as string | null,
  };
}

function mapHistoryRow(row: Row): ThesisStateHistoryEntry {
  return {
    id: row.id as number,
    thesisId: row.thesis_id as string,
    fromState: row.from_state as ThesisState,
    toState: row.to_state as ThesisState,
    triggerReason: row.trigger_reason as string | null,
    cycleId: row.cycle_id as string | null,
    priceAtTransition: row.price_at_transition as number | null,
    convictionAtTransition: row.conviction_at_transition as number | null,
    notes: row.notes as string | null,
    createdAt: row.created_at as string,
  };
}

// ============================================
// Repository
// ============================================

/**
 * Thesis State Repository
 */
export class ThesisStateRepository {
  private readonly table = "thesis_state";
  private readonly historyTable = "thesis_state_history";

  constructor(private readonly client: TursoClient) {}

  /**
   * Create a new thesis (typically in WATCHING state)
   */
  async create(input: CreateThesisInput): Promise<Thesis> {
    const now = new Date().toISOString();

    try {
      await this.client.run(
        `INSERT INTO ${this.table} (
          thesis_id, instrument_id, state, entry_thesis, invalidation_conditions,
          conviction, current_stop, current_target, environment, notes,
          last_updated, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.thesisId,
          input.instrumentId,
          input.state ?? "WATCHING",
          input.entryThesis ?? null,
          input.invalidationConditions ?? null,
          input.conviction ?? null,
          input.currentStop ?? null,
          input.currentTarget ?? null,
          input.environment,
          toJson(input.notes ?? {}),
          now,
          now,
        ]
      );
    } catch (error) {
      throw RepositoryError.fromSqliteError(this.table, error as Error);
    }

    return this.findById(input.thesisId) as Promise<Thesis>;
  }

  /**
   * Find thesis by ID
   */
  async findById(thesisId: string): Promise<Thesis | null> {
    const row = await this.client.get<Row>(`SELECT * FROM ${this.table} WHERE thesis_id = ?`, [
      thesisId,
    ]);

    return row ? mapThesisRow(row) : null;
  }

  /**
   * Find thesis by ID, throw if not found
   */
  async findByIdOrThrow(thesisId: string): Promise<Thesis> {
    const thesis = await this.findById(thesisId);
    if (!thesis) {
      throw RepositoryError.notFound(this.table, thesisId);
    }
    return thesis;
  }

  /**
   * Find active thesis for instrument (not CLOSED)
   */
  async findActiveForInstrument(instrumentId: string, environment: string): Promise<Thesis | null> {
    const row = await this.client.get<Row>(
      `SELECT * FROM ${this.table}
       WHERE instrument_id = ? AND environment = ? AND state != 'CLOSED'
       ORDER BY created_at DESC
       LIMIT 1`,
      [instrumentId, environment]
    );

    return row ? mapThesisRow(row) : null;
  }

  /**
   * Find theses with filters
   */
  async findMany(
    filters: ThesisFilters = {},
    pagination?: PaginationOptions
  ): Promise<PaginatedResult<Thesis>> {
    const builder = query().orderBy("created_at", "DESC");

    if (filters.instrumentId) {
      builder.eq("instrument_id", filters.instrumentId);
    }
    if (filters.state) {
      builder.eq("state", filters.state);
    }
    if (filters.states && filters.states.length > 0) {
      builder.where("state", "IN", filters.states);
    }
    if (filters.environment) {
      builder.eq("environment", filters.environment);
    }
    if (filters.closedAfter) {
      builder.where("closed_at", ">=", filters.closedAfter);
    }
    if (filters.createdAfter) {
      builder.where("created_at", ">=", filters.createdAfter);
    }

    const { sql, args } = builder.build(`SELECT * FROM ${this.table}`);
    // biome-ignore lint/style/noNonNullAssertion: split always returns array
    const countSql = sql.replace("SELECT *", "SELECT COUNT(*) as count").split(" LIMIT ")[0]!;

    const result = await paginate<Row>(
      this.client,
      // biome-ignore lint/style/noNonNullAssertion: split always returns array
      sql.split(" LIMIT ")[0]!,
      countSql,
      args.slice(0, -2),
      pagination
    );

    return {
      ...result,
      data: result.data.map(mapThesisRow),
    };
  }

  /**
   * Find all active theses (not CLOSED) for environment
   */
  async findActive(environment: string): Promise<Thesis[]> {
    const rows = await this.client.execute<Row>(
      `SELECT * FROM ${this.table}
       WHERE environment = ? AND state != 'CLOSED'
       ORDER BY created_at DESC`,
      [environment]
    );

    return rows.map(mapThesisRow);
  }

  /**
   * Find theses in specific states
   */
  async findByStates(states: ThesisState[], environment: string): Promise<Thesis[]> {
    const placeholders = states.map(() => "?").join(", ");
    const rows = await this.client.execute<Row>(
      `SELECT * FROM ${this.table}
       WHERE environment = ? AND state IN (${placeholders})
       ORDER BY created_at DESC`,
      [environment, ...states]
    );

    return rows.map(mapThesisRow);
  }

  /**
   * Transition thesis to new state
   */
  async transitionState(thesisId: string, transition: StateTransitionInput): Promise<Thesis> {
    const thesis = await this.findByIdOrThrow(thesisId);
    const fromState = thesis.state;
    const { toState } = transition;

    // Validate transition
    if (!isValidTransition(fromState, toState)) {
      throw RepositoryError.constraintViolation(
        this.table,
        `Invalid state transition: ${fromState} -> ${toState}`
      );
    }

    const now = new Date().toISOString();

    // Update state
    await this.client.run(
      `UPDATE ${this.table} SET
        state = ?,
        last_updated = ?,
        closed_at = CASE WHEN ? = 'CLOSED' THEN ? ELSE closed_at END
       WHERE thesis_id = ?`,
      [toState, now, toState, now, thesisId]
    );

    // Record transition in history
    await this.client.run(
      `INSERT INTO ${this.historyTable} (
        thesis_id, from_state, to_state, trigger_reason, cycle_id,
        price_at_transition, conviction_at_transition, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        thesisId,
        fromState,
        toState,
        transition.triggerReason ?? null,
        transition.cycleId ?? null,
        transition.priceAtTransition ?? null,
        thesis.conviction,
        transition.notes ?? null,
        now,
      ]
    );

    return this.findByIdOrThrow(thesisId);
  }

  /**
   * Enter a position (transition from WATCHING to ENTERED)
   */
  async enterPosition(
    thesisId: string,
    entryPrice: number,
    stopLoss: number,
    target?: number,
    cycleId?: string
  ): Promise<Thesis> {
    const thesis = await this.findByIdOrThrow(thesisId);

    if (thesis.state !== "WATCHING") {
      throw RepositoryError.constraintViolation(
        this.table,
        `Cannot enter position from state: ${thesis.state}`
      );
    }

    const now = new Date().toISOString();

    await this.client.run(
      `UPDATE ${this.table} SET
        state = 'ENTERED',
        entry_price = ?,
        entry_date = ?,
        current_stop = ?,
        current_target = ?,
        last_updated = ?
       WHERE thesis_id = ?`,
      [entryPrice, now, stopLoss, target ?? null, now, thesisId]
    );

    // Record transition
    await this.client.run(
      `INSERT INTO ${this.historyTable} (
        thesis_id, from_state, to_state, trigger_reason, cycle_id,
        price_at_transition, conviction_at_transition, created_at
      ) VALUES (?, 'WATCHING', 'ENTERED', 'Entry conditions met', ?, ?, ?, ?)`,
      [thesisId, cycleId ?? null, entryPrice, thesis.conviction, now]
    );

    return this.findByIdOrThrow(thesisId);
  }

  /**
   * Close a thesis
   */
  async close(
    thesisId: string,
    reason: CloseReason,
    exitPrice?: number,
    realizedPnl?: number,
    cycleId?: string
  ): Promise<Thesis> {
    const thesis = await this.findByIdOrThrow(thesisId);

    if (thesis.state === "CLOSED") {
      throw RepositoryError.constraintViolation(this.table, "Thesis is already closed");
    }

    const now = new Date().toISOString();
    const pnlPct =
      realizedPnl !== undefined && thesis.entryPrice
        ? (realizedPnl / thesis.entryPrice) * 100
        : null;

    await this.client.run(
      `UPDATE ${this.table} SET
        state = 'CLOSED',
        close_reason = ?,
        exit_price = ?,
        realized_pnl = ?,
        realized_pnl_pct = ?,
        last_updated = ?,
        closed_at = ?
       WHERE thesis_id = ?`,
      [reason, exitPrice ?? null, realizedPnl ?? null, pnlPct, now, now, thesisId]
    );

    // Record transition
    await this.client.run(
      `INSERT INTO ${this.historyTable} (
        thesis_id, from_state, to_state, trigger_reason, cycle_id,
        price_at_transition, conviction_at_transition, created_at
      ) VALUES (?, ?, 'CLOSED', ?, ?, ?, ?, ?)`,
      [thesisId, thesis.state, reason, cycleId ?? null, exitPrice ?? null, thesis.conviction, now]
    );

    return this.findByIdOrThrow(thesisId);
  }

  /**
   * Update thesis conviction
   */
  async updateConviction(thesisId: string, conviction: number): Promise<Thesis> {
    if (conviction < 0 || conviction > 1) {
      throw RepositoryError.constraintViolation(this.table, "Conviction must be between 0 and 1");
    }

    const now = new Date().toISOString();

    await this.client.run(
      `UPDATE ${this.table} SET conviction = ?, last_updated = ? WHERE thesis_id = ?`,
      [conviction, now, thesisId]
    );

    return this.findByIdOrThrow(thesisId);
  }

  /**
   * Update stop loss and target
   */
  async updateLevels(thesisId: string, stopLoss?: number, target?: number): Promise<Thesis> {
    const now = new Date().toISOString();
    const updates: string[] = ["last_updated = ?"];
    const args: unknown[] = [now];

    if (stopLoss !== undefined) {
      updates.push("current_stop = ?");
      args.push(stopLoss);
    }
    if (target !== undefined) {
      updates.push("current_target = ?");
      args.push(target);
    }

    args.push(thesisId);

    await this.client.run(
      `UPDATE ${this.table} SET ${updates.join(", ")} WHERE thesis_id = ?`,
      args
    );

    return this.findByIdOrThrow(thesisId);
  }

  /**
   * Increment add count (when adding to position)
   */
  async incrementAddCount(thesisId: string): Promise<Thesis> {
    const now = new Date().toISOString();

    await this.client.run(
      `UPDATE ${this.table} SET add_count = add_count + 1, last_updated = ? WHERE thesis_id = ?`,
      [now, thesisId]
    );

    return this.findByIdOrThrow(thesisId);
  }

  /**
   * Mark max position reached
   */
  async markMaxPositionReached(thesisId: string): Promise<Thesis> {
    const now = new Date().toISOString();

    await this.client.run(
      `UPDATE ${this.table} SET max_position_reached = 1, last_updated = ? WHERE thesis_id = ?`,
      [now, thesisId]
    );

    return this.findByIdOrThrow(thesisId);
  }

  /**
   * Update peak unrealized P&L
   */
  async updatePeakPnl(thesisId: string, peakPnl: number): Promise<Thesis> {
    const now = new Date().toISOString();

    await this.client.run(
      `UPDATE ${this.table} SET
        peak_unrealized_pnl = MAX(COALESCE(peak_unrealized_pnl, ?), ?),
        last_updated = ?
       WHERE thesis_id = ?`,
      [peakPnl, peakPnl, now, thesisId]
    );

    return this.findByIdOrThrow(thesisId);
  }

  /**
   * Add notes to thesis (appends to existing notes)
   */
  async addNotes(thesisId: string, key: string, value: unknown): Promise<Thesis> {
    const thesis = await this.findByIdOrThrow(thesisId);
    const now = new Date().toISOString();
    const notes = { ...thesis.notes, [key]: value };

    await this.client.run(
      `UPDATE ${this.table} SET notes = ?, last_updated = ? WHERE thesis_id = ?`,
      [toJson(notes), now, thesisId]
    );

    return this.findByIdOrThrow(thesisId);
  }

  /**
   * Get thesis context for agents
   */
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

  /**
   * Get state transition history for a thesis
   */
  async getHistory(thesisId: string): Promise<ThesisStateHistoryEntry[]> {
    const rows = await this.client.execute<Row>(
      `SELECT * FROM ${this.historyTable}
       WHERE thesis_id = ?
       ORDER BY created_at ASC`,
      [thesisId]
    );

    return rows.map(mapHistoryRow);
  }

  /**
   * Delete thesis
   */
  async delete(thesisId: string): Promise<boolean> {
    const result = await this.client.run(`DELETE FROM ${this.table} WHERE thesis_id = ?`, [
      thesisId,
    ]);

    return result.changes > 0;
  }

  /**
   * Get thesis statistics
   */
  async getStats(environment: string): Promise<{
    total: number;
    byState: Record<ThesisState, number>;
    avgHoldingDays: number;
    winRate: number;
  }> {
    const stateCountsRow = await this.client.get<Row>(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN state = 'WATCHING' THEN 1 ELSE 0 END) as watching,
        SUM(CASE WHEN state = 'ENTERED' THEN 1 ELSE 0 END) as entered,
        SUM(CASE WHEN state = 'ADDING' THEN 1 ELSE 0 END) as adding,
        SUM(CASE WHEN state = 'MANAGING' THEN 1 ELSE 0 END) as managing,
        SUM(CASE WHEN state = 'EXITING' THEN 1 ELSE 0 END) as exiting,
        SUM(CASE WHEN state = 'CLOSED' THEN 1 ELSE 0 END) as closed
       FROM ${this.table}
       WHERE environment = ?`,
      [environment]
    );

    const performanceRow = await this.client.get<Row>(
      `SELECT
        AVG(JULIANDAY(closed_at) - JULIANDAY(entry_date)) as avg_holding_days,
        AVG(CASE WHEN realized_pnl > 0 THEN 1.0 ELSE 0.0 END) as win_rate
       FROM ${this.table}
       WHERE environment = ? AND state = 'CLOSED' AND entry_date IS NOT NULL`,
      [environment]
    );

    return {
      total: (stateCountsRow?.total as number) ?? 0,
      byState: {
        WATCHING: (stateCountsRow?.watching as number) ?? 0,
        ENTERED: (stateCountsRow?.entered as number) ?? 0,
        ADDING: (stateCountsRow?.adding as number) ?? 0,
        MANAGING: (stateCountsRow?.managing as number) ?? 0,
        EXITING: (stateCountsRow?.exiting as number) ?? 0,
        CLOSED: (stateCountsRow?.closed as number) ?? 0,
      },
      avgHoldingDays: (performanceRow?.avg_holding_days as number) ?? 0,
      winRate: (performanceRow?.win_rate as number) ?? 0,
    };
  }
}
