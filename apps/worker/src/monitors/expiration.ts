/**
 * Expiration Monitor
 *
 * Monitors option positions approaching expiration and triggers appropriate actions:
 * - Minimum DTE threshold enforcement
 * - Expiration Friday timeline scheduling (12 PM, 2 PM, 3 PM ET)
 * - Pin risk detection and avoidance
 * - Auto-close ITM positions
 * - Force close remaining positions
 *
 * Timeline (all times ET):
 * - 9:30 AM: Evaluate all expiring positions
 * - 12:00 PM: Auto-close ITM positions (unless exercise intended)
 * - 2:00 PM: Final warning for all expiring positions
 * - 3:00 PM: Force close any remaining positions
 * - 4:00 PM: Market close
 * - 5:30 PM: OCC exercise deadline
 *
 * @see docs/plans/08-options.md - Expiration Handling (lines 1161-1246)
 */

import {
  checkPinRisk,
  classifyMoneyness,
  DEFAULT_EXPIRATION_POLICY,
  EXPIRATION_CHECKPOINT_TIMES,
  type ExpirationAction,
  type ExpirationEvaluation,
  type ExpirationPolicyConfig,
  type ExpirationReason,
  type ExpiringPosition,
  getMinimumDTE,
  getPinRiskThreshold,
  isPastCheckpoint,
  type PositionTypeForDTE,
  parseETTimeToMinutes,
  shouldLetExpireWorthless,
} from "@cream/domain/schemas";
import { daysToExpiration, toDateOnly } from "@cream/domain/time";

// ============================================
// Types
// ============================================

/**
 * Position data from the portfolio.
 */
export interface PortfolioPosition {
  positionId: string;
  osiSymbol: string;
  underlyingSymbol: string;
  expirationDate: string;
  strike: number;
  right: "CALL" | "PUT";
  quantity: number;
  isSpread: boolean;
  isUncovered: boolean;
}

/**
 * Market data for underlying.
 */
export interface UnderlyingQuote {
  symbol: string;
  price: number;
  timestamp: string;
}

/**
 * Scheduled action for expiration handling.
 */
export interface ScheduledExpirationAction {
  position: ExpiringPosition;
  evaluation: ExpirationEvaluation;
  scheduledTime: string;
  executed: boolean;
}

/**
 * Monitor state.
 */
export interface ExpirationMonitorState {
  lastCheck: string | null;
  expiringPositions: ExpiringPosition[];
  scheduledActions: ScheduledExpirationAction[];
  config: ExpirationPolicyConfig;
}

// ============================================
// Position Type Classification
// ============================================

/**
 * Determine position type for DTE threshold calculation.
 *
 * @param position - Portfolio position
 * @returns Position type for DTE threshold
 */
export function classifyPositionType(position: PortfolioPosition): PositionTypeForDTE {
  const isLong = position.quantity > 0;
  const isShort = position.quantity < 0;

  if (position.isSpread) {
    // Spreads are defined-risk if properly hedged
    return "DEFINED_RISK_SPREAD";
  }

  if (isShort && position.isUncovered) {
    // Uncovered short options have highest risk
    return "SHORT_UNCOVERED";
  }

  if (isLong) {
    return "LONG_OPTION";
  }

  // Default to complex for anything else
  return "COMPLEX_STRATEGY";
}

// ============================================
// Expiring Position Builder
// ============================================

/**
 * Build expiring position from portfolio position and market data.
 *
 * @param position - Portfolio position
 * @param quote - Current underlying quote
 * @param currentTime - Current timestamp (ISO-8601)
 * @param config - Expiration policy configuration
 * @returns Expiring position or null if not expiring
 */
