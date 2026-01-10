/**
 * Event Normalizer for Unified Feed
 *
 * Converts various WebSocket message types into a normalized event format
 * for display in the unified event feed.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 3.1
 */

// Server message types we handle
// Using a local interface to avoid dependency on server-side @cream/domain
export interface WebSocketMessage {
  type: string;
  data?: unknown;
  cycleId?: string;
}

// ============================================
// Types
// ============================================

export type EventType =
  | "quote"
  | "trade"
  | "options_quote"
  | "options_trade"
  | "decision"
  | "order"
  | "fill"
  | "reject"
  | "alert"
  | "agent"
  | "cycle"
  | "backtest"
  | "system";

export interface NormalizedEvent {
  id: string;
  timestamp: Date;
  type: EventType;
  icon: string;
  symbol: string;
  contractSymbol?: string;
  title: string;
  details: string;
  color: "profit" | "loss" | "neutral" | "accent";
  raw?: unknown;
}

// ============================================
// Icon Map
// ============================================

const EVENT_ICONS: Record<EventType, string> = {
  quote: "●",
  trade: "◆",
  options_quote: "●",
  options_trade: "◇",
  decision: "★",
  order: "◉",
  fill: "✓",
  reject: "✗",
  alert: "⚠",
  agent: "◈",
  cycle: "↻",
  backtest: "▶",
  system: "⚙",
};

// ============================================
// Helpers
// ============================================

/**
 * Parse OCC contract symbol to human-readable format.
 * Example: O:AAPL250117C00190000 → AAPL Jan17 $190C
 */
export function parseContractSymbol(occ: string): {
  underlying: string;
  expiry: string;
  strike: string;
  type: "C" | "P";
} {
  // OCC format: O:SYMBOL210115C00150000
  // or just: SYMBOL210115C00150000
  const cleaned = occ.replace(/^O:/, "");

  // Try to extract components
  const match = cleaned.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
  if (!match) {
    return {
      underlying: occ,
      expiry: "",
      strike: "",
      type: "C",
    };
  }

  const [, symbol, dateStr, optType, strikeStr] = match as [string, string, string, string, string];
  const month = dateStr.slice(2, 4);
  const day = dateStr.slice(4, 6);

  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const monthName = monthNames[Number.parseInt(month, 10) - 1] || month;
  const strike = (Number.parseInt(strikeStr, 10) / 1000).toFixed(0);

  return {
    underlying: symbol,
    expiry: `${monthName}${day}`,
    strike: `$${strike}`,
    type: optType as "C" | "P",
  };
}

/**
 * Format a human-readable contract description.
 */
export function formatContractDescription(contract: string): string {
  const parsed = parseContractSymbol(contract);
  if (!parsed.expiry) {
    return contract;
  }
  return `${parsed.underlying} ${parsed.expiry} ${parsed.strike}${parsed.type}`;
}

/**
 * Format currency value.
 */
function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

// ============================================
// Normalizers
// ============================================

/**
 * Normalize a quote message.
 */
function normalizeQuote(
  data: { symbol: string; bid: number; ask: number; last?: number },
  timestamp: Date
): NormalizedEvent {
  const spread = data.ask - data.bid;
  return {
    id: crypto.randomUUID(),
    timestamp,
    type: "quote",
    icon: EVENT_ICONS.quote,
    symbol: data.symbol,
    title: `${data.symbol}`,
    details: `${formatCurrency(data.bid)} × ${formatCurrency(data.ask)}  Spread: ${formatCurrency(spread)}`,
    color: "neutral",
    raw: data,
  };
}

/**
 * Normalize an equity trade message.
 */
function normalizeTrade(
  data: { sym: string; p: number; s: number; x?: number },
  timestamp: Date
): NormalizedEvent {
  const exchanges: Record<number, string> = {
    1: "NYSE",
    2: "AMEX",
    3: "ARCA",
    4: "NASDAQ",
    5: "BATS",
    6: "IEX",
  };
  const exchange = data.x ? exchanges[data.x] || `EX${data.x}` : "";
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

/**
 * Normalize an options quote message.
 */
function normalizeOptionsQuote(
  data: { contract: string; underlying: string; bid: number; ask: number; last: number },
  timestamp: Date
): NormalizedEvent {
  const contractDesc = formatContractDescription(data.contract);
  const spread = data.ask - data.bid;
  return {
    id: crypto.randomUUID(),
    timestamp,
    type: "options_quote",
    icon: EVENT_ICONS.options_quote,
    symbol: data.underlying,
    contractSymbol: data.contract,
    title: contractDesc,
    details: `Bid: ${formatCurrency(data.bid)}  Ask: ${formatCurrency(data.ask)}  Spread: ${formatCurrency(spread)}`,
    color: "accent",
    raw: data,
  };
}

/**
 * Normalize an options trade message.
 */
function normalizeOptionsTrade(
  data: { contract: string; underlying: string; price: number; size: number },
  timestamp: Date
): NormalizedEvent {
  const contractDesc = formatContractDescription(data.contract);
  return {
    id: crypto.randomUUID(),
    timestamp,
    type: "options_trade",
    icon: EVENT_ICONS.options_trade,
    symbol: data.underlying,
    contractSymbol: data.contract,
    title: contractDesc,
    details: `${data.size} @ ${formatCurrency(data.price)}`,
    color: "accent",
    raw: data,
  };
}

/**
 * Normalize a decision message.
 */
function normalizeDecision(
  data: {
    instrument?: { symbol?: string };
    action?: string;
    consensus?: { total?: number; agreeing?: number };
  },
  timestamp: Date
): NormalizedEvent {
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
    color: action === "BUY" ? "profit" : action === "SELL" ? "loss" : "neutral",
    raw: data,
  };
}

