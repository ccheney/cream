//! Constraint validation logic.
//!
//! Provides deterministic constraint validation for DecisionPlans including:
//! - Per-instrument limits (notional, units, equity %)
//! - Portfolio-level limits (gross/net exposure)
//! - Options-specific limits (delta, gamma, vega, theta)
//! - Buying power / margin checks
//! - Conflicting order detection

use rust_decimal::Decimal;
use std::collections::HashMap;

use crate::models::{
    Action, ConstraintCheckRequest, ConstraintCheckResponse, ConstraintViolation, Direction,
    ExposureLimits, SizeUnit, ViolationSeverity,
};

/// Greeks snapshot for options constraint validation.
#[derive(Debug, Clone, Default)]
pub struct GreeksSnapshot {
    /// Delta-adjusted notional (directional exposure).
    pub delta_notional: Decimal,
    /// Gamma exposure.
    pub gamma: Decimal,
    /// Vega exposure.
    pub vega: Decimal,
    /// Theta (time decay, typically negative for long options).
    pub theta: Decimal,
}

/// Buying power / margin information.
#[derive(Debug, Clone)]
pub struct BuyingPowerInfo {
    /// Available buying power.
    pub available: Decimal,
    /// Required margin for pending orders.
    pub required_margin: Decimal,
}

impl Default for BuyingPowerInfo {
    fn default() -> Self {
        Self {
            available: Decimal::MAX,
            required_margin: Decimal::ZERO,
        }
    }
}

/// Extended request with optional Greeks and buying power.
#[derive(Debug, Clone)]
pub struct ExtendedConstraintContext {
    /// Portfolio Greeks snapshot (optional, for options validation).
    pub greeks: Option<GreeksSnapshot>,
    /// Buying power information.
    pub buying_power: BuyingPowerInfo,
    /// Current positions by instrument (for conflicting order detection).
    pub current_positions: HashMap<String, Decimal>,
}