export function buildExpiringPosition(
  position: PortfolioPosition,
  quote: UnderlyingQuote,
  currentTime: string,
  config: ExpirationPolicyConfig = DEFAULT_EXPIRATION_POLICY
): ExpiringPosition | null {
  const dte = daysToExpiration(position.expirationDate, currentTime);

  // Not expiring if DTE is too high
  const positionType = classifyPositionType(position);
  const minDTE = getMinimumDTE(positionType, config.minimumDTE);

  // Include positions within 2x minimum DTE for early warning
  if (dte > minDTE * 2) {
    return null;
  }

  const moneyness = classifyMoneyness(quote.price, position.strike, position.right);
  const distanceFromStrike = Math.abs(quote.price - position.strike);
  const isPinRisk = checkPinRisk(quote.price, position.strike, config.pinRisk);
  const isExpirationDay = dte <= 1;

  return {
    positionId: position.positionId,
    osiSymbol: position.osiSymbol,
    underlyingSymbol: position.underlyingSymbol,
    expirationDate: position.expirationDate,
    strike: position.strike,
    right: position.right,
    quantity: position.quantity,
    underlyingPrice: quote.price,
    dte,
    positionType,
    moneyness,
    distanceFromStrike,
    isPinRisk,
    isExpirationDay,
  };
}

// ============================================
// Expiration Evaluation
// ============================================

/**
 * Evaluate what action to take for an expiring position.
 *
 * @param position - Expiring position
 * @param currentTime - Current timestamp (ISO-8601)
 * @param config - Expiration policy configuration
 * @returns Evaluation result
 */
export function evaluateExpirationAction(
  position: ExpiringPosition,
  currentTime: string,
  config: ExpirationPolicyConfig = DEFAULT_EXPIRATION_POLICY
): ExpirationEvaluation {
  const minDTE = getMinimumDTE(position.positionType, config.minimumDTE);
  const isLong = position.quantity > 0;
  const isShort = position.quantity < 0;

  // Get current ET time
  const date = new Date(currentTime);
  const etHour = date.getUTCHours() - 5; // Approximate ET
  const etMinutes = date.getUTCMinutes();
  const etTimeMinutes = (etHour < 0 ? etHour + 24 : etHour) * 60 + etMinutes;

  // Check timeline triggers on expiration day
  if (position.isExpirationDay) {
    // Force close at 3 PM
    if (isPastCheckpoint("FORCE_CLOSE", etTimeMinutes)) {
      return buildEvaluation(
        position,
        "CLOSE",
        "FORCE_CLOSE",
        10,
        `Force close triggered at ${EXPIRATION_CHECKPOINT_TIMES.FORCE_CLOSE} ET - all positions must be closed`,
        true,
        EXPIRATION_CHECKPOINT_TIMES.FORCE_CLOSE
      );
    }

    // ITM auto-close at 12 PM (or configured time)
    const autoCloseMinutes = parseETTimeToMinutes(config.autoCloseITMTime);
    if (
      etTimeMinutes >= autoCloseMinutes &&
      (position.moneyness === "ITM" || position.moneyness === "DEEP_ITM")
    ) {
      // Allow exercise if configured and long
      if (config.allowExercise && isLong) {
        return buildEvaluation(
          position,
          "EXERCISE",
          "ITM_EXPIRATION",
          8,
          `ITM ${position.right} - exercise allowed per configuration`,
          false,
          EXPIRATION_CHECKPOINT_TIMES.MARKET_CLOSE
        );
      }

      return buildEvaluation(
        position,
        "CLOSE",
        "ITM_EXPIRATION",
        9,
        `ITM ${position.right} at ${config.autoCloseITMTime} ET - auto-close to avoid exercise/assignment`,
        true,
        config.autoCloseITMTime
      );
    }

    // Pin risk detection - close if near strike
    if (position.isPinRisk && isShort) {
      const threshold = getPinRiskThreshold(position.underlyingPrice, config.pinRisk);
      return buildEvaluation(
        position,
        "CLOSE",
        "PIN_RISK",
        9,
        `Short ${position.right} within $${threshold.toFixed(2)} of strike - pin risk at expiration`,
        true,
        EXPIRATION_CHECKPOINT_TIMES.FORCE_CLOSE
      );
    }

    // Final warning at 2 PM
    if (isPastCheckpoint("FINAL_WARNING", etTimeMinutes)) {
      // If OTM and long, can let expire
      if (shouldLetExpireWorthless(position)) {
        return buildEvaluation(
          position,
          "LET_EXPIRE",
          "TIMELINE_TRIGGER",
          3,
          `Long OTM ${position.right} - letting expire worthless`,
          false
        );
      }

      // Otherwise recommend closing
      return buildEvaluation(
        position,
        "CLOSE",
        "TIMELINE_TRIGGER",
        7,
        `Final warning at ${EXPIRATION_CHECKPOINT_TIMES.FINAL_WARNING} ET - close before force close at 3 PM`,
        false,
        EXPIRATION_CHECKPOINT_TIMES.FORCE_CLOSE
      );
    }
  }

  // Check minimum DTE threshold
  if (position.dte <= minDTE) {
    // Special handling for long OTM positions
    if (shouldLetExpireWorthless(position)) {
      return buildEvaluation(
        position,
        "LET_EXPIRE",
        "MINIMUM_DTE",
        2,
        `Long OTM ${position.right} at ${position.dte.toFixed(1)} DTE - letting expire worthless`,
        false
      );
    }

    // Pin risk for shorts near expiration
    if (position.isPinRisk && isShort) {
      const threshold = getPinRiskThreshold(position.underlyingPrice, config.pinRisk);
      return buildEvaluation(
        position,
        "CLOSE",
        "PIN_RISK",
        9,
        `Short ${position.right} at ${position.dte.toFixed(1)} DTE within $${threshold.toFixed(2)} of strike - close to avoid pin risk`,
        true
      );
    }

    // Roll or close depending on position type
    if (isShort || position.positionType === "COMPLEX_STRATEGY") {
      return buildEvaluation(
        position,
        "ROLL",
        "MINIMUM_DTE",
        6,
        `${position.positionType} at ${position.dte.toFixed(1)} DTE (minimum: ${minDTE}) - recommend rolling`,
        false
      );
    }

    // ITM long positions should close to capture value
    if (position.moneyness === "ITM" || position.moneyness === "DEEP_ITM") {
      return buildEvaluation(
        position,
        "CLOSE",
        "MINIMUM_DTE",
        5,
        `Long ITM ${position.right} at ${position.dte.toFixed(1)} DTE - close to capture remaining value`,
        false
      );
    }

    // Default to close for anything else at minimum DTE
    return buildEvaluation(
      position,
      "CLOSE",
      "MINIMUM_DTE",
      4,
      `${position.positionType} at ${position.dte.toFixed(1)} DTE (minimum: ${minDTE}) - recommend closing`,
      false
    );
  }

  // Early warning - approaching minimum DTE
  if (position.dte <= minDTE * 1.5) {
    return buildEvaluation(
      position,
      "CLOSE",
      "MINIMUM_DTE",
      3,
      `${position.positionType} approaching minimum DTE (${position.dte.toFixed(1)} vs ${minDTE}) - consider closing/rolling`,
      false
    );
  }

  // No action needed
  return buildEvaluation(
    position,
    "CLOSE", // Default action
    "MINIMUM_DTE",
    1,
    `${position.positionType} at ${position.dte.toFixed(1)} DTE - monitoring`,
    false
  );
}

