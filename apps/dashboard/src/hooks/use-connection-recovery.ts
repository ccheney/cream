"use client";

import useConnectionRecovery from "./use-connection-recovery.core.logic";

export { useConnectionRecovery };

export {
	type BackoffConfig,
	type ConnectionError,
	type ConnectionErrorType,
	type ConnectionState,
	type ConnectionStatusInfo,
	calculateBackoffDelay,
	classifyHttpError,
	createConnectionError,
	DEFAULT_BACKOFF,
	DEFAULT_HEARTBEAT,
	getErrorMessage,
	type HeartbeatConfig,
	type UseConnectionRecoveryOptions,
	type UseConnectionRecoveryReturn,
	useConnectionStatusInfo,
} from "./use-connection-recovery.utils";

export default useConnectionRecovery;