impl Default for ExtendedConstraintContext {
    fn default() -> Self {
        Self {
            greeks: None,
            buying_power: BuyingPowerInfo::default(),
            current_positions: HashMap::new(),
        }
    }
}

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
        self.validate_with_context(request, &ExtendedConstraintContext::default())
    }

    /// Validate a decision plan with extended context (Greeks, buying power, positions).
    ///
    /// This method allows full validation including options Greeks limits,
    /// buying power checks, and conflicting order detection.
    #[must_use]
    pub fn validate_with_context(
        &self,
        request: &ConstraintCheckRequest,
        context: &ExtendedConstraintContext,
    ) -> ConstraintCheckResponse {
        let mut violations = Vec::new();

        // Check plan approval status first (fail fast)
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

        // Track per-instrument aggregation for conflict detection
        let mut instrument_actions: HashMap<String, Vec<(usize, Action, Direction)>> =
            HashMap::new();

        // Check each decision
        for (idx, decision) in request.plan.decisions.iter().enumerate() {
            // Skip non-trading decisions
            if matches!(decision.action, Action::Hold | Action::NoTrade) {
                continue;
            }

            // Track actions for conflict detection
            instrument_actions
                .entry(decision.instrument_id.clone())
                .or_default()
                .push((idx, decision.action, decision.direction));

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

            // Check per-instrument unit limit
            if matches!(decision.size.unit, SizeUnit::Shares | SizeUnit::Contracts) {
                let units = decision
                    .size
                    .quantity
                    .to_string()
                    .parse::<u32>()
                    .unwrap_or(u32::MAX);
                if units > self.limits.per_instrument.max_units {
                    violations.push(ConstraintViolation {
                        code: "PER_INSTRUMENT_UNITS_EXCEEDED".to_string(),
                        severity: ViolationSeverity::Error,
                        message: format!(
                            "Units {} exceeds per-instrument limit {}",
                            units, self.limits.per_instrument.max_units
                        ),
                        instrument_id: decision.instrument_id.clone(),
                        field_path: format!("decisions[{idx}].size.quantity"),
                        observed: units.to_string(),
                        limit: self.limits.per_instrument.max_units.to_string(),
                    });
                }
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

        // Detect conflicting orders (same instrument with opposing actions)
        self.check_conflicting_orders(&instrument_actions, context, &mut violations);

        // Calculate portfolio-level metrics
        let (total_gross, total_net) = self.calculate_portfolio_exposure(request);

        // Check gross notional
        if total_gross > self.limits.portfolio.max_gross_notional {
            violations.push(ConstraintViolation {
                code: "PORTFOLIO_GROSS_NOTIONAL_EXCEEDED".to_string(),
                severity: ViolationSeverity::Error,
                message: format!(
                    "Portfolio gross notional ${total_gross} exceeds limit ${}",
                    self.limits.portfolio.max_gross_notional
                ),
                instrument_id: String::new(),
                field_path: "plan.decisions".to_string(),
                observed: total_gross.to_string(),
                limit: self.limits.portfolio.max_gross_notional.to_string(),
            });
        }

        // Check net notional
        if total_net.abs() > self.limits.portfolio.max_net_notional {
            violations.push(ConstraintViolation {
                code: "PORTFOLIO_NET_NOTIONAL_EXCEEDED".to_string(),
                severity: ViolationSeverity::Error,
                message: format!(
                    "Portfolio net notional ${} exceeds limit ${}",
                    total_net.abs(),
                    self.limits.portfolio.max_net_notional
                ),
                instrument_id: String::new(),
                field_path: "plan.decisions".to_string(),
                observed: total_net.to_string(),
                limit: format!("±{}", self.limits.portfolio.max_net_notional),
            });
        }

        // Check portfolio equity percentages
        if request.account_equity > Decimal::ZERO {
            let gross_pct = total_gross / request.account_equity;
            let net_pct = total_net.abs() / request.account_equity;

            if gross_pct > self.limits.portfolio.max_pct_equity_gross {
                violations.push(ConstraintViolation {
                    code: "PORTFOLIO_GROSS_PCT_EXCEEDED".to_string(),
                    severity: ViolationSeverity::Error,
                    message: format!(
                        "Portfolio gross exposure {:.1}% exceeds limit {:.1}%",
                        gross_pct * Decimal::new(100, 0),
                        self.limits.portfolio.max_pct_equity_gross * Decimal::new(100, 0)
                    ),
                    instrument_id: String::new(),
                    field_path: "plan.decisions".to_string(),
                    observed: format!("{:.4}", gross_pct),
                    limit: self.limits.portfolio.max_pct_equity_gross.to_string(),
                });
            }

            if net_pct > self.limits.portfolio.max_pct_equity_net {
                violations.push(ConstraintViolation {
                    code: "PORTFOLIO_NET_PCT_EXCEEDED".to_string(),
                    severity: ViolationSeverity::Error,
                    message: format!(
                        "Portfolio net exposure {:.1}% exceeds limit {:.1}%",
                        net_pct * Decimal::new(100, 0),
                        self.limits.portfolio.max_pct_equity_net * Decimal::new(100, 0)
                    ),
                    instrument_id: String::new(),
                    field_path: "plan.decisions".to_string(),
                    observed: format!("{:.4}", net_pct),
                    limit: self.limits.portfolio.max_pct_equity_net.to_string(),
                });
            }
        }

        // Check buying power if provided
        self.check_buying_power(request, context, &mut violations);

        // Check Greeks limits if provided
        if let Some(greeks) = &context.greeks {
            self.check_greeks_limits(greeks, &mut violations);
        }

        if violations.is_empty() {
            ConstraintCheckResponse::success()
        } else {
            ConstraintCheckResponse::failure(violations)
        }
    }

    /// Check for conflicting orders on the same instrument.
    fn check_conflicting_orders(
        &self,
        instrument_actions: &HashMap<String, Vec<(usize, Action, Direction)>>,
        context: &ExtendedConstraintContext,
        violations: &mut Vec<ConstraintViolation>,
    ) {
        for (instrument_id, actions) in instrument_actions {
            // Check for conflicts only when there are multiple actions
            if actions.len() >= 2 {
                // Check for BUY + SELL on same instrument in same plan
                let has_buy = actions.iter().any(|(_, a, _)| *a == Action::Buy);
                let has_sell = actions.iter().any(|(_, a, _)| *a == Action::Sell);

                if has_buy && has_sell {
                    violations.push(ConstraintViolation {
                        code: "CONFLICTING_ORDERS".to_string(),
                        severity: ViolationSeverity::Error,
                        message: format!(
                            "Conflicting BUY and SELL orders for {} in same plan",
                            instrument_id
                        ),
                        instrument_id: instrument_id.clone(),
                        field_path: "plan.decisions".to_string(),
                        observed: format!("{} decisions", actions.len()),
                        limit: "no conflicting orders".to_string(),
                    });
                }

                // Check for opposite directions (LONG vs SHORT) on same instrument
                let has_long = actions.iter().any(|(_, _, d)| *d == Direction::Long);
                let has_short = actions.iter().any(|(_, _, d)| *d == Direction::Short);

                if has_long && has_short {
                    violations.push(ConstraintViolation {
                        code: "CONFLICTING_DIRECTIONS".to_string(),
                        severity: ViolationSeverity::Error,
                        message: format!(
                            "Conflicting LONG and SHORT directions for {} in same plan",
                            instrument_id
                        ),
                        instrument_id: instrument_id.clone(),
                        field_path: "plan.decisions".to_string(),
                        observed: "LONG and SHORT".to_string(),
                        limit: "single direction per instrument".to_string(),
                    });
                }
            }

            // Check if action conflicts with existing position (applies to any number of actions)
            if let Some(&existing_qty) = context.current_positions.get(instrument_id) {
                for (idx, action, _) in actions {
                    let conflict = match action {
                        // SELL when no position (trying to sell something we don't have)
                        Action::Sell if existing_qty <= Decimal::ZERO => true,
                        // CLOSE when no position to close
                        Action::Close if existing_qty == Decimal::ZERO => true,
                        _ => false,
                    };

                    if conflict {
                        violations.push(ConstraintViolation {
                            code: "POSITION_MISMATCH".to_string(),
                            severity: ViolationSeverity::Warning,
                            message: format!(
                                "Action {:?} conflicts with current position {} for {}",
                                action, existing_qty, instrument_id
                            ),
                            instrument_id: instrument_id.clone(),
                            field_path: format!("decisions[{idx}].action"),
                            observed: format!("{:?}", action),
                            limit: format!("position={}", existing_qty),
                        });
                    }
                }
            }
        }
    }

    /// Check buying power / margin requirements.
    fn check_buying_power(
        &self,
        request: &ConstraintCheckRequest,
        context: &ExtendedConstraintContext,
        violations: &mut Vec<ConstraintViolation>,
    ) {
        let (total_gross, _) = self.calculate_portfolio_exposure(request);

        // Simple margin requirement: 50% of gross for equities (Reg T)
        // This is a simplification - real margin calc is more complex
        let estimated_margin = total_gross * Decimal::new(50, 2); // 0.50

        let total_required = context.buying_power.required_margin + estimated_margin;

        if total_required > context.buying_power.available {
            violations.push(ConstraintViolation {
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
            });
        }
    }

    /// Check options Greeks limits.
    fn check_greeks_limits(&self, greeks: &GreeksSnapshot, violations: &mut Vec<ConstraintViolation>) {
        // Check delta-adjusted notional
        if greeks.delta_notional.abs() > self.limits.options.max_delta_notional {
            violations.push(ConstraintViolation {
                code: "OPTIONS_DELTA_EXCEEDED".to_string(),
                severity: ViolationSeverity::Error,
                message: format!(
                    "Delta-adjusted notional ${} exceeds limit ${}",
                    greeks.delta_notional.abs(),
                    self.limits.options.max_delta_notional
                ),
                instrument_id: String::new(),
                field_path: "portfolio.greeks.delta_notional".to_string(),
                observed: greeks.delta_notional.to_string(),
                limit: format!("±{}", self.limits.options.max_delta_notional),
            });
        }

        // Check gamma
        if greeks.gamma.abs() > self.limits.options.max_gamma {
            violations.push(ConstraintViolation {
                code: "OPTIONS_GAMMA_EXCEEDED".to_string(),
                severity: ViolationSeverity::Error,
                message: format!(
                    "Gamma {} exceeds limit {}",
                    greeks.gamma.abs(),
                    self.limits.options.max_gamma
                ),
                instrument_id: String::new(),
                field_path: "portfolio.greeks.gamma".to_string(),
                observed: greeks.gamma.to_string(),
                limit: format!("±{}", self.limits.options.max_gamma),
            });
        }

        // Check vega
        if greeks.vega.abs() > self.limits.options.max_vega {
            violations.push(ConstraintViolation {
                code: "OPTIONS_VEGA_EXCEEDED".to_string(),
                severity: ViolationSeverity::Error,
                message: format!(
                    "Vega {} exceeds limit {}",
                    greeks.vega.abs(),
                    self.limits.options.max_vega
                ),
                instrument_id: String::new(),
                field_path: "portfolio.greeks.vega".to_string(),
                observed: greeks.vega.to_string(),
                limit: format!("±{}", self.limits.options.max_vega),
            });
        }

        // Check theta (typically negative for long options, positive for short)
        // Limit is expressed as max negative (max time decay for long positions)
        if greeks.theta < self.limits.options.max_theta {
            violations.push(ConstraintViolation {
                code: "OPTIONS_THETA_EXCEEDED".to_string(),
                severity: ViolationSeverity::Error,
                message: format!(
                    "Theta {} exceeds decay limit {}",
                    greeks.theta, self.limits.options.max_theta
                ),
                instrument_id: String::new(),
                field_path: "portfolio.greeks.theta".to_string(),
                observed: greeks.theta.to_string(),
                limit: format!("≥{}", self.limits.options.max_theta),
            });
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

    /// Calculate signed notional for a decision (positive for long, negative for short).
    fn calculate_signed_notional(
        &self,
        decision: &crate::models::Decision,
        account_equity: &Decimal,
    ) -> Decimal {
        let notional = self.calculate_notional(decision, account_equity);
        match decision.direction {
            Direction::Long => notional,
            Direction::Short => -notional,
            Direction::Flat => Decimal::ZERO,
        }
    }

    /// Calculate portfolio exposure (gross and net).
    ///
    /// Returns (gross_notional, net_notional) where:
    /// - gross = sum of absolute notional values
    /// - net = sum of signed notional values (long positive, short negative)
    fn calculate_portfolio_exposure(&self, request: &ConstraintCheckRequest) -> (Decimal, Decimal) {
        let mut gross = Decimal::ZERO;
        let mut net = Decimal::ZERO;

        for decision in &request.plan.decisions {
            if matches!(decision.action, Action::Hold | Action::NoTrade) {
                continue;
            }

            let notional = self.calculate_notional(decision, &request.account_equity);
            let signed = self.calculate_signed_notional(decision, &request.account_equity);

            gross += notional.abs();
            net += signed;
        }

        (gross, net)
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

    // ============ Net Exposure Tests ============

    #[test]
    fn test_net_exposure_calculation() {
        let validator = ConstraintValidator::with_defaults();

        // Create a balanced portfolio: $8k long + $8k short = $16k gross, $0 net
        // Using $8k each to stay under 10% per-instrument equity limit ($100k * 10% = $10k)
        let mut long_decision = make_decision("AAPL", Decimal::new(8000, 0));
        long_decision.direction = Direction::Long;

        // For short position: use Buy action with Short direction
        // (opening a short position is still an entry)
        let mut short_decision = make_decision("MSFT", Decimal::new(8000, 0));
        short_decision.direction = Direction::Short;
        short_decision.instrument_id = "MSFT".to_string();
        short_decision.decision_id = "d2".to_string();
        // Keep action as Buy (opening the position)

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100000, 0),
            plan: make_plan(vec![long_decision, short_decision]),
        };

        let response = validator.validate(&request);
        assert!(response.ok, "Violations: {:?}", response.violations);
    }

    #[test]
    fn test_net_notional_exceeded() {
        let validator = ConstraintValidator::with_defaults();

        // Net limit is $250k, create $300k long exposure
        let mut decision = make_decision("AAPL", Decimal::new(300000, 0));
        decision.direction = Direction::Long;

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(1000000, 0), // Large equity to avoid per-position limits
            plan: make_plan(vec![decision]),
        };

        let response = validator.validate(&request);
        assert!(!response.ok);
        assert!(response
            .violations
            .iter()
            .any(|v| v.code == "PORTFOLIO_NET_NOTIONAL_EXCEEDED"));
    }

    // ============ Conflicting Orders Tests ============

    #[test]
    fn test_conflicting_buy_sell_same_instrument() {
        let validator = ConstraintValidator::with_defaults();

        let mut buy = make_decision("AAPL", Decimal::new(5000, 0));
        buy.action = Action::Buy;
        buy.decision_id = "d1".to_string();

        let mut sell = make_decision("AAPL", Decimal::new(3000, 0));
        sell.action = Action::Sell;
        sell.decision_id = "d2".to_string();

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100000, 0),
            plan: make_plan(vec![buy, sell]),
        };

        let response = validator.validate(&request);
        assert!(!response.ok);
        assert!(response
            .violations
            .iter()
            .any(|v| v.code == "CONFLICTING_ORDERS"));
    }

    #[test]
    fn test_conflicting_directions_same_instrument() {
        let validator = ConstraintValidator::with_defaults();

        let mut long = make_decision("AAPL", Decimal::new(5000, 0));
        long.direction = Direction::Long;
        long.decision_id = "d1".to_string();

        let mut short = make_decision("AAPL", Decimal::new(3000, 0));
        short.direction = Direction::Short;
        short.action = Action::Sell;
        short.decision_id = "d2".to_string();

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100000, 0),
            plan: make_plan(vec![long, short]),
        };

        let response = validator.validate(&request);
        assert!(!response.ok);
        assert!(response
            .violations
            .iter()
            .any(|v| v.code == "CONFLICTING_DIRECTIONS"));
    }

    // ============ Greeks Limits Tests ============

    #[test]
    fn test_delta_exceeded() {
        let validator = ConstraintValidator::with_defaults();

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100000, 0),
            plan: make_plan(vec![make_decision("AAPL", Decimal::new(10000, 0))]),
        };

        let context = ExtendedConstraintContext {
            greeks: Some(GreeksSnapshot {
                delta_notional: Decimal::new(150000, 0), // Over 100k limit
                gamma: Decimal::ZERO,
                vega: Decimal::ZERO,
                theta: Decimal::ZERO,
            }),
            ..Default::default()
        };

        let response = validator.validate_with_context(&request, &context);
        assert!(!response.ok);
        assert!(response
            .violations
            .iter()
            .any(|v| v.code == "OPTIONS_DELTA_EXCEEDED"));
    }

    #[test]
    fn test_gamma_exceeded() {
        let validator = ConstraintValidator::with_defaults();

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100000, 0),
            plan: make_plan(vec![make_decision("AAPL", Decimal::new(10000, 0))]),
        };

        let context = ExtendedConstraintContext {
            greeks: Some(GreeksSnapshot {
                delta_notional: Decimal::ZERO,
                gamma: Decimal::new(2000, 0), // Over 1000 limit
                vega: Decimal::ZERO,
                theta: Decimal::ZERO,
            }),
            ..Default::default()
        };

        let response = validator.validate_with_context(&request, &context);
        assert!(!response.ok);
        assert!(response
            .violations
            .iter()
            .any(|v| v.code == "OPTIONS_GAMMA_EXCEEDED"));
    }

    #[test]
    fn test_vega_exceeded() {
        let validator = ConstraintValidator::with_defaults();

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100000, 0),
            plan: make_plan(vec![make_decision("AAPL", Decimal::new(10000, 0))]),
        };

        let context = ExtendedConstraintContext {
            greeks: Some(GreeksSnapshot {
                delta_notional: Decimal::ZERO,
                gamma: Decimal::ZERO,
                vega: Decimal::new(7000, 0), // Over 5000 limit
                theta: Decimal::ZERO,
            }),
            ..Default::default()
        };

        let response = validator.validate_with_context(&request, &context);
        assert!(!response.ok);
        assert!(response
            .violations
            .iter()
            .any(|v| v.code == "OPTIONS_VEGA_EXCEEDED"));
    }

    #[test]
    fn test_theta_exceeded() {
        let validator = ConstraintValidator::with_defaults();

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100000, 0),
            plan: make_plan(vec![make_decision("AAPL", Decimal::new(10000, 0))]),
        };

        let context = ExtendedConstraintContext {
            greeks: Some(GreeksSnapshot {
                delta_notional: Decimal::ZERO,
                gamma: Decimal::ZERO,
                vega: Decimal::ZERO,
                theta: Decimal::new(-1000, 0), // More negative than -500 limit
            }),
            ..Default::default()
        };

        let response = validator.validate_with_context(&request, &context);
        assert!(!response.ok);
        assert!(response
            .violations
            .iter()
            .any(|v| v.code == "OPTIONS_THETA_EXCEEDED"));
    }

    #[test]
    fn test_greeks_within_limits() {
        let validator = ConstraintValidator::with_defaults();

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100000, 0),
            plan: make_plan(vec![make_decision("AAPL", Decimal::new(10000, 0))]),
        };

        let context = ExtendedConstraintContext {
            greeks: Some(GreeksSnapshot {
                delta_notional: Decimal::new(50000, 0), // Under 100k limit
                gamma: Decimal::new(500, 0),            // Under 1000 limit
                vega: Decimal::new(2000, 0),            // Under 5000 limit
                theta: Decimal::new(-200, 0),           // Above -500 limit
            }),
            ..Default::default()
        };

        let response = validator.validate_with_context(&request, &context);
        assert!(response.ok);
    }

    // ============ Buying Power Tests ============

    #[test]
    fn test_insufficient_buying_power() {
        let validator = ConstraintValidator::with_defaults();

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100000, 0),
            plan: make_plan(vec![make_decision("AAPL", Decimal::new(40000, 0))]),
        };

        let context = ExtendedConstraintContext {
            buying_power: BuyingPowerInfo {
                available: Decimal::new(10000, 0), // Only $10k available
                required_margin: Decimal::ZERO,
            },
            ..Default::default()
        };

        let response = validator.validate_with_context(&request, &context);
        assert!(!response.ok);
        assert!(response
            .violations
            .iter()
            .any(|v| v.code == "INSUFFICIENT_BUYING_POWER"));
    }

    #[test]
    fn test_sufficient_buying_power() {
        let validator = ConstraintValidator::with_defaults();

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100000, 0),
            plan: make_plan(vec![make_decision("AAPL", Decimal::new(10000, 0))]),
        };

        let context = ExtendedConstraintContext {
            buying_power: BuyingPowerInfo {
                available: Decimal::new(50000, 0), // $50k available
                required_margin: Decimal::ZERO,
            },
            ..Default::default()
        };

        let response = validator.validate_with_context(&request, &context);
        assert!(response.ok);
    }

    // ============ Unit Limit Tests ============

    #[test]
    fn test_units_exceeded() {
        let validator = ConstraintValidator::with_defaults();

        let mut decision = make_decision("AAPL", Decimal::new(5000, 0));
        decision.size = Size {
            quantity: Decimal::new(5000, 0), // Over 1000 units limit
            unit: SizeUnit::Shares,
        };

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(1000000, 0),
            plan: make_plan(vec![decision]),
        };

        let response = validator.validate(&request);
        assert!(!response.ok);
        assert!(response
            .violations
            .iter()
            .any(|v| v.code == "PER_INSTRUMENT_UNITS_EXCEEDED"));
    }

    // ============ Position Mismatch Tests ============

    #[test]
    fn test_sell_without_position_warning() {
        let validator = ConstraintValidator::with_defaults();

        let mut decision = make_decision("AAPL", Decimal::new(10000, 0));
        decision.action = Action::Sell;

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100000, 0),
            plan: make_plan(vec![decision]),
        };

        let mut context = ExtendedConstraintContext::default();
        context
            .current_positions
            .insert("AAPL".to_string(), Decimal::ZERO); // No position

        let response = validator.validate_with_context(&request, &context);
        assert!(response
            .violations
            .iter()
            .any(|v| v.code == "POSITION_MISMATCH"));
    }

    // ============ Edge Cases ============

    #[test]
    fn test_hold_action_skipped() {
        let validator = ConstraintValidator::with_defaults();

        let mut decision = make_decision("AAPL", Decimal::new(1000000, 0)); // Would exceed limits
        decision.action = Action::Hold;

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100000, 0),
            plan: make_plan(vec![decision]),
        };

        let response = validator.validate(&request);
        assert!(response.ok);
    }

    #[test]
    fn test_no_trade_action_skipped() {
        let validator = ConstraintValidator::with_defaults();

        let mut decision = make_decision("AAPL", Decimal::new(1000000, 0)); // Would exceed limits
        decision.action = Action::NoTrade;

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100000, 0),
            plan: make_plan(vec![decision]),
        };

        let response = validator.validate(&request);
        assert!(response.ok);
    }

    #[test]
    fn test_portfolio_equity_percentage_exceeded() {
        let validator = ConstraintValidator::with_defaults();

        // Portfolio gross limit is 200% of equity
        // With $10k equity, max gross is $20k
        let decision = make_decision("AAPL", Decimal::new(25000, 0)); // 250% of equity

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(10000, 0),
            plan: make_plan(vec![decision]),
        };

        let response = validator.validate(&request);
        assert!(!response.ok);
        assert!(response
            .violations
            .iter()
            .any(|v| v.code == "PORTFOLIO_GROSS_PCT_EXCEEDED"));
    }

    #[test]
    fn test_short_position_net_calculation() {
        let validator = ConstraintValidator::with_defaults();

        // Large short position should still count toward net exposure
        let mut short_decision = make_decision("AAPL", Decimal::new(300000, 0));
        short_decision.direction = Direction::Short;
        short_decision.action = Action::Sell;

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(1000000, 0),
            plan: make_plan(vec![short_decision]),
        };

        let response = validator.validate(&request);
        assert!(!response.ok);
        // Should fail due to net exposure (short side)
        assert!(response
            .violations
            .iter()
            .any(|v| v.code == "PORTFOLIO_NET_NOTIONAL_EXCEEDED"));
    }
}