/**
 * Build evaluation result.
 */
function buildEvaluation(
  position: ExpiringPosition,
  action: ExpirationAction,
  reason: ExpirationReason,
  priority: number,
  explanation: string,
  isForced: boolean,
  deadline?: string
): ExpirationEvaluation {
  return {
    position,
    action,
    reason,
    priority,
    explanation,
    deadline: deadline ? `${position.expirationDate}T${deadline}:00.000Z` : undefined,
    isForced,
  };
}

// ============================================
// Monitor Class
// ============================================

/**
 * Expiration monitor for tracking and handling expiring positions.
 */
export class ExpirationMonitor {
  private state: ExpirationMonitorState;

  constructor(config: ExpirationPolicyConfig = DEFAULT_EXPIRATION_POLICY) {
    this.state = {
      lastCheck: null,
      expiringPositions: [],
      scheduledActions: [],
      config,
    };
  }

  /**
   * Get current monitor state.
   */
  getState(): ExpirationMonitorState {
    return { ...this.state };
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<ExpirationPolicyConfig>): void {
    this.state.config = { ...this.state.config, ...config };
  }

  /**
   * Check positions for expiration handling.
   *
   * @param positions - Current portfolio positions
   * @param quotes - Current market quotes by symbol
   * @param currentTime - Current timestamp (ISO-8601)
   * @returns List of evaluations for positions needing action
   */
  checkPositions(
    positions: PortfolioPosition[],
    quotes: Map<string, UnderlyingQuote>,
    currentTime: string
  ): ExpirationEvaluation[] {
    if (this.state.config.disabled) {
      return [];
    }

    this.state.lastCheck = currentTime;
    const evaluations: ExpirationEvaluation[] = [];
    const expiringPositions: ExpiringPosition[] = [];

    for (const position of positions) {
      const quote = quotes.get(position.underlyingSymbol);
      if (!quote) {
        continue;
      }

      const expiringPosition = buildExpiringPosition(
        position,
        quote,
        currentTime,
        this.state.config
      );

      if (!expiringPosition) {
        continue;
      }

      expiringPositions.push(expiringPosition);

      const evaluation = evaluateExpirationAction(expiringPosition, currentTime, this.state.config);

      // Only include positions needing action (priority > 1)
      if (evaluation.priority > 1) {
        evaluations.push(evaluation);
      }
    }

    this.state.expiringPositions = expiringPositions;

    // Sort by priority (highest first)
    return evaluations.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get positions expiring within a DTE threshold.
   *
   * @param maxDTE - Maximum DTE to include
   * @returns List of expiring positions
   */
  getExpiringWithinDTE(maxDTE: number): ExpiringPosition[] {
    return this.state.expiringPositions.filter((p) => p.dte <= maxDTE);
  }

  /**
   * Get positions in pin risk zone.
   */
  getPositionsInPinRisk(): ExpiringPosition[] {
    return this.state.expiringPositions.filter((p) => p.isPinRisk && p.isExpirationDay);
  }

  /**
   * Get forced actions (must execute).
   */
  getForcedActions(currentTime: string): ExpirationEvaluation[] {
    const evaluations: ExpirationEvaluation[] = [];

    for (const position of this.state.expiringPositions) {
      const evaluation = evaluateExpirationAction(position, currentTime, this.state.config);

      if (evaluation.isForced) {
        evaluations.push(evaluation);
      }
    }

    return evaluations.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Check if it's expiration Friday.
   *
   * @param currentTime - Current timestamp (ISO-8601)
   * @returns Whether today is expiration Friday
   */
  isExpirationFriday(currentTime: string): boolean {
    const date = new Date(currentTime);
    const dayOfWeek = date.getUTCDay();

    // Check if Friday (5)
    if (dayOfWeek !== 5) {
      return false;
    }

    // Check if any positions expire today
    const today = toDateOnly(date);
    return this.state.expiringPositions.some((p) => p.expirationDate === today);
  }

  /**
   * Get minutes until next checkpoint on expiration day.
   *
   * @param currentTime - Current timestamp (ISO-8601)
   * @returns Minutes until next checkpoint, or null if past all checkpoints
   */
  getMinutesUntilNextCheckpoint(
    currentTime: string
  ): { checkpoint: string; minutes: number } | null {
    const date = new Date(currentTime);
    const etHour = date.getUTCHours() - 5;
    const etMinutes = date.getUTCMinutes();
    const etTimeMinutes = (etHour < 0 ? etHour + 24 : etHour) * 60 + etMinutes;

    const checkpoints: Array<{ name: string; time: string }> = [
      { name: "AUTO_CLOSE_ITM", time: EXPIRATION_CHECKPOINT_TIMES.AUTO_CLOSE_ITM },
      { name: "FINAL_WARNING", time: EXPIRATION_CHECKPOINT_TIMES.FINAL_WARNING },
      { name: "FORCE_CLOSE", time: EXPIRATION_CHECKPOINT_TIMES.FORCE_CLOSE },
      { name: "MARKET_CLOSE", time: EXPIRATION_CHECKPOINT_TIMES.MARKET_CLOSE },
    ];

    for (const checkpoint of checkpoints) {
      const checkpointMinutes = parseETTimeToMinutes(checkpoint.time);
      if (etTimeMinutes < checkpointMinutes) {
        return {
          checkpoint: checkpoint.name,
          minutes: checkpointMinutes - etTimeMinutes,
        };
      }
    }

    return null;
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a new expiration monitor.
 *
 * @param config - Optional configuration override
 * @returns Expiration monitor instance
 */
export function createExpirationMonitor(
  config?: Partial<ExpirationPolicyConfig>
): ExpirationMonitor {
  const fullConfig = config
    ? { ...DEFAULT_EXPIRATION_POLICY, ...config }
    : DEFAULT_EXPIRATION_POLICY;

  return new ExpirationMonitor(fullConfig);
}
