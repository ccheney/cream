/**
 * Snapshot Logger Factories
 *
 * Factory functions for creating snapshot loggers.
 */

import { log } from "../logger.js";
import type { SnapshotLogger } from "./types.js";

/**
 * Create a console-based logger (default implementation).
 */
export function createConsoleLogger(): SnapshotLogger {
	return {
		debug(entry) {
			log.debug(
				{ cycleId: entry.cycleId, environment: entry.environment, ...entry.fields },
				entry.message
			);
		},
		info(entry) {
			log.info(
				{ cycleId: entry.cycleId, environment: entry.environment, ...entry.fields },
				entry.message
			);
		},
		warn(entry) {
			log.warn(
				{ cycleId: entry.cycleId, environment: entry.environment, ...entry.fields },
				entry.message
			);
		},
		error(entry) {
			log.error(
				{ cycleId: entry.cycleId, environment: entry.environment, ...entry.fields },
				entry.message
			);
		},
	};
}

/**
 * Create a no-op logger for testing.
 */
export function createNoOpLogger(): SnapshotLogger {
	return {
		debug: () => {},
		info: () => {},
		warn: () => {},
		error: () => {},
	};
}

/**
 * Default logger instance.
 */
export const defaultSnapshotLogger = createConsoleLogger();
