/**
 * Research Container Orchestration
 *
 * Provides isolated execution environments for autonomous Claude Code research.
 *
 * @see docs/plans/20-research-to-production-pipeline.md
 */

// Container Spawner
export {
  buildResearchPrompt,
  createPermissionCallback,
  createResearchSpawner,
  type PermissionResult,
  ResearchContainerSpawner,
} from "./container-spawner.js";
// Firecracker Runner
export {
  createFirecrackerRunner,
  FirecrackerRunner,
  isFirecrackerAvailable,
} from "./firecracker-runner.js";
// Types
export {
  DEFAULT_GUARDRAILS,
  DEFAULT_RESOURCE_LIMITS,
  type Guardrails,
  GuardrailsSchema,
  type ProgressCallback,
  type ProgressEvent,
  ProgressEventSchema,
  type ProgressEventType,
  ProgressEventTypeSchema,
  type ResearchContainerConfig,
  ResearchContainerConfigSchema,
  type ResearchRunResult,
  ResearchRunResultSchema,
  type ResearchRunStatus,
  ResearchRunStatusSchema,
  type ResourceLimits,
  ResourceLimitsSchema,
  type VMConfig,
  VMConfigSchema,
  type VMHandle,
} from "./types.js";
