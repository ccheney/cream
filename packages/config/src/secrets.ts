/**
 * Secrets Management
 *
 * Provides a unified interface for secret retrieval from various sources:
 * - Environment variables (default, development)
 * - Encrypted files (local development, CI)
 * - External providers (AWS Secrets Manager, HashiCorp Vault, 1Password)
 *
 * Features:
 * - Secret caching with TTL
 * - Automatic refresh
 * - Audit logging
 * - Encryption at rest for file-based secrets
 *
 * @see docs/plans/11-configuration.md
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

// ============================================
// Types
// ============================================

/**
 * Secret value with metadata.
 */
export interface Secret {
  /** The secret value */
  value: string;
  /** When the secret was retrieved */
  retrievedAt: Date;
  /** Source of the secret */
  source: string;
  /** When the secret expires (if applicable) */
  expiresAt?: Date;
}

/**
 * Secret provider interface.
 * Implement this for each secret storage backend.
 */
export interface SecretsProvider {
  /** Provider name for logging */
  readonly name: string;

  /** Get a secret by key */
  get(key: string): Promise<string | null>;

  /** Check if a secret exists */
  has(key: string): Promise<boolean>;

  /** List available secret keys (if supported) */
  list?(): Promise<string[]>;

  /** Check provider health */
  healthCheck(): Promise<boolean>;
}

/**
 * Secrets manager configuration.
 */
export interface SecretsManagerConfig {
  /** Primary provider */
  provider: SecretsProvider;

  /** Fallback providers (tried in order if primary fails) */
  fallbackProviders?: SecretsProvider[];

  /** Cache TTL in milliseconds (0 = no cache) */
  cacheTtlMs: number;

  /** Enable audit logging */
  auditEnabled: boolean;

  /** Audit log callback */
  onAudit?: (event: SecretAuditEvent) => void;

  /** Logger */
  logger?: SecretsLogger;
}

/**
 * Secret audit event.
 */
export interface SecretAuditEvent {
  action: "get" | "list" | "refresh" | "cache_hit" | "cache_miss";
  key?: string;
  provider: string;
  success: boolean;
  timestamp: Date;
  error?: string;
}

/**
 * Logger interface.
 */
export interface SecretsLogger {
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
}

const DEFAULT_LOGGER: SecretsLogger = {
  info: (msg, data) => console.log(`[Secrets] ${msg}`, data ?? ""),
  warn: (msg, data) => console.warn(`[Secrets] ${msg}`, data ?? ""),
  error: (msg, data) => console.error(`[Secrets] ${msg}`, data ?? ""),
};

// ============================================
// Environment Variables Provider
// ============================================

/**
 * Secrets provider that reads from environment variables.
 * This is the default provider for development.
 */
export class EnvSecretsProvider implements SecretsProvider {
  readonly name = "env";
  private readonly prefix: string;

  constructor(prefix = "") {
    this.prefix = prefix;
  }

  async get(key: string): Promise<string | null> {
    const fullKey = this.prefix + key;
    return process.env[fullKey] ?? Bun.env[fullKey] ?? null;
  }

  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  async list(): Promise<string[]> {
    const env = { ...process.env, ...Bun.env };
    return Object.keys(env)
      .filter((key) => key.startsWith(this.prefix))
      .map((key) => key.slice(this.prefix.length));
  }

  async healthCheck(): Promise<boolean> {
    return true; // Environment variables are always available
  }
}

// ============================================
// Encrypted File Provider
// ============================================

/**
 * Encryption configuration for file-based secrets.
 */
export interface FileEncryptionConfig {
  /** Encryption algorithm */
  algorithm: "aes-256-gcm";
  /** Key derivation iterations */
  iterations: number;
  /** Salt length in bytes */
  saltLength: number;
  /** IV length in bytes */
  ivLength: number;
  /** Auth tag length in bytes */
  authTagLength: number;
}

