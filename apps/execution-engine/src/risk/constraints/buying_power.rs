//! Buying power / margin constraint validation.
//!
//! Validates that orders do not exceed available buying power
//! based on margin requirements.

use rust_decimal::Decimal;

use crate::models::{ConstraintCheckRequest, ConstraintViolation, ViolationSeverity};

use super::portfolio::calculate_portfolio_exposure;
use super::types::ExtendedConstraintContext;

/// Check buying power / margin requirements.
///
/// Uses a simplified 50% margin requirement (Reg T) for equities.
/// In production, margin calculations would be more sophisticated.
pub fn check_buying_power(
    request: &ConstraintCheckRequest,
    context: &ExtendedConstraintContext,
) -> Option<ConstraintViolation> {
    let (total_gross, _) = calculate_portfolio_exposure(request);

    // Simple margin requirement: 50% of gross for equities (Reg T)
    let estimated_margin = total_gross * Decimal::new(50, 2); // 0.50

    let total_required = context.buying_power.required_margin + estimated_margin;

    if total_required > context.buying_power.available {
        Some(ConstraintViolation {
            code: "INSUFFICIENT_BUYING_POWER".to_string(),
            severity: ViolationSeverity::Error,
            message: format!(
                "Required margin ${total_required} exceeds available buying power ${}",
                context.buying_power.available
            ),
            instrument_id: String::new(),
            field_path: "plan.decisions".to_string(),
            observed: total_required.to_string(),
            limit: context.buying_power.available.to_string(),
        })
    } else {
        None
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;
    use crate::models::{
        Action, Decision, DecisionPlan, Direction, Size, SizeUnit, StrategyFamily, TimeHorizon,
    };
    use crate::risk::constraints::types::BuyingPowerInfo;

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
            strategy_family: StrategyFamily::Momentum,
            time_horizon: TimeHorizon::Swing,
            bullish_factors: vec!["Strong momentum".to_string()],
            bearish_factors: vec![],
            rationale: "Test trade".to_string(),
            confidence: Decimal::new(75, 2),
        }
    }

    fn make_plan(decisions: Vec<Decision>) -> DecisionPlan {
        DecisionPlan {
            plan_id: "p1".to_string(),
            cycle_id: "c1".to_string(),
            timestamp: "2026-01-04T12:00:00Z".to_string(),
            decisions,
            risk_manager_approved: true,
            critic_approved: true,
            plan_rationale: "Test plan".to_string(),
        }
    }

    #[test]
    fn test_sufficient_buying_power() {
        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100_000, 0),
            plan: make_plan(vec![make_decision("AAPL", Decimal::new(10_000, 0))]),
        };

        let context = ExtendedConstraintContext {
            buying_power: BuyingPowerInfo {
                available: Decimal::new(50_000, 0),
                required_margin: Decimal::ZERO,
            },
            ..Default::default()
        };

        let result = check_buying_power(&request, &context);
        assert!(result.is_none());
    }

    #[test]
    fn test_insufficient_buying_power() {
        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100_000, 0),
            plan: make_plan(vec![make_decision("AAPL", Decimal::new(40_000, 0))]),
        };

        let context = ExtendedConstraintContext {
            buying_power: BuyingPowerInfo {
                available: Decimal::new(10_000, 0),
                required_margin: Decimal::ZERO,
            },
            ..Default::default()
        };

        let result = check_buying_power(&request, &context);
        assert!(result.is_some());
        assert_eq!(result.unwrap().code, "INSUFFICIENT_BUYING_POWER");
    }

    #[test]
    fn test_buying_power_with_existing_margin() {
        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100_000, 0),
            plan: make_plan(vec![make_decision("AAPL", Decimal::new(10_000, 0))]),
        };

        let context = ExtendedConstraintContext {
            buying_power: BuyingPowerInfo {
                available: Decimal::new(10_000, 0),
                required_margin: Decimal::new(8_000, 0), // Already using 8k
            },
            ..Default::default()
        };

        // New order needs 5k margin (50% of 10k), plus existing 8k = 13k > 10k available
        let result = check_buying_power(&request, &context);
        assert!(result.is_some());
        assert_eq!(result.unwrap().code, "INSUFFICIENT_BUYING_POWER");
    }
}
