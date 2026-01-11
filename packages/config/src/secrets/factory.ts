/**
 * Secrets Factory Functions
 *
 * Factory functions for creating secrets managers with various configurations.
 */

import { SecretsManager } from "./manager.js";
import {
  EncryptedFileSecretsProvider,
  EnvSecretsProvider,
  MemorySecretsProvider,
} from "./providers.js";
import type { SecretsManagerConfig, SecretsProvider } from "./types.js";

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
 * Options for creating a secrets manager.
 */
export interface CreateSecretsManagerOptions {
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
}

/**
 * Create a secrets manager from configuration.
 */
export function createSecretsManager(
  providerType: "env" | "memory" | "encrypted-file",
  options: CreateSecretsManagerOptions = {}
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
