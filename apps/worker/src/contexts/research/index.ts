/**
 * Research Bounded Context
 *
 * Container orchestration for autonomous Claude Code research.
 * Provides isolated execution environments using Firecracker microVMs.
 */

export {
	buildResearchPrompt,
	createPermissionCallback,
	createResearchSpawner,
	type PermissionResult,
	ResearchContainerSpawner,
} from "./container-spawner.js";
export {
	createFirecrackerRunner,
	FirecrackerRunner,
	isFirecrackerAvailable,
} from "./firecracker-runner.js";
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
