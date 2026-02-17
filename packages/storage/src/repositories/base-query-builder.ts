export type FilterOperator =
	| "="
	| "!="
	| ">"
	| "<"
	| ">="
	| "<="
	| "LIKE"
	| "IN"
	| "IS NULL"
	| "IS NOT NULL";

export interface Filter {
	field: string;
	operator: FilterOperator;
	value?: unknown;
}

export type OrderDirection = "ASC" | "DESC";

export interface Order {
	field: string;
	direction: OrderDirection;
}

export class QueryBuilder {
	private filters: Filter[] = [];
	private orders: Order[] = [];
	private limitValue = 100;
	private offsetValue = 0;

	where(field: string, operator: FilterOperator, value?: unknown): this {
		this.filters.push({ field, operator, value });
		return this;
	}

	eq(field: string, value: unknown): this {
		return this.where(field, "=", value);
	}

	orderBy(field: string, direction: OrderDirection = "ASC"): this {
		this.orders.push({ field, direction });
		return this;
	}

	limit(limit: number): this {
		this.limitValue = limit;
		return this;
	}

	offset(offset: number): this {
		this.offsetValue = offset;
		return this;
	}

	build(baseQuery: string): { sql: string; args: unknown[] } {
		const args: unknown[] = [];
		let sql = baseQuery;

		if (this.filters.length > 0) {
			const whereClauses: string[] = [];
			for (const filter of this.filters) {
				if (filter.operator === "IS NULL" || filter.operator === "IS NOT NULL") {
					whereClauses.push(`${filter.field} ${filter.operator}`);
				} else if (filter.operator === "IN" && Array.isArray(filter.value)) {
					const placeholders = filter.value.map(() => "?").join(", ");
					whereClauses.push(`${filter.field} IN (${placeholders})`);
					args.push(...filter.value);
				} else {
					whereClauses.push(`${filter.field} ${filter.operator} ?`);
					args.push(filter.value);
				}
			}
			sql += ` WHERE ${whereClauses.join(" AND ")}`;
		}

		if (this.orders.length > 0) {
			const orderClauses = this.orders.map((order) => `${order.field} ${order.direction}`);
			sql += ` ORDER BY ${orderClauses.join(", ")}`;
		}

		sql += " LIMIT ? OFFSET ?";
		args.push(this.limitValue, this.offsetValue);

		return { sql, args };
	}

	reset(): this {
		this.filters = [];
		this.orders = [];
		this.limitValue = 100;
		this.offsetValue = 0;
		return this;
	}
}

export function query(): QueryBuilder {
	return new QueryBuilder();
}
