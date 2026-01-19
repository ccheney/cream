//! Risk limits validation (per-trade risk, risk-reward ratio).
//!
//! Provides per-trade risk validation and risk-reward ratio checks integrated
//! into the constraint validation flow.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::models::{Action, ConstraintViolation, Decision, SizeUnit, ViolationSeverity};

/// Configuration for risk limits enforcement.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskLimitsConfig {
    /// Maximum percentage of account equity at risk per trade (default: 2.0%).
    pub max_per_trade_risk_pct: f64,
    /// Minimum risk-reward ratio (default: 1.5).
    pub min_risk_reward_ratio: f64,
}

impl Default for RiskLimitsConfig {
    fn default() -> Self {
        Self {
            max_per_trade_risk_pct: 2.0,
            min_risk_reward_ratio: 1.5,
        }
    }
}

/// Result of per-trade risk validation.
#[derive(Debug, Clone)]
pub struct PerTradeRiskResult {
    /// The calculated risk amount in dollars.
    pub risk_amount: Decimal,
    /// The calculated risk as percentage of equity.
    pub risk_pct: Decimal,
    /// Whether the risk is within limits.
    pub within_limit: bool,
    /// The configured limit percentage.
    pub limit_pct: Decimal,
}

/// Calculate per-trade risk as a percentage of account equity.
///
/// Formula: Risk = Position Size * |Entry Price - Stop Loss Price| / Entry Price
/// Risk % = Risk Amount / Account Equity * 100
///
/// # Arguments
///
/// * `entry_price` - Entry price for the position
/// * `stop_loss` - Stop loss price
/// * `position_notional` - Position size in dollars
/// * `account_equity` - Total account equity
/// * `max_risk_pct` - Maximum allowed risk percentage (default: 2.0)
///
/// # Returns
///
/// `PerTradeRiskResult` with risk amount, percentage, and whether within limits.
#[must_use]
pub fn calculate_per_trade_risk(
    entry_price: Decimal,
    stop_loss: Decimal,
    position_notional: Decimal,
    account_equity: Decimal,
    max_risk_pct: Decimal,
) -> PerTradeRiskResult {
    // Guard against division by zero
    if entry_price == Decimal::ZERO || account_equity == Decimal::ZERO {
        return PerTradeRiskResult {
            risk_amount: Decimal::ZERO,
            risk_pct: Decimal::ZERO,
            within_limit: true,
            limit_pct: max_risk_pct,
        };
    }

    // Calculate risk per share as percentage of entry price
    let risk_per_share_pct = (entry_price - stop_loss).abs() / entry_price;

    // Calculate total risk amount (position value * risk percentage)
    let risk_amount = position_notional * risk_per_share_pct;

    // Calculate risk as percentage of account equity
    let risk_pct = (risk_amount / account_equity) * Decimal::new(100, 0);

    PerTradeRiskResult {
        risk_amount,
        risk_pct,
        within_limit: risk_pct <= max_risk_pct,
        limit_pct: max_risk_pct,
    }
}

/// Result of risk-reward ratio validation.
#[derive(Debug, Clone)]
pub struct RiskRewardResult {
    /// Potential profit in price terms.
    pub potential_profit: Decimal,
    /// Potential loss in price terms.
    pub potential_loss: Decimal,
    /// The calculated risk-reward ratio.
    pub ratio: Decimal,
    /// Whether the ratio meets the minimum requirement.
    pub meets_minimum: bool,
    /// The configured minimum ratio.
    pub minimum_ratio: Decimal,
}

/// Calculate and validate risk-reward ratio.
///
/// Formula: R:R = |Take Profit - Entry| / |Entry - Stop Loss|
///
/// # Arguments
///
/// * `entry_price` - Entry price for the position
/// * `stop_loss` - Stop loss price
/// * `take_profit` - Take profit target price
/// * `min_ratio` - Minimum required ratio (default: 1.5)
///
/// # Returns
///
/// `RiskRewardResult` with ratio and whether it meets the minimum.
#[must_use]
pub fn calculate_risk_reward_ratio(
    entry_price: Decimal,
    stop_loss: Decimal,
    take_profit: Decimal,
    min_ratio: Decimal,
) -> RiskRewardResult {
    let potential_profit = (take_profit - entry_price).abs();
    let potential_loss = (entry_price - stop_loss).abs();

    // Guard against division by zero
    if potential_loss == Decimal::ZERO {
        return RiskRewardResult {
            potential_profit,
            potential_loss,
            ratio: Decimal::MAX,
            meets_minimum: true,
            minimum_ratio: min_ratio,
        };
    }

    let ratio = potential_profit / potential_loss;

    RiskRewardResult {
        potential_profit,
        potential_loss,
        ratio,
        meets_minimum: ratio >= min_ratio,
        minimum_ratio: min_ratio,
    }
}

