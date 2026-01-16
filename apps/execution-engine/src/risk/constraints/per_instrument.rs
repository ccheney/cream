//! Per-instrument constraint validation.
//!
//! Validates individual decisions against per-instrument limits:
//! - Maximum notional value per instrument
//! - Maximum units (shares/contracts) per instrument
//! - Maximum percentage of equity per instrument

use rust_decimal::Decimal;

use crate::models::{
    Action, ConstraintViolation, Decision, ExposureLimits, SizeUnit, ViolationSeverity,
};

/// Check per-instrument notional limit.
///
/// Returns a violation if the calculated notional exceeds the per-instrument limit.
pub fn check_notional_limit(
    decision: &Decision,
    idx: usize,
    notional: Decimal,
    limits: &ExposureLimits,
) -> Option<ConstraintViolation> {
    if notional > limits.per_instrument.max_notional {
        Some(ConstraintViolation {
            code: "PER_INSTRUMENT_NOTIONAL_EXCEEDED".to_string(),
            severity: ViolationSeverity::Error,
            message: format!(
                "Notional ${notional} exceeds per-instrument limit ${}",
                limits.per_instrument.max_notional
            ),
            instrument_id: decision.instrument_id.clone(),
            field_path: format!("decisions[{idx}].size"),
            observed: notional.to_string(),
            limit: limits.per_instrument.max_notional.to_string(),
        })
    } else {
        None
    }
}

/// Check per-instrument unit limit.
///
/// Returns a violation if the number of shares/contracts exceeds the per-instrument limit.
pub fn check_unit_limit(
    decision: &Decision,
    idx: usize,
    limits: &ExposureLimits,
) -> Option<ConstraintViolation> {
    if matches!(decision.size.unit, SizeUnit::Shares | SizeUnit::Contracts) {
        let units = decision
            .size
            .quantity
            .to_string()
            .parse::<u32>()
            .unwrap_or(u32::MAX);
        if units > limits.per_instrument.max_units {
            return Some(ConstraintViolation {
                code: "PER_INSTRUMENT_UNITS_EXCEEDED".to_string(),
                severity: ViolationSeverity::Error,
                message: format!(
                    "Units {} exceeds per-instrument limit {}",
                    units, limits.per_instrument.max_units
                ),
                instrument_id: decision.instrument_id.clone(),
                field_path: format!("decisions[{idx}].size.quantity"),
                observed: units.to_string(),
                limit: limits.per_instrument.max_units.to_string(),
            });
        }
    }
    None
}

/// Check per-instrument equity percentage limit.
///
/// Returns a violation if the position exceeds the maximum percentage of account equity.
pub fn check_equity_percentage_limit(
    decision: &Decision,
    idx: usize,
    notional: Decimal,
    account_equity: Decimal,
    limits: &ExposureLimits,
) -> Option<ConstraintViolation> {
    if account_equity > Decimal::ZERO {
        let pct_equity = notional / account_equity;
        if pct_equity > limits.per_instrument.max_pct_equity {
            return Some(ConstraintViolation {
                code: "PER_INSTRUMENT_PCT_EQUITY_EXCEEDED".to_string(),
                severity: ViolationSeverity::Error,
                message: format!(
                    "Position {:.1}% of equity exceeds limit {:.1}%",
                    pct_equity * Decimal::new(100, 0),
                    limits.per_instrument.max_pct_equity * Decimal::new(100, 0)
                ),
                instrument_id: decision.instrument_id.clone(),
                field_path: format!("decisions[{idx}].size"),
                observed: format!("{pct_equity:.4}"),
                limit: limits.per_instrument.max_pct_equity.to_string(),
            });
        }
    }
    None
}

/// Check stop loss is set for entry actions (Buy/Sell).
pub fn check_stop_loss_required(decision: &Decision, idx: usize) -> Option<ConstraintViolation> {
    if matches!(decision.action, Action::Buy | Action::Sell)
        && decision.stop_loss_level == Decimal::ZERO
    {
        Some(ConstraintViolation {
            code: "MISSING_STOP_LOSS".to_string(),
            severity: ViolationSeverity::Error,
            message: "Stop loss level is required for new positions".to_string(),
            instrument_id: decision.instrument_id.clone(),
            field_path: format!("decisions[{idx}].stop_loss_level"),
            observed: "0".to_string(),
            limit: "must be set".to_string(),
        })
    } else {
        None
    }
}

