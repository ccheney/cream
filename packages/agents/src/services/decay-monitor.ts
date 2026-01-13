/**
 * Decay Monitor Service
 *
 * Monitors factor performance degradation and generates alerts when:
 * - Rolling IC falls below 50% of peak for 20+ days
 * - Rolling Sharpe falls below 0.5 for 10+ days
 * - Correlation with market (SPY) exceeds 0.8 (crowding)
 * - Factor-factor correlation spikes above 0.7
 *
 * @see https://markrbest.github.io/alpha-decay/
 * @see https://arxiv.org/html/2512.11913 - Not All Factors Crowd Equally
 * @see docs/plans/20-research-to-production-pipeline.md - Phase 7
 */

import type { Factor } from "@cream/domain";
import type { FactorZooRepository } from "@cream/storage";
import { z } from "zod";

export const DecayAlertTypeSchema = z.enum([
  "IC_DECAY",
  "SHARPE_DECAY",
  "CROWDING",
  "CORRELATION_SPIKE",
]);

export type DecayAlertType = z.infer<typeof DecayAlertTypeSchema>;

export const DecaySeveritySchema = z.enum(["WARNING", "CRITICAL"]);

export type DecaySeverity = z.infer<typeof DecaySeveritySchema>;

export const DecayAlertSchema = z.object({
  factorId: z.string(),
  alertType: DecayAlertTypeSchema,
  severity: DecaySeveritySchema,
  currentValue: z.number(),
  threshold: z.number(),
  peakValue: z.number().optional(),
  decayRate: z.number().optional(),
  relatedFactorId: z.string().optional(),
  recommendation: z.string(),
  triggeredAt: z.string(),
});

export type DecayAlert = z.infer<typeof DecayAlertSchema>;

export interface DecayMonitorConfig {
  /** IC decay threshold as fraction of peak (default: 0.5) */
  icDecayThreshold: number;
  /** Days of IC decay before alert (default: 20) */
  icDecayWindowDays: number;
  /** Sharpe threshold for decay alert (default: 0.5) */
  sharpeDecayThreshold: number;
  /** Days of Sharpe decay before alert (default: 10) */
  sharpeDecayWindowDays: number;
  /** Market correlation threshold for crowding (default: 0.8) */
  crowdingThreshold: number;
  /** Factor-factor correlation threshold (default: 0.7) */
  correlationSpikeThreshold: number;
  /** Lookback days for correlation calculation (default: 60) */
  correlationLookbackDays: number;
}

export const DEFAULT_DECAY_MONITOR_CONFIG: DecayMonitorConfig = {
  icDecayThreshold: 0.5,
  icDecayWindowDays: 20,
  sharpeDecayThreshold: 0.5,
  sharpeDecayWindowDays: 10,
  crowdingThreshold: 0.8,
  correlationSpikeThreshold: 0.7,
  correlationLookbackDays: 60,
};

export interface DecayAlertService {
  send(alert: DecayAlert): Promise<void>;
}

export interface MarketDataProvider {
  /** Returns array of daily returns (most recent first) */
  getMarketReturns(days: number): Promise<number[]>;
}

export interface DailyCheckResult {
  alerts: DecayAlert[];
  factorsChecked: number;
  decayingFactors: string[];
  crowdedFactors: string[];
  correlatedPairs: Array<{ factor1: string; factor2: string; correlation: number }>;
  checkedAt: string;
}

export class DecayMonitorService {
  private readonly config: DecayMonitorConfig;

  constructor(
    private readonly factorZoo: FactorZooRepository,
    private readonly alertService?: DecayAlertService,
    private readonly marketData?: MarketDataProvider,
    config?: Partial<DecayMonitorConfig>
  ) {
    this.config = {
      ...DEFAULT_DECAY_MONITOR_CONFIG,
      ...config,
    };
  }

