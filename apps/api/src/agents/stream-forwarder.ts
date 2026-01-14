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
 */

import type { AgentType } from "@cream/agents";

import type { AgentStreamChunk, OnStreamChunk } from "./types.js";

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
        if (!text) return;
        await onChunk({
          ...streamChunkBase,
          type: "text-delta",
          payload: { text },
        });
        return;
      }

      case "reasoning-delta": {
        const text = asNonEmptyString(payload.text);
        if (!text) return;
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
        if (!toolCallId) return;

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
        if (!toolCallId) return;

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
        if (!toolCallId) return;

        const existing = toolArgsById.get(toolCallId);
        // If we never saw a corresponding start/delta, don't emit an "unknown" tool-call
        // that can overwrite a previously emitted tool-call with real args.
        if (!existing) return;

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
        if (!err) return;
        await onChunk({
          ...streamChunkBase,
          type: "error",
          payload: { error: err },
        });
        return;
      }
    }
  };
}
