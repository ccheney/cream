/**
 * Theses API Routes
 *
 * Routes for managing trading theses and convictions.
 * Data is stored in PostgreSQL via ThesisStateRepository.
 *
 * @see docs/plans/ui/05-api-endpoints.md Theses section
 * @see packages/storage/src/repositories/thesis-state.ts
 */

import type { ThesisState } from "@cream/storage";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getThesesRepo } from "../db.js";
import { getCurrentEnvironment } from "./system.js";
import {
	CreateThesisSchema,
	mapThesisToResponse,
	ThesisHistoryEntrySchema,
	ThesisSchema,
	ThesisStatusSchema,
} from "./theses.shared.js";

const app = new OpenAPIHono();

const listRoute = createRoute({
	method: "get",
	path: "/",
	request: {
		query: z.object({
			status: ThesisStatusSchema.optional(),
			symbol: z.string().optional(),
			direction: z.enum(["BULLISH", "BEARISH", "NEUTRAL"]).optional(),
		}),
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.array(ThesisSchema),
				},
			},
			description: "List of theses",
		},
	},
	tags: ["Theses"],
});

app.openapi(listRoute, async (c) => {
	const { status, symbol } = c.req.valid("query");
	const repo = await getThesesRepo();

	let states: ThesisState[] | undefined;
	if (status === "ACTIVE") {
		states = ["WATCHING", "ENTERED", "ADDING", "MANAGING", "EXITING"];
	} else if (status === "REALIZED" || status === "INVALIDATED" || status === "EXPIRED") {
		states = ["CLOSED"];
	}

	const result = await repo.findMany({
		instrumentId: symbol,
		states,
		environment: getCurrentEnvironment(),
	});

	return c.json(result.data.map(mapThesisToResponse));
});

const createThesisRoute = createRoute({
	method: "post",
	path: "/",
	request: {
		body: {
			content: {
				"application/json": {
					schema: CreateThesisSchema,
				},
			},
		},
	},
	responses: {
		201: {
			content: {
				"application/json": {
					schema: ThesisSchema,
				},
			},
			description: "Created thesis",
		},
	},
	tags: ["Theses"],
});

app.openapi(createThesisRoute, async (c) => {
	const body = c.req.valid("json");
	const repo = await getThesesRepo();

	const thesis = await repo.create({
		instrumentId: body.symbol,
		state: "WATCHING",
		entryThesis: body.thesis,
		invalidationConditions: body.invalidationConditions.join("; "),
		conviction: body.confidence ?? undefined,
		currentStop: body.stopPrice ?? undefined,
		currentTarget: body.targetPrice ?? undefined,
		environment: getCurrentEnvironment(),
		notes: {
			direction: body.direction,
			catalysts: body.catalysts,
			timeHorizon: body.timeHorizon,
			expiresAt: body.expiresAt,
			agentSource: "dashboard-api",
		},
	});

	return c.json(mapThesisToResponse(thesis), 201);
});

const getRoute = createRoute({
	method: "get",
	path: "/:id",
	request: {
		params: z.object({
			id: z.string(),
		}),
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: ThesisSchema,
				},
			},
			description: "Thesis details",
		},
		404: {
			description: "Thesis not found",
		},
	},
	tags: ["Theses"],
});

app.openapi(getRoute, async (c) => {
	const { id } = c.req.valid("param");
	const repo = await getThesesRepo();

	const thesis = await repo.findById(id);
	if (!thesis) {
		throw new HTTPException(404, { message: "Thesis not found" });
	}

	return c.json(mapThesisToResponse(thesis));
});

const updateRoute = createRoute({
	method: "put",
	path: "/:id",
	request: {
		params: z.object({
			id: z.string(),
		}),
		body: {
			content: {
				"application/json": {
					schema: CreateThesisSchema.partial(),
				},
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: ThesisSchema,
				},
			},
			description: "Updated thesis",
		},
		404: {
			description: "Thesis not found",
		},
	},
	tags: ["Theses"],
});

app.openapi(updateRoute, async (c) => {
	const { id } = c.req.valid("param");
	const body = c.req.valid("json");
	const repo = await getThesesRepo();

	const existing = await repo.findById(id);
	if (!existing) {
		throw new HTTPException(404, { message: "Thesis not found" });
	}

	if (body.confidence !== undefined && body.confidence !== null) {
		await repo.updateConviction(id, body.confidence);
	}

	if (body.stopPrice !== undefined || body.targetPrice !== undefined) {
		await repo.updateLevels(id, body.stopPrice ?? undefined, body.targetPrice ?? undefined);
	}

	const existingNotes = existing.notes as Record<string, unknown>;
	const updatedNotes: Record<string, unknown> = { ...existingNotes };

	if (body.direction !== undefined) {
		updatedNotes.direction = body.direction;
	}
	if (body.catalysts !== undefined) {
		updatedNotes.catalysts = body.catalysts;
	}
	if (body.timeHorizon !== undefined) {
		updatedNotes.timeHorizon = body.timeHorizon;
	}
	if (body.expiresAt !== undefined) {
		updatedNotes.expiresAt = body.expiresAt;
	}

	for (const [key, value] of Object.entries(updatedNotes)) {
		if (value !== existingNotes[key]) {
			await repo.addNotes(id, key, value);
		}
	}

	const updated = await repo.findById(id);
	if (!updated) {
		throw new HTTPException(404, { message: "Thesis not found after update" });
	}
	return c.json(mapThesisToResponse(updated));
});

