/**
 * Order Event Parser
 *
 * Handles order, fill, and reject event normalization.
 */

import type { EventType, NormalizedEvent, OrderData } from "../types.js";
import { EVENT_ICONS } from "../types.js";

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function normalizeOrder(data: OrderData, timestamp: Date): NormalizedEvent {
  const symbol = data.symbol || "???";
  const status = data.status?.toUpperCase() || "PENDING";
  const side = data.side?.toUpperCase() || "";
  const qty = data.qty || 0;

  let type: EventType = "order";
  let color: NormalizedEvent["color"] = "neutral";
  let icon = EVENT_ICONS.order;

  if (status === "FILLED") {
    type = "fill";
    icon = EVENT_ICONS.fill;
    color = side === "BUY" ? "profit" : "loss";
  } else if (status === "REJECTED" || status === "CANCELED") {
    type = "reject";
    icon = EVENT_ICONS.reject;
    color = "loss";
  }

  const priceInfo = data.avgFillPrice ? ` @ ${formatCurrency(data.avgFillPrice)}` : "";

  return {
    id: crypto.randomUUID(),
    timestamp,
    type,
    icon,
    symbol,
    title: `${symbol} ${side} ${qty}`,
    details: `${status}${priceInfo}`,
    color,
    raw: data,
  };
}
