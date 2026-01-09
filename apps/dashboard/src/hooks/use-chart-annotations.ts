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

export interface TradeAnnotation {
  marker: TradeMarker;
  trade: Trade;
}

export interface PositionAnnotation {
  entry: TradeMarker | null;
  exit: TradeMarker | null;
  stopLoss: PriceLineConfig | null;
  takeProfit: PriceLineConfig | null;
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

export interface UseChartAnnotationsOptions {
  trades: Trade[];
  stopLoss?: number;
  takeProfit?: number;
  showPriceLines?: boolean;
}

export interface UseChartAnnotationsReturn {
  markers: TradeMarker[];
  priceLines: PriceLineConfig[];
  annotations: TradeAnnotation[];
  getAnnotation: (time: number | string) => TradeAnnotation | undefined;
}

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

/**
 * Converts trades to chart annotations.
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
  const annotations = useMemo((): TradeAnnotation[] => {
    return trades.map((trade) => ({
      marker: tradeToMarker(trade),
      trade,
    }));
  }, [trades]);

  const markers = useMemo((): TradeMarker[] => {
    return annotations.map((a) => a.marker);
  }, [annotations]);

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

export interface UsePositionAnnotationsOptions {
  entryTrades: Trade[];
  exitTrades?: Trade[];
  stopPrice?: number;
  targetPrice?: number;
  avgCost: number;
  side: "LONG" | "SHORT";
}

export function usePositionAnnotations({
  entryTrades,
  exitTrades = [],
  stopPrice,
  targetPrice,
  avgCost,
  side,
}: UsePositionAnnotationsOptions): PositionAnnotation {
  return useMemo(() => {
    const entryMarkers = entryTrades.map((t) => createEntryMarker(t.timestamp, `BUY @${t.price}`));
    const exitMarkers = exitTrades.map((t) => createExitMarker(t.timestamp, `SELL @${t.price}`));

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
