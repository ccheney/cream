/**
 * Configuration Version Management Routes
 *
 * Endpoints for config history, rollback, and version comparison.
 */

import { RuntimeConfigError } from "@cream/config";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getRuntimeConfigService, getTradingConfigRepo } from "../../db.js";
import {
	ConfigHistoryEntrySchema,
	ErrorResponseSchema,
	FullConfigSchema,
	getEnvironment,
	HistoryQuerySchema,
	RollbackInputSchema,
	TradingConfigSchema,
} from "./types.js";

const app = new OpenAPIHono();

// ============================================
// GET /history - Get configuration history
// ============================================

const getHistoryRoute = createRoute({
	method: "get",
	path: "/history",
	request: {
		query: HistoryQuerySchema,
	},
	responses: {
		200: {
			content: {
				"application/json": { schema: z.array(ConfigHistoryEntrySchema) },
			},
			description: "Configuration history",
		},
	},
	tags: ["Config"],
});

app.openapi(getHistoryRoute, async (c) => {
	const environment = getEnvironment(c);
	const limit = c.req.query("limit") ? parseInt(c.req.query("limit") as string, 10) : 20;

	const service = await getRuntimeConfigService();
	const history = await service.getHistory(environment, limit);
	return c.json(history, 200);
});

// ============================================
// POST /rollback - Rollback to a previous configuration
// ============================================

const rollbackRoute = createRoute({
	method: "post",
	path: "/rollback",
	request: {
		query: z.object({
			env: z.enum(["BACKTEST", "PAPER", "LIVE"]).optional().openapi({
				description: "Trading environment (default: PAPER)",
			}),
		}),
		body: {
			content: { "application/json": { schema: RollbackInputSchema } },
		},
	},
	responses: {
		200: {
			content: { "application/json": { schema: FullConfigSchema } },
			description: "Rolled back configuration",
		},
		400: {
			content: { "application/json": { schema: ErrorResponseSchema } },
			description: "Rollback failed",
		},
		404: {
			content: { "application/json": { schema: ErrorResponseSchema } },
			description: "Configuration version not found",
		},
	},
	tags: ["Config"],
});

app.openapi(rollbackRoute, async (c) => {
	const environment = getEnvironment(c);
	const { versionId } = c.req.valid("json");

	try {
		const service = await getRuntimeConfigService();
		const config = await service.rollback(environment, versionId);
		return c.json(config, 200);
	} catch (err) {
		if (err instanceof RuntimeConfigError) {
			if (err.code === "ROLLBACK_FAILED") {
				if (err.message.includes("not found")) {
					return c.json({ error: err.message, code: err.code }, 404);
				}
				return c.json({ error: err.message, code: err.code }, 400);
			}
		}
		throw err;
	}
});

// ============================================
// GET /compare/:id1/:id2 - Compare two configuration versions
// ============================================

const compareRoute = createRoute({
	method: "get",
	path: "/compare/{id1}/{id2}",
	request: {
		params: z.object({
			id1: z.string().openapi({ description: "First configuration version ID" }),
			id2: z.string().openapi({ description: "Second configuration version ID" }),
		}),
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({
						config1: TradingConfigSchema,
						config2: TradingConfigSchema,
						differences: z.array(
							z.object({
								field: z.string(),
								value1: z.unknown(),
								value2: z.unknown(),
							})
						),
					}),
				},
			},
			description: "Configuration comparison",
		},
		404: {
			content: { "application/json": { schema: ErrorResponseSchema } },
			description: "One or both configuration versions not found",
		},
	},
	tags: ["Config"],
});

app.openapi(compareRoute, async (c) => {
	const { id1, id2 } = c.req.valid("param");

	const tradingRepo = await getTradingConfigRepo();

	const config1 = await tradingRepo.findById(id1);
	const config2 = await tradingRepo.findById(id2);

	if (!config1) {
		return c.json({ error: `Configuration ${id1} not found` }, 404);
	}
	if (!config2) {
		return c.json({ error: `Configuration ${id2} not found` }, 404);
	}

	const differences: { field: string; value1: unknown; value2: unknown }[] = [];
	const fieldsToCompare = [
		"globalModel",
		"maxConsensusIterations",
		"agentTimeoutMs",
		"totalConsensusTimeoutMs",
		"convictionDeltaHold",
		"convictionDeltaAction",
		"highConvictionPct",
		"mediumConvictionPct",
		"lowConvictionPct",
		"minRiskRewardRatio",
		"kellyFraction",
		"tradingCycleIntervalMs",
		"predictionMarketsIntervalMs",
	] as const;

	for (const field of fieldsToCompare) {
		if (config1[field] !== config2[field]) {
			differences.push({
				field,
				value1: config1[field],
				value2: config2[field],
			});
		}
	}

	return c.json({ config1, config2, differences }, 200);
});

export const versionsRoutes = app;
export default versionsRoutes;
