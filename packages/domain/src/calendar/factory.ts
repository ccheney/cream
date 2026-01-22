/**
 * Calendar Service Factory
 *
 * Factory for creating CalendarService instances.
 * Creates AlpacaCalendarService which requires credentials.
 *
 * @see docs/plans/02-data-layer.md - Session and Calendar Handling
 */

import { type CreamEnvironment, requireEnv } from "../env";
import {
	AlpacaCalendarService,
	type AlpacaCalendarServiceConfig,
	CalendarServiceError,
} from "./service";
import type { CalendarService } from "./types";

// ============================================
// Types
// ============================================

/**
 * Options for creating a CalendarService.
 */
export interface CalendarServiceFactoryOptions {
	/** Trading environment (uses CREAM_ENV if not provided) */
	mode?: CreamEnvironment;
	/** Alpaca API key (uses ALPACA_KEY if not provided) */
	alpacaKey?: string;
	/** Alpaca API secret (uses ALPACA_SECRET if not provided) */
	alpacaSecret?: string;
	/** Years to preload (default: current + next year) */
	preloadYears?: number[];
}

// ============================================
// Error Types
// ============================================

/**
 * Error thrown when CalendarService is not configured properly.
 */
export class CalendarConfigError extends Error {
	constructor(
		public readonly missingVar: string,
		public readonly mode: CreamEnvironment,
	) {
		super(
			`CalendarService in ${mode} mode requires ${missingVar}. ` +
				`Set ${missingVar} environment variable.`,
		);
		this.name = "CalendarConfigError";
	}
}

// ============================================
// Singleton Management
// ============================================

/** Singleton instance */
let calendarServiceInstance: CalendarService | null = null;

/** Initialization promise to prevent concurrent initialization */
let initializationPromise: Promise<CalendarService> | null = null;

/**
 * Get the singleton CalendarService instance.
 *
 * @returns The singleton CalendarService, or null if not initialized
 *
 * @example
 * ```ts
 * await initCalendarService();
 * const service = getCalendarService();
 * const isOpen = await service.isMarketOpen();
 * ```
 */
export function getCalendarService(): CalendarService | null {
	return calendarServiceInstance;
}

/**
 * Get the singleton CalendarService instance, throwing if not initialized.
 *
 * @returns The singleton CalendarService
 * @throws CalendarServiceError if not initialized
 *
 * @example
 * ```ts
 * await initCalendarService();
 * const service = requireCalendarService();
 * const isOpen = await service.isMarketOpen();
 * ```
 */
export function requireCalendarService(): CalendarService {
	if (!calendarServiceInstance) {
		throw new CalendarServiceError(
			"CalendarService not initialized. Call initCalendarService() first.",
			"NOT_INITIALIZED",
		);
	}
	return calendarServiceInstance;
}

/**
 * Initialize the singleton CalendarService.
 *
 * Creates or returns the existing singleton instance. Safe to call multiple times.
 * Returns immediately if already initialized.
 *
 * @param options - Factory options
 * @returns The singleton CalendarService
 *
 * @example
 * ```ts
 * // Initialize at app startup
 * await initCalendarService();
 *
 * // Get instance anywhere
 * const service = requireCalendarService();
 * ```
 */
export async function initCalendarService(
	options: CalendarServiceFactoryOptions = {},
): Promise<CalendarService> {
	// Return existing instance
	if (calendarServiceInstance) {
		return calendarServiceInstance;
	}

	// Prevent concurrent initialization
	if (initializationPromise) {
		return initializationPromise;
	}

	initializationPromise = createCalendarService(options);

	try {
		calendarServiceInstance = await initializationPromise;
		return calendarServiceInstance;
	} finally {
		initializationPromise = null;
	}
}

/**
 * Reset the singleton CalendarService.
 *
 * Useful for testing or when reconfiguration is needed.
 * Does NOT throw if not initialized.
 *
 * @example
 * ```ts
 * // In tests
 * resetCalendarService();
 * await initCalendarService();
 * ```
 */
export function resetCalendarService(): void {
	calendarServiceInstance = null;
	initializationPromise = null;
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a new CalendarService instance.
 *
 * Creates AlpacaCalendarService which requires API credentials.
 *
 * @param options - Factory options
 * @returns Initialized CalendarService
 * @throws CalendarConfigError if credentials are missing
 *
 * @example
 * ```ts
 * // Uses CREAM_ENV and ALPACA_* env vars
 * const service = await createCalendarService();
 *
 * // Explicit configuration
 * const service = await createCalendarService({
 *   mode: "PAPER",
 *   alpacaKey: "pk_xxx",
 *   alpacaSecret: "sk_xxx",
 * });
 * ```
 */
export async function createCalendarService(
	options: CalendarServiceFactoryOptions = {},
): Promise<CalendarService> {
	const mode = options.mode ?? requireEnv();

	const apiKey = options.alpacaKey ?? Bun.env.ALPACA_KEY;
	const apiSecret = options.alpacaSecret ?? Bun.env.ALPACA_SECRET;

	if (!apiKey) {
		throw new CalendarConfigError("ALPACA_KEY", mode);
	}

	if (!apiSecret) {
		throw new CalendarConfigError("ALPACA_SECRET", mode);
	}

	// Determine Alpaca environment based on mode
	const alpacaEnvironment = mode === "LIVE" ? "LIVE" : "PAPER";

	const config: AlpacaCalendarServiceConfig = {
		apiKey,
		apiSecret,
		environment: alpacaEnvironment,
		preloadYears: options.preloadYears,
	};

	const service = new AlpacaCalendarService(config);
	await service.initialize(config.preloadYears);
	return service;
}

/**
 * Check if CalendarService is available for the current environment.
 *
 * @param options - Factory options
 * @returns true if service can be created (credentials present)
 */
export function isCalendarServiceAvailable(options: CalendarServiceFactoryOptions = {}): boolean {
	const apiKey = options.alpacaKey ?? Bun.env.ALPACA_KEY;
	const apiSecret = options.alpacaSecret ?? Bun.env.ALPACA_SECRET;

	return Boolean(apiKey && apiSecret);
}
