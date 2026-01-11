//! Options Greeks constraint validation.
//!
//! Validates options-specific exposure limits:
//! - Delta-adjusted notional exposure
//! - Gamma exposure
//! - Vega exposure
//! - Theta (time decay) limits

use crate::models::{ConstraintViolation, ExposureLimits, ViolationSeverity};

use super::types::GreeksSnapshot;

/// Check all Greeks limits and return any violations.
pub(crate) fn check_greeks_limits(
    greeks: &GreeksSnapshot,
    limits: &ExposureLimits,
) -> Vec<ConstraintViolation> {
    let mut violations = Vec::new();

    if let Some(v) = check_delta_limit(greeks, limits) {
        violations.push(v);
    }
    if let Some(v) = check_gamma_limit(greeks, limits) {
        violations.push(v);
    }
    if let Some(v) = check_vega_limit(greeks, limits) {
        violations.push(v);
    }
    if let Some(v) = check_theta_limit(greeks, limits) {
        violations.push(v);
    }

    violations
}

/// Check delta-adjusted notional limit.
fn check_delta_limit(
    greeks: &GreeksSnapshot,
    limits: &ExposureLimits,
) -> Option<ConstraintViolation> {
    if greeks.delta_notional.abs() > limits.options.max_delta_notional {
        Some(ConstraintViolation {
            code: "OPTIONS_DELTA_EXCEEDED".to_string(),
            severity: ViolationSeverity::Error,
            message: format!(
                "Delta-adjusted notional ${} exceeds limit ${}",
                greeks.delta_notional.abs(),
                limits.options.max_delta_notional
            ),
            instrument_id: String::new(),
            field_path: "portfolio.greeks.delta_notional".to_string(),
            observed: greeks.delta_notional.to_string(),
            limit: format!("±{}", limits.options.max_delta_notional),
        })
    } else {
        None
    }
}

/// Check gamma limit.
fn check_gamma_limit(
    greeks: &GreeksSnapshot,
    limits: &ExposureLimits,
) -> Option<ConstraintViolation> {
    if greeks.gamma.abs() > limits.options.max_gamma {
        Some(ConstraintViolation {
            code: "OPTIONS_GAMMA_EXCEEDED".to_string(),
            severity: ViolationSeverity::Error,
            message: format!(
                "Gamma {} exceeds limit {}",
                greeks.gamma.abs(),
                limits.options.max_gamma
            ),
            instrument_id: String::new(),
            field_path: "portfolio.greeks.gamma".to_string(),
            observed: greeks.gamma.to_string(),
            limit: format!("±{}", limits.options.max_gamma),
        })
    } else {
        None
    }
}

/// Check vega limit.
fn check_vega_limit(
    greeks: &GreeksSnapshot,
    limits: &ExposureLimits,
) -> Option<ConstraintViolation> {
    if greeks.vega.abs() > limits.options.max_vega {
        Some(ConstraintViolation {
            code: "OPTIONS_VEGA_EXCEEDED".to_string(),
            severity: ViolationSeverity::Error,
            message: format!(
                "Vega {} exceeds limit {}",
                greeks.vega.abs(),
                limits.options.max_vega
            ),
            instrument_id: String::new(),
            field_path: "portfolio.greeks.vega".to_string(),
            observed: greeks.vega.to_string(),
            limit: format!("±{}", limits.options.max_vega),
        })
    } else {
        None
    }
}

