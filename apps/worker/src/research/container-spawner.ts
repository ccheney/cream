/**
 * Research Container Spawner
 *
 * Spawns Claude Code agents in isolated environments for autonomous research.
 * Uses the Claude Agent SDK with security guardrails.
 *
 * NOTE: This is a stub implementation. The actual Claude Agent SDK integration
 * will be completed when the SDK is publicly released. Current implementation
 * provides the interface and types for future integration.
 *
 * @see docs/plans/20-research-to-production-pipeline.md
 * @see https://github.com/anthropics/claude-agent-sdk-typescript
 */

import type {
  Guardrails,
  ProgressCallback,
  ProgressEvent,
  ResearchContainerConfig,
  ResearchRunResult,
  ResearchRunStatus,
} from "./types.js";

// ============================================
// Research Prompt Builder
// ============================================

/**
 * Build the research prompt from configuration
 */
export function buildResearchPrompt(config: ResearchContainerConfig): string {
  const factorContext =
    config.activeFactorIds.length > 0
      ? `Active factors: ${config.activeFactorIds.join(", ")}`
      : "No active factors currently in the Factor Zoo.";

  return `You are a quantitative research agent for the Cream trading system.

## Research Context
- **Trigger**: ${config.triggerType} - ${config.triggerReason}
- **Current Market Regime**: ${config.currentRegime}
- ${factorContext}
${config.suggestedFocus ? `- **Suggested Focus**: ${config.suggestedFocus}` : ""}

## Your Mission
Develop a new alpha factor following the AlphaForge research pipeline:

1. **Idea Generation**: Propose an economic hypothesis explaining market inefficiency
2. **Implementation**: Create Python factor code in \`packages/research/research/factors/\`
3. **Stage 1 Validation**: Run backtest with target Sharpe > 1.0, IC > 0.03
4. **Stage 2 Validation**: Statistical rigor (PBO < 0.1, DSR p-value < 0.05)
5. **TypeScript Translation**: Port to \`packages/indicators/src/\`
6. **Equivalence Testing**: Ensure TS and Python produce identical signals
7. **Documentation**: Create markdown explaining the hypothesis and methodology

## Output Requirements
- All code must pass linting and type checks
- Create a PR to the \`factor/<factor-name>\` branch
- Include full test coverage for the factor
- Document the economic rationale

## Constraints
- Do NOT access production databases
- Do NOT execute live trades
- Do NOT push to main/master branches
- Commit all work to feature branches only

When you have created a PR, respond with: "PR created: <url>"
If research fails, respond with: "Research failed: <reason>"

Begin your research now.`;
}

// ============================================
// Permission Callback
// ============================================

/**
 * Permission check result
 */
export interface PermissionResult {
  behavior: "allow" | "deny";
  message?: string;
  updatedInput?: Record<string, unknown>;
}

/**
 * Create permission callback that enforces guardrails
 */
export function createPermissionCallback(guardrails: Guardrails) {
  return async (toolName: string, input: Record<string, unknown>): Promise<PermissionResult> => {
    // Allow read-only operations
    if (["Read", "Grep", "Glob", "WebSearch", "WebFetch"].includes(toolName)) {
      return { behavior: "allow", updatedInput: input };
    }

    // Check bash commands
    if (toolName === "Bash") {
      const command = String(input.command ?? "");

      // Block dangerous commands
      for (const blocked of guardrails.blockedCommands) {
        if (command.includes(blocked)) {
          return {
            behavior: "deny",
            message: `Blocked command pattern: ${blocked}`,
          };
        }
      }

      // Block git push to protected branches
      if (command.includes("git push")) {
        for (const branch of guardrails.blockedBranches) {
          if (command.includes(branch)) {
            return {
              behavior: "deny",
              message: `Cannot push to protected branch: ${branch}`,
            };
          }
        }
      }

      // Block API calls to production
      for (const api of guardrails.blockedApis) {
        if (command.includes(api)) {
          return {
            behavior: "deny",
            message: `Blocked API access: ${api}`,
          };
        }
      }
    }

    // Check file writes
    if (toolName === "Write" || toolName === "Edit") {
      const filePath = String(input.file_path ?? "");

      // Block writes to system paths
      if (
        filePath.startsWith("/etc/") ||
        filePath.startsWith("/usr/") ||
        filePath.startsWith("/bin/")
      ) {
        return {
          behavior: "deny",
          message: "Cannot write to system paths",
        };
      }
    }

    return { behavior: "allow", updatedInput: input };
  };
}

// ============================================
// Container Spawner
// ============================================

/**
 * Spawns and manages research containers running Claude Code
 *
 * NOTE: This is a stub implementation. The `executeInContainer` method
 * will be implemented when the Claude Agent SDK is publicly available.
 */
export class ResearchContainerSpawner {
  private activeRuns: Map<string, AbortController> = new Map();

