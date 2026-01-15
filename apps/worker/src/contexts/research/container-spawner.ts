/**
 * Research Container Spawner
 *
 * Spawns Claude Code agents in isolated environments for autonomous research.
 * Uses the Claude Agent SDK with security guardrails.
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
// SDK Types (from @anthropic-ai/claude-agent-sdk)
// ============================================

interface SDKMessage {
	type: string;
	session_id: string;
	message?: {
		role: string;
		content: Array<{ type: string; text?: string }>;
	};
}

interface SessionOptions {
	model?: string;
	maxTurns?: number;
	cwd?: string;
	allowedTools?: string[];
	additionalDirectories?: string[];
	canUseTool?: (
		toolName: string,
		toolInput: unknown
	) => Promise<{ behavior: "allow" | "deny"; message?: string }>;
}

interface Session {
	send(message: string): Promise<void>;
	stream(): AsyncGenerator<SDKMessage>;
	close(): void;
}

type CreateSessionFunction = (options: SessionOptions) => Session;

interface SDKProvider {
	createSession: CreateSessionFunction;
}

// ============================================
// SDK Loader
// ============================================

let cachedProvider: SDKProvider | null = null;

async function loadSDKProvider(): Promise<SDKProvider | null> {
	if (cachedProvider) {
		return cachedProvider;
	}

	try {
		const sdk = await import("@anthropic-ai/claude-agent-sdk");
		cachedProvider = {
			createSession: sdk.unstable_v2_createSession as CreateSessionFunction,
		};
		return cachedProvider;
	} catch {
		return null;
	}
}

// ============================================
// Research Prompt Builder
// ============================================

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

export interface PermissionResult {
	behavior: "allow" | "deny";
	message?: string;
	updatedInput?: Record<string, unknown>;
}

export function createPermissionCallback(guardrails: Guardrails) {
	return async (toolName: string, input: Record<string, unknown>): Promise<PermissionResult> => {
		if (["Read", "Grep", "Glob", "WebSearch", "WebFetch"].includes(toolName)) {
			return { behavior: "allow", updatedInput: input };
		}

		if (toolName === "Bash") {
			const command = String(input.command ?? "");

			for (const blocked of guardrails.blockedCommands) {
				if (command.includes(blocked)) {
					return {
						behavior: "deny",
						message: `Blocked command pattern: ${blocked}`,
					};
				}
			}

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

			for (const api of guardrails.blockedApis) {
				if (command.includes(api)) {
					return {
						behavior: "deny",
						message: `Blocked API access: ${api}`,
					};
				}
			}
		}

		if (toolName === "Write" || toolName === "Edit") {
			const filePath = String(input.file_path ?? "");

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

export class ResearchContainerSpawner {
	private activeRuns: Map<string, AbortController> = new Map();

	private generateRunId(): string {
		const timestamp = Date.now().toString(36);
		const random = Math.random().toString(36).substring(2, 8);
		return `research-${timestamp}-${random}`;
	}

	async spawn(
		config: Omit<ResearchContainerConfig, "runId">,
		onProgress?: ProgressCallback
	): Promise<ResearchRunResult> {
		const runId = this.generateRunId();
		const fullConfig: ResearchContainerConfig = { ...config, runId };
		const startedAt = new Date().toISOString();

		const abortController = new AbortController();
		this.activeRuns.set(runId, abortController);

		if (onProgress) {
			await onProgress({
				runId,
				type: "started",
				message: `Research run started: ${config.triggerReason}`,
				timestamp: startedAt,
				metadata: { config: fullConfig },
			});
		}

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

	private async executeInContainer(
		config: ResearchContainerConfig,
		onProgress?: ProgressCallback,
		signal?: AbortSignal
	): Promise<void> {
		const prompt = buildResearchPrompt(config);
		const permissionCallback = createPermissionCallback(config.guardrails);

		const sdkProvider = await loadSDKProvider();

		if (!sdkProvider) {
			await this.emitProgress(onProgress, {
				runId: config.runId,
				type: "error",
				message:
					"Claude Agent SDK not installed. Install with: bun add @anthropic-ai/claude-agent-sdk",
				timestamp: new Date().toISOString(),
			});

			await this.emitProgress(onProgress, {
				runId: config.runId,
				type: "completed",
				message: "Research run failed: SDK not available",
				timestamp: new Date().toISOString(),
				metadata: { status: "failed" as ResearchRunStatus },
			});

			this.activeRuns.delete(config.runId);
			return;
		}

		const session = sdkProvider.createSession({
			model: "claude-sonnet-4-20250514",
			maxTurns: 50,
			cwd: process.cwd(),
			allowedTools: ["Read", "Write", "Edit", "Grep", "Glob", "Bash", "WebSearch", "WebFetch"],
			additionalDirectories: ["packages/research", "packages/indicators", "packages/domain"],
			canUseTool: async (toolName: string, toolInput: unknown) => {
				const result = await permissionCallback(toolName, toolInput as Record<string, unknown>);
				return {
					behavior: result.behavior,
					message: result.message,
				};
			},
		});

		try {
			await session.send(prompt);

			let turnsUsed = 0;
			let prUrl: string | null = null;
			let lastError: string | null = null;

			for await (const message of session.stream()) {
				if (signal?.aborted) {
					await this.emitProgress(onProgress, {
						runId: config.runId,
						type: "completed",
						message: "Research run cancelled",
						timestamp: new Date().toISOString(),
						metadata: { status: "cancelled" as ResearchRunStatus },
					});
					break;
				}

				if (message.type === "assistant" && message.message?.content) {
					turnsUsed++;

					const textContent = message.message.content
						.filter((c) => c.type === "text" && c.text)
						.map((c) => c.text)
						.join("\n");

					if (textContent) {
						await this.handleAssistantMessage(config.runId, textContent, onProgress);

						const prMatch = textContent.match(/PR created:\s*(https?:\/\/[^\s]+)/i);
						if (prMatch?.[1]) {
							prUrl = prMatch[1];
						}

						const failMatch = textContent.match(/Research failed:\s*(.+)/i);
						if (failMatch?.[1]) {
							lastError = failMatch[1];
						}
					}

					await this.emitProgress(onProgress, {
						runId: config.runId,
						type: "iteration_complete",
						message: `Turn ${turnsUsed} completed`,
						timestamp: new Date().toISOString(),
						metadata: { turnsUsed },
					});
				}
			}

			const finalStatus: ResearchRunStatus = prUrl
				? "completed"
				: lastError
					? "failed"
					: "completed";

			await this.emitProgress(onProgress, {
				runId: config.runId,
				type: "completed",
				message: prUrl
					? `Research completed with PR: ${prUrl}`
					: lastError
						? `Research failed: ${lastError}`
						: "Research completed",
				timestamp: new Date().toISOString(),
				metadata: {
					status: finalStatus,
					prUrl,
					turnsUsed,
					errorMessage: lastError,
				},
			});
		} catch (error) {
			await this.emitProgress(onProgress, {
				runId: config.runId,
				type: "error",
				message: `Session error: ${error instanceof Error ? error.message : String(error)}`,
				timestamp: new Date().toISOString(),
			});

			await this.emitProgress(onProgress, {
				runId: config.runId,
				type: "completed",
				message: "Research run failed",
				timestamp: new Date().toISOString(),
				metadata: { status: "failed" as ResearchRunStatus },
			});
		} finally {
			session.close();
			this.activeRuns.delete(config.runId);
		}
	}

	async handleAssistantMessage(
		runId: string,
		content: string,
		onProgress?: ProgressCallback
	): Promise<void> {
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

	private async emitProgress(
		callback: ProgressCallback | undefined,
		event: ProgressEvent
	): Promise<void> {
		if (callback) {
			await callback(event);
		}
	}

	cancel(runId: string): boolean {
		const controller = this.activeRuns.get(runId);
		if (controller) {
			controller.abort();
			this.activeRuns.delete(runId);
			return true;
		}
		return false;
	}

	getActiveRuns(): string[] {
		return Array.from(this.activeRuns.keys());
	}

	isRunning(runId: string): boolean {
		return this.activeRuns.has(runId);
	}
}

export function createResearchSpawner(): ResearchContainerSpawner {
	return new ResearchContainerSpawner();
}