/// Validate per-trade risk for a decision.
///
/// Returns a constraint violation if risk exceeds the configured limit.
#[must_use]
pub fn validate_per_trade_risk(
    decision: &Decision,
    account_equity: Decimal,
    config: &RiskLimitsConfig,
) -> Option<ConstraintViolation> {
    // Skip validation for non-entry actions
    if !matches!(decision.action, Action::Buy | Action::Sell) {
        return None;
    }

    // Need an entry price and stop loss
    let entry_price = decision.limit_price.unwrap_or(Decimal::ZERO);
    if entry_price == Decimal::ZERO || decision.stop_loss_level == Decimal::ZERO {
        return None; // Can't calculate risk without prices
    }

    // Estimate position notional from size
    let position_notional = match decision.size.unit {
        SizeUnit::Dollars => decision.size.quantity,
        SizeUnit::PctEquity => decision.size.quantity * account_equity,
        SizeUnit::Shares | SizeUnit::Contracts => decision.size.quantity * entry_price,
    };

    let max_risk_pct =
        Decimal::try_from(config.max_per_trade_risk_pct).unwrap_or_else(|_| Decimal::new(2, 0));
    let result = calculate_per_trade_risk(
        entry_price,
        decision.stop_loss_level,
        position_notional,
        account_equity,
        max_risk_pct,
    );

    if result.within_limit {
        None
    } else {
        Some(ConstraintViolation {
            code: "PER_TRADE_RISK_EXCEEDED".to_string(),
            severity: ViolationSeverity::Error,
            message: format!(
                "Per-trade risk {:.2}% exceeds limit {:.2}% (risk amount: ${})",
                result.risk_pct,
                result.limit_pct,
                result.risk_amount.round_dp(2)
            ),
            instrument_id: decision.instrument_id.clone(),
            field_path: "decision.size".to_string(),
            observed: format!("{:.4}%", result.risk_pct),
            limit: format!("{:.2}%", result.limit_pct),
        })
    }
}

