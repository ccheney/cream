import { requireEnv } from "@cream/domain";
import type { SyncRunStatus, SyncRunType } from "@cream/storage";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getIndicatorSyncRunsRepo } from "../db.js";
import {
	getRunDetailsData,
	getWorkerStatusServices,
	mapRunToSchema,
	ServiceDisplayNames,
	triggerWorkerService,
	type WorkerService,
} from "./workers.helpers.js";

const app = new OpenAPIHono();

const WorkerServiceSchema = z.enum([
	"macro_watch",
	"newspaper",
	"filings_sync",
	"short_interest",
	"sentiment",
	"corporate_actions",
	"prediction_markets",
]);

const RunStatusSchema = z.enum(["running", "completed", "failed"]);

const LastRunSchema = z.object({
	startedAt: z.string(),
	completedAt: z.string().nullable(),
	status: z.enum(["completed", "failed"]),
	result: z.string().nullable(),
});

const ServiceStatusSchema = z.object({
	name: WorkerServiceSchema,
	displayName: z.string(),
	status: z.enum(["idle", "running"]),
	lastRun: LastRunSchema.nullable(),
	nextRun: z.string().nullable(),
});

const WorkerStatusResponseSchema = z.object({ services: z.array(ServiceStatusSchema) });

const TriggerRequestSchema = z.object({
	symbols: z.array(z.string()).min(1).max(500).optional(),
	priority: z.enum(["normal", "high"]).default("normal"),
});

const TriggerResponseSchema = z.object({
	runId: z.string(),
	status: z.enum(["started", "already_running"]),
	message: z.string(),
});

const WorkerRunSchema = z.object({
	id: z.string(),
	service: WorkerServiceSchema,
	status: RunStatusSchema,
	startedAt: z.string(),
	completedAt: z.string().nullable(),
	duration: z.number().nullable(),
	result: z.string().nullable(),
	error: z.string().nullable(),
});

const WorkerRunsResponseSchema = z.object({ runs: z.array(WorkerRunSchema), total: z.number() });

const ErrorSchema = z.object({ error: z.string(), message: z.string() });

const MacroWatchEntrySchema = z.object({
	id: z.string(),
	timestamp: z.string(),
	session: z.string(),
	category: z.string(),
	headline: z.string(),
	symbols: z.array(z.string()),
	source: z.string(),
});

const NewspaperSchema = z.object({
	id: z.string(),
	date: z.string(),
	compiledAt: z.string(),
	sections: z.record(z.string(), z.unknown()),
	entryCount: z.number(),
});

const IndicatorEntrySchema = z.object({
	symbol: z.string(),
	date: z.string(),
	values: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
});

const PredictionMarketSignalSchema = z.object({
	signalType: z.string(),
	signalValue: z.number(),
	confidence: z.number().nullable(),
	computedAt: z.string(),
});

const RunDetailsResponseSchema = z.object({
	run: WorkerRunSchema,
	data: z.union([
		z.object({ type: z.literal("macro_watch"), entries: z.array(MacroWatchEntrySchema) }),
		z.object({ type: z.literal("newspaper"), newspaper: NewspaperSchema.nullable() }),
		z.object({ type: z.literal("indicators"), entries: z.array(IndicatorEntrySchema) }),
		z.object({
			type: z.literal("prediction_markets"),
			signals: z.array(PredictionMarketSignalSchema),
			snapshotCount: z.number(),
			platforms: z.array(z.string()),
		}),
		z.object({ type: z.literal("empty"), message: z.string() }),
	]),
});

type RunDetailsData = z.infer<typeof RunDetailsResponseSchema>["data"];

const getWorkerStatusRoute = createRoute({
	method: "get",
	path: "/status",
	responses: {
		200: {
			content: { "application/json": { schema: WorkerStatusResponseSchema } },
			description: "Status of all worker services",
		},
		503: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Database service unavailable",
		},
	},
	tags: ["Workers"],
});

app.openapi(getWorkerStatusRoute, async (c) => {
	try {
		const services = await getWorkerStatusServices();
		return c.json({ services }, 200);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		throw new HTTPException(503, { message: `Failed to fetch worker status: ${message}` });
	}
});

const triggerServiceRoute = createRoute({
	method: "post",
	path: "/:service/trigger",
	request: {
		params: z.object({ service: WorkerServiceSchema }),
		body: {
			content: { "application/json": { schema: TriggerRequestSchema } },
			required: false,
		},
	},
	responses: {
		202: {
			content: { "application/json": { schema: TriggerResponseSchema } },
			description: "Service trigger request accepted",
		},
		409: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Service already running",
		},
		503: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Database service unavailable",
		},
	},
	tags: ["Workers"],
});