/// Check theta limit.
///
/// Theta is typically negative for long options (time decay).
/// The limit is expressed as the maximum negative value allowed.
fn check_theta_limit(
    greeks: &GreeksSnapshot,
    limits: &ExposureLimits,
) -> Option<ConstraintViolation> {
    if greeks.theta < limits.options.max_theta {
        Some(ConstraintViolation {
            code: "OPTIONS_THETA_EXCEEDED".to_string(),
            severity: ViolationSeverity::Error,
            message: format!(
                "Theta {} exceeds decay limit {}",
                greeks.theta, limits.options.max_theta
            ),
            instrument_id: String::new(),
            field_path: "portfolio.greeks.theta".to_string(),
            observed: greeks.theta.to_string(),
            limit: format!("≥{}", limits.options.max_theta),
        })
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{OptionsLimits, PerInstrumentLimits, PortfolioLimits, SizingLimits};
    use rust_decimal::Decimal;

    fn default_limits() -> ExposureLimits {
        ExposureLimits {
            per_instrument: PerInstrumentLimits::default(),
            portfolio: PortfolioLimits::default(),
            options: OptionsLimits {
                max_delta_notional: Decimal::new(100_000, 0),
                max_gamma: Decimal::new(1_000, 0),
                max_vega: Decimal::new(5_000, 0),
                max_theta: Decimal::new(-500, 0),
            },
            sizing: SizingLimits::default(),
        }
    }

    #[test]
    fn test_delta_within_limit() {
        let greeks = GreeksSnapshot {
            delta_notional: Decimal::new(50_000, 0),
            gamma: Decimal::ZERO,
            vega: Decimal::ZERO,
            theta: Decimal::ZERO,
        };
        let limits = default_limits();
        let result = check_delta_limit(&greeks, &limits);
        assert!(result.is_none());
    }

    #[test]
    fn test_delta_exceeded() {
        let greeks = GreeksSnapshot {
            delta_notional: Decimal::new(150_000, 0),
            gamma: Decimal::ZERO,
            vega: Decimal::ZERO,
            theta: Decimal::ZERO,
        };
        let limits = default_limits();
        let result = check_delta_limit(&greeks, &limits);
        assert!(result.is_some());
        assert_eq!(result.unwrap().code, "OPTIONS_DELTA_EXCEEDED");
    }

    #[test]
    fn test_gamma_within_limit() {
        let greeks = GreeksSnapshot {
            delta_notional: Decimal::ZERO,
            gamma: Decimal::new(500, 0),
            vega: Decimal::ZERO,
            theta: Decimal::ZERO,
        };
        let limits = default_limits();
        let result = check_gamma_limit(&greeks, &limits);
        assert!(result.is_none());
    }

    #[test]
    fn test_gamma_exceeded() {
        let greeks = GreeksSnapshot {
            delta_notional: Decimal::ZERO,
            gamma: Decimal::new(2_000, 0),
            vega: Decimal::ZERO,
            theta: Decimal::ZERO,
        };
        let limits = default_limits();
        let result = check_gamma_limit(&greeks, &limits);
        assert!(result.is_some());
        assert_eq!(result.unwrap().code, "OPTIONS_GAMMA_EXCEEDED");
    }

    #[test]
    fn test_vega_within_limit() {
        let greeks = GreeksSnapshot {
            delta_notional: Decimal::ZERO,
            gamma: Decimal::ZERO,
            vega: Decimal::new(2_000, 0),
            theta: Decimal::ZERO,
        };
        let limits = default_limits();
        let result = check_vega_limit(&greeks, &limits);
        assert!(result.is_none());
    }

    #[test]
    fn test_vega_exceeded() {
        let greeks = GreeksSnapshot {
            delta_notional: Decimal::ZERO,
            gamma: Decimal::ZERO,
            vega: Decimal::new(7_000, 0),
            theta: Decimal::ZERO,
        };
        let limits = default_limits();
        let result = check_vega_limit(&greeks, &limits);
        assert!(result.is_some());
        assert_eq!(result.unwrap().code, "OPTIONS_VEGA_EXCEEDED");
    }

    #[test]
    fn test_theta_within_limit() {
        let greeks = GreeksSnapshot {
            delta_notional: Decimal::ZERO,
            gamma: Decimal::ZERO,
            vega: Decimal::ZERO,
            theta: Decimal::new(-200, 0),
        };
        let limits = default_limits();
        let result = check_theta_limit(&greeks, &limits);
        assert!(result.is_none());
    }

    #[test]
    fn test_theta_exceeded() {
        let greeks = GreeksSnapshot {
            delta_notional: Decimal::ZERO,
            gamma: Decimal::ZERO,
            vega: Decimal::ZERO,
            theta: Decimal::new(-1_000, 0),
        };
        let limits = default_limits();
        let result = check_theta_limit(&greeks, &limits);
        assert!(result.is_some());
        assert_eq!(result.unwrap().code, "OPTIONS_THETA_EXCEEDED");
    }

    #[test]
    fn test_all_greeks_within_limits() {
        let greeks = GreeksSnapshot {
            delta_notional: Decimal::new(50_000, 0),
            gamma: Decimal::new(500, 0),
            vega: Decimal::new(2_000, 0),
            theta: Decimal::new(-200, 0),
        };
        let limits = default_limits();
        let violations = check_greeks_limits(&greeks, &limits);
        assert!(violations.is_empty());
    }

    #[test]
    fn test_multiple_greeks_exceeded() {
        let greeks = GreeksSnapshot {
            delta_notional: Decimal::new(150_000, 0),
            gamma: Decimal::new(2_000, 0),
            vega: Decimal::ZERO,
            theta: Decimal::ZERO,
        };
        let limits = default_limits();
        let violations = check_greeks_limits(&greeks, &limits);
        assert_eq!(violations.len(), 2);
        assert!(
            violations
                .iter()
                .any(|v| v.code == "OPTIONS_DELTA_EXCEEDED")
        );
        assert!(
            violations
                .iter()
                .any(|v| v.code == "OPTIONS_GAMMA_EXCEEDED")
        );
    }
}
