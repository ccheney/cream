/**
 * Backtest Event Parser
 *
 * Handles backtest started, progress, trade, equity, completed, and error event normalization.
 */

import type {
  BacktestCompletedData,
  BacktestEquityData,
  BacktestErrorData,
  BacktestProgressData,
  BacktestStartedData,
  BacktestTradeData,
  NormalizedEvent,
} from "../types";
import { EVENT_ICONS } from "../types";

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function normalizeBacktestStarted(
  data: BacktestStartedData,
  timestamp: Date
): NormalizedEvent {
  return {
    id: crypto.randomUUID(),
    timestamp,
    type: "backtest",
    icon: EVENT_ICONS.backtest,
    symbol: data.symbol || "",
    title: "Backtest started",
    details: data.backtestId ? `ID: ${data.backtestId.slice(0, 8)}` : "",
    color: "accent",
    raw: data,
  };
}

export function normalizeBacktestProgress(
  data: BacktestProgressData,
  timestamp: Date
): NormalizedEvent {
  const progress = data.progress ?? 0;
  return {
    id: crypto.randomUUID(),
    timestamp,
    type: "backtest",
    icon: EVENT_ICONS.backtest,
    symbol: "",
    title: "Backtest running",
    details: `${Math.round(progress * 100)}%${data.currentDate ? ` @ ${data.currentDate}` : ""}`,
    color: "accent",
    raw: data,
  };
}

export function normalizeBacktestTrade(data: BacktestTradeData, timestamp: Date): NormalizedEvent {
  const symbol = data.symbol || "???";
  const side = data.side?.toUpperCase() || "TRADE";
  const qty = data.quantity || 0;
  const price = data.price || 0;
  return {
    id: crypto.randomUUID(),
    timestamp,
    type: "backtest",
    icon: side === "BUY" ? "↗" : "↘",
    symbol,
    title: `${symbol} ${side} ${qty}`,
    details: formatCurrency(price),
    color: side === "BUY" ? "profit" : "loss",
    raw: data,
  };
}

export function normalizeBacktestEquity(
  data: BacktestEquityData,
  timestamp: Date
): NormalizedEvent {
  const equity = data.equity || 0;
  return {
    id: crypto.randomUUID(),
    timestamp,
    type: "backtest",
    icon: "📈",
    symbol: "",
    title: "Equity update",
    details: `${formatCurrency(equity)}${data.date ? ` @ ${data.date}` : ""}`,
    color: "neutral",
    raw: data,
  };
}

export function normalizeBacktestCompleted(
  data: BacktestCompletedData,
  timestamp: Date
): NormalizedEvent {
  const returnPct = data.totalReturn ?? 0;
  const sharpe = data.sharpe;
  return {
    id: crypto.randomUUID(),
    timestamp,
    type: "backtest",
    icon: "✓",
    symbol: "",
    title: "Backtest completed",
    details: `Return: ${returnPct >= 0 ? "+" : ""}${(returnPct * 100).toFixed(2)}%${sharpe !== undefined ? ` Sharpe: ${sharpe.toFixed(2)}` : ""}`,
    color: returnPct >= 0 ? "profit" : "loss",
    raw: data,
  };
}

export function normalizeBacktestError(data: BacktestErrorData, timestamp: Date): NormalizedEvent {
  return {
    id: crypto.randomUUID(),
    timestamp,
    type: "backtest",
    icon: "✗",
    symbol: "",
    title: "Backtest failed",
    details: data.error?.slice(0, 60) || "Unknown error",
    color: "loss",
    raw: data,
  };
}
