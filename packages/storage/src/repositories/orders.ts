/**
 * Orders Repository
 *
 * Data access for orders table.
 *
 * @see docs/plans/ui/04-data-requirements.md
 */

import type { Row, TursoClient } from "../turso.js";
import {
  type PaginatedResult,
  type PaginationOptions,
  paginate,
  parseJson,
  query,
  RepositoryError,
  toJson,
} from "./base.js";

// ============================================
// Types
// ============================================

/**
 * Order side
 */
export type OrderSide = "BUY" | "SELL";

/**
 * Order type
 */
export type OrderType = "MARKET" | "LIMIT" | "STOP" | "STOP_LIMIT";

/**
 * Order status
 */
export type OrderStatus =
  | "pending"
  | "submitted"
  | "accepted"
  | "partially_filled"
  | "filled"
  | "cancelled"
  | "rejected"
  | "expired";

/**
 * Time in force
 */
export type TimeInForce = "DAY" | "GTC" | "IOC" | "FOK";

/**
 * Order entity
 */
export interface Order {
  id: string;
  decisionId: string | null;
  symbol: string;
  side: OrderSide;
  quantity: number;
  filledQuantity: number;
  orderType: OrderType;
  limitPrice: number | null;
  stopPrice: number | null;
  avgFillPrice: number | null;
  status: OrderStatus;
  timeInForce: TimeInForce;
  brokerOrderId: string | null;
  brokerStatus: string | null;
  metadata: Record<string, unknown>;
  environment: string;
  createdAt: string;
  submittedAt: string | null;
  filledAt: string | null;
  cancelledAt: string | null;
  updatedAt: string;
}

/**
 * Create order input
 */
export interface CreateOrderInput {
  id: string;
  decisionId?: string | null;
  symbol: string;
  side: OrderSide;
  quantity: number;
  orderType: OrderType;
  limitPrice?: number | null;
  stopPrice?: number | null;
  timeInForce?: TimeInForce;
  metadata?: Record<string, unknown>;
  environment: string;
}

/**
 * Order filter options
 */
export interface OrderFilters {
  symbol?: string;
  side?: OrderSide;
  orderType?: OrderType;
  status?: OrderStatus | OrderStatus[];
  decisionId?: string;
  environment?: string;
  fromDate?: string;
  toDate?: string;
}

// ============================================
// Row Mapper
// ============================================

function mapOrderRow(row: Row): Order {
  return {
    id: row.id as string,
    decisionId: row.decision_id as string | null,
    symbol: row.symbol as string,
    side: row.side as OrderSide,
    quantity: row.qty as number,
    filledQuantity: (row.filled_qty as number) ?? 0,
    orderType: row.type as OrderType,
    limitPrice: row.limit_price as number | null,
    stopPrice: row.stop_price as number | null,
    avgFillPrice: row.avg_fill_price as number | null,
    status: row.status as OrderStatus,
    timeInForce: (row.time_in_force as TimeInForce) ?? "DAY",
    brokerOrderId: row.broker_order_id as string | null,
    brokerStatus: row.broker_status as string | null,
    metadata: parseJson<Record<string, unknown>>(row.metadata, {}),
    environment: row.environment as string,
    createdAt: row.created_at as string,
    submittedAt: row.submitted_at as string | null,
    filledAt: row.filled_at as string | null,
    cancelledAt: row.cancelled_at as string | null,
    updatedAt: row.updated_at as string,
  };
}

// ============================================
// Repository
// ============================================

/**
 * Orders repository
 */
export class OrdersRepository {
  private readonly table = "orders";

  constructor(private readonly client: TursoClient) {}

