/**
 * API Key Rotation Strategy
 *
 * Manages multiple API keys per service for:
 * - Rate limit distribution across keys
 * - Graceful handling of key expiration/invalidation
 * - Health monitoring and automatic rotation
 * - Fallback to backup keys on failure
 *
 * @see docs/plans/11-configuration.md
 */

// ============================================
// Types
// ============================================

/**
 * Service that requires API keys.
 */
export type ApiService =
  | "polygon"
  | "alphavantage"
  | "fmp"
  | "databento"
  | "alpaca";

/**
 * API key with metadata.
 */
export interface ApiKey {
  /** The API key value */
  key: string;
  /** Optional name/label for the key */
  name?: string;
  /** Whether this key is currently active */
  active: boolean;
  /** Number of requests made with this key */
  requestCount: number;
  /** Number of errors with this key */
  errorCount: number;
  /** Last time this key was used */
  lastUsed?: Date;
  /** Last error message */
  lastError?: string;
  /** When the key was added */
  addedAt: Date;
  /** Rate limit remaining (if known) */
  rateLimitRemaining?: number;
  /** Rate limit reset time (if known) */
  rateLimitReset?: Date;
}

/**
 * Key rotation strategy.
 */
export type RotationStrategy =
  | "round-robin"      // Rotate through keys sequentially
  | "least-used"       // Use the key with fewest requests
  | "healthiest"       // Use the key with lowest error rate
  | "rate-limit-aware" // Use key with most remaining rate limit

/**
 * Key rotation configuration.
 */
export interface KeyRotationConfig {
  /** Rotation strategy */
  strategy: RotationStrategy;
  /** Maximum consecutive errors before marking key as unhealthy */
  maxConsecutiveErrors: number;
  /** Time to wait before retrying an unhealthy key (ms) */
  unhealthyRetryMs: number;
  /** Minimum rate limit remaining before rotation */
  minRateLimitThreshold: number;
  /** Enable automatic rotation on rate limit */
  autoRotateOnRateLimit: boolean;
}

const DEFAULT_CONFIG: KeyRotationConfig = {
  strategy: "rate-limit-aware",
  maxConsecutiveErrors: 3,
  unhealthyRetryMs: 60000, // 1 minute
  minRateLimitThreshold: 10,
  autoRotateOnRateLimit: true,
};

// ============================================
// Key Rotation Manager
// ============================================

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
    // Check for duplicate
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

    const keys = envValue.split(",").map((k) => k.trim()).filter(Boolean);

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
      // Try to recover unhealthy keys
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
    if (!apiKey) return;

    apiKey.errorCount++;
    apiKey.lastError = error;
    this.consecutiveErrors++;

    // Mark as unhealthy if too many consecutive errors
    if (this.consecutiveErrors >= this.config.maxConsecutiveErrors) {
      apiKey.active = false;
      this.consecutiveErrors = 0;

      this.logger.warn(`Key marked unhealthy for ${this.serviceName}`, {
        name: apiKey.name,
        errorCount: apiKey.errorCount,
        error,
      });

      // Rotate to next key
      this.rotateToNext();
    }
  }

  /**
   * Report rate limit status for a key.
   */
  reportRateLimit(key: string, remaining: number, resetTime?: Date): void {
    const apiKey = this.keys.find((k) => k.key === key);
    if (!apiKey) return;

    apiKey.rateLimitRemaining = remaining;
    apiKey.rateLimitReset = resetTime;

    // Auto-rotate if below threshold
    if (
      this.config.autoRotateOnRateLimit &&
      remaining < this.config.minRateLimitThreshold
    ) {
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

  // ============================================
  // Private Methods
  // ============================================

  private selectKey(): ApiKey | null {
    const activeKeys = this.keys.filter((k) => k.active);
    if (activeKeys.length === 0) {
      return null;
    }

    switch (this.config.strategy) {
      case "round-robin":
        return this.selectRoundRobin(activeKeys);
      case "least-used":
        return this.selectLeastUsed(activeKeys);
      case "healthiest":
        return this.selectHealthiest(activeKeys);
      case "rate-limit-aware":
        return this.selectRateLimitAware(activeKeys);
      default:
        return activeKeys[0] ?? null;
    }
  }

  private selectRoundRobin(keys: ApiKey[]): ApiKey {
    this.currentIndex = this.currentIndex % keys.length;
    const key = keys[this.currentIndex]!;
    this.currentIndex++;
    return key;
  }

  private selectLeastUsed(keys: ApiKey[]): ApiKey {
    return keys.reduce((min, k) =>
      k.requestCount < min.requestCount ? k : min
    );
  }

  private selectHealthiest(keys: ApiKey[]): ApiKey {
    return keys.reduce((best, k) => {
      const kErrorRate = k.requestCount > 0 ? k.errorCount / k.requestCount : 0;
      const bestErrorRate = best.requestCount > 0 ? best.errorCount / best.requestCount : 0;
      return kErrorRate < bestErrorRate ? k : best;
    });
  }

  private selectRateLimitAware(keys: ApiKey[]): ApiKey {
    // Prefer keys with known rate limit, sorted by remaining
    const withRateLimit = keys.filter((k) => k.rateLimitRemaining !== undefined);

    if (withRateLimit.length > 0) {
      return withRateLimit.reduce((best, k) =>
        (k.rateLimitRemaining ?? 0) > (best.rateLimitRemaining ?? 0) ? k : best
      );
    }

    // Fall back to least used if no rate limit info
    return this.selectLeastUsed(keys);
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
        key.errorCount = 0; // Reset error count for fresh start
        this.logger.info(`Recovered unhealthy key for ${this.serviceName}`, {
          name: key.name,
        });
      }
    }
  }
}

