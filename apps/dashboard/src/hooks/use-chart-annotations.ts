/**
 * Chart Annotations Hook
 *
 * Converts trade data to chart markers and price line annotations.
 *
 * @see docs/plans/ui/26-data-viz.md (Trade Markers section, lines 59-86)
 */

"use client";

import { useMemo } from "react";
import type { Trade } from "@/lib/api/types";
import {
  CHART_COLORS,
  createEntryMarker,
  createExitMarker,
  createStopLossLine,
  createTakeProfitLine,
  type PriceLineConfig,
  type TradeMarker,
} from "@/lib/chart-config";

// ============================================
// Types
// ============================================

/**
 * Trade annotation with both marker and metadata.
 */
export interface TradeAnnotation {
  /** Trade marker for chart */
  marker: TradeMarker;
  /** Original trade data */
  trade: Trade;
}

/**
 * Position annotation for chart overlays.
 */
export interface PositionAnnotation {
  /** Entry marker */
  entry: TradeMarker | null;
  /** Exit marker (if closed) */
  exit: TradeMarker | null;
  /** Stop-loss line */
  stopLoss: PriceLineConfig | null;
  /** Take-profit line */
  takeProfit: PriceLineConfig | null;
  /** Position metadata */
  position: {
    symbol: string;
    side: "LONG" | "SHORT";
    avgCost: number;
    targetPrice?: number;
    stopPrice?: number;
    pnl?: number;
    pnlPct?: number;
  };
}

/**
 * Options for useChartAnnotations hook.
 */
export interface UseChartAnnotationsOptions {
  /** Trades to convert to annotations */
  trades: Trade[];
  /** Stop-loss price (for open positions) */
  stopLoss?: number;
  /** Take-profit price (for open positions) */
  takeProfit?: number;
  /** Show stop/take-profit lines (default: true) */
  showPriceLines?: boolean;
}

/**
 * Return type for useChartAnnotations hook.
 */
