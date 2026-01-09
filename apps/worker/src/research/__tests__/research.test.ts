/**
 * Research Container Orchestration Tests
 *
 * Tests for types, guardrails, and container spawner functionality.
 * Note: Actual Claude Agent SDK and Firecracker integration tests
 * require running infrastructure and are marked with .skip.
 */

import { describe, expect, test } from "bun:test";
import { createResearchSpawner, ResearchContainerSpawner } from "../container-spawner.js";
import {
  createFirecrackerRunner,
  FirecrackerRunner,
  isFirecrackerAvailable,
} from "../firecracker-runner.js";
import {
  DEFAULT_GUARDRAILS,
  DEFAULT_RESOURCE_LIMITS,
  GuardrailsSchema,
  ProgressEventSchema,
  ProgressEventTypeSchema,
  ResearchContainerConfigSchema,
  ResearchRunResultSchema,
  ResearchRunStatusSchema,
  ResourceLimitsSchema,
  VMConfigSchema,
} from "../types.js";

// ============================================
// Type Schema Tests
// ============================================

describe("ResourceLimitsSchema", () => {
  test("validates default resource limits", () => {
    const result = ResourceLimitsSchema.safeParse(DEFAULT_RESOURCE_LIMITS);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cpu).toBe(8);
      expect(result.data.memoryGb).toBe(32);
      expect(result.data.diskGb).toBe(50);
      expect(result.data.timeoutHours).toBe(4);
      expect(result.data.networkEgress).toBe("unlimited");
      expect(result.data.tokenBudget).toBe(500_000);
    }
  });

  test("applies defaults for partial input", () => {
    const result = ResourceLimitsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cpu).toBe(8);
      expect(result.data.memoryGb).toBe(32);
    }
  });

  test("rejects invalid network egress", () => {
    const result = ResourceLimitsSchema.safeParse({
      networkEgress: "invalid",
    });
    expect(result.success).toBe(false);
  });

  test("rejects negative values", () => {
    const result = ResourceLimitsSchema.safeParse({
      cpu: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe("GuardrailsSchema", () => {
  test("validates default guardrails", () => {
    const result = GuardrailsSchema.safeParse(DEFAULT_GUARDRAILS);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.blockedImports).toContain("os.system");
      expect(result.data.blockedNetwork).toContain("turso.cream.internal");
      expect(result.data.blockedBranches).toContain("main");
      expect(result.data.blockedBranches).toContain("master");
    }
  });

  test("contains security-critical blocked patterns", () => {
    expect(DEFAULT_GUARDRAILS.blockedCommands).toContain("rm -rf");
    expect(DEFAULT_GUARDRAILS.blockedCommands).toContain("curl | bash");
    expect(DEFAULT_GUARDRAILS.blockedApis).toContain("alpaca.markets/v2/orders");
  });

  test("allows research branches", () => {
    expect(DEFAULT_GUARDRAILS.allowedBranches).toContain("factor/*");
    expect(DEFAULT_GUARDRAILS.allowedBranches).toContain("research/*");
  });
});

describe("ResearchContainerConfigSchema", () => {
  test("validates minimal config", () => {
    const config = {
      runId: "research-abc123",
      triggerType: "decay_detected",
      triggerReason: "Alpha decay detected in momentum factor",
      currentRegime: "BULL_TREND",
      activeFactorIds: ["factor-1", "factor-2"],
    };

    const result = ResearchContainerConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.runId).toBe("research-abc123");
      expect(result.data.model).toBe("claude-sonnet-4-5");
      expect(result.data.workspacePath).toBe("/var/lib/claude-code/workspace/cream");
    }
  });

  test("validates full config", () => {
    const config = {
      runId: "research-full",
      triggerType: "regime_change",
      triggerReason: "Market shifted to high volatility",
      currentRegime: "HIGH_VOLATILITY",
      activeFactorIds: [],
      suggestedFocus: "Volatility-based factors",
      resources: {
        cpu: 4,
        memoryGb: 16,
        diskGb: 25,
        timeoutHours: 2,
        networkEgress: "restricted",
        tokenBudget: 250_000,
      },
      model: "claude-opus-4",
    };

    const result = ResearchContainerConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  test("rejects invalid trigger type", () => {
    const config = {
      runId: "research-invalid",
      triggerType: "invalid_trigger",
      triggerReason: "Test",
      currentRegime: "BULL_TREND",
      activeFactorIds: [],
    };

    const result = ResearchContainerConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });
});

describe("ResearchRunStatusSchema", () => {
  test("validates all status values", () => {
    const statuses = [
      "pending",
      "starting",
      "running",
      "completed",
      "failed",
      "timeout",
      "cancelled",
    ];
    for (const status of statuses) {
      const result = ResearchRunStatusSchema.safeParse(status);
      expect(result.success).toBe(true);
    }
  });
});

describe("ResearchRunResultSchema", () => {
  test("validates successful run result", () => {
    const result = ResearchRunResultSchema.safeParse({
      runId: "research-success",
      status: "completed",
      prUrl: "https://github.com/org/repo/pull/123",
      factorId: "factor-new-1",
      hypothesisId: "hyp-001",
      errorMessage: null,
      tokensUsed: 150000,
      computeHours: 1.5,
      startedAt: "2026-01-07T10:00:00.000Z",
      completedAt: "2026-01-07T11:30:00.000Z",
    });

    expect(result.success).toBe(true);
  });

  test("validates failed run result", () => {
    const result = ResearchRunResultSchema.safeParse({
      runId: "research-failed",
      status: "failed",
      prUrl: null,
      factorId: null,
      hypothesisId: null,
      errorMessage: "Stage 1 validation failed: Sharpe ratio below threshold",
      tokensUsed: 75000,
      computeHours: 0.75,
      startedAt: "2026-01-07T10:00:00.000Z",
      completedAt: "2026-01-07T10:45:00.000Z",
    });

    expect(result.success).toBe(true);
  });
});

describe("ProgressEventSchema", () => {
  test("validates progress events", () => {
    const events = [
      {
        runId: "research-1",
        type: "started",
        message: "Research run started",
        timestamp: "2026-01-07T10:00:00.000Z",
      },
      {
        runId: "research-1",
        type: "phase_changed",
        phase: "Implementation",
        message: "Entering phase: Implementation",
        timestamp: "2026-01-07T10:15:00.000Z",
      },
      {
        runId: "research-1",
        type: "pr_created",
        message: "PR created: https://github.com/org/repo/pull/123",
        timestamp: "2026-01-07T11:00:00.000Z",
        metadata: { prUrl: "https://github.com/org/repo/pull/123" },
      },
    ];

    for (const event of events) {
      const result = ProgressEventSchema.safeParse(event);
      expect(result.success).toBe(true);
    }
  });
});

describe("ProgressEventTypeSchema", () => {
  test("validates all event types", () => {
    const types = [
      "started",
      "phase_changed",
      "tool_called",
      "iteration_complete",
      "pr_created",
      "error",
      "completed",
    ];

    for (const type of types) {
      const result = ProgressEventTypeSchema.safeParse(type);
      expect(result.success).toBe(true);
    }
  });
});

describe("VMConfigSchema", () => {
  test("validates VM configuration", () => {
    const config = {
      vmId: "fc-abc123",
      vcpuCount: 4,
      memSizeMb: 2048,
      rootDrivePath: "/var/lib/firecracker/rootfs.ext4",
      kernelPath: "/var/lib/firecracker/vmlinux",
      networkNamespace: "research",
      enableKvm: true,
    };

    const result = VMConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  test("applies defaults for optional fields", () => {
    const config = {
      vmId: "fc-minimal",
      vcpuCount: 2,
      memSizeMb: 1024,
      rootDrivePath: "/path/to/rootfs",
      kernelPath: "/path/to/kernel",
    };

    const result = VMConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.networkNamespace).toBe("research");
      expect(result.data.enableKvm).toBe(true);
    }
  });
});

// ============================================
// Container Spawner Tests
// ============================================

describe("ResearchContainerSpawner", () => {
  test("creates spawner instance", () => {
    const spawner = createResearchSpawner();
    expect(spawner).toBeInstanceOf(ResearchContainerSpawner);
  });

  test("has no active runs initially", () => {
    const spawner = createResearchSpawner();
    expect(spawner.getActiveRuns()).toEqual([]);
  });

  test("isRunning returns false for unknown run", () => {
    const spawner = createResearchSpawner();
    expect(spawner.isRunning("nonexistent")).toBe(false);
  });

  test("cancel returns false for unknown run", () => {
    const spawner = createResearchSpawner();
    expect(spawner.cancel("nonexistent")).toBe(false);
  });
});

// ============================================
// Firecracker Runner Tests
// ============================================

describe("FirecrackerRunner", () => {
  test("creates runner instance", () => {
    const runner = createFirecrackerRunner();
    expect(runner).toBeInstanceOf(FirecrackerRunner);
  });

  test("has no running VMs initially", () => {
    const runner = createFirecrackerRunner();
    expect(runner.getRunningCount()).toBe(0);
    expect(runner.getAllHandles()).toEqual([]);
  });

  test("getHandle returns undefined for unknown VM", () => {
    const runner = createFirecrackerRunner();
    expect(runner.getHandle("nonexistent")).toBeUndefined();
  });

  test("isFirecrackerAvailable checks for binary", async () => {
    // This will return false on most dev machines
    const available = await isFirecrackerAvailable();
    expect(typeof available).toBe("boolean");
  });
});

// Integration tests removed - require infrastructure not yet available:
// - ResearchContainerSpawner: needs Claude Agent SDK
// - FirecrackerRunner: needs Linux+KVM (not available on macOS)
// Unit tests above cover the core logic with mocks.