/**
 * Normalize an order message.
 */
function normalizeOrder(
  data: { symbol?: string; side?: string; qty?: number; status?: string; avgFillPrice?: number },
  timestamp: Date
): NormalizedEvent {
  const symbol = data.symbol || "???";
  const status = data.status?.toUpperCase() || "PENDING";
  const side = data.side?.toUpperCase() || "";
  const qty = data.qty || 0;

  // Determine event type and color based on status
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

/**
 * Normalize an alert message.
 */
function normalizeAlert(
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
    color: data.severity === "error" ? "loss" : data.severity === "warning" ? "neutral" : "accent",
    raw: data,
  };
}

/**
 * Normalize an agent output message.
 */
function normalizeAgentOutput(
  data: { agentType?: string; status?: string; symbol?: string },
  timestamp: Date
): NormalizedEvent {
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

/**
 * Normalize a cycle progress message.
 */
function normalizeCycleProgress(
  data: { phase?: string; progress?: number; symbol?: string },
  timestamp: Date
): NormalizedEvent {
  const phase = data.phase || "unknown";
  const progress = data.progress ?? 0;
  return {
    id: crypto.randomUUID(),
    timestamp,
    type: "cycle",
    icon: EVENT_ICONS.cycle,
    symbol: data.symbol || "",
    title: `OODA ${phase}`,
    details: `Progress: ${Math.round(progress * 100)}%`,
    color: "accent",
    raw: data,
  };
}

/**
 * Normalize an aggregate (candle) message.
 */
function normalizeAggregate(
  data: { symbol: string; open: number; high: number; low: number; close: number; volume: number },
  timestamp: Date
): NormalizedEvent {
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

/**
 * Normalize an agent tool call message.
 */
function normalizeAgentToolCall(
  data: { agentType?: string; toolName?: string; symbol?: string },
  timestamp: Date
): NormalizedEvent {
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

/**
 * Normalize an agent tool result message.
 */
function normalizeAgentToolResult(
  data: { agentType?: string; toolName?: string; symbol?: string; success?: boolean },
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

/**
 * Normalize an agent reasoning message.
 */
function normalizeAgentReasoning(
  data: { agentType?: string; text?: string; symbol?: string },
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

/**
 * Normalize an agent text delta message.
 */
function normalizeAgentTextDelta(
  data: { agentType?: string; text?: string; symbol?: string },
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

/**
 * Normalize an agent status message.
 */
function normalizeAgentStatus(
  data: { type?: string; displayName?: string; status?: string; symbol?: string },
  timestamp: Date
): NormalizedEvent {
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

/**
 * Normalize a cycle result message.
 */
function normalizeCycleResult(
  data: { cycleId?: string; status?: string; symbol?: string; decisionsCount?: number },
  timestamp: Date
): NormalizedEvent {
  const status = data.status || "completed";
  const decisions = data.decisionsCount ?? 0;
  return {
    id: crypto.randomUUID(),
    timestamp,
    type: "cycle",
    icon: EVENT_ICONS.cycle,
    symbol: data.symbol || "",
    title: `Cycle ${status}`,
    details: decisions > 0 ? `${decisions} decision(s)` : "",
    color: status === "completed" ? "profit" : status === "failed" ? "loss" : "neutral",
    raw: data,
  };
}

/**
 * Normalize a decision plan message.
 */
function normalizeDecisionPlan(
  data: { symbol?: string; action?: string; direction?: string },
  timestamp: Date
): NormalizedEvent {
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

/**
 * Normalize a backtest started message.
 */
function normalizeBacktestStarted(
  data: { backtestId?: string; symbol?: string },
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

/**
 * Normalize a backtest progress message.
 */
function normalizeBacktestProgress(
  data: { backtestId?: string; progress?: number; currentDate?: string },
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

/**
 * Normalize a backtest trade message.
 */
function normalizeBacktestTrade(
  data: { symbol?: string; side?: string; quantity?: number; price?: number },
  timestamp: Date
): NormalizedEvent {
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

/**
 * Normalize a backtest equity message.
 */
function normalizeBacktestEquity(
  data: { equity?: number; date?: string },
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

/**
 * Normalize a backtest completed message.
 */
function normalizeBacktestCompleted(
  data: { backtestId?: string; totalReturn?: number; sharpe?: number },
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

/**
 * Normalize a backtest error message.
 */
function normalizeBacktestError(
  data: { backtestId?: string; error?: string },
  timestamp: Date
): NormalizedEvent {
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

/**
 * Normalize a system message (fallback).
 */
function normalizeSystem(data: unknown, type: string, timestamp: Date): NormalizedEvent {
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

// ============================================
// Main Normalizer
// ============================================

/**
 * Normalize a WebSocket server message into a feed event.
 */
export function normalizeEvent(message: WebSocketMessage): NormalizedEvent | null {
  const timestamp = new Date();
  const data = message.data as Record<string, unknown>;

  switch (message.type) {
    case "quote":
      return normalizeQuote(
        data as { symbol: string; bid: number; ask: number; last?: number },
        timestamp
      );

    case "trade":
      return normalizeTrade(data as { sym: string; p: number; s: number; x?: number }, timestamp);

    case "options_quote":
      return normalizeOptionsQuote(
        data as { contract: string; underlying: string; bid: number; ask: number; last: number },
        timestamp
      );

    case "options_trade":
      return normalizeOptionsTrade(
        data as { contract: string; underlying: string; price: number; size: number },
        timestamp
      );

    case "decision":
      return normalizeDecision(data as Record<string, unknown>, timestamp);

    case "order":
      return normalizeOrder(
        data as {
          symbol?: string;
          side?: string;
          qty?: number;
          status?: string;
          avgFillPrice?: number;
        },
        timestamp
      );

    case "alert":
      return normalizeAlert(
        data as { severity?: string; title?: string; message?: string; symbol?: string },
        timestamp
      );

    case "agent_output":
      return normalizeAgentOutput(
        data as { agentType?: string; status?: string; symbol?: string },
        timestamp
      );

    case "cycle_progress":
      return normalizeCycleProgress(
        data as { phase?: string; progress?: number; symbol?: string },
        timestamp
      );

    case "aggregate":
      return normalizeAggregate(
        data as {
          symbol: string;
          open: number;
          high: number;
          low: number;
          close: number;
          volume: number;
        },
        timestamp
      );

    case "agent_tool_call":
      return normalizeAgentToolCall(
        data as { agentType?: string; toolName?: string; symbol?: string },
        timestamp
      );

    case "agent_tool_result":
      return normalizeAgentToolResult(
        data as { agentType?: string; toolName?: string; symbol?: string; success?: boolean },
        timestamp
      );

    case "agent_reasoning":
      return normalizeAgentReasoning(
        data as { agentType?: string; text?: string; symbol?: string },
        timestamp
      );

    case "agent_text_delta":
      return normalizeAgentTextDelta(
        data as { agentType?: string; text?: string; symbol?: string },
        timestamp
      );

    case "agent_status":
      return normalizeAgentStatus(
        data as { type?: string; displayName?: string; status?: string; symbol?: string },
        timestamp
      );

    case "cycle_result":
      return normalizeCycleResult(
        data as { cycleId?: string; status?: string; symbol?: string; decisionsCount?: number },
        timestamp
      );

    case "decision_plan":
      return normalizeDecisionPlan(
        data as { symbol?: string; action?: string; direction?: string },
        timestamp
      );

    case "backtest:started":
      return normalizeBacktestStarted(data as { backtestId?: string; symbol?: string }, timestamp);

    case "backtest:progress":
      return normalizeBacktestProgress(
        data as { backtestId?: string; progress?: number; currentDate?: string },
        timestamp
      );

    case "backtest:trade":
      return normalizeBacktestTrade(
        data as { symbol?: string; side?: string; quantity?: number; price?: number },
        timestamp
      );

    case "backtest:equity":
      return normalizeBacktestEquity(data as { equity?: number; date?: string }, timestamp);

    case "backtest:completed":
      return normalizeBacktestCompleted(
        data as { backtestId?: string; totalReturn?: number; sharpe?: number },
        timestamp
      );

    case "backtest:error":
      return normalizeBacktestError(data as { backtestId?: string; error?: string }, timestamp);

    // Messages we don't display in feed (protocol/internal)
    case "pong":
    case "subscribed":
    case "unsubscribed":
    case "portfolio":
    case "system_status":
    case "options_aggregate":
      return null;

    default:
      return normalizeSystem((message as { data?: unknown }).data, message.type, timestamp);
  }
}

// ============================================
// Color Map for CSS
// ============================================

export const EVENT_TYPE_COLORS: Record<EventType, string> = {
  quote: "text-blue-500",
  trade: "text-cyan-500",
  options_quote: "text-purple-500",
  options_trade: "text-violet-500",
  decision: "text-green-500",
  order: "text-orange-500",
  fill: "text-emerald-500",
  reject: "text-red-500",
  alert: "text-amber-500",
  agent: "text-indigo-500",
  cycle: "text-teal-500",
  backtest: "text-sky-500",
  system: "text-gray-500",
};

export const VALUE_COLORS: Record<NormalizedEvent["color"], string> = {
  profit: "text-green-500",
  loss: "text-red-500",
  neutral: "text-cream-600 dark:text-cream-400",
  accent: "text-purple-500",
};