const invalidateRoute = createRoute({
	method: "post",
	path: "/:id/invalidate",
	request: {
		params: z.object({
			id: z.string(),
		}),
		body: {
			content: {
				"application/json": {
					schema: z.object({
						reason: z.string(),
					}),
				},
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: ThesisSchema,
				},
			},
			description: "Invalidated thesis",
		},
		404: {
			description: "Thesis not found",
		},
	},
	tags: ["Theses"],
});

app.openapi(invalidateRoute, async (c) => {
	const { id } = c.req.valid("param");
	const { reason } = c.req.valid("json");
	const repo = await getThesesRepo();

	const existing = await repo.findById(id);
	if (!existing) {
		throw new HTTPException(404, { message: "Thesis not found" });
	}

	await repo.close(id, "INVALIDATED", undefined, undefined);
	await repo.addNotes(id, "invalidationReason", reason);

	const updated = await repo.findById(id);
	if (!updated) {
		throw new HTTPException(404, { message: "Thesis not found after invalidation" });
	}
	return c.json(mapThesisToResponse(updated));
});

const realizeRoute = createRoute({
	method: "post",
	path: "/:id/realize",
	request: {
		params: z.object({
			id: z.string(),
		}),
		body: {
			content: {
				"application/json": {
					schema: z.object({
						exitPrice: z.number(),
						notes: z.string().optional(),
					}),
				},
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: ThesisSchema,
				},
			},
			description: "Realized thesis",
		},
		404: {
			description: "Thesis not found",
		},
	},
	tags: ["Theses"],
});

app.openapi(realizeRoute, async (c) => {
	const { id } = c.req.valid("param");
	const { exitPrice, notes } = c.req.valid("json");
	const repo = await getThesesRepo();

	const existing = await repo.findById(id);
	if (!existing) {
		throw new HTTPException(404, { message: "Thesis not found" });
	}

	const realizedPnl = existing.entryPrice ? exitPrice - existing.entryPrice : undefined;
	let closeReason: "TARGET_HIT" | "STOP_HIT" | "MANUAL" = "MANUAL";
	if (existing.currentTarget && exitPrice >= existing.currentTarget) {
		closeReason = "TARGET_HIT";
	} else if (existing.currentStop && exitPrice <= existing.currentStop) {
		closeReason = "STOP_HIT";
	}

	await repo.close(id, closeReason, exitPrice, realizedPnl);

	if (notes) {
		await repo.addNotes(id, "realizationNotes", notes);
	}

	const updated = await repo.findById(id);
	if (!updated) {
		throw new HTTPException(404, { message: "Thesis not found after realization" });
	}
	return c.json(mapThesisToResponse(updated));
});

const historyRoute = createRoute({
	method: "get",
	path: "/:id/history",
	request: {
		params: z.object({
			id: z.string(),
		}),
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.array(ThesisHistoryEntrySchema),
				},
			},
			description: "Thesis change history",
		},
		404: {
			description: "Thesis not found",
		},
	},
	tags: ["Theses"],
});

app.openapi(historyRoute, async (c) => {
	const { id } = c.req.valid("param");
	const repo = await getThesesRepo();

	const thesis = await repo.findById(id);
	if (!thesis) {
		throw new HTTPException(404, { message: "Thesis not found" });
	}

	const history = await repo.getHistory(id);
	const historyEntries = history.map((entry) => ({
		id: String(entry.id),
		thesisId: entry.thesisId,
		field: "state",
		oldValue: entry.fromState,
		newValue: entry.toState,
		reason: entry.triggerReason,
		timestamp: entry.createdAt,
	}));

	return c.json(historyEntries);
});

const deleteRoute = createRoute({
	method: "delete",
	path: "/:id",
	request: {
		params: z.object({
			id: z.string(),
		}),
	},
	responses: {
		204: {
			description: "Thesis deleted",
		},
		404: {
			description: "Thesis not found",
		},
	},
	tags: ["Theses"],
});

app.openapi(deleteRoute, async (c) => {
	const { id } = c.req.valid("param");
	const repo = await getThesesRepo();

	const deleted = await repo.delete(id);
	if (!deleted) {
		throw new HTTPException(404, { message: "Thesis not found" });
	}

	return c.body(null, 204);
});

export const thesesRoutes = app;
export default thesesRoutes;
