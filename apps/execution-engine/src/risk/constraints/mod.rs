//! Constraint validation logic.
//!
//! Provides deterministic constraint validation for `DecisionPlans` including:
//! - Per-instrument limits (notional, units, equity %)
//! - Portfolio-level limits (gross/net exposure)
//! - Options-specific limits (delta, gamma, vega, theta)
//! - Buying power / margin checks
//! - Conflicting order detection

mod buying_power;
mod conflicts;
mod options;
mod pdt;
mod per_instrument;
mod portfolio;
pub mod risk_limits;
mod sizing_sanity;
mod types;

use std::collections::HashMap;

use rust_decimal::Decimal;

use crate::models::{
    Action, ConstraintCheckRequest, ConstraintCheckResponse, ConstraintViolation, ExposureLimits,
    ViolationSeverity,
};

pub use pdt::{check_pdt_constraints, would_buy_create_pdt_risk};
pub use risk_limits::{
    RiskLimitsConfig, calculate_per_trade_risk, calculate_risk_reward_ratio,
    validate_per_trade_risk, validate_risk_reward_ratio,
};
pub use sizing_sanity::check_sizing_sanity;
pub use types::{
    BuyingPowerInfo, ExtendedConstraintContext, GreeksSnapshot, PdtInfo, SizingSanityWarning,
};

/// Validates decision plans against risk constraints.
#[derive(Debug, Clone)]
pub struct ConstraintValidator {
    limits: ExposureLimits,
    risk_limits: RiskLimitsConfig,
    sizing_sanity_threshold: Decimal,
    pdt_config: crate::config::PdtConstraints,
}

impl ConstraintValidator {
    /// Create a new validator with the given limits.
    #[must_use]
    pub fn new(limits: ExposureLimits) -> Self {
        Self {
            limits,
            risk_limits: RiskLimitsConfig::default(),
            sizing_sanity_threshold: Decimal::new(30, 1), // 3.0
            pdt_config: crate::config::PdtConstraints::default(),
        }
    }

    /// Create a new validator with all configuration options.
    #[must_use]
    pub const fn with_risk_limits(
        limits: ExposureLimits,
        risk_limits: RiskLimitsConfig,
        sizing_sanity_threshold: Decimal,
        pdt_config: crate::config::PdtConstraints,
    ) -> Self {
        Self {
            limits,
            risk_limits,
            sizing_sanity_threshold,
            pdt_config,
        }
    }

    /// Create a validator with default limits.
    #[must_use]
    pub fn with_defaults() -> Self {
        Self::new(ExposureLimits::default())
    }

