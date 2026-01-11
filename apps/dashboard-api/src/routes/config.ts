/**
 * Configuration API Routes
 *
 * Re-exports from modular config directory for backward compatibility.
 *
 * @see ./config/index.ts for the main router
 * @see docs/plans/22-self-service-dashboard.md (Phase 2)
 */

export { configRoutes, default } from "./config/index.js";
export * from "./config/types.js";
