import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import log from "../../logger.js";

const app = new OpenAPIHono();

const FrontendErrorPayloadSchema = z.object({
	source: z.enum(["error", "global-error"]),
	message: z.string().min(1),
	digest: z.string().optional(),
	stack: z.string().optional(),
	pathname: z.string().optional(),
	userAgent: z.string().optional(),
	timestamp: z.string().datetime(),
});

const FrontendErrorAckSchema = z.object({
	accepted: z.literal(true),
});

const reportFrontendErrorRoute = createRoute({
	method: "post",
	path: "/frontend-errors",
	request: {
		body: {
			content: {
				"application/json": {
					schema: FrontendErrorPayloadSchema,
				},
			},
		},
	},
	responses: {
		202: {
			content: {
				"application/json": {
					schema: FrontendErrorAckSchema,
				},
			},
			description: "Frontend error accepted for ingestion",
		},
	},
	tags: ["System"],
});

app.openapi(reportFrontendErrorRoute, async (c) => {
	const payload = c.req.valid("json");
	log.error(
		{
			source: payload.source,
			message: payload.message,
			digest: payload.digest,
			pathname: payload.pathname,
			userAgent: payload.userAgent,
			stack: payload.stack,
			timestamp: payload.timestamp,
		},
		"Frontend error reported",
	);

	return c.json({ accepted: true }, 202);
});

export default app;
