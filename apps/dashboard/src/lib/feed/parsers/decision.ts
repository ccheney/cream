/**
 * Decision Event Parser
 *
 * Handles decision and decision plan event normalization.
 */

import type { DecisionData, DecisionPlanData, NormalizedEvent } from "../types";
import { EVENT_ICONS } from "../types";

function getDecisionColor(action: string): NormalizedEvent["color"] {
  switch (action) {
    case "BUY":
      return "profit";
    case "SELL":
      return "loss";
    default:
      return "neutral";
  }
}

export function normalizeDecision(data: DecisionData, timestamp: Date): NormalizedEvent {
  const symbol = data.instrument?.symbol || "???";
  const action = data.action || "HOLD";
  const consensus = data.consensus
    ? `(consensus ${data.consensus.agreeing}/${data.consensus.total})`
    : "";

  return {
    id: crypto.randomUUID(),
    timestamp,
    type: "decision",
    icon: EVENT_ICONS.decision,
    symbol,
    title: `${symbol} ${action}`,
    details: consensus,
    color: getDecisionColor(action),
    raw: data,
  };
}

export function normalizeDecisionPlan(data: DecisionPlanData, timestamp: Date): NormalizedEvent {
  const symbol = data.symbol || "???";
  const action = data.action || "PLAN";
  const direction = data.direction || "";

  return {
    id: crypto.randomUUID(),
    timestamp,
    type: "decision",
    icon: "📋",
    symbol,
    title: `${symbol} ${action}`,
    details: direction ? `Direction: ${direction}` : "Plan generated",
    color: "accent",
    raw: data,
  };
}
