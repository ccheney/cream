//! Portfolio-level constraint validation.
//!
//! Validates portfolio-wide exposure limits:
//! - Gross notional exposure
//! - Net notional exposure (long - short)
//! - Gross/net percentage of equity

use rust_decimal::Decimal;

use crate::models::{
    Action, ConstraintCheckRequest, ConstraintViolation, Decision, Direction, ExposureLimits,
    SizeUnit, ViolationSeverity,
};

/// Calculate notional value for a decision.
pub fn calculate_notional(decision: &Decision, account_equity: &Decimal) -> Decimal {
    match decision.size.unit {
        SizeUnit::Dollars => decision.size.quantity,
        SizeUnit::PctEquity => decision.size.quantity * account_equity,
        SizeUnit::Shares | SizeUnit::Contracts => {
            // For shares/contracts, we'd need current price
            // For now, use a placeholder - in production this would
            // come from the market snapshot
            decision.size.quantity * Decimal::new(100, 0) // Assume $100/share
        }
    }
}

/// Calculate signed notional for a decision (positive for long, negative for short).
pub fn calculate_signed_notional(decision: &Decision, account_equity: &Decimal) -> Decimal {
    let notional = calculate_notional(decision, account_equity);
    match decision.direction {
        Direction::Long => notional,
        Direction::Short => -notional,
        Direction::Flat => Decimal::ZERO,
    }
}

/// Calculate portfolio exposure (gross and net).
///
/// Returns (`gross_notional`, `net_notional`) where:
/// - gross = sum of absolute notional values
/// - net = sum of signed notional values (long positive, short negative)
pub fn calculate_portfolio_exposure(request: &ConstraintCheckRequest) -> (Decimal, Decimal) {
    let mut gross = Decimal::ZERO;
    let mut net = Decimal::ZERO;

    for decision in &request.plan.decisions {
        if matches!(decision.action, Action::Hold | Action::NoTrade) {
            continue;
        }

        let notional = calculate_notional(decision, &request.account_equity);
        let signed = calculate_signed_notional(decision, &request.account_equity);

        gross += notional.abs();
        net += signed;
    }

    (gross, net)
}

/// Check gross notional limit.
pub fn check_gross_notional_limit(
    total_gross: Decimal,
    limits: &ExposureLimits,
) -> Option<ConstraintViolation> {
    if total_gross > limits.portfolio.max_gross_notional {
        Some(ConstraintViolation {
            code: "PORTFOLIO_GROSS_NOTIONAL_EXCEEDED".to_string(),
            severity: ViolationSeverity::Error,
            message: format!(
                "Portfolio gross notional ${total_gross} exceeds limit ${}",
                limits.portfolio.max_gross_notional
            ),
            instrument_id: String::new(),
            field_path: "plan.decisions".to_string(),
            observed: total_gross.to_string(),
            limit: limits.portfolio.max_gross_notional.to_string(),
        })
    } else {
        None
    }
}

/// Check net notional limit.
pub fn check_net_notional_limit(
    total_net: Decimal,
    limits: &ExposureLimits,
) -> Option<ConstraintViolation> {
    if total_net.abs() > limits.portfolio.max_net_notional {
        Some(ConstraintViolation {
            code: "PORTFOLIO_NET_NOTIONAL_EXCEEDED".to_string(),
            severity: ViolationSeverity::Error,
            message: format!(
                "Portfolio net notional ${} exceeds limit ${}",
                total_net.abs(),
                limits.portfolio.max_net_notional
            ),
            instrument_id: String::new(),
            field_path: "plan.decisions".to_string(),
            observed: total_net.to_string(),
            limit: format!("±{}", limits.portfolio.max_net_notional),
        })
    } else {
        None
    }
}

