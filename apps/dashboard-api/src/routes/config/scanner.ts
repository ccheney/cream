/**
 * Scanner Configuration Routes
 *
 * Endpoints for managing autonomous scanner configuration.
 */

import { RuntimeConfigError, type RuntimeScannerConfig } from "@cream/config";
import { createScannerClient } from "@cream/domain/grpc";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { getRuntimeConfigService } from "../../db.js";
import {
	EnvironmentQuerySchema,
	ErrorResponseSchema,
	getEnvironment,
	ScannerConfigInputSchema,
	ScannerConfigSchema,
	ScannerStatusSchema,
} from "./types.js";

const app = new OpenAPIHono();

function requireStreamProxyUrl(): string {
	const streamProxyUrl = Bun.env.STREAM_PROXY_URL;
	if (!streamProxyUrl) {
		throw new Error("STREAM_PROXY_URL environment variable is required.");
	}
	return streamProxyUrl;
}

const scannerGrpcClient = createScannerClient(requireStreamProxyUrl(), {
	enableLogging: false,
	maxRetries: 1,
});

// ============================================
// GET /scanner - Get scanner configuration
// ============================================

const getScannerRoute = createRoute({
	method: "get",
	path: "/scanner",
	request: {
		query: EnvironmentQuerySchema,
	},
	responses: {
		200: {
			content: { "application/json": { schema: ScannerConfigSchema } },
			description: "Scanner configuration",
		},
		404: {
			content: { "application/json": { schema: ErrorResponseSchema } },
			description: "No active configuration found",
		},
	},
	tags: ["Config"],
});

app.openapi(getScannerRoute, async (c) => {
	const environment = getEnvironment(c);
	try {
		const service = await getRuntimeConfigService();
		const config = await service.getDraft(environment);
		return c.json(config.scanner, 200);
	} catch (err) {
		if (err instanceof RuntimeConfigError && err.code === "NOT_SEEDED") {
			return c.json({ error: err.message, code: err.code }, 404);
		}
		throw err;
	}
});

// ============================================
// GET /scanner/status - Get live scanner runtime status
// ============================================

const getScannerStatusRoute = createRoute({
	method: "get",
	path: "/scanner/status",
	responses: {
		200: {
			content: { "application/json": { schema: ScannerStatusSchema } },
			description: "Scanner runtime status",
		},
		503: {
			content: { "application/json": { schema: ErrorResponseSchema } },
			description: "Scanner service unavailable",
		},
	},
	tags: ["Config"],
});

app.openapi(getScannerStatusRoute, async (c) => {
	try {
		const status = await scannerGrpcClient.getScannerStatus();
		return c.json(
			{
				active: status.data.active,
				symbolsTracked: status.data.symbolsTracked,
				totalAlerts: Number(status.data.totalAlerts),
				alertsLastHour: Number(status.data.alertsLastHour),
			},
			200,
		);
	} catch (error) {
		return c.json(
			{
				error: error instanceof Error ? error.message : "Scanner status unavailable",
				code: "SERVICE_UNAVAILABLE",
			},
			503,
		);
	}
});

// ============================================
// PUT /scanner - Update scanner config (saves as draft)
// ============================================

const updateScannerRoute = createRoute({
	method: "put",
	path: "/scanner",
	request: {
		query: EnvironmentQuerySchema,
		body: {
			content: { "application/json": { schema: ScannerConfigInputSchema } },
		},
	},
	responses: {
		200: {
			content: { "application/json": { schema: ScannerConfigSchema } },
			description: "Updated scanner configuration",
		},
		404: {
			content: { "application/json": { schema: ErrorResponseSchema } },
			description: "No active configuration to base draft on",
		},
	},
	tags: ["Config"],
});

app.openapi(updateScannerRoute, async (c) => {
	const environment = getEnvironment(c);
	const scanner = c.req.valid("json");

	try {
		const service = await getRuntimeConfigService();
		const updated = await service.saveDraft(environment, {
			scanner: scanner as Partial<RuntimeScannerConfig>,
		});
		return c.json(updated.scanner, 200);
	} catch (err) {
		if (err instanceof RuntimeConfigError && err.code === "NOT_SEEDED") {
			return c.json({ error: err.message, code: err.code }, 404);
		}
		throw err;
	}
});

export const scannerRoutes = app;
export default scannerRoutes;
