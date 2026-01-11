/**
 * System Event Parser
 *
 * Handles fallback system event normalization for unrecognized message types.
 */

import type { NormalizedEvent } from "../types.js";
import { EVENT_ICONS } from "../types.js";

export function normalizeSystem(data: unknown, type: string, timestamp: Date): NormalizedEvent {
  const jsonString = JSON.stringify(data) ?? "";
  return {
    id: crypto.randomUUID(),
    timestamp,
    type: "system",
    icon: EVENT_ICONS.system,
    symbol: "",
    title: type,
    details: jsonString.slice(0, 100),
    color: "neutral",
    raw: data,
  };
}
