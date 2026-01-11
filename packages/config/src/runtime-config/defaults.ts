/**
 * Runtime Configuration Defaults
 */

import type { RuntimeConstraintsConfig, RuntimeEnvironment, TradingEnvironment } from "./types.js";

export function getDefaultConstraints(environment: RuntimeEnvironment): RuntimeConstraintsConfig {
  const now = new Date().toISOString();
  return {
    id: `cc_${environment.toLowerCase()}_default`,
    environment: environment as TradingEnvironment,
    perInstrument: {
      maxShares: 1000,
      maxContracts: 10,
      maxNotional: 50000,
      maxPctEquity: 0.1,
    },
    portfolio: {
      maxGrossExposure: 2.0,
      maxNetExposure: 1.0,
      maxConcentration: 0.25,
      maxCorrelation: 0.7,
      maxDrawdown: 0.15,
    },
    options: {
      maxDelta: 100,
      maxGamma: 50,
      maxVega: 1000,
      maxTheta: 500,
    },
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}