  /**
   * Create a new order
   */
  async create(input: CreateOrderInput): Promise<Order> {
    const now = new Date().toISOString();

    try {
      await this.client.run(
        `INSERT INTO ${this.table} (
          id, decision_id, symbol, side, qty,
          type, limit_price, stop_price, status, time_in_force,
          metadata, environment, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
        [
          input.id,
          input.decisionId ?? null,
          input.symbol,
          input.side,
          input.quantity,
          input.orderType,
          input.limitPrice ?? null,
          input.stopPrice ?? null,
          input.timeInForce ?? "DAY",
          toJson(input.metadata ?? {}),
          input.environment,
          now,
          now,
        ]
      );
    } catch (error) {
      throw RepositoryError.fromSqliteError(this.table, error as Error);
    }

    return this.findById(input.id) as Promise<Order>;
  }

  /**
   * Find order by ID
   */
  async findById(id: string): Promise<Order | null> {
    const row = await this.client.get<Row>(`SELECT * FROM ${this.table} WHERE id = ?`, [id]);

    return row ? mapOrderRow(row) : null;
  }

  /**
   * Find order by ID, throw if not found
   */
  async findByIdOrThrow(id: string): Promise<Order> {
    const order = await this.findById(id);
    if (!order) {
      throw RepositoryError.notFound(this.table, id);
    }
    return order;
  }

  /**
   * Find order by broker order ID
   */
  async findByBrokerOrderId(brokerOrderId: string): Promise<Order | null> {
    const row = await this.client.get<Row>(
      `SELECT * FROM ${this.table} WHERE broker_order_id = ?`,
      [brokerOrderId]
    );

    return row ? mapOrderRow(row) : null;
  }

  /**
   * Find orders with filters
   */
  async findMany(
    filters: OrderFilters = {},
    pagination?: PaginationOptions
  ): Promise<PaginatedResult<Order>> {
    const builder = query().orderBy("created_at", "DESC");

    if (filters.symbol) {
      builder.eq("symbol", filters.symbol);
    }
    if (filters.side) {
      builder.eq("side", filters.side);
    }
    if (filters.orderType) {
      builder.eq("type", filters.orderType);
    }
    if (filters.status) {
      if (Array.isArray(filters.status)) {
        builder.where("status", "IN", filters.status);
      } else {
        builder.eq("status", filters.status);
      }
    }
    if (filters.decisionId) {
      builder.eq("decision_id", filters.decisionId);
    }
    if (filters.environment) {
      builder.eq("environment", filters.environment);
    }
    if (filters.fromDate) {
      builder.where("created_at", ">=", filters.fromDate);
    }
    if (filters.toDate) {
      builder.where("created_at", "<=", filters.toDate);
    }

    const { sql, args } = builder.build(`SELECT * FROM ${this.table}`);
    const countSql = sql.replace("SELECT *", "SELECT COUNT(*) as count").split(" LIMIT ")[0]!;

    const result = await paginate<Row>(
      this.client,
      sql.split(" LIMIT ")[0]!,
      countSql,
      args.slice(0, -2),
      pagination
    );

    return {
      ...result,
      data: result.data.map(mapOrderRow),
    };
  }

  /**
   * Find orders by decision
   */
  async findByDecision(decisionId: string): Promise<Order[]> {
    const rows = await this.client.execute<Row>(
      `SELECT * FROM ${this.table} WHERE decision_id = ? ORDER BY created_at DESC`,
      [decisionId]
    );

    return rows.map(mapOrderRow);
  }

  /**
   * Find active orders (pending, submitted, accepted, partially_filled)
   */
  async findActive(environment: string): Promise<Order[]> {
    const rows = await this.client.execute<Row>(
      `SELECT * FROM ${this.table}
       WHERE environment = ? AND status IN ('pending', 'submitted', 'accepted', 'partially_filled')
       ORDER BY created_at DESC`,
      [environment]
    );

    return rows.map(mapOrderRow);
  }

  /**
   * Find recent orders
   */
  async findRecent(environment: string, limit = 20): Promise<Order[]> {
    const rows = await this.client.execute<Row>(
      `SELECT * FROM ${this.table} WHERE environment = ? ORDER BY created_at DESC LIMIT ?`,
      [environment, limit]
    );

    return rows.map(mapOrderRow);
  }

  /**
   * Update order status
   */
  async updateStatus(
    id: string,
    status: OrderStatus,
    brokerOrderId?: string,
    brokerStatus?: string
  ): Promise<Order> {
    const now = new Date().toISOString();
    const fields: string[] = ["status = ?", "updated_at = ?"];
    const args: unknown[] = [status, now];

    if (brokerOrderId !== undefined) {
      fields.push("broker_order_id = ?");
      args.push(brokerOrderId);
    }
    if (brokerStatus !== undefined) {
      fields.push("broker_status = ?");
      args.push(brokerStatus);
    }

    // Set timestamp fields based on status
    if (status === "submitted") {
      fields.push("submitted_at = ?");
      args.push(now);
    } else if (status === "filled") {
      fields.push("filled_at = ?");
      args.push(now);
    } else if (status === "cancelled") {
      fields.push("cancelled_at = ?");
      args.push(now);
    }

    args.push(id);

    const result = await this.client.run(
      `UPDATE ${this.table} SET ${fields.join(", ")} WHERE id = ?`,
      args
    );

    if (result.changes === 0) {
      throw RepositoryError.notFound(this.table, id);
    }

    return this.findByIdOrThrow(id);
  }

  /**
   * Update fill information
   */
  async updateFill(id: string, filledQty: number, avgFillPrice: number): Promise<Order> {
    const order = await this.findByIdOrThrow(id);
    const now = new Date().toISOString();

    const status: OrderStatus = filledQty >= order.quantity ? "filled" : "partially_filled";

    const fields = ["filled_qty = ?", "avg_fill_price = ?", "status = ?", "updated_at = ?"];
    const args = [filledQty, avgFillPrice, status, now];

    if (status === "filled") {
      fields.push("filled_at = ?");
      args.push(now);
    }

    args.push(id);

    await this.client.run(`UPDATE ${this.table} SET ${fields.join(", ")} WHERE id = ?`, args);

    return this.findByIdOrThrow(id);
  }

  /**
   * Cancel order
   */
  async cancel(id: string): Promise<Order> {
    return this.updateStatus(id, "cancelled");
  }

  /**
   * Delete order
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.client.run(`DELETE FROM ${this.table} WHERE id = ?`, [id]);

    return result.changes > 0;
  }

  /**
   * Count orders by status
   */
  async countByStatus(environment: string): Promise<Record<OrderStatus, number>> {
    const rows = await this.client.execute<{ status: string; count: number }>(
      `SELECT status, COUNT(*) as count FROM ${this.table} WHERE environment = ? GROUP BY status`,
      [environment]
    );

    const result: Record<string, number> = {
      pending: 0,
      submitted: 0,
      accepted: 0,
      partially_filled: 0,
      filled: 0,
      cancelled: 0,
      rejected: 0,
      expired: 0,
    };

    for (const row of rows) {
      result[row.status] = row.count;
    }

    return result as Record<OrderStatus, number>;
  }
}