/// Validate risk-reward ratio for a decision.
///
/// Returns a constraint violation if ratio is below the minimum.
#[must_use]
pub fn validate_risk_reward_ratio(
    decision: &Decision,
    config: &RiskLimitsConfig,
) -> Option<ConstraintViolation> {
    // Skip validation for non-entry actions
    if !matches!(decision.action, Action::Buy | Action::Sell) {
        return None;
    }

    // Need entry price, stop loss, and take profit
    let entry_price = decision.limit_price.unwrap_or(Decimal::ZERO);
    if entry_price == Decimal::ZERO
        || decision.stop_loss_level == Decimal::ZERO
        || decision.take_profit_level == Decimal::ZERO
    {
        return None; // Can't calculate R:R without all prices
    }

    let min_ratio =
        Decimal::try_from(config.min_risk_reward_ratio).unwrap_or_else(|_| Decimal::new(15, 1));
    let result = calculate_risk_reward_ratio(
        entry_price,
        decision.stop_loss_level,
        decision.take_profit_level,
        min_ratio,
    );

    if result.meets_minimum {
        None
    } else {
        Some(ConstraintViolation {
            code: "INSUFFICIENT_RISK_REWARD".to_string(),
            severity: ViolationSeverity::Error,
            message: format!(
                "Risk-reward ratio {:.2}:1 is below minimum {:.2}:1 (profit: ${}, loss: ${})",
                result.ratio,
                result.minimum_ratio,
                result.potential_profit.round_dp(2),
                result.potential_loss.round_dp(2)
            ),
            instrument_id: decision.instrument_id.clone(),
            field_path: "decision.risk_levels".to_string(),
            observed: format!("{:.2}:1", result.ratio),
            limit: format!(">= {:.2}:1", result.minimum_ratio),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Direction, Size, StrategyFamily, ThesisState, TimeHorizon};

    fn make_decision(instrument_id: &str, quantity: Decimal) -> Decision {
        Decision {
            decision_id: "d1".to_string(),
            instrument_id: instrument_id.to_string(),
            action: Action::Buy,
            direction: Direction::Long,
            size: Size {
                quantity,
                unit: SizeUnit::Dollars,
            },
            stop_loss_level: Decimal::new(95, 0),
            take_profit_level: Decimal::new(110, 0),
            limit_price: Some(Decimal::new(100, 0)),
            strategy_family: StrategyFamily::EquityLong,
            time_horizon: TimeHorizon::Swing,
            thesis_state: ThesisState::Watching,
            bullish_factors: vec!["Strong momentum".to_string()],
            bearish_factors: vec![],
            rationale: "Test trade".to_string(),
            confidence: Decimal::new(75, 2),
            legs: vec![],
            net_limit_price: None,
        }
    }

    #[test]
    fn test_per_trade_risk_within_limit() {
        // Entry $100, Stop $95, Position $10,000, Equity $100,000
        // Risk per share: ($100 - $95) / $100 = 5%
        // Risk amount: $10,000 * 5% = $500
        // Risk %: $500 / $100,000 * 100 = 0.5%
        let result = calculate_per_trade_risk(
            Decimal::new(100, 0),     // entry
            Decimal::new(95, 0),      // stop
            Decimal::new(10_000, 0),  // notional
            Decimal::new(100_000, 0), // equity
            Decimal::new(2, 0),       // max 2%
        );

        assert!(result.within_limit);
        assert_eq!(result.risk_amount, Decimal::new(500, 0));
        assert!(result.risk_pct < Decimal::new(1, 0)); // 0.5% < 1%
    }

    #[test]
    fn test_per_trade_risk_exceeds_limit() {
        // Entry $100, Stop $90, Position $50,000, Equity $100,000
        // Risk per share: ($100 - $90) / $100 = 10%
        // Risk amount: $50,000 * 10% = $5,000
        // Risk %: $5,000 / $100,000 * 100 = 5%
        let result = calculate_per_trade_risk(
            Decimal::new(100, 0),
            Decimal::new(90, 0),
            Decimal::new(50_000, 0),
            Decimal::new(100_000, 0),
            Decimal::new(2, 0),
        );

        assert!(!result.within_limit);
        assert_eq!(result.risk_amount, Decimal::new(5_000, 0));
        assert_eq!(result.risk_pct, Decimal::new(5, 0)); // 5% > 2%
    }

    #[test]
    fn test_per_trade_risk_zero_entry() {
        let result = calculate_per_trade_risk(
            Decimal::ZERO,
            Decimal::new(95, 0),
            Decimal::new(10_000, 0),
            Decimal::new(100_000, 0),
            Decimal::new(2, 0),
        );

        // Should handle gracefully
        assert!(result.within_limit);
        assert_eq!(result.risk_amount, Decimal::ZERO);
    }

    #[test]
    fn test_risk_reward_ratio_meets_minimum() {
        // Entry $100, Stop $95, Take Profit $110
        // Profit: $10, Loss: $5
        // Ratio: 10/5 = 2.0 (>= 1.5)
        let result = calculate_risk_reward_ratio(
            Decimal::new(100, 0),
            Decimal::new(95, 0),
            Decimal::new(110, 0),
            Decimal::new(15, 1), // 1.5
        );

        assert!(result.meets_minimum);
        assert_eq!(result.ratio, Decimal::new(2, 0));
        assert_eq!(result.potential_profit, Decimal::new(10, 0));
        assert_eq!(result.potential_loss, Decimal::new(5, 0));
    }

    #[test]
    fn test_risk_reward_ratio_below_minimum() {
        // Entry $100, Stop $95, Take Profit $105
        // Profit: $5, Loss: $5
        // Ratio: 5/5 = 1.0 (< 1.5)
        let result = calculate_risk_reward_ratio(
            Decimal::new(100, 0),
            Decimal::new(95, 0),
            Decimal::new(105, 0),
            Decimal::new(15, 1),
        );

        assert!(!result.meets_minimum);
        assert_eq!(result.ratio, Decimal::new(1, 0));
    }

    #[test]
    fn test_risk_reward_ratio_zero_loss() {
        // Entry equals stop (no risk)
        let result = calculate_risk_reward_ratio(
            Decimal::new(100, 0),
            Decimal::new(100, 0), // Same as entry
            Decimal::new(110, 0),
            Decimal::new(15, 1),
        );

        assert!(result.meets_minimum); // Infinite ratio always passes
        assert_eq!(result.ratio, Decimal::MAX);
    }

    #[test]
    fn test_risk_limits_config_defaults() {
        let config = RiskLimitsConfig::default();
        assert!((config.max_per_trade_risk_pct - 2.0).abs() < f64::EPSILON);
        assert!((config.min_risk_reward_ratio - 1.5).abs() < f64::EPSILON);
    }

    #[test]
    fn test_validate_per_trade_risk_decision() {
        let config = RiskLimitsConfig::default();
        let mut decision = make_decision("AAPL", Decimal::new(50_000, 0));
        decision.limit_price = Some(Decimal::new(100, 0));
        decision.stop_loss_level = Decimal::new(90, 0); // 10% stop

        // 10% risk on $50k = $5k = 5% of $100k equity (exceeds 2% limit)
        let Some(v) = validate_per_trade_risk(&decision, Decimal::new(100_000, 0), &config) else {
            panic!("should detect per-trade risk violation");
        };
        assert_eq!(v.code, "PER_TRADE_RISK_EXCEEDED");
    }

    #[test]
    fn test_validate_risk_reward_ratio_decision() {
        let config = RiskLimitsConfig::default();
        let mut decision = make_decision("AAPL", Decimal::new(10_000, 0));
        decision.limit_price = Some(Decimal::new(100, 0));
        decision.stop_loss_level = Decimal::new(95, 0);
        decision.take_profit_level = Decimal::new(103, 0); // 3/5 = 0.6 ratio

        let Some(v) = validate_risk_reward_ratio(&decision, &config) else {
            panic!("should detect insufficient risk-reward ratio");
        };
        assert_eq!(v.code, "INSUFFICIENT_RISK_REWARD");
    }

    #[test]
    fn test_validate_per_trade_risk_hold_action() {
        let config = RiskLimitsConfig::default();
        let mut decision = make_decision("AAPL", Decimal::new(10_000, 0));
        decision.action = Action::Hold;

        // HOLD actions should not be validated for risk
        let violation = validate_per_trade_risk(&decision, Decimal::new(100_000, 0), &config);

        assert!(violation.is_none());
    }
}
