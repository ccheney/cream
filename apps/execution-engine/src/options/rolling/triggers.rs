//! Roll trigger evaluation logic.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::config::RollConfig;
use crate::options::AssignmentRiskLevel;

/// Reason for rolling a position.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RollReason {
    /// DTE is too low for credit positions.
    CreditDteThreshold,
    /// DTE is critically low for any position.
    UrgentDte,
    /// Position is profitable and DTE is low.
    ProfitableEarlyRoll,
    /// Profit target reached.
    ProfitTarget,
    /// Loss threshold exceeded.
    LossThreshold,
    /// High assignment risk.
    AssignmentRisk,
    /// Earnings or dividend approaching.
    EventRisk,
}

/// Result of checking if a position should be rolled.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RollTriggerResult {
    /// Whether a roll is triggered.
    pub should_roll: bool,
    /// Reason for the roll (if triggered).
    pub reason: Option<RollReason>,
    /// Urgency level (0 = low, 10 = critical).
    pub urgency: u8,
    /// Additional context.
    pub context: String,
}

/// Position state for roll evaluation.
#[allow(clippy::struct_excessive_bools)]
#[derive(Debug, Clone)]
pub struct PositionForRoll {
    /// Position ID.
    pub position_id: String,
    /// Days to expiration.
    pub dte: u32,
    /// Whether this is a credit position.
    pub is_credit: bool,
    /// Credit received (for credit positions).
    pub credit_received: Decimal,
    /// Current position value.
    pub current_value: Decimal,
    /// Maximum profit possible.
    pub max_profit: Decimal,
    /// Whether any leg is in-the-money.
    pub has_itm_leg: bool,
    /// Current assignment risk.
    pub assignment_risk: AssignmentRiskLevel,
    /// Whether earnings are approaching.
    pub earnings_approaching: bool,
    /// Whether ex-dividend date is approaching.
    pub dividend_approaching: bool,
}

/// Check if a position should be rolled.
#[must_use]
pub fn check_roll_trigger(position: &PositionForRoll, config: &RollConfig) -> RollTriggerResult {
    if let Some(result) = check_assignment_risk(position) {
        return result;
    }

    if let Some(result) = check_event_risk(position) {
        return result;
    }

    if let Some(result) = check_urgent_dte(position, config) {
        return result;
    }

    if position.is_credit
        && let Some(result) = check_credit_position_triggers(position, config)
    {
        return result;
    }

    RollTriggerResult {
        should_roll: false,
        reason: None,
        urgency: 0,
        context: "No roll trigger met".to_string(),
    }
}

fn check_assignment_risk(position: &PositionForRoll) -> Option<RollTriggerResult> {
    if position.assignment_risk == AssignmentRiskLevel::Critical {
        return Some(RollTriggerResult {
            should_roll: true,
            reason: Some(RollReason::AssignmentRisk),
            urgency: 10,
            context: "Critical assignment risk detected".to_string(),
        });
    }
    None
}

fn check_event_risk(position: &PositionForRoll) -> Option<RollTriggerResult> {
    if position.earnings_approaching || position.dividend_approaching {
        let event = if position.earnings_approaching {
            "earnings"
        } else {
            "ex-dividend date"
        };
        return Some(RollTriggerResult {
            should_roll: true,
            reason: Some(RollReason::EventRisk),
            urgency: 8,
            context: format!("Upcoming {event} may affect position"),
        });
    }
    None
}

fn check_urgent_dte(position: &PositionForRoll, config: &RollConfig) -> Option<RollTriggerResult> {
    if position.dte <= config.urgent_dte_trigger {
        return Some(RollTriggerResult {
            should_roll: true,
            reason: Some(RollReason::UrgentDte),
            urgency: 9,
            context: format!(
                "DTE ({}) is at or below urgent threshold ({})",
                position.dte, config.urgent_dte_trigger
            ),
        });
    }
    None
}

fn check_credit_position_triggers(
    position: &PositionForRoll,
    config: &RollConfig,
) -> Option<RollTriggerResult> {
    if let Some(result) = check_credit_dte_threshold(position, config) {
        return Some(result);
    }

    let current_profit = position.credit_received - position.current_value;

    if let Some(result) = check_profit_target(position, config, current_profit) {
        return Some(result);
    }

    if let Some(result) = check_loss_threshold(position, config) {
        return Some(result);
    }

    check_profitable_early_roll(position, config, current_profit)
}

fn check_credit_dte_threshold(
    position: &PositionForRoll,
    config: &RollConfig,
) -> Option<RollTriggerResult> {
    if position.dte <= config.credit_dte_trigger {
        return Some(RollTriggerResult {
            should_roll: true,
            reason: Some(RollReason::CreditDteThreshold),
            urgency: 7,
            context: format!(
                "Credit position DTE ({}) at threshold ({})",
                position.dte, config.credit_dte_trigger
            ),
        });
    }
    None
}

