//! Constraint validation logic.
//!
//! Provides deterministic constraint validation for `DecisionPlans` including:
//! - Per-instrument limits (notional, units, equity %)
//! - Portfolio-level limits (gross/net exposure)
//! - Options-specific limits (delta, gamma, vega, theta)
//! - Buying power / margin checks
//! - Conflicting order detection

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
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
        // Default to zero available buying power to enforce explicit provision
        // of buying power info. Using MAX would bypass all buying power checks.
        Self {
            available: Decimal::ZERO,
            required_margin: Decimal::ZERO,
        }
    }
}

impl BuyingPowerInfo {
    /// Create a new `BuyingPowerInfo` with specified available buying power.
    #[must_use]
    pub const fn new(available: Decimal, required_margin: Decimal) -> Self {
        Self {
            available,
            required_margin,
        }
    }

    /// Create `BuyingPowerInfo` with unlimited buying power (for testing only).
    #[cfg(test)]
    #[must_use]
    pub fn unlimited() -> Self {
        Self {
            available: Decimal::MAX,
            required_margin: Decimal::ZERO,
        }
    }
}

/// Extended request with optional Greeks and buying power.
#[derive(Debug, Clone, Default)]
pub struct ExtendedConstraintContext {
    /// Portfolio Greeks snapshot (optional, for options validation).
    pub greeks: Option<GreeksSnapshot>,
    /// Buying power information.
    pub buying_power: BuyingPowerInfo,
    /// Current positions by instrument (for conflicting order detection).
    pub current_positions: HashMap<String, Decimal>,
    /// Historical position sizes for sizing sanity check.
    /// List of recent position notional values.
    pub historical_position_sizes: Vec<Decimal>,
}

/// Sizing sanity warning (not an error, just a warning).
#[derive(Debug, Clone)]
pub struct SizingSanityWarning {
    /// Proposed position notional.
    pub proposed_notional: Decimal,
    /// Typical (median) position size.
    pub typical_size: Decimal,
    /// Multiplier of typical size.
    pub size_multiplier: Decimal,
    /// Threshold multiplier that was exceeded.
    pub threshold: Decimal,
    /// Warning message.
    pub message: String,
}

/// Calculate median of a list of decimals.
fn calculate_median(values: &[Decimal]) -> Option<Decimal> {
    if values.is_empty() {
        return None;
    }
    let mut sorted = values.to_vec();
    sorted.sort();
    let mid = sorted.len() / 2;
    if sorted.len().is_multiple_of(2) {
        Some((sorted[mid - 1] + sorted[mid]) / Decimal::new(2, 0))
    } else {
        Some(sorted[mid])
    }
}

