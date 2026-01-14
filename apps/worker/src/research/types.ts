/**
 * Research Container Orchestration Types
 *
 * Types and configuration for running Claude Code in isolated Firecracker microVMs
 * for autonomous research execution with security boundaries.
 *
 * @see docs/plans/20-research-to-production-pipeline.md
 * @see https://firecracker-microvm.github.io/
 */

import { z } from "zod";

// ============================================
// Resource Limits
// ============================================

/**
 * Resource limits for research containers
 */
export const ResourceLimitsSchema = z.object({
	/** CPU cores allocated */
	cpu: z.number().int().positive().default(8),
	/** Memory in GB */
	memoryGb: z.number().positive().default(32),
	/** Disk storage in GB */
	diskGb: z.number().positive().default(50),
	/** Maximum runtime in hours */
	timeoutHours: z.number().positive().default(4),
	/** Network egress policy */
	networkEgress: z.enum(["unlimited", "restricted", "none"]).default("unlimited"),
	/** Token budget for API cost control */
	tokenBudget: z.number().int().positive().default(500_000),
});
export type ResourceLimits = z.infer<typeof ResourceLimitsSchema>;

/**
 * Default resource limits
 */
export const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
	cpu: 8,
	memoryGb: 32,
	diskGb: 50,
	timeoutHours: 4,
	networkEgress: "unlimited",
	tokenBudget: 500_000,
};

// ============================================
// Safety Guardrails
// ============================================

/**
 * Safety guardrails configuration based on VeriGuard framework
 * @see https://arxiv.org/html/2510.05156
 */
export const GuardrailsSchema = z.object({
	/** Blocked Python/JS imports for security */
	blockedImports: z
		.array(z.string())
		.default(["os.system", "subprocess.Popen", "eval", "exec", "__import__"]),
	/** Blocked network destinations */
	blockedNetwork: z
		.array(z.string())
		.default(["production.cream.internal", "turso.cream.internal", "helix.cream.internal"]),
	/** Maximum file size in MB */
	maxFileSizeMb: z.number().positive().default(100),
	/** Allowed git branch patterns */
	allowedBranches: z.array(z.string()).default(["factor/*", "research/*"]),
	/** Blocked git branches */
	blockedBranches: z.array(z.string()).default(["main", "master", "production"]),
	/** Blocked API endpoints */
	blockedApis: z.array(z.string()).default([
		"alpaca.markets/v2/orders", // No live trading
		"turso.cream.internal", // No production DB
		"helix.cream.internal", // No production graph
	]),
	/** Blocked bash commands */
	blockedCommands: z
		.array(z.string())
		.default(["rm -rf", "dd if=", "mkfs", "> /dev/", "chmod 777", "curl | bash", "wget | bash"]),
});
export type Guardrails = z.infer<typeof GuardrailsSchema>;

/**
 * Default guardrails configuration
 */
export const DEFAULT_GUARDRAILS: Guardrails = {
	blockedImports: ["os.system", "subprocess.Popen", "eval", "exec", "__import__"],
	blockedNetwork: ["production.cream.internal", "turso.cream.internal", "helix.cream.internal"],
	maxFileSizeMb: 100,
	allowedBranches: ["factor/*", "research/*"],
	blockedBranches: ["main", "master", "production"],
	blockedApis: ["alpaca.markets/v2/orders", "turso.cream.internal", "helix.cream.internal"],
	blockedCommands: [
		"rm -rf",
		"dd if=",
		"mkfs",
		"> /dev/",
		"chmod 777",
		"curl | bash",
		"wget | bash",
	],
};

// ============================================
// Container Configuration
// ============================================

/**
 * Research container configuration
 */
export const ResearchContainerConfigSchema = z.object({
	/** Unique run identifier */
	runId: z.string(),
	/** Research trigger that initiated this run */
	triggerType: z.enum(["scheduled", "decay_detected", "regime_change", "manual", "refinement"]),
	/** Detailed trigger reason */
	triggerReason: z.string(),
	/** Current market regime */
	currentRegime: z.string(),
	/** Active factor IDs for context */
	activeFactorIds: z.array(z.string()),
	/** Research focus area */
	suggestedFocus: z.string().optional(),
	/** Resource limits */
	resources: ResourceLimitsSchema.default(DEFAULT_RESOURCE_LIMITS),
	/** Safety guardrails */
	guardrails: GuardrailsSchema.default(DEFAULT_GUARDRAILS),
	/** Working directory path */
	workspacePath: z.string().default("/var/lib/claude-code/workspace/cream"),
	/** Model to use */
	model: z.string().default("claude-sonnet-4-5"),
});
export type ResearchContainerConfig = z.infer<typeof ResearchContainerConfigSchema>;

// ============================================
// Run Status
// ============================================

/**
 * Research run status
 */
export const ResearchRunStatusSchema = z.enum([
	"pending",
	"starting",
	"running",
	"completed",
	"failed",
	"timeout",
	"cancelled",
]);
export type ResearchRunStatus = z.infer<typeof ResearchRunStatusSchema>;

/**
 * Research run result
 */
export const ResearchRunResultSchema = z.object({
	runId: z.string(),
	status: ResearchRunStatusSchema,
	/** PR URL if created */
	prUrl: z.string().url().nullable(),
	/** Factor ID if created */
	factorId: z.string().nullable(),
	/** Hypothesis ID if created */
	hypothesisId: z.string().nullable(),
	/** Error message if failed */
	errorMessage: z.string().nullable(),
	/** Tokens used */
	tokensUsed: z.number().int().nonnegative(),
	/** Compute hours used */
	computeHours: z.number().nonnegative(),
	/** Start timestamp */
	startedAt: z.string().datetime(),
	/** Completion timestamp */
	completedAt: z.string().datetime().nullable(),
});
export type ResearchRunResult = z.infer<typeof ResearchRunResultSchema>;

// ============================================
// VM Configuration (Firecracker)
// ============================================

/**
 * Firecracker microVM configuration
 */
export const VMConfigSchema = z.object({
	/** Unique VM identifier */
	vmId: z.string(),
	/** CPU count */
	vcpuCount: z.number().int().positive(),
	/** Memory size in MB */
	memSizeMb: z.number().int().positive(),
	/** Root drive path */
	rootDrivePath: z.string(),
	/** Kernel path */
	kernelPath: z.string(),
	/** Network namespace */
	networkNamespace: z.string().default("research"),
	/** Enable KVM acceleration */
	enableKvm: z.boolean().default(true),
});
export type VMConfig = z.infer<typeof VMConfigSchema>;

/**
 * VM handle for managing running microVMs
 */
export interface VMHandle {
	vmId: string;
	pid: number;
	socketPath: string;
	status: "running" | "stopped" | "error";
}

// ============================================
// Progress Events
// ============================================

/**
 * Progress event types for research run monitoring
 */
export const ProgressEventTypeSchema = z.enum([
	"started",
	"phase_changed",
	"tool_called",
	"iteration_complete",
	"pr_created",
	"error",
	"completed",
]);
export type ProgressEventType = z.infer<typeof ProgressEventTypeSchema>;

/**
 * Progress event from research run
 */
export const ProgressEventSchema = z.object({
	runId: z.string(),
	type: ProgressEventTypeSchema,
	phase: z.string().optional(),
	message: z.string(),
	timestamp: z.string().datetime(),
	metadata: z.record(z.string(), z.unknown()).optional(),
});
export type ProgressEvent = z.infer<typeof ProgressEventSchema>;

/**
 * Progress callback function type
 */
export type ProgressCallback = (event: ProgressEvent) => void | Promise<void>;