// ============================================
// Key Stats Type
// ============================================

export interface KeyStats {
  service: ApiService;
  totalKeys: number;
  activeKeys: number;
  unhealthyKeys: number;
  totalRequests: number;
  totalErrors: number;
  errorRate: number;
  currentKeyIndex: number;
  keys: Array<{
    name: string;
    active: boolean;
    requestCount: number;
    errorCount: number;
    rateLimitRemaining?: number;
  }>;
}

// ============================================
// Logger
// ============================================

export interface KeyRotationLogger {
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
}

const DEFAULT_LOGGER: KeyRotationLogger = {
  info: (msg, data) => console.log(`[KeyRotation] ${msg}`, data ?? ""),
  warn: (msg, data) => console.warn(`[KeyRotation] ${msg}`, data ?? ""),
  error: (msg, data) => console.error(`[KeyRotation] ${msg}`, data ?? ""),
};

// ============================================
// Service Key Manager Registry
// ============================================

/**
 * Registry for managing key rotation across all services.
 */
export class KeyRotationRegistry {
  private managers = new Map<ApiService, KeyRotationManager>();
  private readonly config: Partial<KeyRotationConfig>;
  private readonly logger: KeyRotationLogger;

  constructor(
    config: Partial<KeyRotationConfig> = {},
    logger?: KeyRotationLogger
  ) {
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
    // Polygon (Massive)
    this.getManager("polygon").addKeysFromEnv(
      process.env.POLYGON_KEY ?? Bun.env.POLYGON_KEY,
      "POLYGON_KEY"
    );

    // Alpha Vantage
    this.getManager("alphavantage").addKeysFromEnv(
      process.env.ALPHAVANTAGE_KEY ?? Bun.env.ALPHAVANTAGE_KEY,
      "ALPHAVANTAGE_KEY"
    );

    // FMP
    this.getManager("fmp").addKeysFromEnv(
      process.env.FMP_KEY ?? Bun.env.FMP_KEY,
      "FMP_KEY"
    );

    // Databento
    this.getManager("databento").addKeysFromEnv(
      process.env.DATABENTO_KEY ?? Bun.env.DATABENTO_KEY,
      "DATABENTO_KEY"
    );

    // Alpaca
    this.getManager("alpaca").addKeysFromEnv(
      process.env.ALPACA_KEY ?? Bun.env.ALPACA_KEY,
      "ALPACA_KEY"
    );
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
  reportRateLimit(
    service: ApiService,
    key: string,
    remaining: number,
    resetTime?: Date
  ): void {
    this.getManager(service).reportRateLimit(key, remaining, resetTime);
  }
}

// ============================================
// Factory Functions
// ============================================

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

// ============================================
// Export Default
// ============================================

export default {
  KeyRotationManager,
  KeyRotationRegistry,
  createKeyRotationRegistry,
  DEFAULT_CONFIG,
};
