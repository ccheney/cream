/**
 * Secrets Manager
 *
 * Centralized secrets manager with caching, fallback providers, and audit logging.
 */

import type {
	CachedSecretEntry,
	SecretAuditEvent,
	SecretsLogger,
	SecretsManagerConfig,
} from "./types.js";
import { DEFAULT_LOGGER, DEFAULT_MANAGER_CONFIG } from "./types.js";

/**
 * Centralized secrets manager with caching, fallback, and audit logging.
 */
export class SecretsManager {
	private readonly config: SecretsManagerConfig;
	private readonly logger: SecretsLogger;
	private cache = new Map<string, CachedSecretEntry>();

	constructor(config: SecretsManagerConfig) {
		this.config = { ...DEFAULT_MANAGER_CONFIG, ...config };
		this.logger = config.logger ?? DEFAULT_LOGGER;
	}

	/**
	 * Get a secret by key.
	 */
	async get(key: string): Promise<string | null> {
		const cached = this.getFromCache(key);
		if (cached !== null) {
			this.audit("cache_hit", key, this.config.provider.name, true);
			return cached;
		}

		this.audit("cache_miss", key, this.config.provider.name, true);

		try {
			const value = await this.config.provider.get(key);
			if (value !== null) {
				this.cacheSecret(key, value, this.config.provider.name);
				this.audit("get", key, this.config.provider.name, true);
				return value;
			}
		} catch (error) {
			this.logger.warn(`Primary provider failed for ${key}`, {
				provider: this.config.provider.name,
				error: error instanceof Error ? error.message : "Unknown",
			});
		}

		for (const provider of this.config.fallbackProviders ?? []) {
			try {
				const value = await provider.get(key);
				if (value !== null) {
					this.cacheSecret(key, value, provider.name);
					this.audit("get", key, provider.name, true);
					return value;
				}
			} catch (error) {
				this.logger.warn(`Fallback provider failed for ${key}`, {
					provider: provider.name,
					error: error instanceof Error ? error.message : "Unknown",
				});
			}
		}

		this.audit("get", key, "all", false);
		return null;
	}

	/**
	 * Get a secret, throwing if not found.
	 */
	async getOrThrow(key: string): Promise<string> {
		const value = await this.get(key);
		if (value === null) {
			throw new Error(`Secret not found: ${key}`);
		}
		return value;
	}

	/**
	 * Get multiple secrets at once.
	 */
	async getMany(keys: string[]): Promise<Record<string, string | null>> {
		const results: Record<string, string | null> = {};

		await Promise.all(
			keys.map(async (key) => {
				results[key] = await this.get(key);
			})
		);

		return results;
	}

	/**
	 * Check if a secret exists.
	 */
	async has(key: string): Promise<boolean> {
		return (await this.get(key)) !== null;
	}

	/**
	 * Refresh the cache for a specific key.
	 */
	async refresh(key: string): Promise<void> {
		this.cache.delete(key);
		await this.get(key);
		this.audit("refresh", key, this.config.provider.name, true);
	}

	/**
	 * Clear the entire cache.
	 */
	clearCache(): void {
		this.cache.clear();
		this.logger.info("Cache cleared");
	}

	/**
	 * Get cache statistics.
	 */
	getCacheStats(): { size: number; keys: string[] } {
		return {
			size: this.cache.size,
			keys: Array.from(this.cache.keys()),
		};
	}

	/**
	 * Check health of all providers.
	 */
	async healthCheck(): Promise<Record<string, boolean>> {
		const results: Record<string, boolean> = {};

		results[this.config.provider.name] = await this.config.provider.healthCheck();

		for (const provider of this.config.fallbackProviders ?? []) {
			results[provider.name] = await provider.healthCheck();
		}

		return results;
	}

	private getFromCache(key: string): string | null {
		const entry = this.cache.get(key);

		if (!entry) {
			return null;
		}

		if (Date.now() > entry.expiresAt) {
			this.cache.delete(key);
			return null;
		}

		return entry.secret.value;
	}

	private cacheSecret(key: string, value: string, source: string): void {
		if (this.config.cacheTtlMs <= 0) {
			return;
		}

		this.cache.set(key, {
			secret: {
				value,
				retrievedAt: new Date(),
				source,
			},
			expiresAt: Date.now() + this.config.cacheTtlMs,
		});
	}

	private audit(
		action: SecretAuditEvent["action"],
		key: string | undefined,
		provider: string,
		success: boolean,
		error?: string
	): void {
		if (!this.config.auditEnabled) {
			return;
		}

		const event: SecretAuditEvent = {
			action,
			key,
			provider,
			success,
			timestamp: new Date(),
			error,
		};

		if (this.config.onAudit) {
			this.config.onAudit(event);
		}

		if (!success) {
			this.logger.warn("Secret access failed", { action, key, provider });
		}
	}
}
