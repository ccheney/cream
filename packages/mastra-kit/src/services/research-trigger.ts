/**
 * Research Trigger Detection Service
 *
 * Monitors for conditions warranting autonomous research spawning.
 * This system decides WHEN to launch the Research-to-Production Pipeline.
 *
 * @see docs/plans/20-research-to-production-pipeline.md - Phase 0: Trigger Detection
 */

import type {
  BlockingCheckResult,
  BlockingConditions,
  Factor,
  FactorPerformance,
  ResearchTrigger,
  ResearchTriggerConfig,
  TriggerDetectionResult,
  TriggerDetectionState,
  TriggerSeverity,
} from "@cream/domain";
import { DEFAULT_RESEARCH_TRIGGER_CONFIG } from "@cream/domain";
import type { FactorZooRepository } from "@cream/storage";

// ============================================
// Types
// ============================================

/**
 * Dependencies for the ResearchTriggerService
 */
export interface ResearchTriggerDependencies {
  factorZoo: FactorZooRepository;
}

/**
 * Market beta provider for crowding detection
 */
export interface MarketBetaProvider {
  getMarketBeta(factorId: string): Promise<number | null>;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Calculate the mean of an array of numbers
 */
function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Determine severity based on affected factor count
 */
function determineSeverity(affectedCount: number, config: ResearchTriggerConfig): TriggerSeverity {
  if (affectedCount >= config.highSeverityFactorCount) {
    return "HIGH";
  }
  if (affectedCount >= 2) {
    return "MEDIUM";
  }
  return "LOW";
}

// ============================================
// ResearchTriggerService
// ============================================

/**
 * Service for detecting research triggers
 */
export class ResearchTriggerService {
  private factorZoo: FactorZooRepository;
  private config: ResearchTriggerConfig;
  private marketBetaProvider?: MarketBetaProvider;

  constructor(
    deps: ResearchTriggerDependencies,
    config: ResearchTriggerConfig = DEFAULT_RESEARCH_TRIGGER_CONFIG,
    marketBetaProvider?: MarketBetaProvider
  ) {
    this.factorZoo = deps.factorZoo;
    this.config = config;
    this.marketBetaProvider = marketBetaProvider;
  }

  /**
   * Main entry point: check if research should be triggered
   */
  async shouldTriggerResearch(state: TriggerDetectionState): Promise<TriggerDetectionResult> {
    const now = new Date().toISOString();

    // Check blocking conditions first
    const blockingCheck = await this.checkBlockingConditions();
    if (blockingCheck.isBlocked) {
      return {
        trigger: null,
        shouldTrigger: false,
        blockingCheck,
        allTriggers: [],
        checkedAt: now,
      };
    }

    // Check all triggers in priority order
    const allTriggers: ResearchTrigger[] = [];

    const regimeGap = await this.checkRegimeGap(state);
    if (regimeGap) {
      allTriggers.push(regimeGap);
    }

    const alphaDecay = await this.checkAlphaDecay();
    if (alphaDecay) {
      allTriggers.push(alphaDecay);
    }

    const perfDegradation = await this.checkPerformanceDegradation();
    if (perfDegradation) {
      allTriggers.push(perfDegradation);
    }

    const crowding = await this.checkFactorCrowding();
    if (crowding) {
      allTriggers.push(crowding);
    }

    // Return highest priority trigger (first one found)
    const trigger = allTriggers[0] ?? null;

    return {
      trigger,
      shouldTrigger: trigger !== null,
      blockingCheck,
      allTriggers,
      checkedAt: now,
    };
  }

  // ============================================
  // Blocking Conditions
  // ============================================

