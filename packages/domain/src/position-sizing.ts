/**
 * Position Sizing Calculators
 *
 * Implements position sizing methodologies from docs/plans/06-decision-contract.md:
 * - Fixed Fractional: Allocate fixed % of capital per trade
 * - Volatility-Targeting: Adjust based on ATR
 * - Fractional Kelly: Optimize based on win rate and payoff ratio
 *
 * All calculators enforce risk-per-trade limits and return position sizes.
 */

/** Input parameters for position sizing calculation */
export interface SizingInput {
  /** Total account equity in dollars */
  accountEquity: number;
  /** Current price of the instrument */
  price: number;
  /** Stop-loss price */
  stopLoss: number;
  /** Take-profit price (optional, for Kelly calculation) */
  takeProfit?: number;
  /** Contract multiplier (100 for options, 1 for shares) */
  multiplier?: number;
}

/** Result of position sizing calculation */
export interface SizingResult {
  /** Number of units (shares or contracts) */
  quantity: number;
  /** Dollar risk (max loss if stopped out) */
  dollarRisk: number;
  /** Risk as percentage of account */
  riskPercent: number;
  /** Notional value of position */
  notionalValue: number;
  /** Risk-reward ratio (if take profit provided) */
  riskRewardRatio?: number;
}

/** Volatility-targeting specific input */
export interface VolatilitySizingInput extends SizingInput {
  /** Average True Range (ATR) value */
  atr: number;
  /** ATR multiplier for stop distance (default: 2) */
  atrMultiplier?: number;
}

/** Kelly criterion specific input */
export interface KellySizingInput extends SizingInput {
  /** Historical win rate (0-1) */
  winRate: number;
  /** Average win amount / average loss amount */
  payoffRatio: number;
  /** Kelly fraction to use (0.25-0.5 recommended) */
  kellyFraction?: number;
}

/** Default risk limits */
export const DEFAULT_RISK_LIMITS = {
  /** Maximum risk per trade (default 2%) */
  maxRiskPerTrade: 0.02,
  /** Maximum gross exposure (default 100%) */
  maxGrossExposure: 1.0,
  /** Minimum risk-reward ratio */
  minRiskReward: 1.5,
} as const;

/**
 * Calculate position size using fixed fractional method.
 *
 * Allocates a fixed percentage of capital to risk per trade.
 * This is the most common and robust approach.
 *
 * @param input - Sizing input parameters
 * @param riskPercent - Percentage of account to risk (e.g., 0.02 for 2%)
 * @returns Position sizing result
 */
export function calculateFixedFractional(input: SizingInput, riskPercent = 0.01): SizingResult {
  validateInput(input);

  const { accountEquity, price, stopLoss, takeProfit, multiplier = 1 } = input;

  if (riskPercent <= 0 || riskPercent > DEFAULT_RISK_LIMITS.maxRiskPerTrade * 5) {
    throw new Error(`riskPercent must be between 0 and ${DEFAULT_RISK_LIMITS.maxRiskPerTrade * 5}`);
  }

  const riskPerUnit = Math.abs(price - stopLoss) * multiplier;
  if (riskPerUnit === 0) {
    throw new Error("Stop loss cannot equal entry price");
  }

  const maxDollarRisk = accountEquity * riskPercent;
  const quantity = Math.floor(maxDollarRisk / riskPerUnit);

  if (quantity <= 0) {
    return {
      quantity: 0,
      dollarRisk: 0,
      riskPercent: 0,
      notionalValue: 0,
      riskRewardRatio: takeProfit
        ? calculateRiskRewardRatio(price, stopLoss, takeProfit)
        : undefined,
    };
  }

  const actualDollarRisk = quantity * riskPerUnit;
  const notionalValue = quantity * price * multiplier;

  return {
    quantity,
    dollarRisk: actualDollarRisk,
    riskPercent: actualDollarRisk / accountEquity,
    notionalValue,
    riskRewardRatio: takeProfit ? calculateRiskRewardRatio(price, stopLoss, takeProfit) : undefined,
  };
}

/**
 * Calculate position size using volatility-targeting method.
 *
 * Adjusts position size based on instrument volatility (ATR).
 * Higher volatility = smaller position. Maintains consistent risk.
 *
 * Formula: Position Size = (Account Risk $) / (ATR * Multiplier)
 *
 * @param input - Volatility sizing input with ATR
 * @param targetRisk - Target risk percentage of account
 * @returns Position sizing result
 */