fn check_profit_target(
    position: &PositionForRoll,
    config: &RollConfig,
    current_profit: Decimal,
) -> Option<RollTriggerResult> {
    let profit_pct = if position.max_profit > Decimal::ZERO {
        current_profit / position.max_profit
    } else {
        Decimal::ZERO
    };

    if profit_pct >= config.profit_target_pct {
        return Some(RollTriggerResult {
            should_roll: true,
            reason: Some(RollReason::ProfitTarget),
            urgency: 5,
            context: format!(
                "Profit target reached ({:.1}% of max)",
                profit_pct * Decimal::new(100, 0)
            ),
        });
    }
    None
}

fn check_loss_threshold(
    position: &PositionForRoll,
    config: &RollConfig,
) -> Option<RollTriggerResult> {
    let current_loss = position.current_value - position.credit_received;
    if current_loss > Decimal::ZERO {
        let loss_multiple = current_loss / position.credit_received;
        if loss_multiple >= config.loss_trigger_multiple {
            return Some(RollTriggerResult {
                should_roll: true,
                reason: Some(RollReason::LossThreshold),
                urgency: 8,
                context: format!("Loss threshold exceeded ({loss_multiple:.1}x credit)"),
            });
        }
    }
    None
}

fn check_profitable_early_roll(
    position: &PositionForRoll,
    config: &RollConfig,
    current_profit: Decimal,
) -> Option<RollTriggerResult> {
    if position.dte <= config.profitable_dte_trigger && current_profit > Decimal::ZERO {
        return Some(RollTriggerResult {
            should_roll: true,
            reason: Some(RollReason::ProfitableEarlyRoll),
            urgency: 4,
            context: format!(
                "Profitable position with DTE {} <= {}",
                position.dte, config.profitable_dte_trigger
            ),
        });
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_position(dte: u32, is_credit: bool, profit_pct: i64) -> PositionForRoll {
        let credit = Decimal::new(200, 0);
        let current_value = if profit_pct >= 0 {
            credit - (credit * Decimal::new(profit_pct, 2))
        } else {
            credit + (credit * Decimal::new(-profit_pct, 2))
        };

        PositionForRoll {
            position_id: "pos-1".to_string(),
            dte,
            is_credit,
            credit_received: credit,
            current_value,
            max_profit: credit,
            has_itm_leg: false,
            assignment_risk: AssignmentRiskLevel::Low,
            earnings_approaching: false,
            dividend_approaching: false,
        }
    }

    #[test]
    fn test_urgent_dte_trigger() {
        let config = RollConfig::default();
        let position = make_position(2, true, 0);

        let result = check_roll_trigger(&position, &config);
        assert!(result.should_roll);
        assert_eq!(result.reason, Some(RollReason::UrgentDte));
        assert!(result.urgency >= 9);
    }

    #[test]
    fn test_credit_dte_trigger() {
        let config = RollConfig::default();
        let position = make_position(5, true, 0);

        let result = check_roll_trigger(&position, &config);
        assert!(result.should_roll);
        assert_eq!(result.reason, Some(RollReason::CreditDteThreshold));
    }

    #[test]
    fn test_profit_target_trigger() {
        let config = RollConfig::default();
        let position = make_position(30, true, 55); // 55% profit

        let result = check_roll_trigger(&position, &config);
        assert!(result.should_roll);
        assert_eq!(result.reason, Some(RollReason::ProfitTarget));
    }

    #[test]
    fn test_loss_threshold_trigger() {
        let config = RollConfig::default();
        let position = make_position(30, true, -210); // 210% loss (> 2x credit)

        let result = check_roll_trigger(&position, &config);
        assert!(result.should_roll);
        assert_eq!(result.reason, Some(RollReason::LossThreshold));
    }

    #[test]
    fn test_no_trigger() {
        let config = RollConfig::default();
        let position = make_position(30, true, 20); // 20% profit, DTE 30

        let result = check_roll_trigger(&position, &config);
        assert!(!result.should_roll);
        assert!(result.reason.is_none());
    }

    #[test]
    fn test_assignment_risk_trigger() {
        let config = RollConfig::default();
        let mut position = make_position(30, true, 0);
        position.assignment_risk = AssignmentRiskLevel::Critical;

        let result = check_roll_trigger(&position, &config);
        assert!(result.should_roll);
        assert_eq!(result.reason, Some(RollReason::AssignmentRisk));
        assert_eq!(result.urgency, 10);
    }

    #[test]
    fn test_event_risk_trigger() {
        let config = RollConfig::default();
        let mut position = make_position(30, true, 0);
        position.earnings_approaching = true;

        let result = check_roll_trigger(&position, &config);
        assert!(result.should_roll);
        assert_eq!(result.reason, Some(RollReason::EventRisk));
    }
}
