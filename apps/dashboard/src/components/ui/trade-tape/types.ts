/**
 * TradeTape Types
 *
 * TypeScript interfaces and constants for the TradeTape component.
 */

export type TradeSide = "BUY" | "SELL" | "UNKNOWN";

export interface Trade {
  /** Unique trade identifier */
  id: string;
  /** Trading symbol */
  symbol: string;
  /** Trade price */
  price: number;
  /** Trade size (shares) */
  size: number;
  /** Trade side (buy/sell/unknown) */
  side: TradeSide;
  /** Exchange ID */
  exchange?: number;
  /** Trade conditions */
  conditions?: number[];
  /** Timestamp */
  timestamp: Date;
}

export interface TradeTapeProps {
  /** Trading symbol */
  symbol: string;
  /** Array of trades to display */
  trades: Trade[];
  /** Maximum trades to keep in memory */
  maxTrades?: number;
  /** Size threshold for highlighting large trades */
  highlightThreshold?: number;
  /** Show statistics footer */
  showStatistics?: boolean;
  /** Container height */
  height?: number | string;
  /** Callback when trade is clicked */
  onTradeClick?: (trade: Trade) => void;
  /** Custom CSS class */
  className?: string;
  /** Test ID for testing */
  "data-testid"?: string;
}

export interface TradeStatistics {
  /** Total volume */
  volume: number;
  /** Volume-Weighted Average Price */
  vwap: number;
  /** Trades per minute (rolling 1-minute window) */
  tradesPerMinute: number;
  /** Number of trades */
  tradeCount: number;
}

export interface TradeItemProps {
  trade: Trade;
  isHighlighted: boolean;
  onClick?: (trade: Trade) => void;
}

export interface NewTradesButtonProps {
  count: number;
  onClick: () => void;
}

export interface StatisticsFooterProps {
  stats: TradeStatistics;
}

// Constants
export const TRADE_ITEM_HEIGHT = 32;
export const DEFAULT_MAX_TRADES = 500;
export const DEFAULT_HIGHLIGHT_THRESHOLD = 1000;

/**
 * Exchange ID to name mapping (Polygon/Massive exchange codes)
 */
export const EXCHANGE_NAMES: Record<number, string> = {
  1: "NYSE",
  2: "NYSE ARCA",
  3: "NYSE American",
  4: "NYSE National",
  5: "NASDAQ",
  6: "NASDAQ OMX BX",
  7: "NASDAQ OMX PSX",
  8: "FINRA",
  9: "ISE",
  10: "CBOE EDGA",
  11: "CBOE EDGX",
  12: "NYSE Chicago",
  13: "MEMX",
  14: "IEX",
  15: "CBOE BZX",
  16: "CBOE BYX",
  17: "MIAX",
};

/**
 * Trade conditions that indicate a sell (offers lifted).
 * These are Polygon/CTA condition codes.
 */
export const SELL_CONDITIONS = new Set([4, 5, 6, 41, 43]);

/**
 * Trade conditions that indicate a buy (bids hit).
 */
export const BUY_CONDITIONS = new Set([1, 2, 3, 37, 38]);

/**
 * Side configuration for styling trade rows.
 */
export const SIDE_CONFIG = {
  BUY: {
    color: "text-green-600 dark:text-green-400",
    icon: "●",
    bgHighlight: "bg-green-50 dark:bg-green-900/20",
  },
  SELL: {
    color: "text-red-600 dark:text-red-400",
    icon: "○",
    bgHighlight: "bg-red-50 dark:bg-red-900/20",
  },
  UNKNOWN: {
    color: "text-stone-500 dark:text-night-300",
    icon: "◐",
    bgHighlight: "bg-cream-50 dark:bg-cream-900/20",
  },
} as const;