const DEFAULT_ENCRYPTION_CONFIG: FileEncryptionConfig = {
  algorithm: "aes-256-gcm",
  iterations: 16384, // scrypt N param must be power of 2 (2^14)
  saltLength: 32,
  ivLength: 16,
  authTagLength: 16,
};

/**
 * Secrets provider that reads from an encrypted JSON file.
 * Format: Base64-encoded encrypted JSON blob.
 */
export class EncryptedFileSecretsProvider implements SecretsProvider {
  readonly name = "encrypted-file";
  private readonly filePath: string;
  private readonly password: string;
  private readonly encryptionConfig: FileEncryptionConfig;
  private cache: Record<string, string> | null = null;
  private cacheTime: number | null = null;

  constructor(
    filePath: string,
    password: string,
    encryptionConfig: Partial<FileEncryptionConfig> = {}
  ) {
    this.filePath = filePath;
    this.password = password;
    this.encryptionConfig = { ...DEFAULT_ENCRYPTION_CONFIG, ...encryptionConfig };
  }

  async get(key: string): Promise<string | null> {
    const secrets = await this.loadSecrets();
    return secrets[key] ?? null;
  }

  async has(key: string): Promise<boolean> {
    const secrets = await this.loadSecrets();
    return key in secrets;
  }

  async list(): Promise<string[]> {
    const secrets = await this.loadSecrets();
    return Object.keys(secrets);
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.loadSecrets();
      return true;
    } catch {
      return false;
    }
  }

  private async loadSecrets(): Promise<Record<string, string>> {
    // Use cache if fresh (within 1 minute)
    if (this.cache && this.cacheTime && Date.now() - this.cacheTime < 60000) {
      return this.cache;
    }

    try {
      const file = Bun.file(this.filePath);
      const encrypted = await file.text();
      const decrypted = this.decrypt(encrypted);
      this.cache = JSON.parse(decrypted);
      this.cacheTime = Date.now();
      return this.cache ?? {};
    } catch {
      throw new Error(`Failed to load secrets from ${this.filePath}`);
    }
  }

  private decrypt(encrypted: string): string {
    const data = Buffer.from(encrypted, "base64");

    const { saltLength, ivLength, authTagLength } = this.encryptionConfig;

    // Extract components
    const salt = data.subarray(0, saltLength);
    const iv = data.subarray(saltLength, saltLength + ivLength);
    const authTag = data.subarray(saltLength + ivLength, saltLength + ivLength + authTagLength);
    const ciphertext = data.subarray(saltLength + ivLength + authTagLength);

    // Derive key
    const key = scryptSync(this.password, salt, 32, {
      N: this.encryptionConfig.iterations,
    });

    // Decrypt
    const decipher = createDecipheriv(this.encryptionConfig.algorithm, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString("utf8");
  }

  /**
   * Encrypt secrets for storage.
   * Call this utility to create the encrypted file.
   */
  static encrypt(
    secrets: Record<string, string>,
    password: string,
    config: Partial<FileEncryptionConfig> = {}
  ): string {
    const fullConfig = { ...DEFAULT_ENCRYPTION_CONFIG, ...config };
    const { saltLength, ivLength } = fullConfig;

    // Generate random salt and IV
    const salt = randomBytes(saltLength);
    const iv = randomBytes(ivLength);

    // Derive key
    const key = scryptSync(password, salt, 32, { N: fullConfig.iterations });

    // Encrypt
    const cipher = createCipheriv(fullConfig.algorithm, key, iv);
    const plaintext = Buffer.from(JSON.stringify(secrets), "utf8");

    let ciphertext = cipher.update(plaintext);
    ciphertext = Buffer.concat([ciphertext, cipher.final()]);

    const authTag = cipher.getAuthTag();

    // Combine: salt + iv + authTag + ciphertext
    const result = Buffer.concat([salt, iv, authTag, ciphertext]);

    return result.toString("base64");
  }
}

// ============================================
// Memory Provider (for testing)
// ============================================

/**
 * In-memory secrets provider for testing.
 */
