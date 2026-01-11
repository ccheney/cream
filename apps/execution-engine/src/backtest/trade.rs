//! Trade record types for backtest simulation.

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

/// Trade record for backtest output.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimTrade {
    /// Trade ID.
    pub trade_id: String,
    /// Instrument ID.
    pub instrument_id: String,
    /// Trade side.
    pub side: String,
    /// Entry time.
    pub entry_time: String,
    /// Entry price.
    pub entry_price: Decimal,
    /// Entry slippage.
    pub entry_slippage: Decimal,
    /// Exit time.
    pub exit_time: String,
    /// Exit price.
    pub exit_price: Decimal,
    /// Exit slippage.
    pub exit_slippage: Decimal,
    /// Exit reason.
    pub exit_reason: String,
    /// Quantity.
    pub quantity: Decimal,
    /// Gross P&L.
    pub gross_pnl: Decimal,
    /// Commission paid.
    pub commission: Decimal,
    /// Net P&L.
    pub net_pnl: Decimal,
    /// Holding period in hours.
    pub holding_period_hours: f64,
}

/// Calculate holding period in hours between two RFC3339 timestamps.
///
/// Returns 0.0 if either timestamp cannot be parsed.
#[must_use]
pub fn calculate_holding_period_hours(entry_time: &str, exit_time: &str) -> f64 {
    let entry: DateTime<Utc> = match entry_time.parse() {
        Ok(dt) => dt,
        Err(_) => return 0.0,
    };
    let exit: DateTime<Utc> = match exit_time.parse() {
        Ok(dt) => dt,
        Err(_) => return 0.0,
    };

    let duration = exit.signed_duration_since(entry);
    #[allow(clippy::cast_precision_loss)]
    let hours = duration.num_seconds() as f64 / 3600.0;

    if hours < 0.0 { 0.0 } else { hours }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_holding_period_hours_valid() {
        let entry = "2026-01-05T10:00:00Z";
        let exit = "2026-01-05T14:00:00Z";
        let hours = calculate_holding_period_hours(entry, exit);
        assert!((hours - 4.0).abs() < 0.001);
    }

    #[test]
    fn test_calculate_holding_period_hours_multi_day() {
        let entry = "2026-01-05T10:00:00Z";
        let exit = "2026-01-06T10:00:00Z";
        let hours = calculate_holding_period_hours(entry, exit);
        assert!((hours - 24.0).abs() < 0.001);
    }

    #[test]
    fn test_calculate_holding_period_hours_fractional() {
        let entry = "2026-01-05T10:00:00Z";
        let exit = "2026-01-05T10:30:00Z";
        let hours = calculate_holding_period_hours(entry, exit);
        assert!((hours - 0.5).abs() < 0.001);
    }

    #[test]
    fn test_calculate_holding_period_hours_invalid_entry() {
        let entry = "not-a-valid-timestamp";
        let exit = "2026-01-05T14:00:00Z";
        let hours = calculate_holding_period_hours(entry, exit);
        assert!((hours - 0.0).abs() < 0.001);
    }

    #[test]
    fn test_calculate_holding_period_hours_invalid_exit() {
        let entry = "2026-01-05T10:00:00Z";
        let exit = "invalid";
        let hours = calculate_holding_period_hours(entry, exit);
        assert!((hours - 0.0).abs() < 0.001);
    }

    #[test]
    fn test_calculate_holding_period_hours_negative_returns_zero() {
        let entry = "2026-01-05T14:00:00Z";
        let exit = "2026-01-05T10:00:00Z";
        let hours = calculate_holding_period_hours(entry, exit);
        assert!((hours - 0.0).abs() < 0.001);
    }
}
