import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { getPortfolioSnapshotsRepo } from "../../db.js";
import { getCurrentEnvironment } from "../system.js";
import { EquityPointSchema } from "./schemas.js";

const equityCurveRoute = createRoute({
	method: "get",
	path: "/equity-curve",
	request: {
		query: z.object({
			from: z.string().optional(),
			to: z.string().optional(),
			limit: z.coerce.number().min(1).max(1000).default(100),
		}),
	},
	responses: {
		200: {
			content: { "application/json": { schema: z.array(EquityPointSchema) } },
			description: "Equity curve history",
		},
	},
	tags: ["Portfolio"],
});

const equityRoute = createRoute({
	method: "get",
	path: "/equity",
	request: {
		query: z.object({
			days: z.coerce.number().min(1).max(365).default(30),
		}),
	},
	responses: {
		200: {
			content: { "application/json": { schema: z.array(EquityPointSchema) } },
			description: "Equity curve for specified number of days",
		},
	},
	tags: ["Portfolio"],
});

function mapSnapshotsToDrawdownSeries(snapshots: Array<{ timestamp: string; nav: number }>) {
	let peak = 0;
	return snapshots.map((snapshot) => {
		peak = Math.max(peak, snapshot.nav);
		const drawdown = peak - snapshot.nav;
		const drawdownPct = peak > 0 ? (drawdown / peak) * 100 : 0;
		return {
			timestamp: snapshot.timestamp,
			nav: snapshot.nav,
			drawdown,
			drawdownPct,
		};
	});
}

export function registerEquityRoutes(app: OpenAPIHono): void {
	app.openapi(equityCurveRoute, async (c) => {
		const query = c.req.valid("query");
		const repo = await getPortfolioSnapshotsRepo();
		const snapshots = await repo.findMany(
			{
				environment: getCurrentEnvironment(),
				fromDate: query.from,
				toDate: query.to,
			},
			{ page: 1, pageSize: query.limit },
		);
		return c.json(mapSnapshotsToDrawdownSeries(snapshots.data));
	});

	app.openapi(equityRoute, async (c) => {
		const { days } = c.req.valid("query");
		const repo = await getPortfolioSnapshotsRepo();

		const fromDate = new Date();
		fromDate.setDate(fromDate.getDate() - days);

		const snapshots = await repo.findMany(
			{
				environment: getCurrentEnvironment(),
				fromDate: fromDate.toISOString().split("T")[0],
			},
			{ page: 1, pageSize: days + 1 },
		);
		return c.json(mapSnapshotsToDrawdownSeries(snapshots.data));
	});
}
