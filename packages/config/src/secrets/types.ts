/**
 * Secrets Management Types
 *
 * Type definitions, interfaces, and schemas for the secrets management system.
 */

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

/**
 * Cached secret entry used internally by SecretsManager.
 */
export interface CachedSecretEntry {
	secret: Secret;
	expiresAt: number;
}

/**
 * Default logger that does nothing (silent).
 */
export const DEFAULT_LOGGER: SecretsLogger = {
	info: (_msg, _data) => {},
	warn: (_msg, _data) => {},
	error: (_msg, _data) => {},
};

/**
 * Default encryption configuration for file-based secrets.
 */
export const DEFAULT_ENCRYPTION_CONFIG: FileEncryptionConfig = {
	algorithm: "aes-256-gcm",
	iterations: 16384, // scrypt N param must be power of 2 (2^14)
	saltLength: 32,
	ivLength: 16,
	authTagLength: 16,
};

/**
 * Default secrets manager configuration (without provider).
 */
export const DEFAULT_MANAGER_CONFIG: Omit<SecretsManagerConfig, "provider"> = {
	cacheTtlMs: 300000, // 5 minutes
	auditEnabled: true,
};