  /**
   * Generate unique run ID
   */
  private generateRunId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `research-${timestamp}-${random}`;
  }

  /**
   * Spawn a new research container
   *
   * Launches the container asynchronously and returns immediately.
   * Progress can be monitored via the onProgress callback.
   *
   * NOTE: Currently a stub - returns immediately with "pending" status.
   * Full implementation requires Claude Agent SDK.
   */
  async spawn(
    config: Omit<ResearchContainerConfig, "runId">,
    onProgress?: ProgressCallback
  ): Promise<ResearchRunResult> {
    const runId = this.generateRunId();
    const fullConfig: ResearchContainerConfig = { ...config, runId };
    const startedAt = new Date().toISOString();

    // Create abort controller for cancellation
    const abortController = new AbortController();
    this.activeRuns.set(runId, abortController);

    // Emit start event
    if (onProgress) {
      await onProgress({
        runId,
        type: "started",
        message: `Research run started: ${config.triggerReason}`,
        timestamp: startedAt,
        metadata: { config: fullConfig },
      });
    }

    // Execute in background (don't await)
    this.executeInContainer(fullConfig, onProgress, abortController.signal).catch((error) => {
      if (onProgress) {
        onProgress({
          runId,
          type: "error",
          message: `Unhandled error: ${error instanceof Error ? error.message : String(error)}`,
          timestamp: new Date().toISOString(),
        });
      }
    });

    return {
      runId,
      status: "running",
      prUrl: null,
      factorId: null,
      hypothesisId: null,
      errorMessage: null,
      tokensUsed: 0,
      computeHours: 0,
      startedAt,
      completedAt: null,
    };
  }

  /**
   * Execute Claude Code in the container
   *
   * NOTE: Stub implementation. Will integrate with Claude Agent SDK
   * when publicly available. Currently emits a "not implemented" error.
   */
  private async executeInContainer(
    config: ResearchContainerConfig,
    onProgress?: ProgressCallback,
    _signal?: AbortSignal
  ): Promise<void> {
    // Build prompt for documentation/testing purposes
    const _prompt = buildResearchPrompt(config);
    const _permissionCallback = createPermissionCallback(config.guardrails);

    // Stub: Emit error indicating SDK is not yet available
    await this.emitProgress(onProgress, {
      runId: config.runId,
      type: "error",
      message:
        "Claude Agent SDK not yet available. " +
        "This is a stub implementation that will be completed when the SDK is released. " +
        "See: https://github.com/anthropics/claude-agent-sdk-typescript",
      timestamp: new Date().toISOString(),
    });

    // Mark as completed (failed)
    await this.emitProgress(onProgress, {
      runId: config.runId,
      type: "completed",
      message: "Research run failed: SDK not available",
      timestamp: new Date().toISOString(),
      metadata: { status: "failed" as ResearchRunStatus },
    });

    this.activeRuns.delete(config.runId);
  }

  /**
   * Handle assistant messages, looking for completion markers
   */
  async handleAssistantMessage(
    runId: string,
    content: string,
    onProgress?: ProgressCallback
  ): Promise<void> {
    // Check for PR creation
    const prMatch = content.match(/PR created:\s*(https?:\/\/[^\s]+)/i);
    if (prMatch) {
      await this.emitProgress(onProgress, {
        runId,
        type: "pr_created",
        message: `PR created: ${prMatch[1]}`,
        timestamp: new Date().toISOString(),
        metadata: { prUrl: prMatch[1] },
      });
      return;
    }

    // Check for failure
    const failMatch = content.match(/Research failed:\s*(.+)/i);
    if (failMatch) {
      await this.emitProgress(onProgress, {
        runId,
        type: "error",
        message: `Research failed: ${failMatch[1]}`,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Check for phase changes
    const phaseKeywords = [
      "Idea Generation",
      "Implementation",
      "Stage 1",
      "Stage 2",
      "Translation",
      "Equivalence",
      "Documentation",
    ];
    for (const phase of phaseKeywords) {
      if (content.includes(phase)) {
        await this.emitProgress(onProgress, {
          runId,
          type: "phase_changed",
          phase,
          message: `Entering phase: ${phase}`,
          timestamp: new Date().toISOString(),
        });
        break;
      }
    }
  }

  /**
   * Emit progress event if callback is provided
   */
  private async emitProgress(
    callback: ProgressCallback | undefined,
    event: ProgressEvent
  ): Promise<void> {
    if (callback) {
      await callback(event);
    }
  }

  /**
   * Cancel a running research container
   */
  cancel(runId: string): boolean {
    const controller = this.activeRuns.get(runId);
    if (controller) {
      controller.abort();
      this.activeRuns.delete(runId);
      return true;
    }
    return false;
  }

  /**
   * Get list of active run IDs
   */
  getActiveRuns(): string[] {
    return Array.from(this.activeRuns.keys());
  }

  /**
   * Check if a run is active
   */
  isRunning(runId: string): boolean {
    return this.activeRuns.has(runId);
  }
}

/**
 * Create a new ResearchContainerSpawner instance
 */
export function createResearchSpawner(): ResearchContainerSpawner {
  return new ResearchContainerSpawner();
}
