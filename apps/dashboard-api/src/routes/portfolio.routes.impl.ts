/**
 * Portfolio Routes
 *
 * Endpoints for portfolio summary, positions, and performance metrics.
 *
 * @see docs/plans/ui/05-api-endpoints.md
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import { registerAccountRoute } from "./portfolio/account.route.js";
import { registerClosedTradesRoute } from "./portfolio/closed-trades.route.js";
import { registerEquityRoutes } from "./portfolio/equity.route.js";
import { registerHistoryRoute } from "./portfolio/history.route.js";
import { registerOptionsRoute } from "./portfolio/options.route.js";
import { registerOrdersRoute } from "./portfolio/orders.route.js";
import { registerPerformanceRoute } from "./portfolio/performance.route.js";
import { registerPositionsRoutes } from "./portfolio/positions.route.js";
import { registerSummaryRoute } from "./portfolio/summary.route.js";

const app = new OpenAPIHono();

registerSummaryRoute(app);
registerOptionsRoute(app);
registerPositionsRoutes(app);
registerEquityRoutes(app);
registerPerformanceRoute(app);
registerAccountRoute(app);
registerHistoryRoute(app);
registerOrdersRoute(app);
registerClosedTradesRoute(app);

export default app;