  async runDailyCheck(): Promise<DailyCheckResult> {
    const timestamp = new Date().toISOString();
    const alerts: DecayAlert[] = [];
    const decayingFactors: string[] = [];
    const crowdedFactors: string[] = [];
    const correlatedPairs: Array<{ factor1: string; factor2: string; correlation: number }> = [];

    const activeFactors = await this.factorZoo.findActiveFactors();

    for (const factor of activeFactors) {
      const icAlert = await this.checkICDecay(factor);
      if (icAlert) {
        alerts.push(icAlert);
        decayingFactors.push(factor.factorId);
      }

      const sharpeAlert = await this.checkSharpeDecay(factor);
      if (sharpeAlert) {
        alerts.push(sharpeAlert);
        if (!decayingFactors.includes(factor.factorId)) {
          decayingFactors.push(factor.factorId);
        }
      }

      if (this.marketData) {
        const crowdingAlert = await this.checkCrowding(factor);
        if (crowdingAlert) {
          alerts.push(crowdingAlert);
          crowdedFactors.push(factor.factorId);
        }
      }
    }

    const corrAlerts = await this.checkCorrelationSpikes(activeFactors);
    for (const alert of corrAlerts) {
      alerts.push(alert);
      if (alert.relatedFactorId) {
        correlatedPairs.push({
          factor1: alert.factorId,
          factor2: alert.relatedFactorId,
          correlation: alert.currentValue,
        });
      }
    }

    if (this.alertService) {
      for (const alert of alerts) {
        await this.alertService.send(alert);
      }
    }

    return {
      alerts,
      factorsChecked: activeFactors.length,
      decayingFactors,
      crowdedFactors,
      correlatedPairs,
      checkedAt: timestamp,
    };
  }

  async checkICDecay(factor: Factor): Promise<DecayAlert | null> {
    const history = await this.factorZoo.getPerformanceHistory(
      factor.factorId,
      this.config.icDecayWindowDays
    );

    if (history.length < this.config.icDecayWindowDays) {
      return null;
    }

    const icValues = history.map((h) => h.ic);
    const peakIC = Math.max(...icValues);
    const recentIC = this.mean(icValues);
    const threshold = peakIC * this.config.icDecayThreshold;

    if (recentIC < threshold) {
      const decayRate = (peakIC - recentIC) / this.config.icDecayWindowDays;
      const severity: DecaySeverity = recentIC < peakIC * 0.3 ? "CRITICAL" : "WARNING";

      return {
        factorId: factor.factorId,
        alertType: "IC_DECAY",
        severity,
        currentValue: recentIC,
        threshold,
        peakValue: peakIC,
        decayRate,
        recommendation:
          `Factor IC has decayed to ${((recentIC / peakIC) * 100).toFixed(1)}% of peak. ` +
          `Consider triggering replacement research or reducing weight.`,
        triggeredAt: new Date().toISOString(),
      };
    }

    return null;
  }

  async checkSharpeDecay(factor: Factor): Promise<DecayAlert | null> {
    const history = await this.factorZoo.getPerformanceHistory(
      factor.factorId,
      this.config.sharpeDecayWindowDays
    );

    if (history.length < this.config.sharpeDecayWindowDays) {
      return null;
    }

    const sharpeValues = history.map((h) => h.sharpe).filter((s): s is number => s !== null);
    if (sharpeValues.length === 0) {
      return null;
    }
    const recentSharpe = this.mean(sharpeValues);

    if (recentSharpe < this.config.sharpeDecayThreshold) {
      const severity: DecaySeverity = recentSharpe < 0 ? "CRITICAL" : "WARNING";

      return {
        factorId: factor.factorId,
        alertType: "SHARPE_DECAY",
        severity,
        currentValue: recentSharpe,
        threshold: this.config.sharpeDecayThreshold,
        recommendation:
          `Rolling Sharpe (${recentSharpe.toFixed(2)}) below threshold. ` +
          `Strategy underperforming risk-adjusted benchmark.`,
        triggeredAt: new Date().toISOString(),
      };
    }

    return null;
  }

  async checkCrowding(factor: Factor): Promise<DecayAlert | null> {
    if (!this.marketData) {
      return null;
    }

    try {
      const marketCorrelation = await this.computeMarketCorrelation(factor.factorId);

      if (Math.abs(marketCorrelation) > this.config.crowdingThreshold) {
        const severity: DecaySeverity = Math.abs(marketCorrelation) > 0.9 ? "CRITICAL" : "WARNING";

        return {
          factorId: factor.factorId,
          alertType: "CROWDING",
          severity,
          currentValue: marketCorrelation,
          threshold: this.config.crowdingThreshold,
          recommendation:
            `Factor highly correlated with market (${(marketCorrelation * 100).toFixed(1)}%). ` +
            `Alpha likely eroded due to crowding. See: https://arxiv.org/html/2512.11913`,
          triggeredAt: new Date().toISOString(),
        };
      }
    } catch {
      // Market data unavailable - skip crowding check
    }

    return null;
  }

