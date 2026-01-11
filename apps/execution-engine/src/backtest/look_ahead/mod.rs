//! Look-ahead bias prevention for backtest simulation.
//!
//! This module provides validation to ensure backtests only use information
//! that was available at the time of each decision, preventing the use of
//! future data that would invalidate backtest results.
//!
//! # Look-Ahead Bias
//!
//! Look-ahead bias occurs when a backtest uses information that was not
//! available at the time of the trading decision. Common examples include:
//!
//! - Using earnings data before the earnings release time
//! - Using restated financials instead of originally reported values
//! - Using revised index constituents (e.g., current S&P 500 members for 2020 trades)
//! - Using adjusted prices for splits/dividends before announcement
//!
//! # Point-in-Time Data
//!
//! All data used in backtesting should be "point-in-time" - reflecting only
//! what was known at that moment. This prevents artificial alpha from
//! information that traders could not have accessed.

mod checker;
mod helpers;
mod types;
mod validation;

pub use checker::LookAheadChecker;
pub use types::{
    DataAccessRecord, EarningsRelease, EarningsReleaseTiming, FundamentalDataAvailability,
    LookAheadConfig, LookAheadError, LookAheadSummary, ValidationResult,
};
pub use validation::{
    check_earnings_availability, check_fundamental_availability, validate_data_timestamp,
    validate_universe_constituents,
};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_look_ahead_error_display() {
        let error = LookAheadError::FutureData {
            data_timestamp: "2025-06-01T12:00:00Z".to_string(),
            decision_timestamp: "2025-06-01T10:00:00Z".to_string(),
            data_type: "candle".to_string(),
        };
        let display = format!("{error}");
        assert!(display.contains("FUTURE_DATA"));
        assert!(display.contains("12:00:00"));
    }

    #[test]
    fn test_look_ahead_summary_display() {
        let summary = LookAheadSummary {
            total_accesses: 100,
            valid_accesses: 98,
            violations: 2,
            warnings: 5,
        };
        let display = format!("{summary}");
        assert!(display.contains("98/100"));
        assert!(display.contains("2 violations"));
        assert!(display.contains("5 warnings"));
    }

    #[test]
    fn test_validation_result_chaining() {
        let result = ValidationResult::pass()
            .with_warning("Warning 1")
            .with_warning("Warning 2");
        assert!(result.valid);
        assert_eq!(result.warnings.len(), 2);
    }
}
