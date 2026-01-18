/**
 * Cycles Routes
 *
 * Endpoints for cycle analytics and decision metrics.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getCyclesRepo, getDecisionsRepo } from "../db.js";
import { getCurrentEnvironment } from "./system.js";

// ============================================
// Schemas
// ============================================

const AnalyticsFiltersSchema = z.object({
	environment: z.string().optional(),
	fromDate: z.string().optional(),
	toDate: z.string().optional(),
	period: z.enum(["1D", "1W", "1M", "3M", "1Y", "ALL"]).optional().default("1M"),
});

const CycleAnalyticsSummarySchema = z.object({
	totalCycles: z.number(),
	completionRate: z.number(),
	approvalRate: z.number(),
	avgDurationMs: z.number().nullable(),
	totalDecisions: z.number(),
	totalOrders: z.number(),
	statusDistribution: z.record(z.string(), z.number()),
});

const DecisionAnalyticsSchema = z.object({
	totalDecisions: z.number(),
	executionRate: z.number(),
	statusDistribution: z.record(z.string(), z.number()),
	actionDistribution: z.record(z.string(), z.number()),
	directionDistribution: z.record(z.string(), z.number()),
	avgConfidence: z.number().nullable(),
	avgRisk: z.number().nullable(),
});

const ConfidenceCalibrationBinSchema = z.object({
	bin: z.string(),
	total: z.number(),
	executed: z.number(),
	executionRate: z.number(),
});

const StrategyBreakdownItemSchema = z.object({
	strategyFamily: z.string(),
	count: z.number(),
	executedCount: z.number(),
	approvalRate: z.number(),
	avgConfidence: z.number().nullable(),
	avgRisk: z.number().nullable(),
});

// ============================================
// Helpers
// ============================================

function periodToDates(period: string): { fromDate?: string; toDate?: string } {
	const now = new Date();
	let fromDate: Date | undefined;

	switch (period) {
		case "1D":
			fromDate = new Date(now);
			fromDate.setDate(fromDate.getDate() - 1);
			break;
		case "1W":
			fromDate = new Date(now);
			fromDate.setDate(fromDate.getDate() - 7);
			break;
		case "1M":
			fromDate = new Date(now);
			fromDate.setMonth(fromDate.getMonth() - 1);
			break;
		case "3M":
			fromDate = new Date(now);
			fromDate.setMonth(fromDate.getMonth() - 3);
			break;
		case "1Y":
			fromDate = new Date(now);
			fromDate.setFullYear(fromDate.getFullYear() - 1);
			break;
		default:
			fromDate = undefined;
			break;
	}

	return {
		fromDate: fromDate?.toISOString(),
		toDate: undefined,
	};
}

// ============================================
// Routes
// ============================================

const app = new OpenAPIHono();

// GET /api/cycles/analytics/summary
const summaryRoute = createRoute({
	method: "get",
	path: "/analytics/summary",
	request: {
		query: AnalyticsFiltersSchema,
	},
	responses: {
		200: {
			content: { "application/json": { schema: CycleAnalyticsSummarySchema } },
			description: "Cycle-level analytics summary",
		},
	},
	tags: ["Cycles"],
});

app.openapi(summaryRoute, async (c) => {
	const query = c.req.valid("query");
	const repo = getCyclesRepo();

	const { fromDate, toDate } = periodToDates(query.period ?? "1M");
	const environment = query.environment ?? getCurrentEnvironment();

	const analytics = await repo.getCycleAnalytics({
		environment,
		fromDate: query.fromDate ?? fromDate,
		toDate: query.toDate ?? toDate,
	});

	return c.json(analytics);
});

// GET /api/cycles/analytics/decisions
const decisionsRoute = createRoute({
	method: "get",
	path: "/analytics/decisions",
	request: {
		query: AnalyticsFiltersSchema,
	},
	responses: {
		200: {
			content: { "application/json": { schema: DecisionAnalyticsSchema } },
			description: "Decision metrics and distributions",
		},
	},
	tags: ["Cycles"],
});

app.openapi(decisionsRoute, async (c) => {
	const query = c.req.valid("query");
	const repo = getDecisionsRepo();

	const { fromDate, toDate } = periodToDates(query.period ?? "1M");
	const environment = query.environment ?? getCurrentEnvironment();

	const analytics = await repo.getDecisionAnalytics({
		environment,
		fromDate: query.fromDate ?? fromDate,
		toDate: query.toDate ?? toDate,
	});

	return c.json(analytics);
});

// GET /api/cycles/analytics/calibration
const calibrationRoute = createRoute({
	method: "get",
	path: "/analytics/calibration",
	request: {
		query: AnalyticsFiltersSchema,
	},
	responses: {
		200: {
			content: { "application/json": { schema: z.array(ConfidenceCalibrationBinSchema) } },
			description: "Confidence calibration bins with success rates",
		},
	},
	tags: ["Cycles"],
});

app.openapi(calibrationRoute, async (c) => {
	const query = c.req.valid("query");
	const repo = getDecisionsRepo();

	const { fromDate, toDate } = periodToDates(query.period ?? "1M");
	const environment = query.environment ?? getCurrentEnvironment();

	const calibration = await repo.getConfidenceCalibration({
		environment,
		fromDate: query.fromDate ?? fromDate,
		toDate: query.toDate ?? toDate,
	});

	return c.json(calibration);
});

// GET /api/cycles/analytics/strategies
const strategiesRoute = createRoute({
	method: "get",
	path: "/analytics/strategies",
	request: {
		query: AnalyticsFiltersSchema,
	},
	responses: {
		200: {
			content: { "application/json": { schema: z.array(StrategyBreakdownItemSchema) } },
			description: "Strategy family breakdown",
		},
	},
	tags: ["Cycles"],
});

app.openapi(strategiesRoute, async (c) => {
	const query = c.req.valid("query");
	const repo = getDecisionsRepo();

	const { fromDate, toDate } = periodToDates(query.period ?? "1M");
	const environment = query.environment ?? getCurrentEnvironment();

	const strategies = await repo.getStrategyBreakdown({
		environment,
		fromDate: query.fromDate ?? fromDate,
		toDate: query.toDate ?? toDate,
	});

	return c.json(strategies);
});

export default app;
