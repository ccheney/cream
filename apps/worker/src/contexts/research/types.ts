/**
 * Research Container Types
 *
 * Types and configuration for running Claude Code in isolated Firecracker microVMs
 * for autonomous research execution with security boundaries.
 */

import { z } from "zod";

// ============================================
// Resource Limits
// ============================================

export const ResourceLimitsSchema = z.object({
	cpu: z.number().int().positive().default(8),
	memoryGb: z.number().positive().default(32),
	diskGb: z.number().positive().default(50),
	timeoutHours: z.number().positive().default(4),
	networkEgress: z.enum(["unlimited", "restricted", "none"]).default("unlimited"),
	tokenBudget: z.number().int().positive().default(500_000),
});
export type ResourceLimits = z.infer<typeof ResourceLimitsSchema>;

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

export const GuardrailsSchema = z.object({
	blockedImports: z
		.array(z.string())
		.default(["os.system", "subprocess.Popen", "eval", "exec", "__import__"]),
	blockedNetwork: z
		.array(z.string())
		.default(["production.cream.internal", "turso.cream.internal", "helix.cream.internal"]),
	maxFileSizeMb: z.number().positive().default(100),
	allowedBranches: z.array(z.string()).default(["factor/*", "research/*"]),
	blockedBranches: z.array(z.string()).default(["main", "master", "production"]),
	blockedApis: z
		.array(z.string())
		.default(["alpaca.markets/v2/orders", "turso.cream.internal", "helix.cream.internal"]),
	blockedCommands: z
		.array(z.string())
		.default(["rm -rf", "dd if=", "mkfs", "> /dev/", "chmod 777", "curl | bash", "wget | bash"]),
});
export type Guardrails = z.infer<typeof GuardrailsSchema>;

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

export const ResearchContainerConfigSchema = z.object({
	runId: z.string(),
	triggerType: z.enum(["scheduled", "decay_detected", "regime_change", "manual", "refinement"]),
	triggerReason: z.string(),
	currentRegime: z.string(),
	activeFactorIds: z.array(z.string()),
	suggestedFocus: z.string().optional(),
	resources: ResourceLimitsSchema.default(DEFAULT_RESOURCE_LIMITS),
	guardrails: GuardrailsSchema.default(DEFAULT_GUARDRAILS),
	workspacePath: z.string().default("/var/lib/claude-code/workspace/cream"),
	model: z.string().default("claude-sonnet-4-5"),
});
export type ResearchContainerConfig = z.infer<typeof ResearchContainerConfigSchema>;

// ============================================
// Run Status
// ============================================

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

export const ResearchRunResultSchema = z.object({
	runId: z.string(),
	status: ResearchRunStatusSchema,
	prUrl: z.string().url().nullable(),
	factorId: z.string().nullable(),
	hypothesisId: z.string().nullable(),
	errorMessage: z.string().nullable(),
	tokensUsed: z.number().int().nonnegative(),
	computeHours: z.number().nonnegative(),
	startedAt: z.string().datetime(),
	completedAt: z.string().datetime().nullable(),
});
export type ResearchRunResult = z.infer<typeof ResearchRunResultSchema>;

// ============================================
// VM Configuration
// ============================================

export const VMConfigSchema = z.object({
	vmId: z.string(),
	vcpuCount: z.number().int().positive(),
	memSizeMb: z.number().int().positive(),
	rootDrivePath: z.string(),
	kernelPath: z.string(),
	networkNamespace: z.string().default("research"),
	enableKvm: z.boolean().default(true),
});
export type VMConfig = z.infer<typeof VMConfigSchema>;

export interface VMHandle {
	vmId: string;
	pid: number;
	socketPath: string;
	status: "running" | "stopped" | "error";
}

// ============================================
// Progress Events
// ============================================

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

export const ProgressEventSchema = z.object({
	runId: z.string(),
	type: ProgressEventTypeSchema,
	phase: z.string().optional(),
	message: z.string(),
	timestamp: z.string().datetime(),
	metadata: z.record(z.string(), z.unknown()).optional(),
});
export type ProgressEvent = z.infer<typeof ProgressEventSchema>;

export type ProgressCallback = (event: ProgressEvent) => void | Promise<void>;
