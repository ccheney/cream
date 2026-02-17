/**
 * Secrets Providers
 *
 * Implementations of the SecretsProvider interface for various backends:
 * - Environment variables (default, development)
 * - Encrypted files (local development, CI)
 * - Memory (testing)
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

import type { FileEncryptionConfig, SecretsProvider } from "./types.js";
import { DEFAULT_ENCRYPTION_CONFIG } from "./types.js";

/**
 * Secrets provider that reads from environment variables.
 * This is the default provider for development.
 */
export interface EnvSecretsProvider extends SecretsProvider {}

type EnvSecretsProviderConstructor = new (prefix?: string) => EnvSecretsProvider;

type MutableEnvSecretsProvider = EnvSecretsProvider & {
	name: string;
	get(key: string): Promise<string | null>;
	has(key: string): Promise<boolean>;
	list(): Promise<string[]>;
	healthCheck(): Promise<boolean>;
};

const EnvSecretsProviderImpl = function EnvSecretsProvider(
	this: MutableEnvSecretsProvider,
	prefix = "",
): void {
	if (!new.target) {
		throw new TypeError("Class constructor EnvSecretsProvider cannot be invoked without 'new'");
	}

	this.name = "env";
	this.get = async (key: string): Promise<string | null> => {
		const fullKey = prefix + key;
		return Bun.env[fullKey] ?? Bun.env[fullKey] ?? null;
	};
	this.has = async (key: string): Promise<boolean> => {
		const value = await this.get(key);
		return value !== null;
	};
	this.list = async (): Promise<string[]> => {
		const env = { ...Bun.env, ...Bun.env };
		return Object.keys(env)
			.filter((key) => key.startsWith(prefix))
			.map((key) => key.slice(prefix.length));
	};
	this.healthCheck = async (): Promise<boolean> => true;
} as unknown as EnvSecretsProviderConstructor;

export const EnvSecretsProvider = EnvSecretsProviderImpl;

/**
 * Secrets provider that reads from an encrypted JSON file.
 * Format: Base64-encoded encrypted JSON blob.
 */
export interface EncryptedFileSecretsProvider extends SecretsProvider {}

type EncryptedFileSecretsProviderConstructor = {
	new (
		filePath: string,
		password: string,
		encryptionConfig?: Partial<FileEncryptionConfig>,
	): EncryptedFileSecretsProvider;
	encrypt(
		secrets: Record<string, string>,
		password: string,
		config?: Partial<FileEncryptionConfig>,
	): string;
};

type MutableEncryptedFileSecretsProvider = EncryptedFileSecretsProvider & {
	name: string;
	get(key: string): Promise<string | null>;
	has(key: string): Promise<boolean>;
	list(): Promise<string[]>;
	healthCheck(): Promise<boolean>;
};

function decryptSecrets(
	encrypted: string,
	password: string,
	encryptionConfig: FileEncryptionConfig,
): string {
	const data = Buffer.from(encrypted, "base64");
	const { saltLength, ivLength, authTagLength } = encryptionConfig;
	const salt = data.subarray(0, saltLength);
	const iv = data.subarray(saltLength, saltLength + ivLength);
	const authTag = data.subarray(saltLength + ivLength, saltLength + ivLength + authTagLength);
	const ciphertext = data.subarray(saltLength + ivLength + authTagLength);
	const key = scryptSync(password, salt, 32, { N: encryptionConfig.iterations });
	const decipher = createDecipheriv(encryptionConfig.algorithm, key, iv);
	decipher.setAuthTag(authTag);
	let decrypted = decipher.update(ciphertext);
	decrypted = Buffer.concat([decrypted, decipher.final()]);
	return decrypted.toString("utf8");
}

function createSecretsLoader(
	filePath: string,
	password: string,
	encryptionConfig: FileEncryptionConfig,
): () => Promise<Record<string, string>> {
	let cache: Record<string, string> | null = null;
	let cacheTime: number | null = null;

	return async (): Promise<Record<string, string>> => {
		if (cache && cacheTime && Date.now() - cacheTime < 60000) {
			return cache;
		}

		try {
			const file = Bun.file(filePath);
			const encrypted = await file.text();
			const decrypted = decryptSecrets(encrypted, password, encryptionConfig);
			cache = JSON.parse(decrypted);
			cacheTime = Date.now();
			return cache ?? {};
		} catch {
			throw new Error(`Failed to load secrets from ${filePath}`);
		}
	};
}

