/**
 * usePositionGreeks Hook
 *
 * Calculates greeks for options positions with streaming price updates.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 2.2
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OptionsPosition } from "@/hooks/queries/useOptionsPositions";

// ============================================
// Types
// ============================================

export interface PositionGreeks {
  /** Delta: change in option price per $1 change in underlying */
  delta: number;
  /** Gamma: change in delta per $1 change in underlying */
  gamma: number;
  /** Theta: daily time decay */
  theta: number;
  /** Vega: change per 1% IV change */
  vega: number;
  /** Theoretical price */
  theoreticalPrice: number;
}

export interface StreamingOptionsPosition extends OptionsPosition {
  /** Live contract price */
  livePrice: number;
  /** Previous price (for flash animation) */
  previousPrice: number;
  /** Live unrealized P/L */
  liveUnrealizedPnl: number;
  /** Live unrealized P/L percentage */
  liveUnrealizedPnlPct: number;
  /** Calculated greeks */
  greeks: PositionGreeks;
  /** Whether streaming is active */
  isStreaming: boolean;
  /** Last update timestamp */
  lastUpdated: Date | null;
}

export interface AggregateGreeks {
  /** Delta-adjusted notional exposure */
  deltaNotional: number;
  /** Total gamma */
  totalGamma: number;
  /** Total daily theta decay */
  totalTheta: number;
  /** Total vega exposure */
  totalVega: number;
}

export interface UsePositionGreeksOptions {
  /** Options positions */
  positions: OptionsPosition[];
  /** Underlying prices by symbol */
  underlyingPrices: Record<string, number>;
  /** WebSocket message handler */
  onMessage?: (data: unknown) => void;
  /** Default IV if not provided (default: 0.30) */
  defaultIV?: number;
}

export interface UsePositionGreeksReturn {
  /** Positions with live greeks */
  streamingPositions: StreamingOptionsPosition[];
  /** Aggregated portfolio greeks */
  aggregateGreeks: AggregateGreeks;
  /** Whether any position is streaming */
  isStreaming: boolean;
  /** Update price for a contract */
  updateContractPrice: (symbol: string, price: number) => void;
  /** Update underlying price */
  updateUnderlyingPrice: (symbol: string, price: number) => void;
}

// ============================================
// Constants
// ============================================

const DEFAULT_IV = 0.3;
const DEFAULT_RISK_FREE_RATE = 0.05;
const DAYS_PER_YEAR = 365;
const MULTIPLIER = 100;

// ============================================
// Black-Scholes Math
// ============================================

function normalCDF(x: number): number {
  const p = 0.2316419;
  const b1 = 0.31938153;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;

  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const t2 = t * t;
  const t3 = t2 * t;
  const t4 = t3 * t;
  const t5 = t4 * t;

  const pdf = Math.exp(-0.5 * absX * absX) / Math.sqrt(2 * Math.PI);
  const cdfPositive = 1.0 - pdf * (b1 * t + b2 * t2 + b3 * t3 + b4 * t4 + b5 * t5);

  return x >= 0 ? cdfPositive : 1.0 - cdfPositive;
}

function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function calculateGreeks(
  S: number, // Underlying price
  K: number, // Strike
  T: number, // Time to expiration in years
  sigma: number, // IV
  isCall: boolean,
  r: number = DEFAULT_RISK_FREE_RATE
): PositionGreeks {
  if (T <= 0) {
    const intrinsicValue = isCall ? Math.max(S - K, 0) : Math.max(K - S, 0);
    const delta = isCall ? (S > K ? 1 : 0) : S < K ? -1 : 0;
    return { delta, gamma: 0, theta: 0, vega: 0, theoreticalPrice: intrinsicValue };
  }

  if (sigma <= 0) {
    const pv = Math.exp(-r * T);
    const intrinsicValue = isCall ? Math.max(S - K * pv, 0) : Math.max(K * pv - S, 0);
    const delta = isCall ? (S > K * pv ? 1 : 0) : S < K * pv ? -1 : 0;
    return { delta, gamma: 0, theta: 0, vega: 0, theoreticalPrice: intrinsicValue };
  }

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const expRT = Math.exp(-r * T);

  const Nd1 = normalCDF(d1);
  const Nd2 = normalCDF(d2);
  const nd1 = normalPDF(d1);

  // Delta
  const delta = isCall ? Nd1 : Nd1 - 1;

  // Gamma
  const gamma = nd1 / (S * sigma * sqrtT);

  // Theta (per day)
  const thetaTerm1 = -(S * nd1 * sigma) / (2 * sqrtT);
  let theta: number;
  if (isCall) {
    theta = thetaTerm1 - r * K * expRT * Nd2;
  } else {
    theta = thetaTerm1 + r * K * expRT * (1 - Nd2);
  }
  theta = theta / DAYS_PER_YEAR;

  // Vega (per 1% change)
  const vega = (S * sqrtT * nd1) / 100;

  // Theoretical price
  let theoreticalPrice: number;
  if (isCall) {
    theoreticalPrice = S * Nd1 - K * expRT * Nd2;
  } else {
    theoreticalPrice = K * expRT * (1 - Nd2) - S * (1 - Nd1);
  }

  return {
    delta,
    gamma,
    theta,
    vega,
    theoreticalPrice: Math.max(theoreticalPrice, 0),
  };
}