  async checkCorrelationSpikes(factors: Factor[]): Promise<DecayAlert[]> {
    const alerts: DecayAlert[] = [];
    const correlationMatrix = await this.factorZoo.getCorrelationMatrix();

    for (let i = 0; i < factors.length; i++) {
      const factor1 = factors[i];
      if (!factor1) {
        continue;
      }
      const factor1Correlations = correlationMatrix.get(factor1.factorId);

      if (!factor1Correlations) {
        continue;
      }

      for (let j = i + 1; j < factors.length; j++) {
        const factor2 = factors[j];
        if (!factor2) {
          continue;
        }
        const correlation = factor1Correlations.get(factor2.factorId) ?? 0;

        if (Math.abs(correlation) > this.config.correlationSpikeThreshold) {
          alerts.push({
            factorId: factor1.factorId,
            alertType: "CORRELATION_SPIKE",
            severity: "WARNING",
            currentValue: correlation,
            threshold: this.config.correlationSpikeThreshold,
            relatedFactorId: factor2.factorId,
            recommendation:
              `High correlation (${(correlation * 100).toFixed(1)}%) with ${factor2.factorId}. ` +
              `Consider reducing weight of one factor to maintain diversification.`,
            triggeredAt: new Date().toISOString(),
          });
        }
      }
    }

    return alerts;
  }

  async checkFactor(factorId: string): Promise<DecayAlert[]> {
    const factor = await this.factorZoo.findFactorById(factorId);
    if (!factor || factor.status !== "active") {
      return [];
    }

    const alerts: DecayAlert[] = [];

    const icAlert = await this.checkICDecay(factor);
    if (icAlert) {
      alerts.push(icAlert);
    }

    const sharpeAlert = await this.checkSharpeDecay(factor);
    if (sharpeAlert) {
      alerts.push(sharpeAlert);
    }

    if (this.marketData) {
      const crowdingAlert = await this.checkCrowding(factor);
      if (crowdingAlert) {
        alerts.push(crowdingAlert);
      }
    }

    return alerts;
  }

  private async computeMarketCorrelation(factorId: string): Promise<number> {
    if (!this.marketData) {
      throw new Error("Market data provider not configured");
    }

    const factorHistory = await this.factorZoo.getPerformanceHistory(
      factorId,
      this.config.correlationLookbackDays
    );

    if (factorHistory.length < 20) {
      return 0;
    }

    const marketReturns = await this.marketData.getMarketReturns(
      this.config.correlationLookbackDays
    );

    if (marketReturns.length < 20) {
      return 0;
    }

    const factorIC = factorHistory.map((h) => h.ic);
    const n = Math.min(factorIC.length, marketReturns.length);

    return this.correlation(factorIC.slice(0, n), marketReturns.slice(0, n));
  }

  private mean(arr: number[]): number {
    if (arr.length === 0) {
      return 0;
    }
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  private correlation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n < 2) {
      return 0;
    }

    const xSlice = x.slice(0, n);
    const ySlice = y.slice(0, n);

    const meanX = xSlice.reduce((a, b) => a + b, 0) / n;
    const meanY = ySlice.reduce((a, b) => a + b, 0) / n;

    let num = 0;
    let denX = 0;
    let denY = 0;

    for (let i = 0; i < n; i++) {
      const xi = xSlice[i];
      const yi = ySlice[i];
      if (xi === undefined || yi === undefined) {
        continue;
      }
      const dx = xi - meanX;
      const dy = yi - meanY;
      num += dx * dy;
      denX += dx * dx;
      denY += dy * dy;
    }

    const denominator = Math.sqrt(denX * denY);
    if (denominator === 0) {
      return 0;
    }

    return num / denominator;
  }

  getConfig(): DecayMonitorConfig {
    return { ...this.config };
  }
}

export interface DecayMonitorDependencies {
  factorZoo: FactorZooRepository;
  alertService?: DecayAlertService;
  marketData?: MarketDataProvider;
}

export function createDecayMonitorService(
  deps: DecayMonitorDependencies,
  config?: Partial<DecayMonitorConfig>
): DecayMonitorService {
  return new DecayMonitorService(deps.factorZoo, deps.alertService, deps.marketData, config);
}
