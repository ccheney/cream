//! Constraint validation logic.

use rust_decimal::Decimal;

use crate::models::{
    Action, ConstraintCheckRequest, ConstraintCheckResponse, ConstraintViolation,
    ExposureLimits, SizeUnit, ViolationSeverity,
};

/// Validates decision plans against risk constraints.
#[derive(Debug, Clone)]
pub struct ConstraintValidator {
    limits: ExposureLimits,
}

impl ConstraintValidator {
    /// Create a new validator with the given limits.
    #[must_use]
    pub const fn new(limits: ExposureLimits) -> Self {
        Self { limits }
    }

    /// Create a validator with default limits.
    #[must_use]
    pub fn with_defaults() -> Self {
        Self::new(ExposureLimits::default())
    }

    /// Validate a decision plan against constraints.
    ///
    /// Returns a response indicating whether validation passed and any violations.
    #[must_use]
    pub fn validate(&self, request: &ConstraintCheckRequest) -> ConstraintCheckResponse {
        let mut violations = Vec::new();

        // Check each decision
        for (idx, decision) in request.plan.decisions.iter().enumerate() {
            // Skip non-trading decisions
            if matches!(decision.action, Action::Hold | Action::NoTrade) {
                continue;
            }

            // Calculate notional value for the decision
            let notional = self.calculate_notional(decision, &request.account_equity);

            // Check per-instrument notional limit
            if notional > self.limits.per_instrument.max_notional {
                violations.push(ConstraintViolation {
                    code: "PER_INSTRUMENT_NOTIONAL_EXCEEDED".to_string(),
                    severity: ViolationSeverity::Error,
                    message: format!(
                        "Notional ${notional} exceeds per-instrument limit ${}",
                        self.limits.per_instrument.max_notional
                    ),
                    instrument_id: decision.instrument_id.clone(),
                    field_path: format!("decisions[{idx}].size"),
                    observed: notional.to_string(),
                    limit: self.limits.per_instrument.max_notional.to_string(),
                });
            }

            // Check per-instrument equity percentage
            if request.account_equity > Decimal::ZERO {
                let pct_equity = notional / request.account_equity;
                if pct_equity > self.limits.per_instrument.max_pct_equity {
                    violations.push(ConstraintViolation {
                        code: "PER_INSTRUMENT_PCT_EQUITY_EXCEEDED".to_string(),
                        severity: ViolationSeverity::Error,
                        message: format!(
                            "Position {:.1}% of equity exceeds limit {:.1}%",
                            pct_equity * Decimal::new(100, 0),
                            self.limits.per_instrument.max_pct_equity * Decimal::new(100, 0)
                        ),
                        instrument_id: decision.instrument_id.clone(),
                        field_path: format!("decisions[{idx}].size"),
                        observed: format!("{:.4}", pct_equity),
                        limit: self.limits.per_instrument.max_pct_equity.to_string(),
                    });
                }
            }

            // Check stop loss is set for entries
            if matches!(decision.action, Action::Buy | Action::Sell)
                && decision.stop_loss_level == Decimal::ZERO
            {
                violations.push(ConstraintViolation {
                    code: "MISSING_STOP_LOSS".to_string(),
                    severity: ViolationSeverity::Error,
                    message: "Stop loss level is required for new positions".to_string(),
                    instrument_id: decision.instrument_id.clone(),
                    field_path: format!("decisions[{idx}].stop_loss_level"),
                    observed: "0".to_string(),
                    limit: "must be set".to_string(),
                });
            }

            // Check confidence is valid (0 to 1)
            if decision.confidence < Decimal::ZERO || decision.confidence > Decimal::ONE {
                violations.push(ConstraintViolation {
                    code: "INVALID_CONFIDENCE".to_string(),
                    severity: ViolationSeverity::Error,
                    message: "Confidence must be between 0 and 1".to_string(),
                    instrument_id: decision.instrument_id.clone(),
                    field_path: format!("decisions[{idx}].confidence"),
                    observed: decision.confidence.to_string(),
                    limit: "0.0 to 1.0".to_string(),
                });
            }
        }

        // Calculate portfolio-level metrics
        let total_gross_notional = self.calculate_gross_notional(request);

        if total_gross_notional > self.limits.portfolio.max_gross_notional {
            violations.push(ConstraintViolation {
                code: "PORTFOLIO_GROSS_NOTIONAL_EXCEEDED".to_string(),
                severity: ViolationSeverity::Error,
                message: format!(
                    "Portfolio gross notional ${total_gross_notional} exceeds limit ${}",
                    self.limits.portfolio.max_gross_notional
                ),
                instrument_id: String::new(),
                field_path: "plan.decisions".to_string(),
                observed: total_gross_notional.to_string(),
                limit: self.limits.portfolio.max_gross_notional.to_string(),
            });
        }

        // Check plan approval status
        if !request.plan.is_approved() {
            violations.push(ConstraintViolation {
                code: "PLAN_NOT_APPROVED".to_string(),
                severity: ViolationSeverity::Error,
                message: "Plan requires both Risk Manager and Critic approval".to_string(),
                instrument_id: String::new(),
                field_path: "plan".to_string(),
                observed: format!(
                    "risk_manager={}, critic={}",
                    request.plan.risk_manager_approved, request.plan.critic_approved
                ),
                limit: "both must be true".to_string(),
            });
        }

        if violations.is_empty() {
            ConstraintCheckResponse::success()
        } else {
            ConstraintCheckResponse::failure(violations)
        }
    }