// ============================================
// Hook Implementation
// ============================================

export function usePositionGreeks(options: UsePositionGreeksOptions): UsePositionGreeksReturn {
  const { positions, underlyingPrices, defaultIV = DEFAULT_IV } = options;

  // State for live prices
  const [contractPrices, setContractPrices] = useState<Record<string, number>>({});
  const [livePrices, setLivePrices] = useState<Record<string, number>>(() => ({
    ...underlyingPrices,
  }));
  const [isStreaming, setIsStreaming] = useState(false);

  // Track previous prices for flash
  const previousPricesRef = useRef<Record<string, number>>({});

  // Initialize contract prices from positions
  useEffect(() => {
    const initial: Record<string, number> = {};
    for (const pos of positions) {
      initial[pos.contractSymbol] = pos.currentPrice;
      previousPricesRef.current[pos.contractSymbol] = pos.currentPrice;
    }
    setContractPrices(initial);
  }, [positions]);

  // Update underlying prices when they change
  useEffect(() => {
    setLivePrices((prev) => ({ ...prev, ...underlyingPrices }));
  }, [underlyingPrices]);

  // Update contract price
  const updateContractPrice = useCallback((symbol: string, price: number) => {
    setContractPrices((prev) => {
      previousPricesRef.current[symbol] = prev[symbol] ?? price;
      return { ...prev, [symbol]: price };
    });
    setIsStreaming(true);
  }, []);

  // Update underlying price
  const updateUnderlyingPrice = useCallback((symbol: string, price: number) => {
    setLivePrices((prev) => ({ ...prev, [symbol]: price }));
    setIsStreaming(true);
  }, []);

  // Calculate streaming positions with greeks
  const streamingPositions = useMemo<StreamingOptionsPosition[]>(() => {
    return positions.map((pos) => {
      const livePrice = contractPrices[pos.contractSymbol] ?? pos.currentPrice;
      const previousPrice = previousPricesRef.current[pos.contractSymbol] ?? pos.currentPrice;
      const underlyingPrice = livePrices[pos.underlying] ?? 0;

      // Calculate time to expiration
      const expDate = new Date(pos.expiration);
      const now = new Date();
      const daysToExp = Math.max(0, (expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const T = daysToExp / DAYS_PER_YEAR;

      // Calculate greeks
      const greeks = calculateGreeks(
        underlyingPrice,
        pos.strike,
        T,
        defaultIV,
        pos.right === "CALL"
      );

      // Calculate P/L
      const costBasis = pos.avgCost * Math.abs(pos.quantity) * MULTIPLIER;
      const marketValue = livePrice * Math.abs(pos.quantity) * MULTIPLIER;
      const sign = pos.quantity > 0 ? 1 : -1;
      const liveUnrealizedPnl = sign * (marketValue - costBasis);
      const liveUnrealizedPnlPct = costBasis > 0 ? (liveUnrealizedPnl / costBasis) * 100 : 0;

      return {
        ...pos,
        livePrice,
        previousPrice,
        liveUnrealizedPnl,
        liveUnrealizedPnlPct,
        greeks,
        isStreaming,
        lastUpdated: isStreaming ? new Date() : null,
      };
    });
  }, [positions, contractPrices, livePrices, defaultIV, isStreaming]);

  // Calculate aggregate greeks
  const aggregateGreeks = useMemo<AggregateGreeks>(() => {
    let deltaNotional = 0;
    let totalGamma = 0;
    let totalTheta = 0;
    let totalVega = 0;

    for (const pos of streamingPositions) {
      const underlyingPrice = livePrices[pos.underlying] ?? 0;
      const positionMultiplier = pos.quantity * MULTIPLIER;

      deltaNotional += positionMultiplier * pos.greeks.delta * underlyingPrice;
      totalGamma += positionMultiplier * pos.greeks.gamma;
      totalTheta += positionMultiplier * pos.greeks.theta;
      totalVega += positionMultiplier * pos.greeks.vega;
    }

    return { deltaNotional, totalGamma, totalTheta, totalVega };
  }, [streamingPositions, livePrices]);

  return {
    streamingPositions,
    aggregateGreeks,
    isStreaming,
    updateContractPrice,
    updateUnderlyingPrice,
  };
}

export default usePositionGreeks;
