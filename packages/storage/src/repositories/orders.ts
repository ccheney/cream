/**
 * Orders Repository (Drizzle ORM)
 *
 * Data access for orders table.
 */
import { and, count, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { type Database, getDb } from "../db";
import { orders } from "../schema/core-trading";
import { RepositoryError } from "./base";

// ============================================
// Types
// ============================================

export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit" | "stop" | "stop_limit";
export type OrderStatus =
	| "pending"
	| "submitted"
	| "accepted"
	| "partial_fill"
	| "filled"
	| "cancelled"
	| "rejected"
	| "expired";
export type TimeInForce = "day" | "gtc" | "ioc" | "fok";

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
	commission: number | null;
	environment: string;
	createdAt: string;
	submittedAt: string | null;
	filledAt: string | null;
	cancelledAt: string | null;
}

export interface CreateOrderInput {
	id?: string;
	decisionId?: string | null;
	symbol: string;
	side: OrderSide;
	quantity: number;
	orderType: OrderType;
	limitPrice?: number | null;
	stopPrice?: number | null;
	timeInForce?: TimeInForce;
	environment: string;
}

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
// Row Mapping
// ============================================

type OrderRow = typeof orders.$inferSelect;

function mapOrderRow(row: OrderRow): Order {
	return {
		id: row.id,
		decisionId: row.decisionId,
		symbol: row.symbol,
		side: row.side as OrderSide,
		quantity: Number(row.qty),
		filledQuantity: Number(row.filledQty ?? 0),
		orderType: row.orderType as OrderType,
		limitPrice: row.limitPrice ? Number(row.limitPrice) : null,
		stopPrice: row.stopPrice ? Number(row.stopPrice) : null,
		avgFillPrice: row.filledAvgPrice ? Number(row.filledAvgPrice) : null,
		status: row.status as OrderStatus,
		timeInForce: row.timeInForce as TimeInForce,
		brokerOrderId: row.brokerOrderId,
		commission: row.commission ? Number(row.commission) : null,
		environment: row.environment,
		createdAt: row.createdAt.toISOString(),
		submittedAt: row.submittedAt?.toISOString() ?? null,
		filledAt: row.filledAt?.toISOString() ?? null,
		cancelledAt: row.cancelledAt?.toISOString() ?? null,
	};
}

// ============================================
// Repository
// ============================================

export class OrdersRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async create(input: CreateOrderInput): Promise<Order> {
		const [row] = await this.db
			.insert(orders)
			.values({
				decisionId: input.decisionId ?? null,
				symbol: input.symbol,
				side: input.side,
				qty: String(input.quantity),
				orderType: input.orderType,
				limitPrice: input.limitPrice != null ? String(input.limitPrice) : null,
				stopPrice: input.stopPrice != null ? String(input.stopPrice) : null,
				status: "pending",
				timeInForce: input.timeInForce ?? "day",
				environment: input.environment as "PAPER" | "LIVE",
			})
			.returning();

