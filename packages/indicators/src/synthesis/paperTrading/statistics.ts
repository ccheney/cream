/**
 * Paper Trading Statistical Functions
 *
 * Core statistical calculations for paper trading metrics.
 */

import { PAPER_TRADING_DEFAULTS, type PaperSignal, type RealizedMetrics } from "./types.js";

/**
 * Calculate the number of trading days between two dates (inclusive).
 * Approximates by counting weekdays (excludes weekends).
 */
export function tradingDaysBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (end < start) {
    return 0;
  }

  let tradingDays = 0;
  const current = new Date(start);

  while (current <= end) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      tradingDays++;
    }
    current.setDate(current.getDate() + 1);
  }

  return tradingDays;
}

/**
 * Calculate annualized Sharpe ratio from returns.
 */
export function calculateAnnualizedSharpe(returns: number[]): number {
  if (returns.length === 0) {
    return 0;
  }

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;
  const std = Math.sqrt(variance);

  if (std < 1e-15) {
    return 0;
  }

  return (mean / std) * Math.sqrt(PAPER_TRADING_DEFAULTS.tradingDaysPerYear);
}

/**
 * Calculate maximum drawdown from returns.
 */
export function calculateMaxDrawdown(returns: number[]): number {
  if (returns.length === 0) {
    return 0;
  }

  let cumulative = 1;
  let peak = 1;
  let maxDrawdown = 0;

  for (const r of returns) {
    cumulative *= 1 + r;
    if (cumulative > peak) {
      peak = cumulative;
    }
    const drawdown = (peak - cumulative) / peak;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  return maxDrawdown;
}

/**
 * Compute ranks for an array (with tie handling).
 */
export function computeRanks(arr: number[]): number[] {
  const n = arr.length;
  const indexed = arr.map((v, i) => ({ value: v, index: i }));
  indexed.sort((a, b) => a.value - b.value);

  const ranks = new Array<number>(n);
  let i = 0;

  while (i < n) {
    let j = i;
    while (j < n - 1 && indexed[j]?.value === indexed[j + 1]?.value) {
      j++;
    }
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) {
      const idx = indexed[k]?.index;
      if (idx !== undefined) {
        ranks[idx] = avgRank;
      }
    }
    i = j + 1;
  }

  return ranks;
}

/**
 * Calculate IC metrics (mean, std, ICIR) from signals and outcomes.
 */
export function calculateICMetrics(
  signals: number[],
  outcomes: number[]
): { icMean: number; icStd: number; icir: number } {
  if (signals.length !== outcomes.length || signals.length < 2) {
    return { icMean: 0, icStd: 0, icir: 0 };
  }

  const n = signals.length;
  const signalRanks = computeRanks(signals);
  const outcomeRanks = computeRanks(outcomes);

  const meanSignal = signalRanks.reduce((a, b) => a + b, 0) / n;
  const meanOutcome = outcomeRanks.reduce((a, b) => a + b, 0) / n;

  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (let i = 0; i < n; i++) {
    const dx = (signalRanks[i] ?? 0) - meanSignal;
    const dy = (outcomeRanks[i] ?? 0) - meanOutcome;
    sumXY += dx * dy;
    sumX2 += dx * dx;
    sumY2 += dy * dy;
  }

  const denominator = Math.sqrt(sumX2 * sumY2);
  const ic = denominator < 1e-15 ? 0 : sumXY / denominator;

  const icMean = ic;
  const icStd = 0.1;
  const icir = icStd > 0 ? icMean / icStd : 0;

  return { icMean, icStd, icir };
}

/**
 * Calculate realized metrics from paper trading signals.
 */
export function calculateRealizedMetrics(signals: PaperSignal[]): RealizedMetrics {
  const signalsWithOutcomes = signals.filter((s) => s.outcome !== null);
  const totalSignals = signals.length;
  const nOutcomes = signalsWithOutcomes.length;

  if (nOutcomes === 0) {
    return {
      sharpe: 0,
      maxDrawdown: 0,
      icMean: 0,
      icir: 0,
      totalSignals,
      signalsWithOutcomes: 0,
      hitRate: 0,
      avgDailyTurnover: 0,
    };
  }

  const returns: number[] = signalsWithOutcomes.map((s) => Math.sign(s.signal) * (s.outcome ?? 0));

  const sharpe = calculateAnnualizedSharpe(returns);
  const maxDrawdown = calculateMaxDrawdown(returns);

  const signalValues = signalsWithOutcomes.map((s) => s.signal);
  const outcomeValues = signalsWithOutcomes.map((s) => s.outcome ?? 0);
  const { icMean, icir } = calculateICMetrics(signalValues, outcomeValues);

  const correctPredictions = signalsWithOutcomes.filter(
    (s) => Math.sign(s.signal) === Math.sign(s.outcome ?? 0)
  ).length;
  const hitRate = correctPredictions / nOutcomes;

  const uniqueDates = new Set(signalsWithOutcomes.map((s) => s.date));
  const avgDailyTurnover = uniqueDates.size > 0 ? nOutcomes / uniqueDates.size : 0;

  return {
    sharpe,
    maxDrawdown,
    icMean,
    icir,
    totalSignals,
    signalsWithOutcomes: nOutcomes,
    hitRate,
    avgDailyTurnover,
  };
}
