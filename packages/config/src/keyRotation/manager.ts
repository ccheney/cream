/**
 * KeyRotationManager - Manages API keys for a service with rotation support.
 */

import {
  selectHealthiest,
  selectLeastUsed,
  selectRateLimitAware,
  selectRoundRobin,
} from "./strategies.js";
import type {
  ApiKey,
  ApiService,
  KeyRotationConfig,
  KeyRotationLogger,
  KeyStats,
} from "./types.js";
import { DEFAULT_CONFIG, DEFAULT_LOGGER } from "./types.js";

/**
 * Manages API keys for a service with rotation support.
 */
export class KeyRotationManager {
  private keys: ApiKey[] = [];
  private currentIndex = 0;
  private consecutiveErrors = 0;
  private readonly config: KeyRotationConfig;
  private readonly serviceName: ApiService;
  private readonly logger: KeyRotationLogger;

  constructor(
    serviceName: ApiService,
    config: Partial<KeyRotationConfig> = {},
    logger?: KeyRotationLogger
  ) {
    this.serviceName = serviceName;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger ?? DEFAULT_LOGGER;
  }

  /**
   * Add a key to the rotation pool.
   */
  addKey(key: string, name?: string): void {
    if (this.keys.some((k) => k.key === key)) {
      this.logger.warn(`Duplicate key for ${this.serviceName}`, { name });
      return;
    }

    this.keys.push({
      key,
      name,
      active: true,
      requestCount: 0,
      errorCount: 0,
      addedAt: new Date(),
    });

    this.logger.info(`Added key to ${this.serviceName}`, {
      name,
      totalKeys: this.keys.length,
    });
  }

  /**
   * Add multiple keys from environment variable.
   * Supports comma-separated keys: "key1,key2,key3"
   */
  addKeysFromEnv(envValue: string | undefined, envName: string): void {
    if (!envValue) {
      return;
    }

    const keys = envValue
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key) {
        this.addKey(key, `${envName}_${i + 1}`);
      }
    }
  }

  /**
   * Get the next key based on the rotation strategy.
   */
  getKey(): string | null {
    const activeKeys = this.keys.filter((k) => k.active);

    if (activeKeys.length === 0) {
      this.tryRecoverUnhealthyKeys();
      const recovered = this.keys.filter((k) => k.active);
      if (recovered.length === 0) {
        this.logger.error(`No active keys for ${this.serviceName}`);
        return null;
      }
    }

    const key = this.selectKey();
    if (key) {
      key.requestCount++;
      key.lastUsed = new Date();
    }

    return key?.key ?? null;
  }

  /**
   * Report a successful request.
   */
  reportSuccess(key: string): void {
    const apiKey = this.keys.find((k) => k.key === key);
    if (apiKey) {
      this.consecutiveErrors = 0;
      apiKey.lastError = undefined;
    }
  }

  /**
   * Report a failed request.
   */
  reportError(key: string, error: string): void {
    const apiKey = this.keys.find((k) => k.key === key);
    if (!apiKey) {
      return;
    }

    apiKey.errorCount++;
    apiKey.lastError = error;
    this.consecutiveErrors++;

    if (this.consecutiveErrors >= this.config.maxConsecutiveErrors) {
      apiKey.active = false;
      this.consecutiveErrors = 0;

      this.logger.warn(`Key marked unhealthy for ${this.serviceName}`, {
        name: apiKey.name,
        errorCount: apiKey.errorCount,
        error,
      });

      this.rotateToNext();
    }
  }

  /**
   * Report rate limit status for a key.
   */
  reportRateLimit(key: string, remaining: number, resetTime?: Date): void {
    const apiKey = this.keys.find((k) => k.key === key);
    if (!apiKey) {
      return;
    }

    apiKey.rateLimitRemaining = remaining;
    apiKey.rateLimitReset = resetTime;

    if (this.config.autoRotateOnRateLimit && remaining < this.config.minRateLimitThreshold) {
      this.logger.info(`Rate limit low for ${this.serviceName}, rotating`, {
        name: apiKey.name,
        remaining,
      });
      this.rotateToNext();
    }
  }

  /**
   * Get statistics for all keys.
   */
  getStats(): KeyStats {
    const active = this.keys.filter((k) => k.active);
    const unhealthy = this.keys.filter((k) => !k.active);
    const totalRequests = this.keys.reduce((sum, k) => sum + k.requestCount, 0);
    const totalErrors = this.keys.reduce((sum, k) => sum + k.errorCount, 0);

    return {
      service: this.serviceName,
      totalKeys: this.keys.length,
      activeKeys: active.length,
      unhealthyKeys: unhealthy.length,
      totalRequests,
      totalErrors,
      errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
      currentKeyIndex: this.currentIndex,
      keys: this.keys.map((k) => ({
        name: k.name ?? "unnamed",
        active: k.active,
        requestCount: k.requestCount,
        errorCount: k.errorCount,
        rateLimitRemaining: k.rateLimitRemaining,
      })),
    };
  }

  /**
   * Reset statistics for all keys.
   */
  resetStats(): void {
    for (const key of this.keys) {
      key.requestCount = 0;
      key.errorCount = 0;
      key.lastError = undefined;
    }
  }

  /**
   * Get number of active keys.
   */
  getActiveKeyCount(): number {
    return this.keys.filter((k) => k.active).length;
  }

  /**
   * Check if any keys are available.
   */
  hasKeys(): boolean {
    return this.keys.length > 0;
  }

  private selectKey(): ApiKey | null {
    const activeKeys = this.keys.filter((k) => k.active);
    if (activeKeys.length === 0) {
      return null;
    }

    switch (this.config.strategy) {
      case "round-robin": {
        const result = selectRoundRobin(activeKeys, this.currentIndex);
        this.currentIndex = result.nextIndex;
        return result.key;
      }
      case "least-used":
        return selectLeastUsed(activeKeys);
      case "healthiest":
        return selectHealthiest(activeKeys);
      case "rate-limit-aware":
        return selectRateLimitAware(activeKeys);
      default:
        return activeKeys[0] ?? null;
    }
  }

  private rotateToNext(): void {
    const activeKeys = this.keys.filter((k) => k.active);
    if (activeKeys.length > 0) {
      this.currentIndex = (this.currentIndex + 1) % activeKeys.length;
    }
  }

  private tryRecoverUnhealthyKeys(): void {
    const now = Date.now();
    const unhealthy = this.keys.filter((k) => !k.active);

    for (const key of unhealthy) {
      const lastUsedTime = key.lastUsed?.getTime() ?? 0;
      const timeSinceLastUse = now - lastUsedTime;

      if (timeSinceLastUse >= this.config.unhealthyRetryMs) {
        key.active = true;
        key.errorCount = 0;
        this.logger.info(`Recovered unhealthy key for ${this.serviceName}`, {
          name: key.name,
        });
      }
    }
  }
}
