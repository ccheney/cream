/**
 * Limits Service
 *
 * Monitors portfolio risk limits and constraint utilization.
 *
 * @see docs/plans/ui/05-api-endpoints.md Risk section
 */

import type { ExposureMetrics, PositionForExposure } from "./types.js";

// ============================================
// Constraint Types (mirror @cream/config)
// ============================================

export interface PerInstrumentConstraints {
  max_units: number;
  max_notional: number;
  max_pct_equity: number;
}

export interface PortfolioConstraints {
  max_gross_notional: number;
  max_net_notional: number;
  max_gross_pct_equity: number;
  max_net_pct_equity: number;
}

export interface OptionsGreeksConstraints {
  max_delta_notional: number;
  max_gamma: number;
  max_vega: number;
  max_theta: number;
}

export interface ConstraintsConfig {
  per_instrument?: PerInstrumentConstraints;
  portfolio?: PortfolioConstraints;
  options?: OptionsGreeksConstraints;
}

// ============================================
// Types
// ============================================

export type LimitCategory = "per_instrument" | "portfolio" | "options";
export type LimitStatus = "ok" | "warning" | "critical";

export interface LimitStatusItem {
  /** Human-readable limit name */
  name: string;
  /** Limit category */
  category: LimitCategory;
  /** Current value */
  current: number;
  /** Configured limit */
  limit: number;
  /** Utilization as percentage (0-100+) */
  utilization: number;
  /** Status based on utilization */
  status: LimitStatus;
}

export interface PortfolioGreeks {
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
}

export interface CalculateLimitsOptions {
  /** Portfolio exposure metrics */
  exposure: ExposureMetrics;
  /** Portfolio Greeks (optional - for options limits) */
  greeks?: PortfolioGreeks;
  /** Current positions for per-instrument checks */
  positions: PositionForExposure[];
  /** Portfolio NAV */
  nav: number;
  /** Configured constraints */
  constraints: ConstraintsConfig;
}

// ============================================
// Default Constraints (fallback if not configured)
// ============================================

const DEFAULT_PER_INSTRUMENT: PerInstrumentConstraints = {
  max_units: 1000,
  max_notional: 50000,
  max_pct_equity: 0.1,
};

const DEFAULT_PORTFOLIO: PortfolioConstraints = {
  max_gross_notional: 500000,
  max_net_notional: 250000,
  max_gross_pct_equity: 2.0,
  max_net_pct_equity: 1.0,
};

export const DEFAULT_OPTIONS: OptionsGreeksConstraints = {
  max_delta_notional: 100000,
  max_gamma: 1000,
  max_vega: 5000,
  max_theta: -500,
};

// ============================================
// Status Calculation
// ============================================

/**
 * Determine limit status based on utilization percentage.
 */
function getStatus(utilization: number): LimitStatus {
  if (utilization >= 95) {
    return "critical";
  }
  if (utilization >= 80) {
    return "warning";
  }
  return "ok";
}

/**
 * Calculate utilization percentage.
 */
function calculateUtilization(current: number, limit: number): number {
  if (limit === 0) {
    return 0;
  }
  return Math.abs(current / limit) * 100;
}

// ============================================
// Limit Calculations
// ============================================

/**
 * Calculate per-instrument limit statuses.
 */
function calculatePerInstrumentLimits(
  positions: PositionForExposure[],
  nav: number,
  constraints: PerInstrumentConstraints
): LimitStatusItem[] {
  const limits: LimitStatusItem[] = [];

  // Find max values across all positions
  let maxUnits = 0;
  let maxNotional = 0;
  let maxPctEquity = 0;

  for (const position of positions) {
    const units = Math.abs(position.quantity);
    const notional = Math.abs(position.marketValue ?? 0);
    const pctEquity = nav > 0 ? notional / nav : 0;

    if (units > maxUnits) {
      maxUnits = units;
    }
    if (notional > maxNotional) {
      maxNotional = notional;
    }
    if (pctEquity > maxPctEquity) {
      maxPctEquity = pctEquity;
    }
  }

  // Max Shares/Contracts
  const unitsUtil = calculateUtilization(maxUnits, constraints.max_units);
  limits.push({
    name: "Max Units Per Position",
    category: "per_instrument",
    current: maxUnits,
    limit: constraints.max_units,
    utilization: unitsUtil,
    status: getStatus(unitsUtil),
  });

  // Max Notional
  const notionalUtil = calculateUtilization(maxNotional, constraints.max_notional);
  limits.push({
    name: "Max Notional Per Position",
    category: "per_instrument",
    current: maxNotional,
    limit: constraints.max_notional,
    utilization: notionalUtil,
    status: getStatus(notionalUtil),
  });

  // Max % Equity
  const pctEquityLimit = constraints.max_pct_equity * 100;
  const pctEquityCurrent = maxPctEquity * 100;
  const pctEquityUtil = calculateUtilization(maxPctEquity, constraints.max_pct_equity);
  limits.push({
    name: "Max % Equity Per Position",
    category: "per_instrument",
    current: pctEquityCurrent,
    limit: pctEquityLimit,
    utilization: pctEquityUtil,
    status: getStatus(pctEquityUtil),
  });

  return limits;
}

/**
 * Calculate portfolio-level limit statuses.
 */
