/**
 * Routes Index
 *
 * Exports all route modules for mounting in the main app.
 *
 * ## Known Issue: @hono/zod-openapi Multi-Response Type Inference
 *
 * Many routes use `@ts-expect-error` to suppress TypeScript errors when routes
 * define multiple response status codes (e.g., 200 + 404). This is a known
 * limitation in @hono/zod-openapi's type system.
 *
 * ### Root Cause
 * When a route defines multiple responses (e.g., 200 success + 404 not found),
 * TypeScript cannot properly infer the union type for the handler's return value.
 * The type system produces `Promise<never>` instead of the expected response union,
 * causing TS2345 errors on the `app.openapi()` call.
 *
 * ### Current Workaround
 * We use `@ts-expect-error` with a descriptive comment on each affected handler.
 * This allows the code to compile while maintaining runtime type safety through
 * Zod validation.
 *
 * ### Version Information
 * - Current: @hono/zod-openapi ^0.19.0 (installed: 0.19.10)
 * - Latest available: @hono/zod-openapi 1.2.0 (as of Jan 2025)
 *
 * ### Upgrade Path
 * The 1.x release includes TypeScript improvements but does NOT fully resolve
 * this multi-response inference issue. The maintainers have acknowledged this
 * as a structural limitation (see GitHub issues #1403, #1410). Key findings:
 *
 * 1. Issue #1403: Fixed by ensuring `strict: true` in tsconfig (we already have this)
 * 2. Issue #1410: Maintainer states "You should not use RouteHandler directly"
 *
 * Upgrading to 1.x may reduce some suppressions but will not eliminate all.
 * A future version may provide better discriminated union support for responses.
 *
 * ### Affected Patterns
 * Routes with single response (200 only): No suppression needed
 * Routes with multiple responses (200 + 404/400): Suppression required
 *
 * @see https://github.com/honojs/middleware/issues/1403
 * @see https://github.com/honojs/middleware/issues/1410
 */

export { default as adminRoutes } from "./admin.js";
export { default as agentsRoutes } from "./agents.js";
export { default as aiRoutes } from "./ai.js";
export { default as alertsRoutes } from "./alerts.js";
export { default as batchStatusRoutes } from "./batch-status.js";
export { default as batchTriggerRoutes } from "./batch-trigger.js";
export { default as calendarRoutes } from "./calendar.js";
export { default as configRoutes } from "./config.js";
export { default as cyclesRoutes } from "./cycles.js";
export { default as decisionsRoutes } from "./decisions.js";
export { default as economicCalendarRoutes } from "./economic-calendar.js";
export { default as filingsRoutes } from "./filings.js";
export { default as indicatorsRoutes } from "./indicators.js";
export { default as marketRoutes } from "./market.js";
export { default as optionsRoutes } from "./options.js";
export { default as portfolioRoutes } from "./portfolio.js";
export { default as preferencesRoutes } from "./preferences.js";
export { default as factorZooRoutes } from "./factor-zoo.js";
export { default as riskRoutes } from "./risk.js";
export { default as searchRoutes } from "./search.js";
export { default as snapshotsRoutes } from "./snapshots.js";
export { default as systemRoutes } from "./system.js";
export { default as thesesRoutes } from "./theses.js";
export { default as workersRoutes } from "./workers.js";