  /**
   * Check all blocking conditions
   */
  async checkBlockingConditions(): Promise<BlockingCheckResult> {
    const conditions = await this.getBlockingConditions();
    const reasons: string[] = [];

    // Check cooldown
    if (conditions.daysSinceLastResearch < this.config.cooldownDays) {
      reasons.push(
        `Cooldown active: ${conditions.daysSinceLastResearch} days since last research (min: ${this.config.cooldownDays})`
      );
    }

    // Check active research count
    if (conditions.activeResearchCount >= this.config.maxActiveResearch) {
      reasons.push(
        `Too many active research pipelines: ${conditions.activeResearchCount} (max: ${this.config.maxActiveResearch})`
      );
    }

    // Check Factor Zoo capacity
    if (conditions.factorZooSize >= this.config.maxFactorZooSize) {
      reasons.push(
        `Factor Zoo at capacity: ${conditions.factorZooSize} factors (max: ${this.config.maxFactorZooSize})`
      );
    }

    // Check budget
    if (conditions.budgetExhausted) {
      reasons.push("Monthly research budget exhausted");
    }

    return {
      isBlocked: reasons.length > 0,
      reasons,
      conditions,
    };
  }

  /**
   * Get current blocking condition values
   */
  private async getBlockingConditions(): Promise<BlockingConditions> {
    const [activeRuns, stats] = await Promise.all([
      this.factorZoo.findActiveResearchRuns(),
      this.factorZoo.getStats(),
    ]);

    // Calculate days since last research
    const daysSinceLastResearch = await this.getDaysSinceLastResearch();

    return {
      daysSinceLastResearch,
      activeResearchCount: activeRuns.length,
      factorZooSize: stats.activeFactors,
      budgetExhausted: false, // TODO: Implement budget tracking
    };
  }

  /**
   * Calculate days since last completed research run
   */
  private async getDaysSinceLastResearch(): Promise<number> {
    // Query for most recent completed research run
    // For now, return a large number if no research found
    const activeRuns = await this.factorZoo.findActiveResearchRuns();

    // If there are active runs, we're in cooldown
    if (activeRuns.length > 0) {
      return 0;
    }

    // TODO: Query for most recent completed research run timestamp
    // For now, return a value that passes cooldown by default
    return this.config.cooldownDays + 1;
  }

  // ============================================
  // Trigger Detection: Regime Gap
  // ============================================

  /**
   * Check if current regime is not covered by active strategies
   */
  async checkRegimeGap(state: TriggerDetectionState): Promise<ResearchTrigger | null> {
    const { currentRegime, activeRegimes } = state;

    // Check if current regime is covered
    if (activeRegimes.includes(currentRegime)) {
      return null;
    }

    const now = new Date().toISOString();

    // Find which regimes are covered
    const allRegimes = ["BULL_TREND", "BEAR_TREND", "RANGE", "HIGH_VOL", "LOW_VOL"];
    const uncoveredRegimes = allRegimes.filter((r) => !activeRegimes.includes(r));

    return {
      type: "REGIME_GAP",
      severity: currentRegime === "HIGH_VOL" ? "HIGH" : "MEDIUM",
      affectedFactors: [], // No specific factors affected, it's a gap
      suggestedFocus: `Develop strategies for ${currentRegime} regime`,
      detectedAt: now,
      metadata: {
        currentRegime,
        coveredRegimes: activeRegimes,
        uncoveredRegimes,
      },
    };
  }

  // ============================================
  // Trigger Detection: Alpha Decay
  // ============================================