export function calculateVolatilityTargeted(
  input: VolatilitySizingInput,
  targetRisk = 0.01
): SizingResult {
  validateInput(input);

  const {
    accountEquity,
    price,
    stopLoss,
    takeProfit,
    atr,
    atrMultiplier = 2,
    multiplier = 1,
  } = input;

  if (atr <= 0) {
    throw new Error("ATR must be positive");
  }

  const atrStopDistance = atr * atrMultiplier * multiplier;
  const maxDollarRisk = accountEquity * targetRisk;
  const quantity = Math.floor(maxDollarRisk / atrStopDistance);

  if (quantity <= 0) {
    return {
      quantity: 0,
      dollarRisk: 0,
      riskPercent: 0,
      notionalValue: 0,
      riskRewardRatio: takeProfit
        ? calculateRiskRewardRatio(price, stopLoss, takeProfit)
        : undefined,
    };
  }

  const riskPerUnit = Math.abs(price - stopLoss) * multiplier;
  const actualDollarRisk = quantity * riskPerUnit;
  const notionalValue = quantity * price * multiplier;

  return {
    quantity,
    dollarRisk: actualDollarRisk,
    riskPercent: actualDollarRisk / accountEquity,
    notionalValue,
    riskRewardRatio: takeProfit ? calculateRiskRewardRatio(price, stopLoss, takeProfit) : undefined,
  };
}

/**
 * Calculate position size using fractional Kelly criterion.
 *
 * Kelly % = W - [(1-W) / R]
 * where W = win rate, R = payoff ratio (avg win / avg loss)
 *
 * CRITICAL: Use 25-50% of full Kelly to reduce volatility.
 * Full Kelly causes excessive drawdowns.
 *
 * @param input - Kelly sizing input with win rate and payoff ratio
 * @param maxRiskPercent - Maximum risk cap (default 2%)
 * @returns Position sizing result
 */
export function calculateFractionalKelly(
  input: KellySizingInput,
  maxRiskPercent = 0.02
): SizingResult {
  validateInput(input);

  const {
    accountEquity,
    price,
    stopLoss,
    takeProfit,
    winRate,
    payoffRatio,
    kellyFraction = 0.25, // Conservative default
    multiplier = 1,
  } = input;

  if (winRate < 0 || winRate > 1) {
    throw new Error("winRate must be between 0 and 1");
  }
  if (payoffRatio <= 0) {
    throw new Error("payoffRatio must be positive");
  }
  if (kellyFraction <= 0 || kellyFraction > 1) {
    throw new Error("kellyFraction must be between 0 and 1");
  }

  const fullKelly = winRate - (1 - winRate) / payoffRatio;

  if (fullKelly <= 0) {
    return {
      quantity: 0,
      dollarRisk: 0,
      riskPercent: 0,
      notionalValue: 0,
      riskRewardRatio: takeProfit
        ? calculateRiskRewardRatio(price, stopLoss, takeProfit)
        : undefined,
    };
  }

  const kellyRisk = Math.min(fullKelly * kellyFraction, maxRiskPercent);

  return calculateFixedFractional(
    { accountEquity, price, stopLoss, takeProfit, multiplier },
    kellyRisk
  );
}

/** Market condition adjustments */
export interface MarketConditions {
  /** VIX level (high volatility > 25) */
  vix?: number;
  /** Portfolio correlation (0-1) */
  portfolioCorrelation?: number;
  /** Current drawdown percentage (0-1) */
  accountDrawdown?: number;
  /** Average daily volume of instrument */
  averageDailyVolume?: number;
  /** Today's volume so far */
  currentVolume?: number;
}

/**
 * Calculate adjustment factor based on market conditions.
 *
 * Reduces position size in adverse conditions per docs spec:
 * - VIX > 25: Reduce by 25-50%
 * - High correlation > 0.7: Reduce size
 * - Drawdown > 10%: Reduce by 50%
 * - Low liquidity: Limit to 5-10% of ADV
 *
 * @param conditions - Current market conditions
 * @returns Adjustment multiplier (0-1)
 */