		if (!row) {
			throw new Error("Failed to create order");
		}
		return mapOrderRow(row);
	}

	async findById(id: string): Promise<Order | null> {
		const [row] = await this.db.select().from(orders).where(eq(orders.id, id)).limit(1);

		return row ? mapOrderRow(row) : null;
	}

	async findByIdOrThrow(id: string): Promise<Order> {
		const order = await this.findById(id);
		if (!order) {
			throw RepositoryError.notFound("orders", id);
		}
		return order;
	}

	async findByBrokerOrderId(brokerOrderId: string): Promise<Order | null> {
		const [row] = await this.db
			.select()
			.from(orders)
			.where(eq(orders.brokerOrderId, brokerOrderId))
			.limit(1);

		return row ? mapOrderRow(row) : null;
	}

	async findMany(
		filters: OrderFilters = {},
		pagination?: { limit?: number; offset?: number }
	): Promise<{ data: Order[]; total: number; limit: number; offset: number }> {
		const conditions = [];

		if (filters.symbol) {
			conditions.push(eq(orders.symbol, filters.symbol));
		}
		if (filters.side) {
			conditions.push(eq(orders.side, filters.side));
		}
		if (filters.orderType) {
			conditions.push(eq(orders.orderType, filters.orderType));
		}
		if (filters.status) {
			if (Array.isArray(filters.status)) {
				conditions.push(inArray(orders.status, filters.status));
			} else {
				conditions.push(eq(orders.status, filters.status));
			}
		}
		if (filters.decisionId) {
			conditions.push(eq(orders.decisionId, filters.decisionId));
		}
		if (filters.environment) {
			conditions.push(eq(orders.environment, filters.environment as "PAPER" | "LIVE"));
		}
		if (filters.fromDate) {
			conditions.push(gte(orders.createdAt, new Date(filters.fromDate)));
		}
		if (filters.toDate) {
			conditions.push(lte(orders.createdAt, new Date(filters.toDate)));
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
		const limit = pagination?.limit ?? 20;
		const offset = pagination?.offset ?? 0;

		const [countResult] = await this.db.select({ count: count() }).from(orders).where(whereClause);

		const rows = await this.db
			.select()
			.from(orders)
			.where(whereClause)
			.orderBy(desc(orders.createdAt))
			.limit(limit)
			.offset(offset);

		return {
			data: rows.map(mapOrderRow),
			total: countResult?.count ?? 0,
			limit,
			offset,
		};
	}

	async findByDecision(decisionId: string): Promise<Order[]> {
		const rows = await this.db
			.select()
			.from(orders)
			.where(eq(orders.decisionId, decisionId))
			.orderBy(desc(orders.createdAt));

		return rows.map(mapOrderRow);
	}

	async findActive(environment: string): Promise<Order[]> {
		const rows = await this.db
			.select()
			.from(orders)
			.where(
				and(
					eq(orders.environment, environment as "PAPER" | "LIVE"),
					inArray(orders.status, ["pending", "submitted", "accepted", "partial_fill"])
				)
			)
			.orderBy(desc(orders.createdAt));

		return rows.map(mapOrderRow);
	}

	async findRecent(environment: string, limit = 20): Promise<Order[]> {
		const rows = await this.db
			.select()
			.from(orders)
			.where(eq(orders.environment, environment as "PAPER" | "LIVE"))
			.orderBy(desc(orders.createdAt))
			.limit(limit);

		return rows.map(mapOrderRow);
	}

	async updateStatus(id: string, status: OrderStatus, brokerOrderId?: string): Promise<Order> {
		const updateData: Partial<typeof orders.$inferInsert> = { status };

		if (brokerOrderId !== undefined) {
			updateData.brokerOrderId = brokerOrderId;
		}

		if (status === "submitted") {
			updateData.submittedAt = new Date();
		} else if (status === "filled") {
			updateData.filledAt = new Date();
		} else if (status === "cancelled") {
			updateData.cancelledAt = new Date();
		}

		const [row] = await this.db.update(orders).set(updateData).where(eq(orders.id, id)).returning();

		if (!row) {
			throw RepositoryError.notFound("orders", id);
		}

		return mapOrderRow(row);
	}

	async updateFill(id: string, filledQty: number, avgFillPrice: number): Promise<Order> {
		const order = await this.findByIdOrThrow(id);

		const status: OrderStatus = filledQty >= order.quantity ? "filled" : "partial_fill";

		const updateData: Partial<typeof orders.$inferInsert> = {
			filledQty: String(filledQty),
			filledAvgPrice: String(avgFillPrice),
			status,
		};

		if (status === "filled") {
			updateData.filledAt = new Date();
		}

		const [row] = await this.db.update(orders).set(updateData).where(eq(orders.id, id)).returning();

		if (!row) {
			throw RepositoryError.notFound("orders", id);
		}
		return mapOrderRow(row);
	}

	async cancel(id: string): Promise<Order> {
		return this.updateStatus(id, "cancelled");
	}

	async delete(id: string): Promise<boolean> {
		const result = await this.db
			.delete(orders)
			.where(eq(orders.id, id))
			.returning({ id: orders.id });

		return result.length > 0;
	}

	async countByStatus(environment: string): Promise<Record<OrderStatus, number>> {
		const rows = await this.db
			.select({ status: orders.status, count: count() })
			.from(orders)
			.where(eq(orders.environment, environment as "PAPER" | "LIVE"))
			.groupBy(orders.status);

		const result: Record<string, number> = {
			pending: 0,
			submitted: 0,
			accepted: 0,
			partial_fill: 0,
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
