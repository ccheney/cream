/**
 * Mastra stream → AgentStreamChunk forwarder.
 *
 * Mastra/AI SDK can emit tool call inputs as streaming chunks:
 * - tool-call-input-streaming-start
 * - tool-call-delta
 * - tool-call-input-streaming-end
 *
 * Our UI only understands "tool-call" + "tool-result", so we synthesize/upgrade
 * tool-call chunks from the streaming input events to ensure tool calls surface.
 *
 * Additionally handles:
 * - source: Google Search grounding citations with URLs and titles
 * - start/finish: Stream lifecycle events
 * - Various boundary events (text-start, reasoning-end, etc.) - silently ignored
 */

import type { AgentType } from "@cream/agents";
import { createNodeLogger } from "@cream/logger";

import type { AgentStreamChunk, OnStreamChunk } from "./types.js";

const log = createNodeLogger({ service: "stream-forwarder", level: "debug" });

type MastraStreamChunk = { type: string; payload?: Record<string, unknown> };

type ToolCallArgsAccumulator = Map<string, { toolName?: string; argsText: string }>;

function asNonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function safeParseJsonObject(text: string): Record<string, unknown> | undefined {
	try {
		const parsed = JSON.parse(text) as unknown;
		if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
	} catch {
		// ignore
	}
	return undefined;
}