/// Check confidence is within valid range (0 to 1).
pub fn check_confidence_valid(decision: &Decision, idx: usize) -> Option<ConstraintViolation> {
    if decision.confidence < Decimal::ZERO || decision.confidence > Decimal::ONE {
        Some(ConstraintViolation {
            code: "INVALID_CONFIDENCE".to_string(),
            severity: ViolationSeverity::Error,
            message: "Confidence must be between 0 and 1".to_string(),
            instrument_id: decision.instrument_id.clone(),
            field_path: format!("decisions[{idx}].confidence"),
            observed: decision.confidence.to_string(),
            limit: "0.0 to 1.0".to_string(),
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
        Direction, ExposureLimits, OptionsLimits, PerInstrumentLimits, PortfolioLimits, Size,
        SizingLimits, StrategyFamily, TimeHorizon,
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
            confidence: Decimal::new(75, 2),
        }
    }

    fn default_limits() -> ExposureLimits {
        ExposureLimits {
            per_instrument: PerInstrumentLimits {
                max_units: 1000,
                max_notional: Decimal::new(50_000, 0),
                max_pct_equity: Decimal::new(10, 2),
            },
            portfolio: PortfolioLimits::default(),
            options: OptionsLimits::default(),
            sizing: SizingLimits::default(),
        }
    }

    #[test]
    fn test_notional_within_limit() {
        let decision = make_decision("AAPL", Decimal::new(10_000, 0));
        let limits = default_limits();
        let result = check_notional_limit(&decision, 0, Decimal::new(10_000, 0), &limits);
        assert!(result.is_none());
    }

    #[test]
    fn test_notional_exceeded() {
        let decision = make_decision("AAPL", Decimal::new(60_000, 0));
        let limits = default_limits();
        let result = check_notional_limit(&decision, 0, Decimal::new(60_000, 0), &limits);
        assert!(result.is_some());
        assert_eq!(result.unwrap().code, "PER_INSTRUMENT_NOTIONAL_EXCEEDED");
    }

    #[test]
    fn test_units_within_limit() {
        let mut decision = make_decision("AAPL", Decimal::new(500, 0));
        decision.size.unit = SizeUnit::Shares;
        decision.size.quantity = Decimal::new(500, 0);
        let limits = default_limits();
        let result = check_unit_limit(&decision, 0, &limits);
        assert!(result.is_none());
    }

    #[test]
    fn test_units_exceeded() {
        let mut decision = make_decision("AAPL", Decimal::new(5_000, 0));
        decision.size.unit = SizeUnit::Shares;
        decision.size.quantity = Decimal::new(5_000, 0);
        let limits = default_limits();
        let result = check_unit_limit(&decision, 0, &limits);
        assert!(result.is_some());
        assert_eq!(result.unwrap().code, "PER_INSTRUMENT_UNITS_EXCEEDED");
    }

    #[test]
    fn test_equity_percentage_within_limit() {
        let decision = make_decision("AAPL", Decimal::new(5_000, 0));
        let limits = default_limits();
        let result = check_equity_percentage_limit(
            &decision,
            0,
            Decimal::new(5_000, 0),
            Decimal::new(100_000, 0),
            &limits,
        );
        assert!(result.is_none());
    }

    #[test]
    fn test_equity_percentage_exceeded() {
        let decision = make_decision("AAPL", Decimal::new(15_000, 0));
        let limits = default_limits();
        let result = check_equity_percentage_limit(
            &decision,
            0,
            Decimal::new(15_000, 0),
            Decimal::new(100_000, 0),
            &limits,
        );
        assert!(result.is_some());
        assert_eq!(result.unwrap().code, "PER_INSTRUMENT_PCT_EQUITY_EXCEEDED");
    }

    #[test]
    fn test_stop_loss_required_present() {
        let decision = make_decision("AAPL", Decimal::new(10_000, 0));
        let result = check_stop_loss_required(&decision, 0);
        assert!(result.is_none());
    }

    #[test]
    fn test_stop_loss_required_missing() {
        let mut decision = make_decision("AAPL", Decimal::new(10_000, 0));
        decision.stop_loss_level = Decimal::ZERO;
        let result = check_stop_loss_required(&decision, 0);
        assert!(result.is_some());
        assert_eq!(result.unwrap().code, "MISSING_STOP_LOSS");
    }

    #[test]
    fn test_confidence_valid() {
        let decision = make_decision("AAPL", Decimal::new(10_000, 0));
        let result = check_confidence_valid(&decision, 0);
        assert!(result.is_none());
    }

    #[test]
    fn test_confidence_invalid_negative() {
        let mut decision = make_decision("AAPL", Decimal::new(10_000, 0));
        decision.confidence = Decimal::new(-1, 1);
        let result = check_confidence_valid(&decision, 0);
        assert!(result.is_some());
        assert_eq!(result.unwrap().code, "INVALID_CONFIDENCE");
    }

    #[test]
    fn test_confidence_invalid_over_one() {
        let mut decision = make_decision("AAPL", Decimal::new(10_000, 0));
        decision.confidence = Decimal::new(15, 1);
        let result = check_confidence_valid(&decision, 0);
        assert!(result.is_some());
        assert_eq!(result.unwrap().code, "INVALID_CONFIDENCE");
    }
}