function calculatePortfolioLimits(
  exposure: ExposureMetrics,
  nav: number,
  constraints: PortfolioConstraints
): LimitStatusItem[] {
  const limits: LimitStatusItem[] = [];

  // Gross Notional
  const grossNotionalUtil = calculateUtilization(
    exposure.gross.current,
    constraints.max_gross_notional
  );
  limits.push({
    name: "Gross Exposure",
    category: "portfolio",
    current: exposure.gross.current,
    limit: constraints.max_gross_notional,
    utilization: grossNotionalUtil,
    status: getStatus(grossNotionalUtil),
  });

  // Net Notional
  const netNotionalUtil = calculateUtilization(
    Math.abs(exposure.net.current),
    constraints.max_net_notional
  );
  limits.push({
    name: "Net Exposure",
    category: "portfolio",
    current: exposure.net.current,
    limit: constraints.max_net_notional,
    utilization: netNotionalUtil,
    status: getStatus(netNotionalUtil),
  });

  // Gross % Equity
  const grossPctEquity = nav > 0 ? exposure.gross.current / nav : 0;
  const grossPctEquityUtil = calculateUtilization(grossPctEquity, constraints.max_gross_pct_equity);
  limits.push({
    name: "Gross Exposure % Equity",
    category: "portfolio",
    current: grossPctEquity * 100,
    limit: constraints.max_gross_pct_equity * 100,
    utilization: grossPctEquityUtil,
    status: getStatus(grossPctEquityUtil),
  });

  // Net % Equity
  const netPctEquity = nav > 0 ? Math.abs(exposure.net.current) / nav : 0;
  const netPctEquityUtil = calculateUtilization(netPctEquity, constraints.max_net_pct_equity);
  limits.push({
    name: "Net Exposure % Equity",
    category: "portfolio",
    current: netPctEquity * 100,
    limit: constraints.max_net_pct_equity * 100,
    utilization: netPctEquityUtil,
    status: getStatus(netPctEquityUtil),
  });

  // Concentration (from exposure metrics)
  // Use 25% as default concentration limit if not in config
  const concentrationLimit = 25;
  const concentrationUtil = calculateUtilization(exposure.concentrationMax.pct, concentrationLimit);
  limits.push({
    name: "Concentration",
    category: "portfolio",
    current: exposure.concentrationMax.pct,
    limit: concentrationLimit,
    utilization: concentrationUtil,
    status: getStatus(concentrationUtil),
  });

  return limits;
}

/**
 * Calculate options Greeks limit statuses.
 */
function calculateOptionsLimits(
  greeks: PortfolioGreeks,
  constraints: OptionsGreeksConstraints
): LimitStatusItem[] {
  const limits: LimitStatusItem[] = [];

  // Delta Notional
  const deltaUtil = calculateUtilization(Math.abs(greeks.delta), constraints.max_delta_notional);
  limits.push({
    name: "Delta Exposure",
    category: "options",
    current: greeks.delta,
    limit: constraints.max_delta_notional,
    utilization: deltaUtil,
    status: getStatus(deltaUtil),
  });

  // Gamma
  const gammaUtil = calculateUtilization(Math.abs(greeks.gamma), constraints.max_gamma);
  limits.push({
    name: "Gamma",
    category: "options",
    current: greeks.gamma,
    limit: constraints.max_gamma,
    utilization: gammaUtil,
    status: getStatus(gammaUtil),
  });

  // Vega
  const vegaUtil = calculateUtilization(Math.abs(greeks.vega), constraints.max_vega);
  limits.push({
    name: "Vega",
    category: "options",
    current: greeks.vega,
    limit: constraints.max_vega,
    utilization: vegaUtil,
    status: getStatus(vegaUtil),
  });

  // Theta (negative limit - cost cap)
  // For theta, we compare the absolute values
  const thetaLimit = Math.abs(constraints.max_theta);
  const thetaUtil = calculateUtilization(Math.abs(greeks.theta), thetaLimit);
  limits.push({
    name: "Theta (Daily Decay)",
    category: "options",
    current: greeks.theta,
    limit: constraints.max_theta,
    utilization: thetaUtil,
    status: getStatus(thetaUtil),
  });

  return limits;
}

// ============================================
// Main Calculation Function
// ============================================

/**
 * Calculate all limit statuses.
 *
 * @example
 * ```typescript
 * const limits = calculateLimits({
 *   exposure: { gross: { current: 450000, limit: 500000, pct: 90 }, ... },
 *   greeks: { delta: 85000, gamma: 500, vega: 3000, theta: -300 },
 *   positions: [...],
 *   nav: 500000,
 *   constraints: config.constraints,
 * });
 * ```
 */
export function calculateLimits(options: CalculateLimitsOptions): LimitStatusItem[] {
  const { exposure, greeks, positions, nav, constraints } = options;

  const limits: LimitStatusItem[] = [];

  // Per-instrument limits
  const perInstrument = constraints.per_instrument ?? DEFAULT_PER_INSTRUMENT;
  limits.push(...calculatePerInstrumentLimits(positions, nav, perInstrument));

  // Portfolio limits
  const portfolio = constraints.portfolio ?? DEFAULT_PORTFOLIO;
  limits.push(...calculatePortfolioLimits(exposure, nav, portfolio));

  // Options limits (only if Greeks provided)
  if (greeks) {
    const optionsConstraints = constraints.options ?? DEFAULT_OPTIONS;
    limits.push(...calculateOptionsLimits(greeks, optionsConstraints));
  }

  return limits;
}

// ============================================
// Summary Functions
// ============================================

/**
 * Get limits that are in warning or critical status.
 */
export function getBreachingLimits(limits: LimitStatusItem[]): LimitStatusItem[] {
  return limits.filter((l) => l.status === "warning" || l.status === "critical");
}

/**
 * Get the worst status across all limits.
 */
export function getWorstStatus(limits: LimitStatusItem[]): LimitStatus {
  if (limits.some((l) => l.status === "critical")) {
    return "critical";
  }
  if (limits.some((l) => l.status === "warning")) {
    return "warning";
  }
  return "ok";
}

export default {
  calculateLimits,
  getBreachingLimits,
  getWorstStatus,
};
