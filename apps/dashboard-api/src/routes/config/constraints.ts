/**
 * Constraints Configuration Routes
 *
 * Endpoints for managing risk constraint configuration.
 * Constraints define limits for positions, portfolio, and options Greeks.
 */

import {
	RuntimeConfigError,
	type RuntimeOptionsLimits,
	type RuntimePerInstrumentLimits,
	type RuntimePortfolioLimits,
} from "@cream/config";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { getRuntimeConfigService } from "../../db.js";
import {
	ConstraintsConfigInputSchema,
	ConstraintsConfigResponseSchema,
	EnvironmentQuerySchema,
	ErrorResponseSchema,
	getEnvironment,
} from "./types.js";

const app = new OpenAPIHono();

// ============================================
// GET /constraints - Get constraints configuration
// ============================================

const getConstraintsRoute = createRoute({
	method: "get",
	path: "/constraints",
	request: {
		query: EnvironmentQuerySchema,
	},
	responses: {
		200: {
			content: { "application/json": { schema: ConstraintsConfigResponseSchema } },
			description: "Constraints configuration",
		},
		404: {
			content: { "application/json": { schema: ErrorResponseSchema } },
			description: "No active configuration found",
		},
	},
	tags: ["Config"],
});

app.openapi(getConstraintsRoute, async (c) => {
	const environment = getEnvironment(c);
	try {
		const service = await getRuntimeConfigService();
		const config = await service.getActiveConfig(environment);
		return c.json(config.constraints, 200);
	} catch (err) {
		if (err instanceof RuntimeConfigError && err.code === "NOT_SEEDED") {
			return c.json({ error: err.message, code: err.code }, 404);
		}
		throw err;
	}
});

// ============================================
// PUT /constraints - Update constraints configuration (saves as draft)
// ============================================

const updateConstraintsRoute = createRoute({
	method: "put",
	path: "/constraints",
	request: {
		query: EnvironmentQuerySchema,
		body: {
			content: { "application/json": { schema: ConstraintsConfigInputSchema } },
		},
	},
	responses: {
		200: {
			content: { "application/json": { schema: ConstraintsConfigResponseSchema } },
			description: "Updated constraints configuration",
		},
		404: {
			content: { "application/json": { schema: ErrorResponseSchema } },
			description: "No active configuration to base draft on",
		},
	},
	tags: ["Config"],
});

app.openapi(updateConstraintsRoute, async (c) => {
	const environment = getEnvironment(c);
	const constraints = c.req.valid("json");

	try {
		const service = await getRuntimeConfigService();
		const updated = await service.saveDraft(environment, {
			constraints: {
				perInstrument: constraints.perInstrument as Partial<RuntimePerInstrumentLimits>,
				portfolio: constraints.portfolio as Partial<RuntimePortfolioLimits>,
				options: constraints.options as Partial<RuntimeOptionsLimits>,
			},
		});
		return c.json(updated.constraints, 200);
	} catch (err) {
		if (err instanceof RuntimeConfigError && err.code === "NOT_SEEDED") {
			return c.json({ error: err.message, code: err.code }, 404);
		}
		throw err;
	}
});

export const constraintsRoutes = app;
export default constraintsRoutes;
