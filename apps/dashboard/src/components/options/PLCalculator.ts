/**
 * Options P/L Calculator
 *
 * Calculates profit/loss for options positions and multi-leg strategies.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 2.3
 */

export interface OptionLeg {
  strike: number;
  right: "CALL" | "PUT";
  /** Positive for long, negative for short */
  quantity: number;
  premium: number;
  /** YYYY-MM-DD format */
  expiration: string;
  impliedVolatility?: number;
}

export interface PLDataPoint {
  price: number;
  pnlAtExpiration: number;
  pnlToday: number;
}

export interface PLAnalysis {
  breakevens: number[];
  /** Infinity for unlimited upside */
  maxProfit: number;
  maxLoss: number;
  maxProfitPrices: number[];
  maxLossPrices: number[];
}

const MULTIPLIER = 100;
const DAYS_PER_YEAR = 365;
const DEFAULT_RISK_FREE_RATE = 0.05;
const DEFAULT_IV = 0.3;

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

function blackScholes(
  S: number,
  K: number,
  T: number,
  sigma: number,
  isCall: boolean,
  r: number = DEFAULT_RISK_FREE_RATE
): number {
  if (T <= 0) {
    return isCall ? Math.max(0, S - K) : Math.max(0, K - S);
  }

  if (sigma <= 0) {
    const pv = Math.exp(-r * T);
    return isCall ? Math.max(0, S - K * pv) : Math.max(0, K * pv - S);
  }

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const expRT = Math.exp(-r * T);

  if (isCall) {
    return S * normalCDF(d1) - K * expRT * normalCDF(d2);
  }
  return K * expRT * normalCDF(-d2) - S * normalCDF(-d1);
}

export function legPnlAtExpiration(price: number, leg: OptionLeg): number {
  const intrinsic =
    leg.right === "CALL" ? Math.max(0, price - leg.strike) : Math.max(0, leg.strike - price);

  return (intrinsic - leg.premium) * leg.quantity * MULTIPLIER;
}

export function legPnlToday(price: number, leg: OptionLeg, dte: number): number {
  const T = Math.max(0, dte / DAYS_PER_YEAR);
  const sigma = leg.impliedVolatility ?? DEFAULT_IV;
  const currentValue = blackScholes(price, leg.strike, T, sigma, leg.right === "CALL");

  return (currentValue - leg.premium) * leg.quantity * MULTIPLIER;
}

export function strategyPnlAtExpiration(price: number, legs: OptionLeg[]): number {
  return legs.reduce((sum, leg) => sum + legPnlAtExpiration(price, leg), 0);
}

export function strategyPnlToday(price: number, legs: OptionLeg[], dte: number): number {
  return legs.reduce((sum, leg) => sum + legPnlToday(price, leg, dte), 0);
}

export function generatePLData(
  legs: OptionLeg[],
  currentPrice: number,
  options: {
    rangePercent?: number;
    points?: number;
    dte?: number;
  } = {}
): PLDataPoint[] {
  const { rangePercent = 20, points = 100, dte = 30 } = options;

  const minPrice = currentPrice * (1 - rangePercent / 100);
  const maxPrice = currentPrice * (1 + rangePercent / 100);
  const step = (maxPrice - minPrice) / (points - 1);

  const data: PLDataPoint[] = [];

  for (let i = 0; i < points; i++) {
    const price = minPrice + step * i;
    data.push({
      price,
      pnlAtExpiration: strategyPnlAtExpiration(price, legs),
      pnlToday: strategyPnlToday(price, legs, dte),
    });
  }

  return data;
}

export function findBreakevens(_legs: OptionLeg[], data: PLDataPoint[]): number[] {
  const breakevens: number[] = [];

  for (let i = 1; i < data.length; i++) {
    const prev = data[i - 1];
    const curr = data[i];

    if (
      prev &&
      curr &&
      prev.pnlAtExpiration !== curr.pnlAtExpiration &&
      ((prev.pnlAtExpiration < 0 && curr.pnlAtExpiration >= 0) ||
        (prev.pnlAtExpiration > 0 && curr.pnlAtExpiration <= 0))
    ) {
      const ratio =
        Math.abs(prev.pnlAtExpiration) /
        (Math.abs(prev.pnlAtExpiration) + Math.abs(curr.pnlAtExpiration));
      const breakeven = prev.price + ratio * (curr.price - prev.price);
      breakevens.push(Number(breakeven.toFixed(2)));
    }
  }

  return breakevens;
}

export function analyzeStrategy(legs: OptionLeg[], data: PLDataPoint[]): PLAnalysis {
  const breakevens = findBreakevens(legs, data);

  let maxProfit = Number.NEGATIVE_INFINITY;
  let maxLoss = Number.POSITIVE_INFINITY;
  const maxProfitPrices: number[] = [];
  const maxLossPrices: number[] = [];

  for (const point of data) {
    if (point.pnlAtExpiration > maxProfit) {
      maxProfit = point.pnlAtExpiration;
      maxProfitPrices.length = 0;
      maxProfitPrices.push(point.price);
    } else if (point.pnlAtExpiration === maxProfit) {
      maxProfitPrices.push(point.price);
    }

    if (point.pnlAtExpiration < maxLoss) {
      maxLoss = point.pnlAtExpiration;
      maxLossPrices.length = 0;
      maxLossPrices.push(point.price);
    } else if (point.pnlAtExpiration === maxLoss) {
      maxLossPrices.push(point.price);
    }
  }

  const firstPoint = data[0];
  const lastPoint = data[data.length - 1];

  // Long calls/puts have unlimited profit potential at price extremes
  if (firstPoint && lastPoint) {
    if (
      maxProfitPrices[0] === firstPoint.price ||
      maxProfitPrices[maxProfitPrices.length - 1] === lastPoint.price
    ) {
      const hasUnlimitedUpside = legs.some((leg) => leg.right === "CALL" && leg.quantity > 0);
      const hasUnlimitedDownside = legs.some((leg) => leg.right === "PUT" && leg.quantity > 0);

      if (hasUnlimitedUpside || hasUnlimitedDownside) {
        maxProfit = Number.POSITIVE_INFINITY;
      }
    }
  }

  return {
    breakevens,
    maxProfit,
    maxLoss,
    maxProfitPrices,
    maxLossPrices,
  };
}

export function calculateDTE(expiration: string): number {
  const expDate = new Date(expiration);
  const now = new Date();
  const diffMs = expDate.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

export function getEarliestExpiration(legs: OptionLeg[]): string {
  if (legs.length === 0) {
    return new Date().toISOString().split("T")[0] ?? "";
  }

  return legs.reduce((earliest, leg) => {
    return leg.expiration < earliest ? leg.expiration : earliest;
  }, legs[0]?.expiration ?? "");
}

export default {
  legPnlAtExpiration,
  legPnlToday,
  strategyPnlAtExpiration,
  strategyPnlToday,
  generatePLData,
  findBreakevens,
  analyzeStrategy,
  calculateDTE,
  getEarliestExpiration,
};
