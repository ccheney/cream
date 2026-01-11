/**
 * Agent Event Parser
 *
 * Handles agent output, tool call, tool result, reasoning, text delta, and status event normalization.
 */

import type {
  AgentOutputData,
  AgentReasoningData,
  AgentStatusData,
  AgentTextDeltaData,
  AgentToolCallData,
  AgentToolResultData,
  NormalizedEvent,
} from "../types";
import { EVENT_ICONS } from "../types";

function getSeverityColor(severity?: string): NormalizedEvent["color"] {
  switch (severity) {
    case "error":
      return "loss";
    case "warning":
      return "neutral";
    default:
      return "accent";
  }
}

export function normalizeAgentOutput(data: AgentOutputData, timestamp: Date): NormalizedEvent {
  const agent = data.agentType || "unknown";
  const status = data.status || "";
  return {
    id: crypto.randomUUID(),
    timestamp,
    type: "agent",
    icon: EVENT_ICONS.agent,
    symbol: data.symbol || "",
    title: `${agent} agent`,
    details: status,
    color: "accent",
    raw: data,
  };
}

export function normalizeAgentToolCall(data: AgentToolCallData, timestamp: Date): NormalizedEvent {
  const agent = data.agentType || "agent";
  const tool = data.toolName || "tool";
  return {
    id: crypto.randomUUID(),
    timestamp,
    type: "agent",
    icon: "🔧",
    symbol: data.symbol || "",
    title: `${agent} → ${tool}`,
    details: "Tool call",
    color: "accent",
    raw: data,
  };
}

export function normalizeAgentToolResult(
  data: AgentToolResultData,
  timestamp: Date
): NormalizedEvent {
  const agent = data.agentType || "agent";
  const tool = data.toolName || "tool";
  const success = data.success !== false;
  return {
    id: crypto.randomUUID(),
    timestamp,
    type: "agent",
    icon: success ? "✓" : "✗",
    symbol: data.symbol || "",
    title: `${agent} ← ${tool}`,
    details: success ? "Result received" : "Tool failed",
    color: success ? "profit" : "loss",
    raw: data,
  };
}

export function normalizeAgentReasoning(
  data: AgentReasoningData,
  timestamp: Date
): NormalizedEvent {
  const agent = data.agentType || "agent";
  const text = data.text || "";
  return {
    id: crypto.randomUUID(),
    timestamp,
    type: "agent",
    icon: "💭",
    symbol: data.symbol || "",
    title: `${agent} thinking`,
    details: text.slice(0, 80) + (text.length > 80 ? "..." : ""),
    color: "neutral",
    raw: data,
  };
}

export function normalizeAgentTextDelta(
  data: AgentTextDeltaData,
  timestamp: Date
): NormalizedEvent {
  const agent = data.agentType || "agent";
  const text = data.text || "";
  return {
    id: crypto.randomUUID(),
    timestamp,
    type: "agent",
    icon: "📝",
    symbol: data.symbol || "",
    title: `${agent} output`,
    details: text.slice(0, 80) + (text.length > 80 ? "..." : ""),
    color: "neutral",
    raw: data,
  };
}

export function normalizeAgentStatus(data: AgentStatusData, timestamp: Date): NormalizedEvent {
  const agent = data.displayName || data.type || "agent";
  const status = data.status || "idle";
  return {
    id: crypto.randomUUID(),
    timestamp,
    type: "agent",
    icon: EVENT_ICONS.agent,
    symbol: data.symbol || "",
    title: agent,
    details: status,
    color: status === "running" ? "accent" : "neutral",
    raw: data,
  };
}

export function normalizeAlert(
  data: { severity?: string; title?: string; message?: string; symbol?: string },
  timestamp: Date
): NormalizedEvent {
  return {
    id: crypto.randomUUID(),
    timestamp,
    type: "alert",
    icon: EVENT_ICONS.alert,
    symbol: data.symbol || "",
    title: data.title || "Alert",
    details: data.message || "",
    color: getSeverityColor(data.severity),
    raw: data,
  };
}
