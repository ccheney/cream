//! Constraint validation types.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::DecisionPlan;

/// Per-instrument exposure limits.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerInstrumentLimits {
    /// Maximum units/contracts per instrument.
    pub max_units: u32,
    /// Maximum notional value per instrument.
    pub max_notional: Decimal,
    /// Maximum percentage of equity per instrument.
    pub max_pct_equity: Decimal,
}

impl Default for PerInstrumentLimits {
    fn default() -> Self {
        Self {
            max_units: 1000,
            max_notional: Decimal::new(50000, 0),
            max_pct_equity: Decimal::new(10, 2), // 0.10 = 10%
        }
    }
}

/// Portfolio-level exposure limits.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortfolioLimits {
    /// Maximum gross notional (sum of absolute values).
    pub max_gross_notional: Decimal,
    /// Maximum net notional (long - short).
    pub max_net_notional: Decimal,
    /// Maximum gross exposure as % of equity.
    pub max_pct_equity_gross: Decimal,
    /// Maximum net exposure as % of equity.
    pub max_pct_equity_net: Decimal,
}

impl Default for PortfolioLimits {
    fn default() -> Self {
        Self {
            max_gross_notional: Decimal::new(500_000, 0),
            max_net_notional: Decimal::new(250_000, 0),
            max_pct_equity_gross: Decimal::new(200, 2), // 2.0 = 200%
            max_pct_equity_net: Decimal::new(100, 2),   // 1.0 = 100%
        }
    }
}

/// Options-specific limits.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptionsLimits {
    /// Maximum delta-adjusted notional.
    pub max_delta_notional: Decimal,
    /// Maximum gamma exposure.
    pub max_gamma: Decimal,
    /// Maximum vega exposure.
    pub max_vega: Decimal,
    /// Maximum theta (daily time decay, negative for long).
    pub max_theta: Decimal,
}

impl Default for OptionsLimits {
    fn default() -> Self {
        Self {
            max_delta_notional: Decimal::new(100_000, 0),
            max_gamma: Decimal::new(1000, 0),
            max_vega: Decimal::new(5000, 0),
            max_theta: Decimal::new(-500, 0),
        }
    }
}

/// Position sizing sanity check limits.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SizingLimits {
    /// Multiplier for flagging unusually large positions.
    /// Positions > multiplier * `typical_size` trigger warnings.
    pub sanity_threshold_multiplier: Decimal,
}

impl Default for SizingLimits {
    fn default() -> Self {
        Self {
            sanity_threshold_multiplier: Decimal::new(30, 1), // 3.0
        }
    }
}

/// Complete exposure limits configuration.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ExposureLimits {
    /// Per-instrument limits.
    pub per_instrument: PerInstrumentLimits,
    /// Portfolio limits.
    pub portfolio: PortfolioLimits,
    /// Options limits.
    pub options: OptionsLimits,
    /// Sizing sanity limits.
    pub sizing: SizingLimits,
}

/// Constraint violation severity.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ViolationSeverity {
    /// Warning - can proceed with caution.
    Warning,
    /// Error - must reject the plan.
    Error,
}

/// A single constraint violation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConstraintViolation {
    /// Violation code (e.g., `"PER_INSTRUMENT_NOTIONAL_EXCEEDED"`).
    pub code: String,
    /// Violation severity.
    pub severity: ViolationSeverity,
    /// Human-readable message.
    pub message: String,
    /// Instrument ID (empty for portfolio-level).
    pub instrument_id: String,
    /// Field path in the plan (e.g., "decisions[3].size.quantity").
    pub field_path: String,
    /// Observed value that violated the constraint.
    pub observed: String,
    /// Configured limit.
    pub limit: String,
}

/// Request to check constraints.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConstraintCheckRequest {
    /// Request ID.
    pub request_id: String,
    /// Cycle ID.
    pub cycle_id: String,
    /// Risk policy ID to use.
    pub risk_policy_id: String,
    /// Current account equity.
    pub account_equity: Decimal,
    /// Decision plan to validate.
    pub plan: DecisionPlan,
}

/// Response from constraint check.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConstraintCheckResponse {
    /// Whether all constraints passed.
    pub ok: bool,
    /// List of violations (empty if ok=true).
    pub violations: Vec<ConstraintViolation>,
}

impl ConstraintCheckResponse {
    /// Create a successful response with no violations.
    #[must_use]
    pub fn success() -> Self {
        Self {
            ok: true,
            violations: vec![],
        }
    }

    /// Create a failed response with violations.
    #[must_use]
    pub fn failure(violations: Vec<ConstraintViolation>) -> Self {
        Self {
            ok: false,
            violations,
        }
    }

    /// Returns true if there are any error-level violations.
    #[must_use]
    pub fn has_errors(&self) -> bool {
        self.violations
            .iter()
            .any(|v| v.severity == ViolationSeverity::Error)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_constraint_response_success() {
        let response = ConstraintCheckResponse::success();
        assert!(response.ok);
        assert!(response.violations.is_empty());
        assert!(!response.has_errors());
    }

    #[test]
    fn test_constraint_response_failure() {
        let violation = ConstraintViolation {
            code: "TEST".to_string(),
            severity: ViolationSeverity::Error,
            message: "Test violation".to_string(),
            instrument_id: "AAPL".to_string(),
            field_path: "decisions[0]".to_string(),
            observed: "100".to_string(),
            limit: "50".to_string(),
        };
        let response = ConstraintCheckResponse::failure(vec![violation]);
        assert!(!response.ok);
        assert!(response.has_errors());
    }
}
