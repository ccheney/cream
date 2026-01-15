/**
 * Monitoring Bounded Context
 *
 * Position monitoring and expiration handling for options positions.
 */

export {
	buildExpiringPosition,
	classifyPositionType,
	evaluateExpirationAction,
} from "./evaluation.js";
export {
	createExpirationMonitor,
	ExpirationMonitor,
} from "./expiration-monitor.js";
export type {
	ExpirationMonitorState,
	PortfolioPosition,
	ScheduledExpirationAction,
	UnderlyingQuote,
} from "./types.js";
