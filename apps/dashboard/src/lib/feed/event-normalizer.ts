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

    // Messages we don't display in feed
    case "pong":
    case "subscribed":
    case "unsubscribed":
    case "portfolio":
    case "system_status":
    case "cycle_progress":
    case "decision_plan":
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
  system: "text-gray-500",
};

export const VALUE_COLORS: Record<NormalizedEvent["color"], string> = {
  profit: "text-green-500",
  loss: "text-red-500",
  neutral: "text-cream-600 dark:text-cream-400",
  accent: "text-purple-500",
};
