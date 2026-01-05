/**
 * Dividend Adjustment Logic
 *
 * Handles dividend adjustments for total return calculations.
 *
 * Dividend Types:
 * - CD: Cash Dividend (regular)
 * - SC: Special Cash Dividend
 * - LT: Long-term Capital Gains
 * - ST: Short-term Capital Gains
 *
 * @see docs/plans/02-data-layer.md
 */

import type { Dividend } from "../providers/polygon";

// ============================================
// Types
// ============================================

export interface DividendInfo {
  /** Symbol */
  symbol: string;
  /** Cash amount per share */
  cashAmount: number;
  /** Currency code */
  currency: string;
  /** Ex-dividend date (YYYY-MM-DD) - you must own before this date */
  exDividendDate: string;
  /** Record date (YYYY-MM-DD) */
  recordDate: string | null;
  /** Pay date (YYYY-MM-DD) - when dividend is paid */
  payDate: string | null;
  /** Declaration date */
  declarationDate: string | null;
  /** Dividend type: CD (Cash), SC (Special Cash), LT, ST */
  dividendType: "CD" | "SC" | "LT" | "ST";
  /** Payment frequency (1=annual, 4=quarterly, 12=monthly) */
  frequency: number | null;
  /** Annualized yield at declaration (if known) */
  yield?: number;
}

export interface DividendAdjustedReturn {
  /** Price return (close to close) */
  priceReturn: number;
  /** Dividend return (dividend / previous close) */
  dividendReturn: number;
  /** Total return (price + dividend) */
  totalReturn: number;
  /** Dividends paid in period */
  dividends: DividendInfo[];
}

// ============================================
// Dividend Conversion
// ============================================

/**
 * Convert Polygon Dividend to DividendInfo.
 */
export function toDividendInfo(dividend: Dividend): DividendInfo {
  return {
    symbol: dividend.ticker,
    cashAmount: dividend.cash_amount,
    currency: dividend.currency ?? "USD",
    exDividendDate: dividend.ex_dividend_date,
    recordDate: dividend.record_date ?? null,
    payDate: dividend.pay_date ?? null,
    declarationDate: dividend.declaration_date ?? null,
    dividendType: dividend.dividend_type as "CD" | "SC" | "LT" | "ST",
    frequency: dividend.frequency ?? null,
  };
}

// ============================================
// Dividend Calculations
// ============================================

/**
 * Calculate dividend yield.
 *
 * @param dividend - Dividend amount per share
 * @param price - Stock price
 * @returns Dividend yield as decimal (e.g., 0.02 for 2%)
 */
export function calculateDividendYield(dividend: number, price: number): number {
  if (price === 0) return 0;
  return dividend / price;
}

/**
 * Calculate annualized dividend yield.
 *
 * @param dividendPerPeriod - Dividend amount per period
 * @param frequency - Payments per year (1=annual, 4=quarterly, 12=monthly)
 * @param price - Stock price
 * @returns Annualized dividend yield as decimal
 */
export function calculateAnnualizedYield(
  dividendPerPeriod: number,
  frequency: number,
  price: number
): number {
  if (price === 0 || frequency === 0) return 0;
  const annualDividend = dividendPerPeriod * frequency;
  return annualDividend / price;
}

/**
 * Get dividends on or after a specific ex-date.
 *
 * @param dividends - Array of dividends
 * @param date - Date to filter from (YYYY-MM-DD or ISO)
 * @returns Dividends with ex-date >= date
 */
export function getDividendsFromDate(dividends: DividendInfo[], date: string): DividendInfo[] {
  const dateStr = date.split("T")[0]!;
  return dividends.filter((d) => d.exDividendDate >= dateStr);
}

/**
 * Get dividends between two dates (inclusive).
 *
 * @param dividends - Array of dividends
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 * @returns Dividends within date range
 */
export function getDividendsInRange(
  dividends: DividendInfo[],
  startDate: string,
  endDate: string
): DividendInfo[] {
  return dividends.filter((d) => d.exDividendDate >= startDate && d.exDividendDate <= endDate);
}

/**
 * Calculate total dividends in a period.
 *
 * @param dividends - Array of dividends
 * @returns Total cash amount
 */
export function sumDividends(dividends: DividendInfo[]): number {
  return dividends.reduce((sum, d) => sum + d.cashAmount, 0);
}

// ============================================
// Return Calculations
// ============================================

