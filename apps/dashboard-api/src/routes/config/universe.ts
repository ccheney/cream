/**
 * Universe Configuration Routes
 *
 * Endpoints for managing trading universe configuration.
 * The universe defines which symbols are eligible for trading.
 */

import { RuntimeConfigError, type RuntimeUniverseConfig } from "@cream/config";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { getRuntimeConfigService } from "../../db.js";
import {
	EnvironmentQuerySchema,
	ErrorResponseSchema,
	getEnvironment,
	UniverseConfigInputSchema,
	UniverseConfigSchema,
} from "./types.js";

const app = new OpenAPIHono();

// ============================================
// GET /universe - Get universe configuration
// ============================================

const getUniverseRoute = createRoute({
	method: "get",
	path: "/universe",
	request: {
		query: EnvironmentQuerySchema,
	},
	responses: {
		200: {
			content: { "application/json": { schema: UniverseConfigSchema } },
			description: "Universe configuration",
		},
		404: {
			content: { "application/json": { schema: ErrorResponseSchema } },
			description: "No active configuration found",
		},
	},
	tags: ["Config"],
});

app.openapi(getUniverseRoute, async (c) => {
	const environment = getEnvironment(c);
	try {
		const service = await getRuntimeConfigService();
		const config = await service.getActiveConfig(environment);
		return c.json(config.universe, 200);
	} catch (err) {
		if (err instanceof RuntimeConfigError && err.code === "NOT_SEEDED") {
			return c.json({ error: err.message, code: err.code }, 404);
		}
		throw err;
	}
});

// ============================================
// PUT /universe - Update universe configuration (saves as draft)
// ============================================

const updateUniverseRoute = createRoute({
	method: "put",
	path: "/universe",
	request: {
		query: EnvironmentQuerySchema,
		body: {
			content: { "application/json": { schema: UniverseConfigInputSchema } },
		},
	},
	responses: {
		200: {
			content: { "application/json": { schema: UniverseConfigSchema } },
			description: "Updated universe configuration",
		},
		404: {
			content: { "application/json": { schema: ErrorResponseSchema } },
			description: "No active configuration to base draft on",
		},
	},
	tags: ["Config"],
});

app.openapi(updateUniverseRoute, async (c) => {
	const environment = getEnvironment(c);
	const universe = c.req.valid("json");

	try {
		const service = await getRuntimeConfigService();
		const updated = await service.saveDraft(environment, {
			universe: universe as Partial<RuntimeUniverseConfig>,
		});
		return c.json(updated.universe, 200);
	} catch (err) {
		if (err instanceof RuntimeConfigError && err.code === "NOT_SEEDED") {
			return c.json({ error: err.message, code: err.code }, 404);
		}
		throw err;
	}
});

export const universeRoutes = app;
export default universeRoutes;