const EncryptedFileSecretsProviderImpl = function EncryptedFileSecretsProvider(
	this: MutableEncryptedFileSecretsProvider,
	filePath: string,
	password: string,
	encryptionConfig: Partial<FileEncryptionConfig> = {},
): void {
	if (!new.target) {
		throw new TypeError(
			"Class constructor EncryptedFileSecretsProvider cannot be invoked without 'new'",
		);
	}

	const fullConfig = { ...DEFAULT_ENCRYPTION_CONFIG, ...encryptionConfig };
	const loadSecrets = createSecretsLoader(filePath, password, fullConfig);

	this.name = "encrypted-file";
	this.get = async (key: string): Promise<string | null> => {
		const secrets = await loadSecrets();
		return secrets[key] ?? null;
	};
	this.has = async (key: string): Promise<boolean> => {
		const secrets = await loadSecrets();
		return key in secrets;
	};
	this.list = async (): Promise<string[]> => {
		const secrets = await loadSecrets();
		return Object.keys(secrets);
	};
	this.healthCheck = async (): Promise<boolean> => {
		try {
			await loadSecrets();
			return true;
		} catch {
			return false;
		}
	};
} as unknown as EncryptedFileSecretsProviderConstructor;

EncryptedFileSecretsProviderImpl.encrypt = (
	secrets: Record<string, string>,
	password: string,
	config: Partial<FileEncryptionConfig> = {},
): string => {
	const fullConfig = { ...DEFAULT_ENCRYPTION_CONFIG, ...config };
	const { saltLength, ivLength } = fullConfig;

	const salt = randomBytes(saltLength);
	const iv = randomBytes(ivLength);

	const key = scryptSync(password, salt, 32, { N: fullConfig.iterations });

	const cipher = createCipheriv(fullConfig.algorithm, key, iv);
	const plaintext = Buffer.from(JSON.stringify(secrets), "utf8");

	let ciphertext = cipher.update(plaintext);
	ciphertext = Buffer.concat([ciphertext, cipher.final()]);

	const authTag = cipher.getAuthTag();
	const result = Buffer.concat([salt, iv, authTag, ciphertext]);
	return result.toString("base64");
};

export const EncryptedFileSecretsProvider = EncryptedFileSecretsProviderImpl;

/**
 * In-memory secrets provider for testing.
 */
export interface MemorySecretsProvider extends SecretsProvider {
	set(key: string, value: string): void;
	delete(key: string): void;
	clear(): void;
}

type MemorySecretsProviderConstructor = new (
	initialSecrets?: Record<string, string>,
) => MemorySecretsProvider;

type MutableMemorySecretsProvider = MemorySecretsProvider & {
	name: string;
	get(key: string): Promise<string | null>;
	has(key: string): Promise<boolean>;
	list(): Promise<string[]>;
	healthCheck(): Promise<boolean>;
};

const MemorySecretsProviderImpl = function MemorySecretsProvider(
	this: MutableMemorySecretsProvider,
	initialSecrets: Record<string, string> = {},
): void {
	if (!new.target) {
		throw new TypeError("Class constructor MemorySecretsProvider cannot be invoked without 'new'");
	}

	let secrets: Record<string, string> = { ...initialSecrets };

	this.name = "memory";
	this.get = async (key: string): Promise<string | null> => secrets[key] ?? null;
	this.has = async (key: string): Promise<boolean> => key in secrets;
	this.list = async (): Promise<string[]> => Object.keys(secrets);
	this.healthCheck = async (): Promise<boolean> => true;
	this.set = (key: string, value: string): void => {
		secrets[key] = value;
	};
	this.delete = (key: string): void => {
		delete secrets[key];
	};
	this.clear = (): void => {
		secrets = {};
	};
} as unknown as MemorySecretsProviderConstructor;

export const MemorySecretsProvider = MemorySecretsProviderImpl;
