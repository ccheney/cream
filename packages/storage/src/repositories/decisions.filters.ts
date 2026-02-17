import { eq, gte, inArray, lte } from "drizzle-orm";
import { decisions } from "../schema/core-trading";
import type { DecisionFilters } from "./decisions.types";

export function buildDecisionFilterConditions(filters: DecisionFilters) {
	const conditions = [];

	if (filters.symbol) {
		conditions.push(eq(decisions.symbol, filters.symbol));
	}
	if (filters.status) {
		if (Array.isArray(filters.status)) {
			conditions.push(inArray(decisions.status, filters.status));
		} else {
			conditions.push(eq(decisions.status, filters.status));
		}
	}
	if (filters.action) {
		conditions.push(eq(decisions.action, filters.action));
	}
	if (filters.direction) {
		conditions.push(eq(decisions.direction, filters.direction));
	}
	if (filters.environment) {
		conditions.push(eq(decisions.environment, filters.environment as "PAPER" | "LIVE"));
	}
	if (filters.cycleId) {
		conditions.push(eq(decisions.cycleId, filters.cycleId));
	}
	if (filters.fromDate) {
		conditions.push(gte(decisions.createdAt, new Date(filters.fromDate)));
	}
	if (filters.toDate) {
		conditions.push(lte(decisions.createdAt, new Date(filters.toDate)));
	}

	return conditions;
}