  /**
   * Check for factors with decaying predictive power
   *
   * Based on Alpha Decay research: https://markrbest.github.io/alpha-decay/
   * Rolling IC < 50% of peak for 20+ days indicates alpha decay
   */
  async checkAlphaDecay(): Promise<ResearchTrigger | null> {
    const activeFactors = await this.factorZoo.findActiveFactors();
    type DecayInfo = {
      peakIC: number;
      currentIC: number;
      rollingIC: number;
      decayRate: number;
      daysDecaying: number;
    };
    const decayingFactors: Array<{ factor: Factor; metadata: DecayInfo }> = [];

    for (const factor of activeFactors) {
      const decayInfo = await this.checkFactorDecay(factor);
      if (decayInfo) {
        decayingFactors.push({ factor, metadata: decayInfo });
      }
    }

    if (decayingFactors.length === 0) {
      return null;
    }

    const now = new Date().toISOString();
    const avgDecayRate = mean(decayingFactors.map((d) => d.metadata.decayRate));

    return {
      type: "ALPHA_DECAY",
      severity: determineSeverity(decayingFactors.length, this.config),
      affectedFactors: decayingFactors.map((d) => d.factor.factorId),
      suggestedFocus: "Replace decaying factors with novel alpha sources",
      detectedAt: now,
      metadata: {
        decayingFactorCount: decayingFactors.length,
        averageDecayRate: avgDecayRate,
        factors: decayingFactors.map((d) => ({
          factorId: d.factor.factorId,
          ...d.metadata,
        })),
      },
    };
  }

  /**
   * Check if a single factor is experiencing alpha decay
   */
  private async checkFactorDecay(factor: Factor): Promise<{
    peakIC: number;
    currentIC: number;
    rollingIC: number;
    decayRate: number;
    daysDecaying: number;
  } | null> {
    // Get performance history (60 days for analysis)
    const history = await this.factorZoo.getPerformanceHistory(factor.factorId, 60);

    if (history.length < this.config.alphaDecayMinDays) {
      return null; // Not enough data
    }

    const icValues = history.map((h: FactorPerformance) => h.ic);
    const peakIC = Math.max(...icValues);

    if (peakIC <= 0) {
      return null; // No positive IC recorded
    }

    // Get rolling IC for the minimum decay period
    const recentHistory = history.slice(0, this.config.alphaDecayMinDays);
    const rollingIC = mean(recentHistory.map((h: FactorPerformance) => h.ic));

    // Check if rolling IC < threshold% of peak
    const threshold = peakIC * this.config.alphaDecayICThreshold;

    if (rollingIC >= threshold) {
      return null; // Not decaying
    }

    // Calculate decay rate (IC decline per day)
    const currentIC = recentHistory[0]?.ic ?? 0;
    const oldestRecentIC = recentHistory[recentHistory.length - 1]?.ic ?? peakIC;
    const decayRate = (oldestRecentIC - currentIC) / recentHistory.length;

    // Count consecutive days below threshold
    let daysDecaying = 0;
    for (const h of recentHistory) {
      if (h.ic < threshold) {
        daysDecaying++;
      } else {
        break;
      }
    }

    if (daysDecaying < this.config.alphaDecayMinDays) {
      return null; // Not decaying long enough
    }

    return {
      peakIC,
      currentIC,
      rollingIC,
      decayRate,
      daysDecaying,
    };
  }

  // ============================================
  // Trigger Detection: Performance Degradation
  // ============================================

  /**
   * Check for factors with degraded performance
   *
   * Rolling Sharpe < 0.5 for 10+ days indicates performance degradation
   */
  async checkPerformanceDegradation(): Promise<ResearchTrigger | null> {
    const activeFactors = await this.factorZoo.findActiveFactors();
    const degradedFactors: Array<{ factor: Factor; sharpe: number; days: number }> = [];

    for (const factor of activeFactors) {
      const degradation = await this.checkFactorPerformanceDegradation(factor);
      if (degradation) {
        degradedFactors.push({ factor, ...degradation });
      }
    }

    if (degradedFactors.length === 0) {
      return null;
    }

    const now = new Date().toISOString();
    const avgSharpe = mean(degradedFactors.map((d) => d.sharpe));

    return {
      type: "PERFORMANCE_DEGRADATION",
      severity: determineSeverity(degradedFactors.length, this.config),
      affectedFactors: degradedFactors.map((d) => d.factor.factorId),
      suggestedFocus: "Investigate and replace underperforming factors",
      detectedAt: now,
      metadata: {
        degradedFactorCount: degradedFactors.length,
        averageRollingSharpe: avgSharpe,
        sharpeThreshold: this.config.performanceSharpeThreshold,
        factors: degradedFactors.map((d) => ({
          factorId: d.factor.factorId,
          rollingSharpe: d.sharpe,
          daysBelowThreshold: d.days,
        })),
      },
    };
  }

