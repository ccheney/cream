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
    return true;
  }
}

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

    const salt = data.subarray(0, saltLength);
    const iv = data.subarray(saltLength, saltLength + ivLength);
    const authTag = data.subarray(saltLength + ivLength, saltLength + ivLength + authTagLength);
    const ciphertext = data.subarray(saltLength + ivLength + authTagLength);

    const key = scryptSync(this.password, salt, 32, {
      N: this.encryptionConfig.iterations,
    });

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
  }
}

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