    /// Create a validator from configuration.
    #[must_use]
    pub fn from_config(config: &crate::config::Config) -> Self {
        use crate::models::{OptionsLimits, PerInstrumentLimits, PortfolioLimits, SizingLimits};

        let constraints = &config.constraints;

        let per_instrument = PerInstrumentLimits {
            max_units: constraints.per_instrument.max_units,
            max_notional: Decimal::try_from(constraints.per_instrument.max_notional)
                .unwrap_or_else(|_| Decimal::new(50000, 0)),
            max_pct_equity: Decimal::try_from(constraints.per_instrument.max_equity_pct)
                .unwrap_or_else(|_| Decimal::new(10, 2)),
        };

        let portfolio = PortfolioLimits {
            max_gross_notional: Decimal::try_from(constraints.portfolio.max_gross_notional)
                .unwrap_or_else(|_| Decimal::new(500_000, 0)),
            max_net_notional: Decimal::try_from(constraints.portfolio.max_net_notional)
                .unwrap_or_else(|_| Decimal::new(250_000, 0)),
            max_pct_equity_gross: Decimal::try_from(constraints.portfolio.max_leverage)
                .unwrap_or_else(|_| Decimal::new(200, 2)),
            max_pct_equity_net: Decimal::ONE,
        };

        let options = OptionsLimits {
            max_delta_notional: Decimal::try_from(constraints.options.max_portfolio_delta)
                .unwrap_or_else(|_| Decimal::new(500, 0)),
            max_gamma: Decimal::try_from(constraints.options.max_portfolio_gamma)
                .unwrap_or_else(|_| Decimal::new(50, 0)),
            max_vega: Decimal::try_from(constraints.options.max_portfolio_vega)
                .unwrap_or_else(|_| Decimal::new(1000, 0)),
            max_theta: Decimal::try_from(constraints.options.max_portfolio_theta)
                .unwrap_or_else(|_| Decimal::new(-500, 0)),
        };

        let limits = ExposureLimits {
            per_instrument,
            portfolio,
            options,
            sizing: SizingLimits::default(),
        };

        let risk_limits = RiskLimitsConfig {
            max_per_trade_risk_pct: constraints.risk_limits.max_per_trade_risk_pct,
            min_risk_reward_ratio: constraints.risk_limits.min_risk_reward_ratio,
        };

        let sizing_sanity_threshold =
            Decimal::try_from(constraints.risk_limits.sizing_sanity_threshold)
                .unwrap_or_else(|_| Decimal::new(30, 1));

        let pdt_config = constraints.pdt.clone();

        Self::with_risk_limits(limits, risk_limits, sizing_sanity_threshold, pdt_config)
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
    #[allow(clippy::too_many_lines)]
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
        let mut instrument_actions: HashMap<
            String,
            Vec<(usize, Action, crate::models::Direction)>,
        > = HashMap::new();

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
            let notional = portfolio::calculate_notional(decision, &request.account_equity);

            // Per-instrument validations
            if let Some(v) =
                per_instrument::check_notional_limit(decision, idx, notional, &self.limits)
            {
                violations.push(v);
            }

            if let Some(v) = per_instrument::check_unit_limit(decision, idx, &self.limits) {
                violations.push(v);
            }

            if let Some(v) = per_instrument::check_equity_percentage_limit(
                decision,
                idx,
                notional,
                request.account_equity,
                &self.limits,
            ) {
                violations.push(v);
            }

            if let Some(v) = per_instrument::check_stop_loss_required(decision, idx) {
                violations.push(v);
            }

            if let Some(v) = per_instrument::check_confidence_valid(decision, idx) {
                violations.push(v);
            }

            // Per-trade risk validation
            if let Some(v) =
                validate_per_trade_risk(decision, request.account_equity, &self.risk_limits)
            {
                violations.push(v);
            }

            // Risk-reward ratio validation
            if let Some(v) = validate_risk_reward_ratio(decision, &self.risk_limits) {
                violations.push(v);
            }

            // Sizing sanity check (only if historical data is available)
            if !context.historical_position_sizes.is_empty()
                && let Some(warning) = check_sizing_sanity(
                    notional,
                    &context.historical_position_sizes,
                    self.sizing_sanity_threshold,
                )
            {
                violations.push(ConstraintViolation {
                    code: "SIZING_SANITY_WARNING".to_string(),
                    severity: ViolationSeverity::Warning,
                    message: warning.message,
                    instrument_id: decision.instrument_id.clone(),
                    field_path: "decision.size".to_string(),
                    observed: format!("${}", warning.proposed_notional.round_dp(2)),
                    limit: format!(
                        "<= {}x typical (${})",
                        warning.threshold,
                        warning.typical_size.round_dp(2)
                    ),
                });
            }
        }

        // Detect conflicting orders (same instrument with opposing actions)
        conflicts::check_conflicting_orders(&instrument_actions, context, &mut violations);

        // Calculate portfolio-level metrics
        let (total_gross, total_net) = portfolio::calculate_portfolio_exposure(request);

        // Check gross notional
        if let Some(v) = portfolio::check_gross_notional_limit(total_gross, &self.limits) {
            violations.push(v);
        }

        // Check net notional
        if let Some(v) = portfolio::check_net_notional_limit(total_net, &self.limits) {
            violations.push(v);
        }

        // Check portfolio equity percentages
        let equity_violations = portfolio::check_equity_percentage_limits(
            total_gross,
            total_net,
            request.account_equity,
            &self.limits,
        );
        violations.extend(equity_violations);

        // Check buying power if provided
        if let Some(v) = buying_power::check_buying_power(request, context) {
            violations.push(v);
        }

        // Check Greeks limits if provided
        if let Some(greeks) = &context.greeks {
            let greeks_violations = options::check_greeks_limits(greeks, &self.limits);
            violations.extend(greeks_violations);
        }

        // Check PDT constraints
        if let Some(v) = pdt::check_pdt_constraints(request, context, &self.pdt_config) {
            violations.push(v);
        }

