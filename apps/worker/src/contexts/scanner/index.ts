/**
 * Scanner Bounded Context
 *
 * Scanner alert ingestion, batching, and cycle triggering.
 */

export {
	AlertBatcher,
	type AlertBatcherConfig,
	type AlertBatcherStatus,
	createAlertBatcher,
} from "./alert-batcher.js";
export {
	createScannerAlertClient,
	type ScannerAlertClientConfig,
	type ScannerAlertClientPort,
	type ScannerAlertStreamOptions,
	ScannerAlertClient,
} from "./scanner-alert-client.js";
export {
	createScannerTriggerService,
	type ScannerAlert,
	type ScannerTriggerServiceConfig,
	type ScannerTriggerServiceDeps,
	ScannerTriggerService,
} from "./scanner-trigger-service.js";