export interface UseChartAnnotationsReturn {
  /** Markers for the chart */
  markers: TradeMarker[];
  /** Price lines for stop/take-profit */
  priceLines: PriceLineConfig[];
  /** Trade annotations with full metadata */
  annotations: TradeAnnotation[];
  /** Get annotation by marker time */
  getAnnotation: (time: number | string) => TradeAnnotation | undefined;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Convert trade to marker.
 */
function tradeToMarker(trade: Trade): TradeMarker {
  const isBuy = trade.side === "BUY";

  return {
    time: trade.timestamp,
    position: isBuy ? "belowBar" : "aboveBar",
    color: isBuy ? CHART_COLORS.profit : CHART_COLORS.loss,
    shape: isBuy ? "arrowUp" : "arrowDown",
    text: isBuy ? "BUY" : "SELL",
    size: 1,
  };
}

/**
 * Convert backtest trade to marker.
 */
export function backtestTradeToMarker(trade: {
  timestamp: string;
  action: "BUY" | "SELL";
  price: number;
}): TradeMarker {
  const isBuy = trade.action === "BUY";

  return {
    time: trade.timestamp,
    position: isBuy ? "belowBar" : "aboveBar",
    color: isBuy ? CHART_COLORS.profit : CHART_COLORS.loss,
    shape: isBuy ? "arrowUp" : "arrowDown",
    text: `${isBuy ? "BUY" : "SELL"} @${trade.price.toFixed(2)}`,
    size: 1,
  };
}

// ============================================
// Main Hook
// ============================================

/**
 * Hook for converting trades to chart annotations.
 *
 * @example
 * ```tsx
 * function PositionChart({ position }: { position: PositionDetail }) {
 *   const { markers, priceLines, getAnnotation } = useChartAnnotations({
 *     trades: position.trades,
 *     stopLoss: position.stopPrice,
 *     takeProfit: position.targetPrice,
 *   });
 *
 *   const handleMarkerClick = (time: string) => {
 *     const annotation = getAnnotation(time);
 *     if (annotation) {
 *       showTradeDetail(annotation.trade);
 *     }
 *   };
 *
 *   return (
 *     <TradingViewChart
 *       data={candleData}
 *       markers={markers}
 *       priceLines={priceLines}
 *     />
 *   );
 * }
 * ```
 */
export function useChartAnnotations({
  trades,
  stopLoss,
  takeProfit,
  showPriceLines = true,
}: UseChartAnnotationsOptions): UseChartAnnotationsReturn {
  // Convert trades to annotations
  const annotations = useMemo((): TradeAnnotation[] => {
    return trades.map((trade) => ({
      marker: tradeToMarker(trade),
      trade,
    }));
  }, [trades]);

  // Extract markers
  const markers = useMemo((): TradeMarker[] => {
    return annotations.map((a) => a.marker);
  }, [annotations]);

  // Build price lines
  const priceLines = useMemo((): PriceLineConfig[] => {
    if (!showPriceLines) {
      return [];
    }

    const lines: PriceLineConfig[] = [];

    if (stopLoss !== undefined) {
      lines.push(createStopLossLine(stopLoss));
    }

    if (takeProfit !== undefined) {
      lines.push(createTakeProfitLine(takeProfit));
    }

    return lines;
  }, [stopLoss, takeProfit, showPriceLines]);

  // Lookup function for annotations
  const getAnnotation = useMemo(() => {
    const timeMap = new Map<string, TradeAnnotation>();

    for (const annotation of annotations) {
      const key = String(annotation.marker.time);
      timeMap.set(key, annotation);
    }

    return (time: number | string): TradeAnnotation | undefined => {
      return timeMap.get(String(time));
    };
  }, [annotations]);

  return {
    markers,
    priceLines,
    annotations,
    getAnnotation,
  };
}

// ============================================
// Additional Hooks
// ============================================

/**
 * Options for usePositionAnnotations hook.
 */
export interface UsePositionAnnotationsOptions {
  /** Entry trades */
  entryTrades: Trade[];
  /** Exit trades (if position is closed) */
  exitTrades?: Trade[];
  /** Stop-loss price */
  stopPrice?: number;
  /** Take-profit price */
  targetPrice?: number;
  /** Average cost basis */
  avgCost: number;
  /** Position side */
  side: "LONG" | "SHORT";
}

/**
 * Hook for creating position-specific annotations.
 *
 * Groups entry/exit trades and adds stop/target lines.
 */
export function usePositionAnnotations({
  entryTrades,
  exitTrades = [],
  stopPrice,
  targetPrice,
  avgCost,
  side,
}: UsePositionAnnotationsOptions): PositionAnnotation {
  return useMemo(() => {
    // Create entry markers
    const entryMarkers = entryTrades.map((t) => createEntryMarker(t.timestamp, `BUY @${t.price}`));

    // Create exit markers
    const exitMarkers = exitTrades.map((t) => createExitMarker(t.timestamp, `SELL @${t.price}`));

    // Calculate PnL if we have exit trades
    let pnl: number | undefined;
    let pnlPct: number | undefined;

    if (exitTrades.length > 0) {
      const totalEntryValue = entryTrades.reduce((sum, t) => sum + t.price * t.qty, 0);
      const totalExitValue = exitTrades.reduce((sum, t) => sum + t.price * t.qty, 0);
      pnl = side === "LONG" ? totalExitValue - totalEntryValue : totalEntryValue - totalExitValue;
      pnlPct = (pnl / totalEntryValue) * 100;
    }

    return {
      entry: entryMarkers[0] ?? null,
      exit: exitMarkers[0] ?? null,
      stopLoss: stopPrice !== undefined ? createStopLossLine(stopPrice) : null,
      takeProfit: targetPrice !== undefined ? createTakeProfitLine(targetPrice) : null,
      position: {
        symbol: entryTrades[0]?.symbol ?? "",
        side,
        avgCost,
        targetPrice,
        stopPrice,
        pnl,
        pnlPct,
      },
    };
  }, [entryTrades, exitTrades, stopPrice, targetPrice, avgCost, side]);
}

// ============================================
// Exports
// ============================================

export default useChartAnnotations;