    /// Calculate notional value for a decision.
    fn calculate_notional(
        &self,
        decision: &crate::models::Decision,
        account_equity: &Decimal,
    ) -> Decimal {
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

    /// Calculate total gross notional across all decisions.
    fn calculate_gross_notional(&self, request: &ConstraintCheckRequest) -> Decimal {
        request
            .plan
            .decisions
            .iter()
            .filter(|d| !matches!(d.action, Action::Hold | Action::NoTrade))
            .map(|d| self.calculate_notional(d, &request.account_equity).abs())
            .sum()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{
        Action, Decision, DecisionPlan, Direction, Size, SizeUnit, StrategyFamily, TimeHorizon,
    };

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
            confidence: Decimal::new(75, 2), // 0.75
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
    fn test_valid_plan_passes() {
        let validator = ConstraintValidator::with_defaults();
        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100000, 0),
            plan: make_plan(vec![make_decision("AAPL", Decimal::new(10000, 0))]),
        };

        let response = validator.validate(&request);
        assert!(response.ok);
        assert!(response.violations.is_empty());
    }

    #[test]
    fn test_notional_exceeded() {
        let validator = ConstraintValidator::with_defaults();
        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100000, 0),
            plan: make_plan(vec![make_decision("AAPL", Decimal::new(60000, 0))]), // Over 50k limit
        };

        let response = validator.validate(&request);
        assert!(!response.ok);
        assert!(response
            .violations
            .iter()
            .any(|v| v.code == "PER_INSTRUMENT_NOTIONAL_EXCEEDED"));
    }

    #[test]
    fn test_missing_stop_loss() {
        let validator = ConstraintValidator::with_defaults();
        let mut decision = make_decision("AAPL", Decimal::new(10000, 0));
        decision.stop_loss_level = Decimal::ZERO;

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100000, 0),
            plan: make_plan(vec![decision]),
        };

        let response = validator.validate(&request);
        assert!(!response.ok);
        assert!(response
            .violations
            .iter()
            .any(|v| v.code == "MISSING_STOP_LOSS"));
    }

    #[test]
    fn test_plan_not_approved() {
        let validator = ConstraintValidator::with_defaults();
        let mut plan = make_plan(vec![make_decision("AAPL", Decimal::new(10000, 0))]);
        plan.critic_approved = false;

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100000, 0),
            plan,
        };

        let response = validator.validate(&request);
        assert!(!response.ok);
        assert!(response
            .violations
            .iter()
            .any(|v| v.code == "PLAN_NOT_APPROVED"));
    }
}
