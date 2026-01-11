/**
 * Component Health Check System
 *
 * Provides health monitoring for system components with standardized
 * status reporting and aggregation for observability.
 *
 * Features:
 * - Individual component health checks
 * - Dependency health tracking
 * - Aggregated system health status
 * - Health history and trends
 * - Configurable thresholds and intervals
 */

// Re-export aggregation utilities
export {
  aggregateHealthResults,
  calculateEffectiveStatus,
  countHealthStatuses,
  determineOverallStatus,
} from "./aggregation.js";
// Re-export health check factories
export {
  createCustomHealthCheck,
  createHttpHealthCheck,
  createMemoryHealthCheck,
} from "./checks.js";
// Re-export registry
export { HealthCheckRegistry } from "./registry.js";
// Re-export types
export type {
  ComponentHealthConfig,
  ComponentState,
  HealthCheckConfig,
  HealthCheckDefinition,
  HealthCheckFn,
  HealthCheckResult,
  HealthStatus,
  SystemHealth,
} from "./types.js";

// Import for factory and default export
import {
  createCustomHealthCheck,
  createHttpHealthCheck,
  createMemoryHealthCheck,
} from "./checks.js";
import { HealthCheckRegistry } from "./registry.js";
import type { HealthCheckConfig } from "./types.js";

/**
 * Create a health check registry.
 */
export function createHealthRegistry(config?: Partial<HealthCheckConfig>): HealthCheckRegistry {
  return new HealthCheckRegistry(config);
}

export default {
  HealthCheckRegistry,
  createHealthRegistry,
  createHttpHealthCheck,
  createMemoryHealthCheck,
  createCustomHealthCheck,
};