/**
 * Calculate dividend-adjusted return between two dates.
 *
 * On ex-dividend date, the stock price typically drops by the dividend amount.
 * To calculate true total return, we need to add back dividends.
 *
 * @param prevClose - Previous close price
 * @param currClose - Current close price
 * @param dividends - Dividends that went ex in the period
 * @returns Adjusted return breakdown
 */
export function calculateDividendAdjustedReturn(
  prevClose: number,
  currClose: number,
  dividends: DividendInfo[]
): DividendAdjustedReturn {
  if (prevClose === 0) {
    return {
      priceReturn: 0,
      dividendReturn: 0,
      totalReturn: 0,
      dividends,
    };
  }

  const totalDividend = sumDividends(dividends);
  const priceReturn = (currClose - prevClose) / prevClose;
  const dividendReturn = totalDividend / prevClose;
  const totalReturn = priceReturn + dividendReturn;

  return {
    priceReturn,
    dividendReturn,
    totalReturn,
    dividends,
  };
}

/**
 * Adjust price for dividend (for historical price adjustment).
 *
 * When adjusting historical prices for dividends, we subtract the dividend
 * from prices before the ex-date.
 *
 * @param price - Historical price
 * @param dividend - Dividend amount
 * @returns Adjusted price
 */
export function adjustPriceForDividend(price: number, dividend: number): number {
  return price - dividend;
}

/**
 * Calculate adjusted prices for dividend reinvestment.
 *
 * Assumes dividends are reinvested at the ex-dividend date price.
 *
 * @param price - Price at ex-date
 * @param dividend - Dividend per share
 * @param shares - Number of shares
 * @returns New share count after reinvestment
 */
export function calculateDRIPShares(price: number, dividend: number, shares: number): number {
  if (price === 0) return shares;
  const dividendAmount = dividend * shares;
  const additionalShares = dividendAmount / price;
  return shares + additionalShares;
}

// ============================================
// Special Dividend Handling
// ============================================

/**
 * Check if dividend is a special (non-regular) dividend.
 *
 * Special dividends (SC) are one-time payments and should be flagged
 * for different treatment in backtesting.
 */
export function isSpecialDividend(dividend: DividendInfo): boolean {
  return dividend.dividendType === "SC";
}

/**
 * Filter for only regular cash dividends.
 */
export function getRegularDividends(dividends: DividendInfo[]): DividendInfo[] {
  return dividends.filter((d) => d.dividendType === "CD");
}

/**
 * Filter for special dividends only.
 */
export function getSpecialDividends(dividends: DividendInfo[]): DividendInfo[] {
  return dividends.filter((d) => d.dividendType === "SC");
}

// ============================================
// Upcoming Dividend Detection
// ============================================

/**
 * Get upcoming dividends (ex-date in the future).
 *
 * @param dividends - Array of dividends
 * @param asOfDate - Reference date (default: today)
 * @returns Dividends with ex-date > asOfDate
 */
export function getUpcomingDividends(dividends: DividendInfo[], asOfDate?: Date): DividendInfo[] {
  const today = asOfDate ?? new Date();
  const todayStr = today.toISOString().split("T")[0]!;

  return dividends.filter((d) => d.exDividendDate > todayStr);
}

/**
 * Get dividends going ex within N days.
 *
 * @param dividends - Array of dividends
 * @param days - Number of days to look ahead
 * @param asOfDate - Reference date (default: today)
 * @returns Dividends going ex within range
 */
export function getDividendsGoingExWithin(
  dividends: DividendInfo[],
  days: number,
  asOfDate?: Date
): DividendInfo[] {
  const today = asOfDate ?? new Date();
  const futureDate = new Date(today);
  futureDate.setDate(futureDate.getDate() + days);

  const todayStr = today.toISOString().split("T")[0]!;
  const futureStr = futureDate.toISOString().split("T")[0]!;

  return dividends.filter((d) => d.exDividendDate > todayStr && d.exDividendDate <= futureStr);
}

export default {
  toDividendInfo,
  calculateDividendYield,
  calculateAnnualizedYield,
  getDividendsFromDate,
  getDividendsInRange,
  sumDividends,
  calculateDividendAdjustedReturn,
  adjustPriceForDividend,
  calculateDRIPShares,
  isSpecialDividend,
  getRegularDividends,
  getSpecialDividends,
  getUpcomingDividends,
  getDividendsGoingExWithin,
};