app.openapi(triggerServiceRoute, async (c) => {
	const { service } = c.req.valid("param");
	const body = await c.req.json().catch(() => ({}));
	const { priority = "normal" } = TriggerRequestSchema.parse(body);
	const environment = requireEnv();
	const workerService = service as WorkerService;

	try {
		const { runId } = await triggerWorkerService(workerService, priority, environment);
		return c.json(
			{
				runId,
				status: "started" as const,
				message: `${ServiceDisplayNames[workerService]} triggered`,
			},
			202,
		);
	} catch (error) {
		if (error instanceof HTTPException) {
			throw error;
		}
		const status = (error as Error & { code?: number }).code;
		if (status === 409) {
			throw new HTTPException(409, {
				message: error instanceof Error ? error.message : "Conflict",
			});
		}
		const message = error instanceof Error ? error.message : "Unknown error";
		throw new HTTPException(503, { message: `Failed to trigger service: ${message}` });
	}
});

const getWorkerRunsRoute = createRoute({
	method: "get",
	path: "/runs",
	request: {
		query: z.object({
			limit: z.coerce.number().min(1).max(100).default(20),
			service: WorkerServiceSchema.optional(),
			status: RunStatusSchema.optional(),
		}),
	},
	responses: {
		200: {
			content: { "application/json": { schema: WorkerRunsResponseSchema } },
			description: "Recent worker runs",
		},
		503: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Database service unavailable",
		},
	},
	tags: ["Workers"],
});

app.openapi(getWorkerRunsRoute, async (c) => {
	const { limit, service, status } = c.req.valid("query");
	try {
		const syncRunsRepo = getIndicatorSyncRunsRepo();
		const filters = {
			runType: service as SyncRunType | undefined,
			status: status as SyncRunStatus | undefined,
		};
		const [syncRuns, total] = await Promise.all([
			syncRunsRepo.findMany(filters, limit),
			syncRunsRepo.countByFilters(filters),
		]);
		return c.json(
			{
				runs: syncRuns
					.map(mapRunToSchema)
					.filter((run): run is NonNullable<typeof run> => run !== null),
				total,
			},
			200,
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		throw new HTTPException(503, { message: `Failed to fetch worker runs: ${message}` });
	}
});

const getWorkerRunRoute = createRoute({
	method: "get",
	path: "/runs/:id",
	request: { params: z.object({ id: z.string() }) },
	responses: {
		200: {
			content: { "application/json": { schema: z.object({ run: WorkerRunSchema }) } },
			description: "Worker run details",
		},
		404: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Run not found",
		},
		503: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Database service unavailable",
		},
	},
	tags: ["Workers"],
});

app.openapi(getWorkerRunRoute, async (c) => {
	const { id } = c.req.valid("param");
	try {
		const syncRun = await getIndicatorSyncRunsRepo().findById(id);
		if (!syncRun) {
			throw new HTTPException(404, { message: `Run ${id} not found` });
		}
		const run = mapRunToSchema(syncRun);
		if (!run) {
			throw new HTTPException(404, { message: `Run ${id} has unknown service type` });
		}
		return c.json({ run }, 200);
	} catch (error) {
		if (error instanceof HTTPException) {
			throw error;
		}
		const message = error instanceof Error ? error.message : "Unknown error";
		throw new HTTPException(503, { message: `Failed to fetch run: ${message}` });
	}
});

const getRunDetailsRoute = createRoute({
	method: "get",
	path: "/runs/:id/details",
	request: { params: z.object({ id: z.string() }) },
	responses: {
		200: {
			content: { "application/json": { schema: RunDetailsResponseSchema } },
			description: "Run details with associated data",
		},
		404: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Run not found",
		},
		503: {
			content: { "application/json": { schema: ErrorSchema } },
			description: "Database service unavailable",
		},
	},
	tags: ["Workers"],
});

app.openapi(getRunDetailsRoute, async (c) => {
	const { id } = c.req.valid("param");
	try {
		const syncRun = await getIndicatorSyncRunsRepo().findById(id);
		if (!syncRun) {
			throw new HTTPException(404, { message: `Run ${id} not found` });
		}
		const run = mapRunToSchema(syncRun);
		if (!run) {
			throw new HTTPException(404, { message: `Run ${id} has unknown service type` });
		}
		const data = await getRunDetailsData(
			run.service,
			syncRun.startedAt,
			syncRun.completedAt ?? new Date().toISOString(),
		);
		const parsedData: RunDetailsData = RunDetailsResponseSchema.shape.data.parse(data);
		return c.json({ run, data: parsedData }, 200);
	} catch (error) {
		if (error instanceof HTTPException) {
			throw error;
		}
		const message = error instanceof Error ? error.message : "Unknown error";
		throw new HTTPException(503, { message: `Failed to fetch run details: ${message}` });
	}
});

export default app;
