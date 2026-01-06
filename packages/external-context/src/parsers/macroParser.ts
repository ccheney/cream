/**
 * Macro Release Parser
 *
 * Parses Alpha Vantage and other macro data sources into normalized format.
 */

import type { ParsedMacroRelease } from "../types.js";

/**
 * Alpha Vantage economic indicator response
 */
export interface AlphaVantageEconomicIndicator {
  name: string;
  interval: string;
  unit: string;
  data: Array<{
    date: string;
    value: string;
  }>;
}

/**
 * Known macro indicators with metadata
 */
export const MACRO_INDICATORS = {
  // Growth indicators
  REAL_GDP: { name: "Real GDP", unit: "billions USD", frequency: "quarterly" },
  REAL_GDP_PER_CAPITA: { name: "Real GDP per Capita", unit: "USD", frequency: "quarterly" },

  // Inflation indicators
  CPI: { name: "Consumer Price Index", unit: "index", frequency: "monthly" },
  INFLATION: { name: "Inflation Rate", unit: "percent", frequency: "monthly" },

  // Employment indicators
  UNEMPLOYMENT: { name: "Unemployment Rate", unit: "percent", frequency: "monthly" },
  NONFARM_PAYROLL: { name: "Nonfarm Payrolls", unit: "thousands", frequency: "monthly" },

  // Interest rate indicators
  FEDERAL_FUNDS_RATE: { name: "Federal Funds Rate", unit: "percent", frequency: "daily" },
  TREASURY_YIELD: { name: "Treasury Yield", unit: "percent", frequency: "daily" },

  // Retail and consumer
  RETAIL_SALES: { name: "Retail Sales", unit: "millions USD", frequency: "monthly" },
  CONSUMER_SENTIMENT: { name: "Consumer Sentiment", unit: "index", frequency: "monthly" },

  // Trade
  DURABLES: { name: "Durable Goods Orders", unit: "millions USD", frequency: "monthly" },
} as const;

export type MacroIndicatorType = keyof typeof MACRO_INDICATORS;

/**
 * Parse Alpha Vantage economic indicator response
 */
export function parseAlphaVantageIndicator(
  response: AlphaVantageEconomicIndicator,
  indicatorType?: MacroIndicatorType
): ParsedMacroRelease[] {
  const results: ParsedMacroRelease[] = [];

  if (!response.data || !Array.isArray(response.data)) {
    return results;
  }

  // Get metadata
  const metadata = indicatorType ? MACRO_INDICATORS[indicatorType] : null;

  for (let i = 0; i < response.data.length; i++) {
    const item = response.data[i];
    if (!item || !item.date || item.value === ".") {
      continue;
    }

    const value = parseFloat(item.value);
    if (Number.isNaN(value)) {
      continue;
    }

    const date = parseDate(item.date);
    if (!date) {
      continue;
    }

    // Get previous value if available
    const nextItem = response.data[i + 1];
    const previousValue = nextItem ? parseFloat(nextItem.value) : undefined;

    results.push({
      indicator: metadata?.name ?? response.name ?? "Unknown",
      value,
      previousValue: Number.isNaN(previousValue ?? NaN) ? undefined : previousValue,
      date,
      unit: metadata?.unit ?? response.unit ?? undefined,
      source: "Alpha Vantage",
    });
  }

  return results;
}

/**
 * Parse FMP economic calendar event
 */
export interface FMPEconomicEvent {
  date: string;
  country: string;
  event: string;
  actual?: number | null;
  previous?: number | null;
  estimate?: number | null;
  change?: number | null;
  changePercentage?: number | null;
  unit?: string;
  impact?: "Low" | "Medium" | "High";
}

/**
 * Parse FMP economic calendar events
 */
export function parseFMPEconomicEvents(events: FMPEconomicEvent[]): ParsedMacroRelease[] {
  const results: ParsedMacroRelease[] = [];

  for (const event of events) {
    // Only process events with actual values
    if (event.actual === null || event.actual === undefined) {
      continue;
    }

    const date = parseDate(event.date);
    if (!date) {
      continue;
    }

    results.push({
      indicator: event.event,
      value: event.actual,
      previousValue: event.previous ?? undefined,
      date,
      unit: event.unit,
      source: `FMP:${event.country}`,
    });
  }

  return results;
}

/**
 * Parse date string
 */
function parseDate(dateStr: string): Date | null {
  if (!dateStr) {
    return null;
  }
  const date = new Date(dateStr);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Calculate surprise score for macro release
 *
 * @param actual - Actual released value
 * @param estimate - Consensus estimate
 * @param previous - Previous release value
 * @returns Surprise score from -1 (big miss) to 1 (big beat)
 */
export function calculateMacroSurprise(
  actual: number,
  estimate?: number,
  previous?: number
): number {
  // If we have an estimate, use it for surprise calculation
  if (estimate !== undefined && estimate !== 0) {
    const surprise = (actual - estimate) / Math.abs(estimate);
    // Clamp to [-1, 1] range
    return Math.max(-1, Math.min(1, surprise));
  }

  // If no estimate but have previous, use previous as baseline
  if (previous !== undefined && previous !== 0) {
    const change = (actual - previous) / Math.abs(previous);
    // Use half the weight for previous-based surprise
    return Math.max(-1, Math.min(1, change * 0.5));
  }

  // No baseline available
  return 0;
}

/**
 * Determine if macro release is significant
 */
export function isMacroReleaseSignificant(
  release: ParsedMacroRelease,
  thresholdPercent = 0.5
): boolean {
  if (release.previousValue === undefined) {
    return true; // Assume significant if unknown
  }

  const changePercent =
    Math.abs((release.value - release.previousValue) / release.previousValue) * 100;

  return changePercent >= thresholdPercent;
}

/**
 * Filter macro releases by recency
 */
export function filterRecentMacroReleases(
  releases: ParsedMacroRelease[],
  maxAgeDays = 7
): ParsedMacroRelease[] {
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
  return releases.filter((r) => r.date >= cutoff);
}

/**
 * Group macro releases by indicator
 */
export function groupByIndicator(
  releases: ParsedMacroRelease[]
): Map<string, ParsedMacroRelease[]> {
  const groups = new Map<string, ParsedMacroRelease[]>();

  for (const release of releases) {
    const key = release.indicator;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)?.push(release);
  }

  // Sort each group by date descending
  for (const [, releases] of groups) {
    releases.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  return groups;
}