  /**
   * Check if a single factor has degraded performance
   */
  private async checkFactorPerformanceDegradation(
    factor: Factor
  ): Promise<{ sharpe: number; days: number } | null> {
    const history = await this.factorZoo.getPerformanceHistory(
      factor.factorId,
      this.config.performanceMinDays
    );

    if (history.length < this.config.performanceMinDays) {
      return null; // Not enough data
    }

    // Calculate rolling Sharpe
    const sharpeValues = history
      .map((h: FactorPerformance) => h.sharpe)
      .filter((s: number | null): s is number => s !== null);

    if (sharpeValues.length === 0) {
      return null; // No Sharpe data
    }

    const rollingSharpe = mean(sharpeValues);

    if (rollingSharpe >= this.config.performanceSharpeThreshold) {
      return null; // Performance is acceptable
    }

    // Count consecutive days below threshold
    let daysBelowThreshold = 0;
    for (const h of history) {
      if (h.sharpe !== null && h.sharpe < this.config.performanceSharpeThreshold) {
        daysBelowThreshold++;
      } else {
        break;
      }
    }

    if (daysBelowThreshold < this.config.performanceMinDays) {
      return null; // Not degraded long enough
    }

    return {
      sharpe: rollingSharpe,
      days: daysBelowThreshold,
    };
  }

  // ============================================
  // Trigger Detection: Factor Crowding
  // ============================================

  /**
   * Check for factors that are crowded (high correlation with market beta)
   *
   * Based on: https://arxiv.org/html/2512.11913
   * Correlation with market beta > 0.8 indicates crowding
   */
  async checkFactorCrowding(): Promise<ResearchTrigger | null> {
    if (!this.marketBetaProvider) {
      // No market beta provider, skip crowding check
      return null;
    }

    const activeFactors = await this.factorZoo.findActiveFactors();
    const crowdedFactors: Array<{ factor: Factor; correlation: number }> = [];

    for (const factor of activeFactors) {
      const correlation = await this.marketBetaProvider.getMarketBeta(factor.factorId);

      if (
        correlation !== null &&
        Math.abs(correlation) > this.config.crowdingCorrelationThreshold
      ) {
        crowdedFactors.push({ factor, correlation });
      }
    }

    if (crowdedFactors.length === 0) {
      return null;
    }

    const now = new Date().toISOString();
    const avgCorrelation = mean(crowdedFactors.map((c) => Math.abs(c.correlation)));

    return {
      type: "FACTOR_CROWDING",
      severity: determineSeverity(crowdedFactors.length, this.config),
      affectedFactors: crowdedFactors.map((c) => c.factor.factorId),
      suggestedFocus: "Develop orthogonal alpha sources uncorrelated with market",
      detectedAt: now,
      metadata: {
        crowdedFactorCount: crowdedFactors.length,
        averageMarketCorrelation: avgCorrelation,
        crowdingThreshold: this.config.crowdingCorrelationThreshold,
        factors: crowdedFactors.map((c) => ({
          factorId: c.factor.factorId,
          marketBetaCorrelation: c.correlation,
        })),
      },
    };
  }
}

/**
 * Create a ResearchTriggerService with custom configuration
 */
export function createResearchTriggerService(
  deps: ResearchTriggerDependencies,
  config?: Partial<ResearchTriggerConfig>,
  marketBetaProvider?: MarketBetaProvider
): ResearchTriggerService {
  const mergedConfig: ResearchTriggerConfig = {
    ...DEFAULT_RESEARCH_TRIGGER_CONFIG,
    ...config,
  };
  return new ResearchTriggerService(deps, mergedConfig, marketBetaProvider);
}