export function createStreamChunkForwarder(agentType: AgentType, onChunk: OnStreamChunk) {
	const toolArgsById: ToolCallArgsAccumulator = new Map();

	return async (chunk: MastraStreamChunk): Promise<void> => {
		const timestamp = new Date().toISOString();
		const payload = chunk.payload ?? {};

		const streamChunkBase = {
			agentType,
			timestamp,
		} satisfies Pick<AgentStreamChunk, "agentType" | "timestamp">;

		switch (chunk.type) {
			case "text-delta": {
				const text = asNonEmptyString(payload.text);
				if (!text) {
					return;
				}
				await onChunk({
					...streamChunkBase,
					type: "text-delta",
					payload: { text },
				});
				return;
			}

			case "reasoning-delta": {
				const text = asNonEmptyString(payload.text);
				if (!text) {
					return;
				}
				await onChunk({
					...streamChunkBase,
					type: "reasoning-delta",
					payload: { text },
				});
				return;
			}

			case "tool-call": {
				const toolCallId = asNonEmptyString(payload.toolCallId);
				const toolName = asNonEmptyString(payload.toolName) ?? "unknown";
				const toolArgs =
					typeof payload.args === "object" && payload.args !== null && !Array.isArray(payload.args)
						? (payload.args as Record<string, unknown>)
						: {};

				await onChunk({
					...streamChunkBase,
					type: "tool-call",
					payload: { toolCallId, toolName, toolArgs },
				});
				return;
			}

			case "tool-result": {
				const toolCallId = asNonEmptyString(payload.toolCallId);
				const toolName = asNonEmptyString(payload.toolName) ?? "unknown";
				const result = payload.result;
				const isError = payload.isError === true;

				if (toolCallId) {
					toolArgsById.delete(toolCallId);
				}

				await onChunk({
					...streamChunkBase,
					type: "tool-result",
					payload: { toolCallId, toolName, result, success: !isError },
				});
				return;
			}

			// Tool call input streaming (Gemini 3 / AI SDK v6 emits these)
			case "tool-call-streaming-start":
			case "tool-call-input-streaming-start": {
				const toolCallId = asNonEmptyString(payload.toolCallId);
				if (!toolCallId) {
					return;
				}

				const toolName = asNonEmptyString(payload.toolName) ?? "unknown";
				toolArgsById.set(toolCallId, { toolName, argsText: "" });

				// Emit a placeholder tool-call so the UI can show "tool is being called"
				// even before args are fully streamed.
				await onChunk({
					...streamChunkBase,
					type: "tool-call",
					payload: { toolCallId, toolName, toolArgs: {} },
				});
				return;
			}

			case "tool-call-delta": {
				const toolCallId = asNonEmptyString(payload.toolCallId);
				if (!toolCallId) {
					return;
				}

				const argsTextDelta = asNonEmptyString(payload.argsTextDelta) ?? "";
				const existing = toolArgsById.get(toolCallId) ?? {
					toolName: asNonEmptyString(payload.toolName),
					argsText: "",
				};

				existing.toolName = existing.toolName ?? asNonEmptyString(payload.toolName);
				existing.argsText += argsTextDelta;
				toolArgsById.set(toolCallId, existing);
				return;
			}

			case "tool-call-streaming-end":
			case "tool-call-input-streaming-end": {
				const toolCallId = asNonEmptyString(payload.toolCallId);
				if (!toolCallId) {
					return;
				}

				const existing = toolArgsById.get(toolCallId);
				// If we never saw a corresponding start/delta, don't emit an "unknown" tool-call
				// that can overwrite a previously emitted tool-call with real args.
				if (!existing) {
					return;
				}

				const toolName = asNonEmptyString(payload.toolName) ?? existing?.toolName ?? "unknown";
				const argsText = existing?.argsText ?? "";

				// If no args were streamed, nothing to upgrade (placeholder already emitted).
				if (argsText.length === 0) {
					toolArgsById.delete(toolCallId);
					return;
				}

				const toolArgs =
					safeParseJsonObject(argsText) ??
					(argsText.length > 0 ? ({ _raw: argsText } as Record<string, unknown>) : {});

				await onChunk({
					...streamChunkBase,
					type: "tool-call",
					payload: { toolCallId, toolName, toolArgs },
				});

				toolArgsById.delete(toolCallId);
				return;
			}

			case "error": {
				const err =
					payload.error instanceof Error ? payload.error.message : asNonEmptyString(payload.error);
				if (!err) {
					return;
				}
				await onChunk({
					...streamChunkBase,
					type: "error",
					payload: { error: err },
				});
				return;
			}

			// Source chunks contain grounding citations (Google Search results)
			case "source": {
				const sourceType = asNonEmptyString(payload.sourceType);
				// Only forward URL sources (main type from Google Search grounding)
				if (sourceType !== "url") {
					return;
				}
				const sourceId = asNonEmptyString(payload.id);
				const url = asNonEmptyString(payload.url);
				const title = asNonEmptyString(payload.title);
				const providerMetadata =
					typeof payload.providerMetadata === "object" && payload.providerMetadata !== null
						? (payload.providerMetadata as Record<string, unknown>)
						: undefined;

				await onChunk({
					...streamChunkBase,
					type: "source",
					payload: { sourceId, sourceType, url, title, providerMetadata },
				});
				return;
			}

			// Lifecycle events - forward start/finish for UI status updates
			case "start": {
				await onChunk({
					...streamChunkBase,
					type: "start",
					payload: {},
				});
				return;
			}

			case "finish": {
				await onChunk({
					...streamChunkBase,
					type: "finish",
					payload: {},
				});
				return;
			}

			// Boundary events - these mark start/end of text/reasoning blocks
			// We don't need to forward these as UI tracks via delta events
			case "text-start":
			case "text-end":
			case "reasoning-start":
			case "reasoning-end":
			// Step events - internal lifecycle, not needed for UI
			case "step-start":
			case "start-step":
			case "step-finish":
			case "finish-step":
			// Object streaming - handled via final stream.object, not needed incrementally
			case "object":
			case "object-result":
			// Raw provider data - not useful for UI
			case "raw":
			// File chunks - not used in our agents
			case "file": {
				// Known chunk types that we intentionally don't forward
				return;
			}

			default: {
				// Log truly unhandled chunk types for debugging
				log.debug(
					{
						agentType,
						chunkType: chunk.type,
						payloadKeys: Object.keys(payload),
					},
					"Unhandled stream chunk type"
				);
			}
		}
	};
}