export class MemorySecretsProvider implements SecretsProvider {
  readonly name = "memory";
  private secrets: Record<string, string> = {};

  constructor(initialSecrets: Record<string, string> = {}) {
    this.secrets = { ...initialSecrets };
  }

  async get(key: string): Promise<string | null> {
    return this.secrets[key] ?? null;
  }

  async has(key: string): Promise<boolean> {
    return key in this.secrets;
  }

  async list(): Promise<string[]> {
    return Object.keys(this.secrets);
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  /** Set a secret (for testing) */
  set(key: string, value: string): void {
    this.secrets[key] = value;
  }

  /** Delete a secret (for testing) */
  delete(key: string): void {
    delete this.secrets[key];
  }

  /** Clear all secrets (for testing) */
  clear(): void {
    this.secrets = {};
  }
}

// ============================================
// Secrets Manager
// ============================================

const DEFAULT_CONFIG: Omit<SecretsManagerConfig, "provider"> = {
  cacheTtlMs: 300000, // 5 minutes
  auditEnabled: true,
};

/**
 * Centralized secrets manager with caching, fallback, and audit logging.
 */
export class SecretsManager {
  private readonly config: SecretsManagerConfig;
  private readonly logger: SecretsLogger;
  private cache = new Map<string, { secret: Secret; expiresAt: number }>();

  constructor(config: SecretsManagerConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = config.logger ?? DEFAULT_LOGGER;
  }

  /**
   * Get a secret by key.
   */
  async get(key: string): Promise<string | null> {
    // Check cache first
    const cached = this.getFromCache(key);
    if (cached !== null) {
      this.audit("cache_hit", key, this.config.provider.name, true);
      return cached;
    }

    this.audit("cache_miss", key, this.config.provider.name, true);

    // Try primary provider
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

    // Try fallback providers
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

  // ============================================
  // Private Methods
  // ============================================

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

    // Log non-success events
    if (!success) {
      this.logger.warn("Secret access failed", { action, key, provider });
    }
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a secrets manager with environment variables as the provider.
 */
export function createEnvSecretsManager(
  config?: Partial<Omit<SecretsManagerConfig, "provider">>
): SecretsManager {
  return new SecretsManager({
    cacheTtlMs: config?.cacheTtlMs ?? 300000,
    auditEnabled: config?.auditEnabled ?? true,
    ...config,
    provider: new EnvSecretsProvider(),
  });
}

/**
 * Create a secrets manager from configuration.
 */
export function createSecretsManager(
  providerType: "env" | "memory" | "encrypted-file",
  options: {
    /** Prefix for env provider */
    envPrefix?: string;
    /** Initial secrets for memory provider */
    initialSecrets?: Record<string, string>;
    /** File path for encrypted file provider */
    filePath?: string;
    /** Password for encrypted file provider */
    password?: string;
    /** Additional config */
    config?: Partial<Omit<SecretsManagerConfig, "provider">>;
  } = {}
): SecretsManager {
  let provider: SecretsProvider;

  switch (providerType) {
    case "env":
      provider = new EnvSecretsProvider(options.envPrefix);
      break;
    case "memory":
      provider = new MemorySecretsProvider(options.initialSecrets);
      break;
    case "encrypted-file":
      if (!options.filePath || !options.password) {
        throw new Error("Encrypted file provider requires filePath and password");
      }
      provider = new EncryptedFileSecretsProvider(options.filePath, options.password);
      break;
    default:
      throw new Error(`Unknown provider type: ${providerType}`);
  }

  return new SecretsManager({
    cacheTtlMs: options.config?.cacheTtlMs ?? 300000,
    auditEnabled: options.config?.auditEnabled ?? true,
    ...options.config,
    provider,
  });
}

// ============================================
// Exports
// ============================================

export default {
  SecretsManager,
  EnvSecretsProvider,
  EncryptedFileSecretsProvider,
  MemorySecretsProvider,
  createEnvSecretsManager,
  createSecretsManager,
};
