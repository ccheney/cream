/**
 * Shared Infrastructure Exports
 *
 * Common utilities used across bounded contexts.
 */

export { loadConfig, type ReloadConfigDeps, reloadConfig } from "./config-loader.js";
export {
	checkHelixHealth,
	closeDb,
	closeHelixClient,
	getDbClient,
	getHelixClient,
	getRuntimeConfigService,
	HelixDBValidationError,
	resetRuntimeConfigService,
	validateHelixDBAtStartup,
	validateHelixDBOrExit,
} from "./database.js";
export {
	createHealthServer,
	type HealthServerDeps,
	type ServiceTriggers,
	type TriggerResult,
	type WorkerService,
} from "./health-server.js";
export { log } from "./logger.js";
export {
	type CompleteRunOptions,
	type RecordRunOptions,
	type RunRecordResult,
	recordRunComplete,
	recordRunStart,
} from "./run-recorder.js";