/// Check if a position size is unusually large.
///
/// Returns a warning if the proposed notional exceeds
/// `threshold_multiplier` * median of historical sizes.
#[must_use]
pub fn check_sizing_sanity(
    proposed_notional: Decimal,
    historical_sizes: &[Decimal],
    threshold_multiplier: Decimal,
) -> Option<SizingSanityWarning> {
    // Need at least some historical data
    if historical_sizes.len() < 5 {
        return None;
    }

    let typical_size = calculate_median(historical_sizes)?;
    if typical_size <= Decimal::ZERO {
        return None;
    }

    let size_multiplier = proposed_notional / typical_size;
    if size_multiplier > threshold_multiplier {
        return Some(SizingSanityWarning {
            proposed_notional,
            typical_size,
            size_multiplier,
            threshold: threshold_multiplier,
            message: format!(
                "Position size ${proposed_notional} is {size_multiplier:.1}x typical size ${typical_size} (threshold: {threshold_multiplier}x)"
            ),
        });
    }

    None
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

        Self::new(limits)
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
            let notional = Self::calculate_notional(decision, &request.account_equity);

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
                        observed: format!("{pct_equity:.4}"),
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
        Self::check_conflicting_orders(&instrument_actions, context, &mut violations);

        // Calculate portfolio-level metrics
        let (total_gross, total_net) = Self::calculate_portfolio_exposure(request);

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
                    observed: format!("{gross_pct:.4}"),
                    limit: self.limits.portfolio.max_pct_equity_gross.to_string(),
                });
            }

            if net_pct > self.limits.portfolio.max_pct_equity_net {
                let net_pct_display = net_pct * Decimal::new(100, 0);
                let limit_display = self.limits.portfolio.max_pct_equity_net * Decimal::new(100, 0);
                violations.push(ConstraintViolation {
                    code: "PORTFOLIO_NET_PCT_EXCEEDED".to_string(),
                    severity: ViolationSeverity::Error,
                    message: format!(
                        "Portfolio net exposure {net_pct_display:.1}% exceeds limit {limit_display:.1}%"
                    ),
                    instrument_id: String::new(),
                    field_path: "plan.decisions".to_string(),
                    observed: format!("{net_pct:.4}"),
                    limit: self.limits.portfolio.max_pct_equity_net.to_string(),
                });
            }
        }

        // Check buying power if provided
        Self::check_buying_power(request, context, &mut violations);

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
                    let num_decisions = actions.len();
                    violations.push(ConstraintViolation {
                        code: "CONFLICTING_ORDERS".to_string(),
                        severity: ViolationSeverity::Error,
                        message: format!(
                            "Conflicting BUY and SELL orders for {instrument_id} in same plan"
                        ),
                        instrument_id: instrument_id.clone(),
                        field_path: "plan.decisions".to_string(),
                        observed: format!("{num_decisions} decisions"),
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
                            "Conflicting LONG and SHORT directions for {instrument_id} in same plan"
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
                                "Action {action:?} conflicts with current position {existing_qty} for {instrument_id}"
                            ),
                            instrument_id: instrument_id.clone(),
                            field_path: format!("decisions[{idx}].action"),
                            observed: format!("{action:?}"),
                            limit: format!("position={existing_qty}"),
                        });
                    }
                }
            }
        }
    }

    /// Check buying power / margin requirements.
    fn check_buying_power(
        request: &ConstraintCheckRequest,
        context: &ExtendedConstraintContext,
        violations: &mut Vec<ConstraintViolation>,
    ) {
        let (total_gross, _) = Self::calculate_portfolio_exposure(request);

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
    fn check_greeks_limits(
        &self,
        greeks: &GreeksSnapshot,
        violations: &mut Vec<ConstraintViolation>,
    ) {
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
    fn calculate_notional(decision: &crate::models::Decision, account_equity: &Decimal) -> Decimal {
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
        decision: &crate::models::Decision,
        account_equity: &Decimal,
    ) -> Decimal {
        let notional = Self::calculate_notional(decision, account_equity);
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
    fn calculate_portfolio_exposure(request: &ConstraintCheckRequest) -> (Decimal, Decimal) {
        let mut gross = Decimal::ZERO;
        let mut net = Decimal::ZERO;

        for decision in &request.plan.decisions {
            if matches!(decision.action, Action::Hold | Action::NoTrade) {
                continue;
            }

            let notional = Self::calculate_notional(decision, &request.account_equity);
            let signed = Self::calculate_signed_notional(decision, &request.account_equity);

            gross += notional.abs();
            net += signed;
        }

        (gross, net)
    }
}

// ============================================================================
// Risk Limits (per-trade risk, risk-reward ratio, correlation)
// ============================================================================
//
// These risk limit functions are complete but not yet integrated into the
// main constraint validation flow. They will be enabled in a future phase.

/// Configuration for risk limits enforcement.
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskLimitsConfig {
    /// Maximum percentage of account equity at risk per trade (default: 2.0%).
    pub max_per_trade_risk_pct: f64,
    /// Minimum risk-reward ratio (default: 1.5).
    pub min_risk_reward_ratio: f64,
    /// Maximum average correlation before position size reduction (default: 0.7).
    pub max_correlation: f64,
    /// Position size reduction factor when correlation exceeds threshold (default: 0.5).
    pub correlation_size_reduction: f64,
}

impl Default for RiskLimitsConfig {
    fn default() -> Self {
        Self {
            max_per_trade_risk_pct: 2.0,
            min_risk_reward_ratio: 1.5,
            max_correlation: 0.7,
            correlation_size_reduction: 0.5,
        }
    }
}

/// Result of per-trade risk validation.
#[allow(dead_code)]
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
/// Formula: Risk = Position Size × |Entry Price - Stop Loss Price| / Entry Price
/// Risk % = Risk Amount / Account Equity × 100
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
#[allow(dead_code)]
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

    // Calculate total risk amount (position value × risk percentage)
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
#[allow(dead_code)]
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
#[allow(dead_code)]
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

/// Result of correlation check.
#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct CorrelationResult {
    /// Average pairwise correlation.
    pub average_correlation: f64,
    /// Whether correlation exceeds the threshold.
    pub exceeds_threshold: bool,
    /// Suggested position size multiplier (1.0 if no reduction needed).
    pub size_multiplier: f64,
    /// The configured threshold.
    pub threshold: f64,
}

/// Calculate average pairwise correlation from returns.
///
/// Returns the average correlation coefficient across all pairs.
/// If less than 2 instruments, returns 0.0 (no correlation check needed).
///
/// # Arguments
///
/// * `returns` - Map of instrument ID to vector of returns
/// * `max_correlation` - Correlation threshold (default: 0.7)
/// * `size_reduction` - Size reduction factor when threshold exceeded (default: 0.5)
#[must_use]
#[allow(dead_code)]
pub fn calculate_correlation_adjustment(
    returns: &std::collections::HashMap<String, Vec<f64>>,
    max_correlation: f64,
    size_reduction: f64,
) -> CorrelationResult {
    let instruments: Vec<_> = returns.keys().collect();

    // Need at least 2 instruments for correlation
    if instruments.len() < 2 {
        return CorrelationResult {
            average_correlation: 0.0,
            exceeds_threshold: false,
            size_multiplier: 1.0,
            threshold: max_correlation,
        };
    }

    let mut total_correlation = 0.0;
    let mut pair_count = 0;

    // Calculate pairwise correlations
    for i in 0..instruments.len() {
        for j in (i + 1)..instruments.len() {
            if let (Some(returns_i), Some(returns_j)) =
                (returns.get(instruments[i]), returns.get(instruments[j]))
                && let Some(corr) = pearson_correlation(returns_i, returns_j)
            {
                total_correlation += corr.abs();
                pair_count += 1;
            }
        }
    }

    let average_correlation = if pair_count > 0 {
        // Use From for infallible i32 -> f64 conversion
        total_correlation / f64::from(pair_count)
    } else {
        0.0
    };

    let exceeds_threshold = average_correlation > max_correlation;
    let size_multiplier = if exceeds_threshold {
        size_reduction
    } else {
        1.0
    };

    CorrelationResult {
        average_correlation,
        exceeds_threshold,
        size_multiplier,
        threshold: max_correlation,
    }
}

/// Calculate Pearson correlation coefficient between two series.
#[allow(dead_code, clippy::cast_precision_loss)]
fn pearson_correlation(x: &[f64], y: &[f64]) -> Option<f64> {
    let n = x.len().min(y.len());
    if n < 2 {
        return None;
    }

    // Precision loss acceptable for statistical calculation (approximate metric)
    let mean_x: f64 = x.iter().take(n).sum::<f64>() / n as f64;
    let mean_y: f64 = y.iter().take(n).sum::<f64>() / n as f64;

    let mut cov = 0.0;
    let mut var_x = 0.0;
    let mut var_y = 0.0;

    for i in 0..n {
        let dx = x[i] - mean_x;
        let dy = y[i] - mean_y;
        cov += dx * dy;
        var_x += dx * dx;
        var_y += dy * dy;
    }

    if var_x == 0.0 || var_y == 0.0 {
        return None;
    }

    Some(cov / (var_x.sqrt() * var_y.sqrt()))
}

/// Validate per-trade risk for a decision.
///
/// Returns a constraint violation if risk exceeds the configured limit.
#[must_use]
#[allow(dead_code)]
pub fn validate_per_trade_risk(
    decision: &crate::models::Decision,
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
#[allow(dead_code)]
pub fn validate_risk_reward_ratio(
    decision: &crate::models::Decision,
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

    // ============ Net Exposure Tests ============

    #[test]
    fn test_net_exposure_calculation() {
        let validator = ConstraintValidator::with_defaults();

        // Create a balanced portfolio: $8k long + $8k short = $16k gross, $0 net
        // Using $8k each to stay under 10% per-instrument equity limit ($100k * 10% = $10k)
        let mut long_decision = make_decision("AAPL", Decimal::new(8_000, 0));
        long_decision.direction = Direction::Long;

        // For short position: use Buy action with Short direction
        // (opening a short position is still an entry)
        let mut short_decision = make_decision("MSFT", Decimal::new(8_000, 0));
        short_decision.direction = Direction::Short;
        short_decision.instrument_id = "MSFT".to_string();
        short_decision.decision_id = "d2".to_string();
        // Keep action as Buy (opening the position)

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

        // Net limit is $250k, create $300k long exposure
        let mut decision = make_decision("AAPL", Decimal::new(300_000, 0));
        decision.direction = Direction::Long;

        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(1_000_000, 0), // Large equity to avoid per-position limits
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

    // ============ Conflicting Orders Tests ============

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

    // ============ Greeks Limits Tests ============

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

    // ============ Buying Power Tests ============

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

    // ============ Unit Limit Tests ============

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

    // ============ Position Mismatch Tests ============

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

    // ============ Edge Cases ============

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

    // ============ Sizing Sanity Tests ============

    #[test]
    fn test_calculate_median_odd() {
        let values = vec![
            Decimal::new(10_000, 0),
            Decimal::new(20_000, 0),
            Decimal::new(15_000, 0),
            Decimal::new(25_000, 0),
            Decimal::new(18_000, 0),
        ];
        let median = super::calculate_median(&values);
        assert_eq!(median, Some(Decimal::new(18_000, 0)));
    }

    #[test]
    fn test_calculate_median_even() {
        let values = vec![
            Decimal::new(10_000, 0),
            Decimal::new(20_000, 0),
            Decimal::new(15_000, 0),
            Decimal::new(25_000, 0),
        ];
        let median = super::calculate_median(&values);
        assert_eq!(median, Some(Decimal::new(17_500, 0)));
    }

    #[test]
    fn test_calculate_median_empty() {
        let values: Vec<Decimal> = vec![];
        let median = super::calculate_median(&values);
        assert_eq!(median, None);
    }

    #[test]
    fn test_sizing_sanity_within_limit() {
        let historical = vec![
            Decimal::new(10_000, 0),
            Decimal::new(12_000, 0),
            Decimal::new(11_000, 0),
            Decimal::new(13_000, 0),
            Decimal::new(10_500, 0),
        ];
        let threshold = Decimal::new(30, 1); // 3.0

        // Proposed $25k is ~2.3x median $11k - within threshold
        let result = super::check_sizing_sanity(Decimal::new(25_000, 0), &historical, threshold);
        assert!(result.is_none());
    }

    #[test]
    fn test_sizing_sanity_exceeds_limit() {
        let historical = vec![
            Decimal::new(10_000, 0),
            Decimal::new(12_000, 0),
            Decimal::new(11_000, 0),
            Decimal::new(13_000, 0),
            Decimal::new(10_500, 0),
        ];
        let threshold = Decimal::new(30, 1); // 3.0

        // Proposed $50k is ~4.5x median $11k - exceeds 3x threshold
        let result = super::check_sizing_sanity(Decimal::new(50_000, 0), &historical, threshold);
        let Some(warning) = result else {
            panic!("sizing sanity check should detect warning");
        };
        assert!(warning.size_multiplier > Decimal::new(4, 0));
        assert_eq!(warning.threshold, Decimal::new(30, 1));
    }

    #[test]
    fn test_sizing_sanity_insufficient_history() {
        // Less than 5 historical data points
        let historical = vec![
            Decimal::new(10_000, 0),
            Decimal::new(12_000, 0),
            Decimal::new(11_000, 0),
        ];
        let threshold = Decimal::new(30, 1);

        // Should return None (can't assess with insufficient data)
        let result = super::check_sizing_sanity(Decimal::new(100_000, 0), &historical, threshold);
        assert!(result.is_none());
    }

    // ============ Risk Limits Tests ============

    #[test]
    fn test_per_trade_risk_within_limit() {
        // Entry $100, Stop $95, Position $10,000, Equity $100,000
        // Risk per share: ($100 - $95) / $100 = 5%
        // Risk amount: $10,000 × 5% = $500
        // Risk %: $500 / $100,000 × 100 = 0.5%
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
        // Risk amount: $50,000 × 10% = $5,000
        // Risk %: $5,000 / $100,000 × 100 = 5%
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
    fn test_correlation_adjustment_single_instrument() {
        let mut returns = std::collections::HashMap::new();
        returns.insert("AAPL".to_string(), vec![0.01, 0.02, -0.01, 0.015]);

        let result = calculate_correlation_adjustment(&returns, 0.7, 0.5);

        assert!(!result.exceeds_threshold);
        assert!((result.size_multiplier - 1.0).abs() < f64::EPSILON);
        assert!((result.average_correlation - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_correlation_adjustment_high_correlation() {
        let mut returns = std::collections::HashMap::new();
        // Highly correlated returns (almost identical)
        returns.insert("AAPL".to_string(), vec![0.01, 0.02, -0.01, 0.015, 0.005]);
        returns.insert("MSFT".to_string(), vec![0.012, 0.019, -0.011, 0.014, 0.006]);

        let result = calculate_correlation_adjustment(&returns, 0.7, 0.5);

        assert!(result.exceeds_threshold);
        assert!((result.size_multiplier - 0.5).abs() < f64::EPSILON);
        assert!(result.average_correlation > 0.7);
    }

    #[test]
    fn test_correlation_adjustment_low_correlation() {
        let mut returns = std::collections::HashMap::new();
        // Uncorrelated returns
        returns.insert("AAPL".to_string(), vec![0.01, 0.02, -0.01, 0.015, 0.005]);
        returns.insert("GLD".to_string(), vec![-0.005, 0.01, 0.02, -0.015, 0.008]);

        let result = calculate_correlation_adjustment(&returns, 0.7, 0.5);

        assert!(!result.exceeds_threshold);
        assert!((result.size_multiplier - 1.0).abs() < f64::EPSILON);
        assert!(result.average_correlation < 0.7);
    }

    #[test]
    fn test_pearson_correlation_positive() {
        // Perfectly correlated: x = y
        let x = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let y = vec![1.0, 2.0, 3.0, 4.0, 5.0];

        let Some(corr) = super::pearson_correlation(&x, &y) else {
            panic!("correlation should be computable for valid data");
        };
        assert!((corr - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_pearson_correlation_negative() {
        // Perfectly negative correlated
        let x = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        let y = vec![5.0, 4.0, 3.0, 2.0, 1.0];

        let Some(corr) = super::pearson_correlation(&x, &y) else {
            panic!("correlation should be computable for valid data");
        };
        assert!((corr + 1.0).abs() < 0.001);
    }

    #[test]
    fn test_pearson_correlation_insufficient_data() {
        let x = vec![1.0];
        let y = vec![1.0];

        let corr = super::pearson_correlation(&x, &y);
        assert!(corr.is_none());
    }

    #[test]
    fn test_risk_limits_config_defaults() {
        let config = RiskLimitsConfig::default();
        assert!((config.max_per_trade_risk_pct - 2.0).abs() < f64::EPSILON);
        assert!((config.min_risk_reward_ratio - 1.5).abs() < f64::EPSILON);
        assert!((config.max_correlation - 0.7).abs() < f64::EPSILON);
        assert!((config.correlation_size_reduction - 0.5).abs() < f64::EPSILON);
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
