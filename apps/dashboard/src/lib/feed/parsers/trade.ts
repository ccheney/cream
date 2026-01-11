/**
 * Trade Event Parser
 *
 * Handles equity trade and aggregate (candle) event normalization.
 */

import type { AggregateData, NormalizedEvent, TradeData } from "../types";
import { EVENT_ICONS } from "../types";

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

const EXCHANGE_NAMES: Record<number, string> = {
  1: "NYSE",
  2: "AMEX",
  3: "ARCA",
  4: "NASDAQ",
  5: "BATS",
  6: "IEX",
};

export function normalizeTrade(data: TradeData, timestamp: Date): NormalizedEvent {
  const exchange = data.x ? EXCHANGE_NAMES[data.x] || `EX${data.x}` : "";
  return {
    id: crypto.randomUUID(),
    timestamp,
    type: "trade",
    icon: EVENT_ICONS.trade,
    symbol: data.sym,
    title: `${data.sym}`,
    details: `${data.s} @ ${formatCurrency(data.p)}  ${exchange}`,
    color: "neutral",
    raw: data,
  };
}

export function normalizeAggregate(data: AggregateData, timestamp: Date): NormalizedEvent {
  const change = data.close - data.open;
  const changePercent = data.open > 0 ? (change / data.open) * 100 : 0;
  return {
    id: crypto.randomUUID(),
    timestamp,
    type: "trade",
    icon: EVENT_ICONS.trade,
    symbol: data.symbol,
    title: data.symbol,
    details: `${formatCurrency(data.close)} ${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}%  Vol: ${(data.volume / 1000).toFixed(1)}K`,
    color: change >= 0 ? "profit" : "loss",
    raw: data,
  };
}
