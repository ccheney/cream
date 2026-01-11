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

export type { CreateSecretsManagerOptions } from "./factory.js";
// Factory functions
export { createEnvSecretsManager, createSecretsManager } from "./factory.js";
// Manager
export { SecretsManager } from "./manager.js";
// Providers
export {
  EncryptedFileSecretsProvider,
  EnvSecretsProvider,
  MemorySecretsProvider,
} from "./providers.js";
// Types
export type {
  CachedSecretEntry,
  FileEncryptionConfig,
  Secret,
  SecretAuditEvent,
  SecretsLogger,
  SecretsManagerConfig,
  SecretsProvider,
} from "./types.js";
export { DEFAULT_ENCRYPTION_CONFIG, DEFAULT_LOGGER, DEFAULT_MANAGER_CONFIG } from "./types.js";

import { createEnvSecretsManager, createSecretsManager } from "./factory.js";
// Default export for backwards compatibility
import { SecretsManager } from "./manager.js";
import {
  EncryptedFileSecretsProvider,
  EnvSecretsProvider,
  MemorySecretsProvider,
} from "./providers.js";

export default {
  SecretsManager,
  EnvSecretsProvider,
  EncryptedFileSecretsProvider,
  MemorySecretsProvider,
  createEnvSecretsManager,
  createSecretsManager,
};
