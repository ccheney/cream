/**
 * Options Event Parser
 *
 * Handles options quote and trade event normalization.
 */

import type { NormalizedEvent, OptionsQuoteData, OptionsTradeData } from "../types.js";
import { EVENT_ICONS } from "../types.js";

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

/**
 * Parse OCC contract symbol to human-readable format.
 * Example: O:AAPL250117C00190000 -> AAPL Jan17 $190C
 */
export function parseContractSymbol(occ: string): {
  underlying: string;
  expiry: string;
  strike: string;
  type: "C" | "P";
} {
  const cleaned = occ.replace(/^O:/, "");
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

export function formatContractDescription(contract: string): string {
  const parsed = parseContractSymbol(contract);
  if (!parsed.expiry) {
    return contract;
  }
  return `${parsed.underlying} ${parsed.expiry} ${parsed.strike}${parsed.type}`;
}

export function normalizeOptionsQuote(data: OptionsQuoteData, timestamp: Date): NormalizedEvent {
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

export function normalizeOptionsTrade(data: OptionsTradeData, timestamp: Date): NormalizedEvent {
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