export function calculateAdaptiveAdjustment(conditions: MarketConditions): number {
  let adjustment = 1.0;

  // VIX adjustment
  if (conditions.vix !== undefined && conditions.vix > 25) {
    // Linear reduction from 1.0 at VIX 25 to 0.5 at VIX 40+
    const vixFactor = Math.max(0.5, 1.0 - (conditions.vix - 25) / 30);
    adjustment *= vixFactor;
  }

  if (conditions.portfolioCorrelation !== undefined && conditions.portfolioCorrelation > 0.7) {
    const corrFactor = Math.max(0.5, 1.0 - (conditions.portfolioCorrelation - 0.7) / 0.6);
    adjustment *= corrFactor;
  }

  if (conditions.accountDrawdown !== undefined && conditions.accountDrawdown > 0.1) {
    // 50% reduction during drawdowns > 10%
    adjustment *= 0.5;
  }

  return adjustment;
}

/**
 * Calculate liquidity-adjusted maximum position size.
 *
 * Limits position to 5-10% of average daily volume.
 *
 * @param averageDailyVolume - Average daily volume
 * @param maxParticipation - Maximum participation rate (default 0.05 = 5%)
 * @returns Maximum units that can be traded
 */
export function calculateLiquidityLimit(
  averageDailyVolume: number,
  maxParticipation = 0.05
): number {
  if (averageDailyVolume <= 0) {
    throw new Error("averageDailyVolume must be positive");
  }
  if (maxParticipation <= 0 || maxParticipation > 1) {
    throw new Error("maxParticipation must be between 0 and 1");
  }
  return Math.floor(averageDailyVolume * maxParticipation);
}

/** Options-specific sizing input */
export interface OptionsSizingInput extends SizingInput {
  /** Option delta (0-1 for calls, -1-0 for puts) */
  delta: number;
  /** Underlying price (required for delta-adjusted sizing) */
  underlyingPrice: number;
  /** Implied volatility */
  impliedVolatility?: number;
  /** Days to expiration */
  dte?: number;
}

/**
 * Calculate delta-adjusted position size for options.
 *
 * Uses delta-adjusted exposure for risk management:
 * Delta-Adjusted = Notional × Delta
 *
 * @param input - Options sizing input with delta
 * @param targetDeltaExposure - Target delta-adjusted exposure in dollars
 * @returns Position sizing result
 */
export function calculateDeltaAdjustedSize(
  input: OptionsSizingInput,
  targetDeltaExposure: number
): SizingResult {
  validateInput(input);

  const {
    accountEquity,
    price,
    stopLoss,
    takeProfit,
    delta,
    underlyingPrice,
    multiplier = 100,
  } = input;

  if (Math.abs(delta) > 1) {
    throw new Error("delta must be between -1 and 1");
  }
  if (targetDeltaExposure <= 0) {
    throw new Error("targetDeltaExposure must be positive");
  }
  if (underlyingPrice <= 0) {
    throw new Error("underlyingPrice must be positive");
  }

  const deltaPerContract = Math.abs(delta) * multiplier * underlyingPrice;

  const contracts = Math.floor(targetDeltaExposure / deltaPerContract);

  if (contracts <= 0) {
    return {
      quantity: 0,
      dollarRisk: 0,
      riskPercent: 0,
      notionalValue: 0,
      riskRewardRatio: takeProfit
        ? calculateRiskRewardRatio(price, stopLoss, takeProfit)
        : undefined,
    };
  }

  const premiumRisk = contracts * price * multiplier;
  const notionalValue = contracts * underlyingPrice * multiplier;

  return {
    quantity: contracts,
    dollarRisk: premiumRisk,
    riskPercent: premiumRisk / accountEquity,
    notionalValue,
    riskRewardRatio: takeProfit ? calculateRiskRewardRatio(price, stopLoss, takeProfit) : undefined,
  };
}

/**
 * Validate common input parameters.
 */
function validateInput(input: SizingInput): void {
  if (input.accountEquity <= 0) {
    throw new Error("accountEquity must be positive");
  }
  if (input.price <= 0) {
    throw new Error("price must be positive");
  }
  if (input.stopLoss <= 0) {
    throw new Error("stopLoss must be positive");
  }
  if (input.multiplier !== undefined && input.multiplier <= 0) {
    throw new Error("multiplier must be positive");
  }
}

/**
 * Calculate risk-reward ratio.
 */
function calculateRiskRewardRatio(entry: number, stopLoss: number, takeProfit: number): number {
  const risk = Math.abs(entry - stopLoss);
  const reward = Math.abs(takeProfit - entry);
  return risk > 0 ? reward / risk : 0;
}
