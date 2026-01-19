//! VWAP Tactic Configuration

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

/// Configuration for VWAP tactic.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VwapConfig {
    /// Maximum percentage of ADV per interval (0.01 to 0.50).
    pub max_pct_volume: Decimal,
    /// Window start time (optional, defaults to now).
    pub start_time: Option<DateTime<Utc>>,
    /// Window end time (optional, defaults to market close).
    pub end_time: Option<DateTime<Utc>>,
    /// Only post, never cross (passive only).
    pub no_take_liquidity: bool,
}

impl Default for VwapConfig {
    fn default() -> Self {
        Self {
            max_pct_volume: Decimal::new(10, 2), // 0.10 (10%)
            start_time: None,
            end_time: None,
            no_take_liquidity: false,
        }
    }
}

impl VwapConfig {
    /// Create a new VWAP configuration.
    #[must_use]
    pub const fn new(
        max_pct_volume: Decimal,
        start_time: Option<DateTime<Utc>>,
        end_time: Option<DateTime<Utc>>,
        no_take_liquidity: bool,
    ) -> Self {
        Self {
            max_pct_volume,
            start_time,
            end_time,
            no_take_liquidity,
        }
    }

    /// Create a VWAP configuration with a specific participation rate.
    #[must_use]
    pub fn with_participation_rate(rate: Decimal) -> Self {
        Self {
            max_pct_volume: rate,
            ..Default::default()
        }
    }

    /// Calculate the maximum quantity for next interval based on recent volume.
    ///
    /// # Arguments
    /// * `recent_volume` - Volume in the recent interval
    /// * `remaining_quantity` - Quantity still to be filled
    ///
    /// # Returns
    /// The maximum quantity to submit in the next interval.
    #[must_use]
    pub fn calculate_participation_quantity(
        &self,
        recent_volume: Decimal,
        remaining_quantity: Decimal,
    ) -> Decimal {
        let max_quantity = recent_volume * self.max_pct_volume;
        max_quantity.min(remaining_quantity)
    }

    /// Check if execution window has ended.
    #[must_use]
    pub fn is_window_ended(&self) -> bool {
        self.end_time.is_some_and(|end_time| Utc::now() >= end_time)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vwap_config_default() {
        let config = VwapConfig::default();
        assert_eq!(config.max_pct_volume, Decimal::new(10, 2));
        assert!(config.start_time.is_none());
        assert!(config.end_time.is_none());
        assert!(!config.no_take_liquidity);
    }

    #[test]
    fn vwap_config_with_participation_rate() {
        let config = VwapConfig::with_participation_rate(Decimal::new(5, 2));
        assert_eq!(config.max_pct_volume, Decimal::new(5, 2));
    }

    #[test]
    fn calculate_participation_quantity_limited_by_volume() {
        let config = VwapConfig::default();
        let recent_volume = Decimal::new(10000, 0);
        let remaining_quantity = Decimal::new(5000, 0);

        let quantity = config.calculate_participation_quantity(recent_volume, remaining_quantity);

        // Should be min(10000 * 0.10, 5000) = 1000
        assert_eq!(quantity, Decimal::new(1000, 0));
    }

    #[test]
    fn calculate_participation_quantity_limited_by_remaining() {
        let config = VwapConfig::default();
        let recent_volume = Decimal::new(10000, 0);
        let remaining_quantity = Decimal::new(500, 0);

        let quantity = config.calculate_participation_quantity(recent_volume, remaining_quantity);

        // Should be min(10000 * 0.10, 500) = 500
        assert_eq!(quantity, Decimal::new(500, 0));
    }

    #[test]
    fn is_window_ended_false_when_no_end_time() {
        let config = VwapConfig::default();
        assert!(!config.is_window_ended());
    }

    #[test]
    fn is_window_ended_false_when_future() {
        let config = VwapConfig::new(
            Decimal::new(10, 2),
            None,
            Some(Utc::now() + chrono::TimeDelta::hours(1)),
            false,
        );
        assert!(!config.is_window_ended());
    }

    #[test]
    fn vwap_config_serde() {
        let config = VwapConfig::with_participation_rate(Decimal::new(15, 2));
        let json = serde_json::to_string(&config).unwrap();
        let parsed: VwapConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, config);
    }
}
