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
	ScannerAlertClient,
	type ScannerAlertClientConfig,
	type ScannerAlertClientPort,
	type ScannerAlertStreamOptions,
} from "./scanner-alert-client.js";
export {
	createScannerTriggerService,
	type ScannerAlert,
	ScannerTriggerService,
	type ScannerTriggerServiceConfig,
	type ScannerTriggerServiceDeps,
} from "./scanner-trigger-service.js";