        if violations.is_empty() {
            ConstraintCheckResponse::success()
        } else {
            ConstraintCheckResponse::failure(violations)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{
        Action, Decision, DecisionPlan, Direction, Size, SizeUnit, StrategyFamily, ThesisState,
        TimeHorizon,
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
            strategy_family: StrategyFamily::EquityLong,
            time_horizon: TimeHorizon::Swing,
            thesis_state: ThesisState::Watching,
            bullish_factors: vec!["Strong momentum".to_string()],
            bearish_factors: vec![],
            rationale: "Test trade".to_string(),
            confidence: Decimal::new(75, 2), // 0.75
            legs: vec![],
            net_limit_price: None,
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
            account_equity: Decimal::new(100_000, 0),
            plan: make_plan(vec![make_decision("AAPL", Decimal::new(10_000, 0))]),
        };

        let context = ExtendedConstraintContext {
            buying_power: BuyingPowerInfo::unlimited(),
            ..Default::default()
        };

        let response = validator.validate_with_context(&request, &context);
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
            account_equity: Decimal::new(100_000, 0),
            plan: make_plan(vec![make_decision("AAPL", Decimal::new(60_000, 0))]), // Over 50k limit
        };

        let response = validator.validate(&request);
        assert!(!response.ok);
        assert!(
            response
                .violations
                .iter()
                .any(|v| v.code == "PER_INSTRUMENT_NOTIONAL_EXCEEDED")
        );
    }

    #[test]
    fn test_missing_stop_loss() {
        let validator = ConstraintValidator::with_defaults();
        let mut decision = make_decision("AAPL", Decimal::new(10_000, 0));
        decision.stop_loss_level = Decimal::ZERO;

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100_000, 0),
            plan: make_plan(vec![decision]),
        };

        let response = validator.validate(&request);
        assert!(!response.ok);
        assert!(
            response
                .violations
                .iter()
                .any(|v| v.code == "MISSING_STOP_LOSS")
        );
    }

    #[test]
    fn test_plan_not_approved() {
        let validator = ConstraintValidator::with_defaults();
        let mut plan = make_plan(vec![make_decision("AAPL", Decimal::new(10_000, 0))]);
        plan.critic_approved = false;

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100_000, 0),
            plan,
        };

        let response = validator.validate(&request);
        assert!(!response.ok);
        assert!(
            response
                .violations
                .iter()
                .any(|v| v.code == "PLAN_NOT_APPROVED")
        );
    }

    #[test]
    fn test_net_exposure_calculation() {
        let validator = ConstraintValidator::with_defaults();

        // Create a balanced portfolio: $8k long + $8k short = $16k gross, $0 net
        let mut long_decision = make_decision("AAPL", Decimal::new(8_000, 0));
        long_decision.direction = Direction::Long;

        let mut short_decision = make_decision("MSFT", Decimal::new(8_000, 0));
        short_decision.direction = Direction::Short;
        short_decision.instrument_id = "MSFT".to_string();
        short_decision.decision_id = "d2".to_string();

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100_000, 0),
            plan: make_plan(vec![long_decision, short_decision]),
        };

        let context = ExtendedConstraintContext {
            buying_power: BuyingPowerInfo::unlimited(),
            ..Default::default()
        };

        let response = validator.validate_with_context(&request, &context);
        assert!(response.ok, "Violations: {:?}", response.violations);
    }

    #[test]
    fn test_net_notional_exceeded() {
        let validator = ConstraintValidator::with_defaults();

        let mut decision = make_decision("AAPL", Decimal::new(300_000, 0));
        decision.direction = Direction::Long;

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(1_000_000, 0),
            plan: make_plan(vec![decision]),
        };

        let response = validator.validate(&request);
        assert!(!response.ok);
        assert!(
            response
                .violations
                .iter()
                .any(|v| v.code == "PORTFOLIO_NET_NOTIONAL_EXCEEDED")
        );
    }

    #[test]
    fn test_conflicting_buy_sell_same_instrument() {
        let validator = ConstraintValidator::with_defaults();

        let mut buy = make_decision("AAPL", Decimal::new(5_000, 0));
        buy.action = Action::Buy;
        buy.decision_id = "d1".to_string();

        let mut sell = make_decision("AAPL", Decimal::new(3_000, 0));
        sell.action = Action::Sell;
        sell.decision_id = "d2".to_string();

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100_000, 0),
            plan: make_plan(vec![buy, sell]),
        };

        let response = validator.validate(&request);
        assert!(!response.ok);
        assert!(
            response
                .violations
                .iter()
                .any(|v| v.code == "CONFLICTING_ORDERS")
        );
    }

    #[test]
    fn test_conflicting_directions_same_instrument() {
        let validator = ConstraintValidator::with_defaults();

        let mut long = make_decision("AAPL", Decimal::new(5_000, 0));
        long.direction = Direction::Long;
        long.decision_id = "d1".to_string();

        let mut short = make_decision("AAPL", Decimal::new(3_000, 0));
        short.direction = Direction::Short;
        short.action = Action::Sell;
        short.decision_id = "d2".to_string();

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100_000, 0),
            plan: make_plan(vec![long, short]),
        };

        let response = validator.validate(&request);
        assert!(!response.ok);
        assert!(
            response
                .violations
                .iter()
                .any(|v| v.code == "CONFLICTING_DIRECTIONS")
        );
    }

    #[test]
    fn test_delta_exceeded() {
        let validator = ConstraintValidator::with_defaults();

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100_000, 0),
            plan: make_plan(vec![make_decision("AAPL", Decimal::new(10_000, 0))]),
        };

        let context = ExtendedConstraintContext {
            greeks: Some(GreeksSnapshot {
                delta_notional: Decimal::new(150_000, 0), // Over 100k limit
                gamma: Decimal::ZERO,
                vega: Decimal::ZERO,
                theta: Decimal::ZERO,
            }),
            ..Default::default()
        };

        let response = validator.validate_with_context(&request, &context);
        assert!(!response.ok);
        assert!(
            response
                .violations
                .iter()
                .any(|v| v.code == "OPTIONS_DELTA_EXCEEDED")
        );
    }

    #[test]
    fn test_gamma_exceeded() {
        let validator = ConstraintValidator::with_defaults();

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100_000, 0),
            plan: make_plan(vec![make_decision("AAPL", Decimal::new(10_000, 0))]),
        };

        let context = ExtendedConstraintContext {
            greeks: Some(GreeksSnapshot {
                delta_notional: Decimal::ZERO,
                gamma: Decimal::new(2_000, 0), // Over 1000 limit
                vega: Decimal::ZERO,
                theta: Decimal::ZERO,
            }),
            ..Default::default()
        };

        let response = validator.validate_with_context(&request, &context);
        assert!(!response.ok);
        assert!(
            response
                .violations
                .iter()
                .any(|v| v.code == "OPTIONS_GAMMA_EXCEEDED")
        );
    }

    #[test]
    fn test_vega_exceeded() {
        let validator = ConstraintValidator::with_defaults();

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100_000, 0),
            plan: make_plan(vec![make_decision("AAPL", Decimal::new(10_000, 0))]),
        };

        let context = ExtendedConstraintContext {
            greeks: Some(GreeksSnapshot {
                delta_notional: Decimal::ZERO,
                gamma: Decimal::ZERO,
                vega: Decimal::new(7_000, 0), // Over 5000 limit
                theta: Decimal::ZERO,
            }),
            ..Default::default()
        };

        let response = validator.validate_with_context(&request, &context);
        assert!(!response.ok);
        assert!(
            response
                .violations
                .iter()
                .any(|v| v.code == "OPTIONS_VEGA_EXCEEDED")
        );
    }

    #[test]
    fn test_theta_exceeded() {
        let validator = ConstraintValidator::with_defaults();

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100_000, 0),
            plan: make_plan(vec![make_decision("AAPL", Decimal::new(10_000, 0))]),
        };

        let context = ExtendedConstraintContext {
            greeks: Some(GreeksSnapshot {
                delta_notional: Decimal::ZERO,
                gamma: Decimal::ZERO,
                vega: Decimal::ZERO,
                theta: Decimal::new(-1_000, 0), // More negative than -500 limit
            }),
            ..Default::default()
        };

        let response = validator.validate_with_context(&request, &context);
        assert!(!response.ok);
        assert!(
            response
                .violations
                .iter()
                .any(|v| v.code == "OPTIONS_THETA_EXCEEDED")
        );
    }

    #[test]
    fn test_greeks_within_limits() {
        let validator = ConstraintValidator::with_defaults();

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100_000, 0),
            plan: make_plan(vec![make_decision("AAPL", Decimal::new(10_000, 0))]),
        };

        let context = ExtendedConstraintContext {
            greeks: Some(GreeksSnapshot {
                delta_notional: Decimal::new(50_000, 0), // Under 100k limit
                gamma: Decimal::new(500, 0),             // Under 1000 limit
                vega: Decimal::new(2_000, 0),            // Under 5000 limit
                theta: Decimal::new(-200, 0),            // Above -500 limit
            }),
            buying_power: BuyingPowerInfo::unlimited(),
            ..Default::default()
        };

        let response = validator.validate_with_context(&request, &context);
        assert!(response.ok);
    }

    #[test]
    fn test_insufficient_buying_power() {
        let validator = ConstraintValidator::with_defaults();

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100_000, 0),
            plan: make_plan(vec![make_decision("AAPL", Decimal::new(40_000, 0))]),
        };

        let context = ExtendedConstraintContext {
            buying_power: BuyingPowerInfo {
                available: Decimal::new(10_000, 0), // Only $10k available
                required_margin: Decimal::ZERO,
            },
            ..Default::default()
        };

        let response = validator.validate_with_context(&request, &context);
        assert!(!response.ok);
        assert!(
            response
                .violations
                .iter()
                .any(|v| v.code == "INSUFFICIENT_BUYING_POWER")
        );
    }

    #[test]
    fn test_sufficient_buying_power() {
        let validator = ConstraintValidator::with_defaults();

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100_000, 0),
            plan: make_plan(vec![make_decision("AAPL", Decimal::new(10_000, 0))]),
        };

        let context = ExtendedConstraintContext {
            buying_power: BuyingPowerInfo {
                available: Decimal::new(50_000, 0), // $50k available
                required_margin: Decimal::ZERO,
            },
            ..Default::default()
        };

        let response = validator.validate_with_context(&request, &context);
        assert!(response.ok);
    }

    #[test]
    fn test_units_exceeded() {
        let validator = ConstraintValidator::with_defaults();

        let mut decision = make_decision("AAPL", Decimal::new(5_000, 0));
        decision.size = Size {
            quantity: Decimal::new(5_000, 0), // Over 1000 units limit
            unit: SizeUnit::Shares,
        };

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(1_000_000, 0),
            plan: make_plan(vec![decision]),
        };

        let response = validator.validate(&request);
        assert!(!response.ok);
        assert!(
            response
                .violations
                .iter()
                .any(|v| v.code == "PER_INSTRUMENT_UNITS_EXCEEDED")
        );
    }

    #[test]
    fn test_sell_without_position_warning() {
        let validator = ConstraintValidator::with_defaults();

        let mut decision = make_decision("AAPL", Decimal::new(10_000, 0));
        decision.action = Action::Sell;

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100_000, 0),
            plan: make_plan(vec![decision]),
        };

        let mut context = ExtendedConstraintContext::default();
        context
            .current_positions
            .insert("AAPL".to_string(), Decimal::ZERO); // No position

        let response = validator.validate_with_context(&request, &context);
        assert!(
            response
                .violations
                .iter()
                .any(|v| v.code == "POSITION_MISMATCH")
        );
    }

    #[test]
    fn test_hold_action_skipped() {
        let validator = ConstraintValidator::with_defaults();

        let mut decision = make_decision("AAPL", Decimal::new(1_000_000, 0)); // Would exceed limits
        decision.action = Action::Hold;

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100_000, 0),
            plan: make_plan(vec![decision]),
        };

        let response = validator.validate(&request);
        assert!(response.ok);
    }

    #[test]
    fn test_no_trade_action_skipped() {
        let validator = ConstraintValidator::with_defaults();

        let mut decision = make_decision("AAPL", Decimal::new(1_000_000, 0)); // Would exceed limits
        decision.action = Action::NoTrade;

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100_000, 0),
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
        let decision = make_decision("AAPL", Decimal::new(25_000, 0)); // 250% of equity

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(10_000, 0),
            plan: make_plan(vec![decision]),
        };

        let response = validator.validate(&request);
        assert!(!response.ok);
        assert!(
            response
                .violations
                .iter()
                .any(|v| v.code == "PORTFOLIO_GROSS_PCT_EXCEEDED")
        );
    }

    #[test]
    fn test_short_position_net_calculation() {
        let validator = ConstraintValidator::with_defaults();

        // Large short position should still count toward net exposure
        let mut short_decision = make_decision("AAPL", Decimal::new(300_000, 0));
        short_decision.direction = Direction::Short;
        short_decision.action = Action::Sell;

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(1_000_000, 0),
            plan: make_plan(vec![short_decision]),
        };

        let response = validator.validate(&request);
        assert!(!response.ok);
        // Should fail due to net exposure (short side)
        assert!(
            response
                .violations
                .iter()
                .any(|v| v.code == "PORTFOLIO_NET_NOTIONAL_EXCEEDED")
        );
    }
}
