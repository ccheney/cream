/**
 * System Control Routes
 *
 * Endpoints for system status, start/stop controls, and environment management.
 * Re-exports from modular system routes for backward compatibility.
 *
 * @see docs/plans/ui/05-api-endpoints.md
 */

export {
	default,
	getCurrentEnvironment,
	getRunningCycles,
	getSystemState,
	setSystemStatus,
} from "./system/index.js";
export type { CycleState, ServiceHealth, SystemState } from "./system/types.js";
