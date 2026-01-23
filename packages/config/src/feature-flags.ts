/**
 * Feature Flags
 *
 * Runtime feature flags for gradual migrations and A/B testing.
 * All flags default to false unless explicitly enabled.
 */

/**
 * Use the new Mastra v1.0 app (apps/mastra) instead of the legacy API (apps/api).
 *
 * When enabled:
 * - apps/worker calls apps/mastra directly for agent orchestration
 * - apps/dashboard-api proxies to apps/mastra for workflow endpoints
 *
 * When disabled (default):
 * - apps/worker calls apps/api for agent orchestration
 * - apps/dashboard-api uses apps/api endpoints
 */
export const USE_MASTRA_APP = Bun.env.USE_MASTRA_APP === "true";

/**
 * URL for the Mastra v1.0 API server.
 * Only used when USE_MASTRA_APP is enabled.
 * Defaults to http://localhost:4112 for local development.
 */
export const MASTRA_API_URL = Bun.env.MASTRA_API_URL ?? "http://localhost:4112";

/**
 * Helper to get the appropriate API URL based on feature flag.
 */
export function getAgentApiUrl(dashboardApiUrl: string): string {
	return USE_MASTRA_APP ? MASTRA_API_URL : dashboardApiUrl;
}
