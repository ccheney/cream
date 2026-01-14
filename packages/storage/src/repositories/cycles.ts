/**
 * Cycles Repository
 *
 * Data access for OODA trading cycles and cycle events.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md
 */

import type { Row, TursoClient } from "../turso.js";
import { parseJson, RepositoryError, toJson } from "./base.js";

// ============================================
// Types
// ============================================

/**
 * Cycle status
 */
export type CycleStatus = "running" | "completed" | "failed";

/**
 * Cycle phase
 */
export type CyclePhase = "observe" | "orient" | "decide" | "act" | "complete";

/**
 * Decision summary
 */
export interface DecisionSummary {
  symbol: string;
  action: "BUY" | "SELL" | "HOLD";
  direction: "LONG" | "SHORT" | "FLAT";
  confidence: number;
}

/**
 * Order summary
 */
export interface OrderSummary {
  orderId: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  status: "submitted" | "filled" | "rejected";
}

/**
 * Cycle entity
 */
export interface Cycle {
  id: string;
  environment: string;
  status: CycleStatus;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  currentPhase: CyclePhase | null;
  phaseStartedAt: string | null;
  totalSymbols: number;
  completedSymbols: number;
  progressPct: number;
  approved: boolean | null;
  iterations: number | null;
  decisionsCount: number;
  ordersCount: number;
  decisions: DecisionSummary[];
  orders: OrderSummary[];
  errorMessage: string | null;
  errorStack: string | null;
  configVersion: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Create cycle input
 */
export interface CreateCycleInput {
  id: string;
  environment: string;
  totalSymbols?: number;
  configVersion?: string;
}

/**
 * Update cycle input
 */
export interface UpdateCycleInput {
  status?: CycleStatus;
  completedAt?: string;
  durationMs?: number;
  currentPhase?: CyclePhase;
  phaseStartedAt?: string;
  completedSymbols?: number;
  progressPct?: number;
  approved?: boolean;
  iterations?: number;
  decisionsCount?: number;
  ordersCount?: number;
  decisions?: DecisionSummary[];
  orders?: OrderSummary[];
  errorMessage?: string;
  errorStack?: string;
}

/**
 * Cycle event types
 */
export type CycleEventType =
  | "phase_change"
  | "agent_start"
  | "agent_complete"
  | "decision"
  | "order"
  | "error"
  | "progress"
  // Streaming events for UI replay
  | "tool_call"
  | "tool_result"
  | "reasoning_delta"
  | "text_delta";

/**
 * Cycle event entity
 */
export interface CycleEvent {
  id: number;
  cycleId: string;
  eventType: CycleEventType;
  phase: CyclePhase | null;
  agentType: string | null;
  symbol: string | null;
  message: string | null;
  data: Record<string, unknown>;
  timestamp: string;
  durationMs: number | null;
}

/**
 * Create cycle event input
 */
export interface CreateCycleEventInput {
  cycleId: string;
  eventType: CycleEventType;
  phase?: CyclePhase;
  agentType?: string;
  symbol?: string;
  message?: string;
  data?: Record<string, unknown>;
  durationMs?: number;
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  page?: number;
  pageSize?: number;
}

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ============================================
// Row Mappers
// ============================================

function mapCycleRow(row: Row): Cycle {
  return {
    id: row.id as string,
    environment: row.environment as string,
    status: row.status as CycleStatus,
    startedAt: row.started_at as string,
    completedAt: row.completed_at as string | null,
    durationMs: row.duration_ms as number | null,
    currentPhase: row.current_phase as CyclePhase | null,
    phaseStartedAt: row.phase_started_at as string | null,
    totalSymbols: (row.total_symbols as number) ?? 0,
    completedSymbols: (row.completed_symbols as number) ?? 0,
    progressPct: (row.progress_pct as number) ?? 0,
    approved: row.approved === null ? null : Boolean(row.approved),
    iterations: row.iterations as number | null,
    decisionsCount: (row.decisions_count as number) ?? 0,
    ordersCount: (row.orders_count as number) ?? 0,
    decisions: parseJson<DecisionSummary[]>(row.decisions_json, []),
    orders: parseJson<OrderSummary[]>(row.orders_json, []),
    errorMessage: row.error_message as string | null,
    errorStack: row.error_stack as string | null,
    configVersion: row.config_version as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapCycleEventRow(row: Row): CycleEvent {
  return {
    id: row.id as number,
    cycleId: row.cycle_id as string,
    eventType: row.event_type as CycleEventType,
    phase: row.phase as CyclePhase | null,
    agentType: row.agent_type as string | null,
    symbol: row.symbol as string | null,
    message: row.message as string | null,
    data: parseJson<Record<string, unknown>>(row.data_json, {}),
    timestamp: row.timestamp as string,
    durationMs: row.duration_ms as number | null,
  };
}

// ============================================
// Streaming Event Types
// ============================================

/** Event types used for streaming state reconstruction */
export const STREAMING_EVENT_TYPES: CycleEventType[] = [
  "tool_call",
  "tool_result",
  "reasoning_delta",
  "text_delta",
  "agent_start",
  "agent_complete",
];

// ============================================
// Streaming State Types
// ============================================

/** Reconstructed tool call from events */
export interface ReconstructedToolCall {
  toolCallId: string;
  toolName: string;
  toolArgs: string;
  status: "pending" | "complete" | "error";
  resultSummary?: string;
  durationMs?: number;
  timestamp: string;
}

/** Reconstructed agent streaming state */
export interface ReconstructedAgentState {
  status: "idle" | "processing" | "complete" | "error";
  toolCalls: ReconstructedToolCall[];
  reasoningText: string;
  textOutput: string;
  error?: string;
  lastUpdate: string | null;
}

/** Full streaming state for a cycle */
export interface ReconstructedStreamingState {
  agents: Record<string, ReconstructedAgentState>;
  cycleId: string;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Reconstruct streaming state from cycle events
 */
export function reconstructStreamingState(events: CycleEvent[]): ReconstructedStreamingState {
  const agents: Record<string, ReconstructedAgentState> = {};

  const getOrCreateAgent = (agentType: string): ReconstructedAgentState => {
    if (!agents[agentType]) {
      agents[agentType] = {
        status: "idle",
        toolCalls: [],
        reasoningText: "",
        textOutput: "",
        lastUpdate: null,
      };
    }
    return agents[agentType] as ReconstructedAgentState;
  };

  // Track tool calls by ID for upsert
  const toolCallMap = new Map<string, ReconstructedToolCall>();

  for (const event of events) {
    if (!event.agentType) {
      continue;
    }

    const agent = getOrCreateAgent(event.agentType);
    agent.lastUpdate = event.timestamp;

    switch (event.eventType) {
      case "agent_start":
        agent.status = "processing";
        break;

      case "agent_complete":
        agent.status = "complete";
        break;

      case "tool_call": {
        agent.status = "processing";
        const data = event.data as {
          toolCallId?: string;
          toolName?: string;
          toolArgs?: string;
        };
        if (data.toolCallId) {
          const toolCall: ReconstructedToolCall = {
            toolCallId: data.toolCallId,
            toolName: data.toolName ?? "unknown",
            toolArgs: data.toolArgs ?? "{}",
            status: "pending",
            timestamp: event.timestamp,
          };
          toolCallMap.set(data.toolCallId, toolCall);
        }
        break;
      }

      case "tool_result": {
        const data = event.data as {
          toolCallId?: string;
          success?: boolean;
          resultSummary?: string;
          durationMs?: number;
        };
        const existing = data.toolCallId ? toolCallMap.get(data.toolCallId) : undefined;
        if (existing) {
          existing.status = data.success ? "complete" : "error";
          existing.resultSummary = data.resultSummary;
          existing.durationMs = data.durationMs;
        }
        break;
      }

      case "reasoning_delta": {
        agent.status = "processing";
        const data = event.data as { text?: string };
        if (data.text) {
          agent.reasoningText += data.text;
        }
        break;
      }

      case "text_delta": {
        agent.status = "processing";
        const data = event.data as { text?: string };
        if (data.text) {
          agent.textOutput += data.text;
        }
        break;
      }

      case "error": {
        agent.status = "error";
        agent.error = event.message ?? "Unknown error";
        break;
      }
    }
  }

  // Convert tool call map to arrays in each agent
  for (const agent of Object.values(agents)) {
    const agentToolCalls = Array.from(toolCallMap.values()).filter((tc) => {
      // Find events for this tool call to determine which agent it belongs to
      const toolEvent = events.find(
        (e) =>
          e.eventType === "tool_call" &&
          (e.data as { toolCallId?: string }).toolCallId === tc.toolCallId
      );
      return toolEvent?.agentType && agents[toolEvent.agentType] === agent;
    });
    agent.toolCalls = agentToolCalls.toSorted(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  const cycleId = events[0]?.cycleId ?? "";
  return { agents, cycleId };
}

// ============================================
// Repository
// ============================================

export interface CyclesRepository {
  // Cycle CRUD
  create(input: CreateCycleInput): Promise<Cycle>;
  findById(id: string): Promise<Cycle | null>;
  update(id: string, input: UpdateCycleInput): Promise<Cycle>;
  findMany(options?: {
    environment?: string;
    status?: CycleStatus;
    pagination?: PaginationOptions;
  }): Promise<PaginatedResult<Cycle>>;
  findRecent(environment: string, limit?: number): Promise<Cycle[]>;

  // Cleanup
  markOrphanedAsFailed(): Promise<number>;

  // Cycle events
  addEvent(input: CreateCycleEventInput): Promise<CycleEvent>;
  addEventsBatch(events: CreateCycleEventInput[]): Promise<void>;
  findEvents(cycleId: string, options?: { eventType?: CycleEventType }): Promise<CycleEvent[]>;
  findStreamingEvents(cycleId: string): Promise<CycleEvent[]>;

  // Convenience methods
  start(
    id: string,
    environment: string,
    totalSymbols?: number,
    configVersion?: string
  ): Promise<Cycle>;
  updateProgress(
    id: string,
    phase: CyclePhase,
    completedSymbols: number,
    progressPct: number,
    message?: string
  ): Promise<void>;
  complete(
    id: string,
    result: {
      approved: boolean;
      iterations: number;
      decisions: DecisionSummary[];
      orders: OrderSummary[];
      durationMs: number;
    }
  ): Promise<Cycle>;
  fail(id: string, error: string, stack?: string, durationMs?: number): Promise<Cycle>;
}

/**
 * Create cycles repository
 */
export function createCyclesRepository(client: TursoClient): CyclesRepository {
  return {
    async create(input: CreateCycleInput): Promise<Cycle> {
      const now = new Date().toISOString();
      try {
        await client.execute(
          `INSERT INTO cycles (id, environment, status, started_at, total_symbols, config_version, created_at, updated_at)
           VALUES (?, ?, 'running', ?, ?, ?, ?, ?)`,
          [
            input.id,
            input.environment,
            now,
            input.totalSymbols ?? 0,
            input.configVersion ?? null,
            now,
            now,
          ]
        );
      } catch (error) {
        throw RepositoryError.fromSqliteError("cycles", error as Error);
      }

      const cycle = await this.findById(input.id);
      if (!cycle) {
        throw new RepositoryError("Failed to create cycle", "QUERY_ERROR", "cycles");
      }
      return cycle;
    },

    async findById(id: string): Promise<Cycle | null> {
      const rows = await client.execute<Row>("SELECT * FROM cycles WHERE id = ?", [id]);
      const row = rows[0];
      return row ? mapCycleRow(row) : null;
    },

    async update(id: string, input: UpdateCycleInput): Promise<Cycle> {
      const updates: string[] = [];
      const values: unknown[] = [];

      if (input.status !== undefined) {
        updates.push("status = ?");
        values.push(input.status);
      }
      if (input.completedAt !== undefined) {
        updates.push("completed_at = ?");
        values.push(input.completedAt);
      }
      if (input.durationMs !== undefined) {
        updates.push("duration_ms = ?");
        values.push(input.durationMs);
      }
      if (input.currentPhase !== undefined) {
        updates.push("current_phase = ?");
        values.push(input.currentPhase);
      }
      if (input.phaseStartedAt !== undefined) {
        updates.push("phase_started_at = ?");
        values.push(input.phaseStartedAt);
      }
      if (input.completedSymbols !== undefined) {
        updates.push("completed_symbols = ?");
        values.push(input.completedSymbols);
      }
      if (input.progressPct !== undefined) {
        updates.push("progress_pct = ?");
        values.push(input.progressPct);
      }
      if (input.approved !== undefined) {
        updates.push("approved = ?");
        values.push(input.approved ? 1 : 0);
      }
      if (input.iterations !== undefined) {
        updates.push("iterations = ?");
        values.push(input.iterations);
      }
      if (input.decisionsCount !== undefined) {
        updates.push("decisions_count = ?");
        values.push(input.decisionsCount);
      }
      if (input.ordersCount !== undefined) {
        updates.push("orders_count = ?");
        values.push(input.ordersCount);
      }
      if (input.decisions !== undefined) {
        updates.push("decisions_json = ?");
        values.push(toJson(input.decisions));
      }
      if (input.orders !== undefined) {
        updates.push("orders_json = ?");
        values.push(toJson(input.orders));
      }
      if (input.errorMessage !== undefined) {
        updates.push("error_message = ?");
        values.push(input.errorMessage);
      }
      if (input.errorStack !== undefined) {
        updates.push("error_stack = ?");
        values.push(input.errorStack);
      }

      updates.push("updated_at = ?");
      values.push(new Date().toISOString());
      values.push(id);

      try {
        await client.execute(
          `UPDATE cycles SET ${updates.join(", ")} WHERE id = ?`,
          values as (string | number | null)[]
        );
      } catch (error) {
        throw RepositoryError.fromSqliteError("cycles", error as Error);
      }

      const cycle = await this.findById(id);
      if (!cycle) {
        throw RepositoryError.notFound("cycles", id);
      }
      return cycle;
    },

    async findMany(options?: {
      environment?: string;
      status?: CycleStatus;
      pagination?: PaginationOptions;
    }): Promise<PaginatedResult<Cycle>> {
      const conditions: string[] = [];
      const values: (string | number)[] = [];

      if (options?.environment) {
        conditions.push("environment = ?");
        values.push(options.environment);
      }
      if (options?.status) {
        conditions.push("status = ?");
        values.push(options.status);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const page = options?.pagination?.page ?? 1;
      const pageSize = options?.pagination?.pageSize ?? 50;
      const offset = (page - 1) * pageSize;

      // Get total count
      const countResult = await client.execute<Row>(
        `SELECT COUNT(*) as count FROM cycles ${whereClause}`,
        values
      );
      const total = (countResult[0]?.count as number) ?? 0;

      // Get paginated data
      const rows = await client.execute<Row>(
        `SELECT * FROM cycles ${whereClause} ORDER BY started_at DESC LIMIT ? OFFSET ?`,
        [...values, pageSize, offset]
      );

      return {
        data: rows.map(mapCycleRow),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    },

    async findRecent(environment: string, limit = 10): Promise<Cycle[]> {
      const rows = await client.execute<Row>(
        "SELECT * FROM cycles WHERE environment = ? ORDER BY started_at DESC LIMIT ?",
        [environment, limit]
      );
      return rows.map(mapCycleRow);
    },

    async addEvent(input: CreateCycleEventInput): Promise<CycleEvent> {
      try {
        await client.execute(
          `INSERT INTO cycle_events (cycle_id, event_type, phase, agent_type, symbol, message, data_json, duration_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            input.cycleId,
            input.eventType,
            input.phase ?? null,
            input.agentType ?? null,
            input.symbol ?? null,
            input.message ?? null,
            input.data ? toJson(input.data) : null,
            input.durationMs ?? null,
          ]
        );
      } catch (error) {
        throw RepositoryError.fromSqliteError("cycle_events", error as Error);
      }

      // Get the last inserted event
      const rows = await client.execute<Row>(
        "SELECT * FROM cycle_events WHERE cycle_id = ? ORDER BY id DESC LIMIT 1",
        [input.cycleId]
      );

      const row = rows[0];
      if (!row) {
        throw new RepositoryError("Failed to create cycle event", "QUERY_ERROR", "cycle_events");
      }

      return mapCycleEventRow(row);
    },

    async addEventsBatch(events: CreateCycleEventInput[]): Promise<void> {
      if (events.length === 0) {
        return;
      }

      try {
        // Use a transaction for batch insert
        const values: (string | number | null)[] = [];
        const placeholders = events
          .map((input) => {
            values.push(
              input.cycleId,
              input.eventType,
              input.phase ?? null,
              input.agentType ?? null,
              input.symbol ?? null,
              input.message ?? null,
              input.data ? toJson(input.data) : null,
              input.durationMs ?? null
            );
            return "(?, ?, ?, ?, ?, ?, ?, ?)";
          })
          .join(", ");

        await client.execute(
          `INSERT INTO cycle_events (cycle_id, event_type, phase, agent_type, symbol, message, data_json, duration_ms)
           VALUES ${placeholders}`,
          values
        );
      } catch (error) {
        throw RepositoryError.fromSqliteError("cycle_events", error as Error);
      }
    },

    async findEvents(
      cycleId: string,
      options?: { eventType?: CycleEventType }
    ): Promise<CycleEvent[]> {
      const conditions = ["cycle_id = ?"];
      const values: (string | number)[] = [cycleId];

      if (options?.eventType) {
        conditions.push("event_type = ?");
        values.push(options.eventType);
      }

      const rows = await client.execute<Row>(
        `SELECT * FROM cycle_events WHERE ${conditions.join(" AND ")} ORDER BY timestamp ASC`,
        values
      );

      return rows.map(mapCycleEventRow);
    },

    async findStreamingEvents(cycleId: string): Promise<CycleEvent[]> {
      const eventTypes = STREAMING_EVENT_TYPES.map(() => "?").join(", ");
      const rows = await client.execute<Row>(
        `SELECT * FROM cycle_events
         WHERE cycle_id = ? AND event_type IN (${eventTypes})
         ORDER BY timestamp ASC`,
        [cycleId, ...STREAMING_EVENT_TYPES]
      );
      return rows.map(mapCycleEventRow);
    },

    // Convenience methods
    async start(
      id: string,
      environment: string,
      totalSymbols = 0,
      configVersion?: string
    ): Promise<Cycle> {
      return this.create({ id, environment, totalSymbols, configVersion });
    },

    async updateProgress(
      id: string,
      phase: CyclePhase,
      completedSymbols: number,
      progressPct: number,
      message?: string
    ): Promise<void> {
      await this.update(id, {
        currentPhase: phase,
        phaseStartedAt: new Date().toISOString(),
        completedSymbols,
        progressPct,
      });

      if (message) {
        await this.addEvent({
          cycleId: id,
          eventType: "progress",
          phase,
          message,
        });
      }
    },

    async complete(
      id: string,
      result: {
        approved: boolean;
        iterations: number;
        decisions: DecisionSummary[];
        orders: OrderSummary[];
        durationMs: number;
      }
    ): Promise<Cycle> {
      return this.update(id, {
        status: "completed",
        completedAt: new Date().toISOString(),
        durationMs: result.durationMs,
        currentPhase: "complete",
        approved: result.approved,
        iterations: result.iterations,
        decisionsCount: result.decisions.length,
        ordersCount: result.orders.length,
        decisions: result.decisions,
        orders: result.orders,
        progressPct: 100,
      });
    },

    async fail(id: string, error: string, stack?: string, durationMs?: number): Promise<Cycle> {
      return this.update(id, {
        status: "failed",
        completedAt: new Date().toISOString(),
        durationMs,
        errorMessage: error,
        errorStack: stack,
      });
    },

    async markOrphanedAsFailed(): Promise<number> {
      const now = new Date().toISOString();
      try {
        const result = await client.run(
          `UPDATE cycles
           SET status = 'failed',
               completed_at = ?,
               error_message = 'Server restarted - cycle orphaned',
               updated_at = ?
           WHERE status = 'running'`,
          [now, now]
        );
        return result.changes;
      } catch (error) {
        throw RepositoryError.fromSqliteError("cycles", error as Error);
      }
    },
  };
}