/// Check portfolio equity percentage limits (gross and net).
pub fn check_equity_percentage_limits(
    total_gross: Decimal,
    total_net: Decimal,
    account_equity: Decimal,
    limits: &ExposureLimits,
) -> Vec<ConstraintViolation> {
    let mut violations = Vec::new();

    if account_equity > Decimal::ZERO {
        let gross_pct = total_gross / account_equity;
        let net_pct = total_net.abs() / account_equity;

        if gross_pct > limits.portfolio.max_pct_equity_gross {
            violations.push(ConstraintViolation {
                code: "PORTFOLIO_GROSS_PCT_EXCEEDED".to_string(),
                severity: ViolationSeverity::Error,
                message: format!(
                    "Portfolio gross exposure {:.1}% exceeds limit {:.1}%",
                    gross_pct * Decimal::new(100, 0),
                    limits.portfolio.max_pct_equity_gross * Decimal::new(100, 0)
                ),
                instrument_id: String::new(),
                field_path: "plan.decisions".to_string(),
                observed: format!("{gross_pct:.4}"),
                limit: limits.portfolio.max_pct_equity_gross.to_string(),
            });
        }

        if net_pct > limits.portfolio.max_pct_equity_net {
            let net_pct_display = net_pct * Decimal::new(100, 0);
            let limit_display = limits.portfolio.max_pct_equity_net * Decimal::new(100, 0);
            violations.push(ConstraintViolation {
                code: "PORTFOLIO_NET_PCT_EXCEEDED".to_string(),
                severity: ViolationSeverity::Error,
                message: format!(
                    "Portfolio net exposure {net_pct_display:.1}% exceeds limit {limit_display:.1}%"
                ),
                instrument_id: String::new(),
                field_path: "plan.decisions".to_string(),
                observed: format!("{net_pct:.4}"),
                limit: limits.portfolio.max_pct_equity_net.to_string(),
            });
        }
    }

    violations
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;
    use crate::models::{
        DecisionPlan, ExposureLimits, OptionsLimits, PerInstrumentLimits, PortfolioLimits, Size,
        SizingLimits, StrategyFamily, TimeHorizon,
    };

    fn make_decision(instrument_id: &str, quantity: Decimal, direction: Direction) -> Decision {
        Decision {
            decision_id: "d1".to_string(),
            instrument_id: instrument_id.to_string(),
            action: Action::Buy,
            direction,
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

    fn default_limits() -> ExposureLimits {
        ExposureLimits {
            per_instrument: PerInstrumentLimits::default(),
            portfolio: PortfolioLimits {
                max_gross_notional: Decimal::new(500_000, 0),
                max_net_notional: Decimal::new(250_000, 0),
                max_pct_equity_gross: Decimal::new(200, 2),
                max_pct_equity_net: Decimal::ONE,
            },
            options: OptionsLimits::default(),
            sizing: SizingLimits::default(),
        }
    }

    #[test]
    fn test_calculate_notional_dollars() {
        let decision = make_decision("AAPL", Decimal::new(10_000, 0), Direction::Long);
        let notional = calculate_notional(&decision, &Decimal::new(100_000, 0));
        assert_eq!(notional, Decimal::new(10_000, 0));
    }

    #[test]
    fn test_calculate_notional_pct_equity() {
        let mut decision = make_decision("AAPL", Decimal::new(10, 2), Direction::Long);
        decision.size.unit = SizeUnit::PctEquity;
        let notional = calculate_notional(&decision, &Decimal::new(100_000, 0));
        assert_eq!(notional, Decimal::new(10_000, 0));
    }

    #[test]
    fn test_calculate_signed_notional_long() {
        let decision = make_decision("AAPL", Decimal::new(10_000, 0), Direction::Long);
        let signed = calculate_signed_notional(&decision, &Decimal::new(100_000, 0));
        assert_eq!(signed, Decimal::new(10_000, 0));
    }

    #[test]
    fn test_calculate_signed_notional_short() {
        let decision = make_decision("AAPL", Decimal::new(10_000, 0), Direction::Short);
        let signed = calculate_signed_notional(&decision, &Decimal::new(100_000, 0));
        assert_eq!(signed, Decimal::new(-10_000, 0));
    }

    #[test]
    fn test_calculate_portfolio_exposure_balanced() {
        let long = make_decision("AAPL", Decimal::new(8_000, 0), Direction::Long);
        let short = make_decision("MSFT", Decimal::new(8_000, 0), Direction::Short);

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100_000, 0),
            plan: make_plan(vec![long, short]),
        };

        let (gross, net) = calculate_portfolio_exposure(&request);
        assert_eq!(gross, Decimal::new(16_000, 0));
        assert_eq!(net, Decimal::ZERO);
    }

    #[test]
    fn test_gross_notional_within_limit() {
        let limits = default_limits();
        let result = check_gross_notional_limit(Decimal::new(100_000, 0), &limits);
        assert!(result.is_none());
    }

    #[test]
    fn test_gross_notional_exceeded() {
        let limits = default_limits();
        let result = check_gross_notional_limit(Decimal::new(600_000, 0), &limits);
        assert!(result.is_some());
        assert_eq!(result.unwrap().code, "PORTFOLIO_GROSS_NOTIONAL_EXCEEDED");
    }

    #[test]
    fn test_net_notional_within_limit() {
        let limits = default_limits();
        let result = check_net_notional_limit(Decimal::new(100_000, 0), &limits);
        assert!(result.is_none());
    }

    #[test]
    fn test_net_notional_exceeded() {
        let limits = default_limits();
        let result = check_net_notional_limit(Decimal::new(300_000, 0), &limits);
        assert!(result.is_some());
        assert_eq!(result.unwrap().code, "PORTFOLIO_NET_NOTIONAL_EXCEEDED");
    }

    #[test]
    fn test_equity_percentages_within_limits() {
        let limits = default_limits();
        let violations = check_equity_percentage_limits(
            Decimal::new(100_000, 0),
            Decimal::new(50_000, 0),
            Decimal::new(100_000, 0),
            &limits,
        );
        assert!(violations.is_empty());
    }

    #[test]
    fn test_gross_equity_percentage_exceeded() {
        let limits = default_limits();
        let violations = check_equity_percentage_limits(
            Decimal::new(250_000, 0), // 250% of equity
            Decimal::new(50_000, 0),
            Decimal::new(100_000, 0),
            &limits,
        );
        assert!(
            violations
                .iter()
                .any(|v| v.code == "PORTFOLIO_GROSS_PCT_EXCEEDED")
        );
    }

    #[test]
    fn test_net_equity_percentage_exceeded() {
        let limits = default_limits();
        let violations = check_equity_percentage_limits(
            Decimal::new(100_000, 0),
            Decimal::new(150_000, 0), // 150% of equity
            Decimal::new(100_000, 0),
            &limits,
        );
        assert!(
            violations
                .iter()
                .any(|v| v.code == "PORTFOLIO_NET_PCT_EXCEEDED")
        );
    }
}
