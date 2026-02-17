import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { portfolioService } from "../../services/portfolio.js";
import { OptionsPositionSchema } from "./schemas.js";

const optionsRoute = createRoute({
	method: "get",
	path: "/options",
	responses: {
		200: {
			content: { "application/json": { schema: z.array(OptionsPositionSchema) } },
			description: "Options positions",
		},
	},
	tags: ["Portfolio"],
});

export function registerOptionsRoute(app: OpenAPIHono): void {
	app.openapi(optionsRoute, async (c) => {
		const options = await portfolioService.getOptionsPositions();
		return c.json(options);
	});
}
