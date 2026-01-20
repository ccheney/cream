/**
 * KeyRotationRegistry - Registry for managing key rotation across all services.
 */

import { KeyRotationManager } from "./manager.js";
import type { ApiService, KeyRotationConfig, KeyRotationLogger, KeyStats } from "./types.js";
import { DEFAULT_LOGGER } from "./types.js";

/**
 * Registry for managing key rotation across all services.
 */
export class KeyRotationRegistry {
	private managers = new Map<ApiService, KeyRotationManager>();
	private readonly config: Partial<KeyRotationConfig>;
	private readonly logger: KeyRotationLogger;

	constructor(config: Partial<KeyRotationConfig> = {}, logger?: KeyRotationLogger) {
		this.config = config;
		this.logger = logger ?? DEFAULT_LOGGER;
	}

	/**
	 * Get or create a manager for a service.
	 */
	getManager(service: ApiService): KeyRotationManager {
		let manager = this.managers.get(service);

		if (!manager) {
			manager = new KeyRotationManager(service, this.config, this.logger);
			this.managers.set(service, manager);
		}

		return manager;
	}

	/**
	 * Initialize managers from environment variables.
	 * Supports comma-separated keys for rotation.
	 */
	initFromEnv(): void {
		this.getManager("alpaca").addKeysFromEnv(Bun.env.ALPACA_KEY, "ALPACA_KEY");
	}

	/**
	 * Get statistics for all services.
	 */
	getAllStats(): KeyStats[] {
		return Array.from(this.managers.values()).map((m) => m.getStats());
	}

	/**
	 * Get a key for a service.
	 */
	getKey(service: ApiService): string | null {
		return this.getManager(service).getKey();
	}

	/**
	 * Report success for a service key.
	 */
	reportSuccess(service: ApiService, key: string): void {
		this.getManager(service).reportSuccess(key);
	}

	/**
	 * Report error for a service key.
	 */
	reportError(service: ApiService, key: string, error: string): void {
		this.getManager(service).reportError(key, error);
	}

	/**
	 * Report rate limit for a service key.
	 */
	reportRateLimit(service: ApiService, key: string, remaining: number, resetTime?: Date): void {
		this.getManager(service).reportRateLimit(key, remaining, resetTime);
	}
}

/**
 * Create a key rotation registry initialized from environment variables.
 */
export function createKeyRotationRegistry(
	config?: Partial<KeyRotationConfig>
): KeyRotationRegistry {
	const registry = new KeyRotationRegistry(config);
	registry.initFromEnv();
	return registry;
}
