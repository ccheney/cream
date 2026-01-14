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

// Manager
export { KeyRotationManager } from "./manager.js";
// Registry
export { createKeyRotationRegistry, KeyRotationRegistry } from "./registry.js";
// Types
export type {
	ApiKey,
	ApiService,
	KeyRotationConfig,
	KeyRotationLogger,
	KeyStats,
	RotationStrategy,
} from "./types.js";
export { DEFAULT_CONFIG, DEFAULT_LOGGER } from "./types.js";

// Default export for backward compatibility
import { KeyRotationManager } from "./manager.js";
import { createKeyRotationRegistry, KeyRotationRegistry } from "./registry.js";
import { DEFAULT_CONFIG } from "./types.js";

export default {
	KeyRotationManager,
	KeyRotationRegistry,
	createKeyRotationRegistry,
	DEFAULT_CONFIG,
};
