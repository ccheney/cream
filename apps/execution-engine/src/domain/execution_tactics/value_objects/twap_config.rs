//! TWAP Tactic Configuration

use chrono::{DateTime, TimeDelta, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::SliceType;

/// Configuration for TWAP tactic.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TwapConfig {
    /// Total execution window (minutes).
    pub duration_minutes: u32,
    /// Time between slices (seconds).
    pub slice_interval_seconds: u32,
    /// Order type per slice ("limit" or "market").
    pub slice_type: SliceType,
    /// Continue after window if unfilled.
    pub allow_past_end: bool,
}

impl Default for TwapConfig {
    fn default() -> Self {
        Self {
            duration_minutes: 60,
            slice_interval_seconds: 60,
            slice_type: SliceType::Limit,
            allow_past_end: false,
        }
    }
}

impl TwapConfig {
    /// Create a new TWAP configuration.
    #[must_use]
    pub const fn new(
        duration_minutes: u32,
        slice_interval_seconds: u32,
        slice_type: SliceType,
        allow_past_end: bool,
    ) -> Self {
        Self {
            duration_minutes,
            slice_interval_seconds,
            slice_type,
            allow_past_end,
        }
    }

    /// Calculate the number of slices for a TWAP execution.
    #[must_use]
    pub const fn calculate_slice_count(&self) -> u32 {
        let total_seconds = self.duration_minutes * 60;
        total_seconds / self.slice_interval_seconds
    }

    /// Calculate the quantity per slice.
    #[must_use]
    pub fn calculate_slice_quantity(&self, total_quantity: Decimal) -> Decimal {
        total_quantity / Decimal::from(self.calculate_slice_count())
    }

    /// Calculate the execution schedule.
    ///
    /// Returns a vector of timestamps when each slice should be submitted.
    #[must_use]
    pub fn calculate_schedule(&self, start_time: DateTime<Utc>) -> Vec<DateTime<Utc>> {
        let slice_count = self.calculate_slice_count();
        let interval = TimeDelta::seconds(i64::from(self.slice_interval_seconds));

        (0..slice_count)
            .map(|i| start_time + interval * i32::try_from(i).unwrap_or(0))
            .collect()
    }

    /// Check if execution window has ended.
    #[must_use]
    pub fn is_window_ended(&self, start_time: DateTime<Utc>) -> bool {
        let end_time = start_time + TimeDelta::minutes(i64::from(self.duration_minutes));
        Utc::now() >= end_time
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn twap_config_default() {
        let config = TwapConfig::default();
        assert_eq!(config.duration_minutes, 60);
        assert_eq!(config.slice_interval_seconds, 60);
        assert_eq!(config.slice_type, SliceType::Limit);
        assert!(!config.allow_past_end);
    }

    #[test]
    fn twap_config_new() {
        let config = TwapConfig::new(30, 30, SliceType::Market, true);
        assert_eq!(config.duration_minutes, 30);
        assert_eq!(config.slice_interval_seconds, 30);
        assert_eq!(config.slice_type, SliceType::Market);
        assert!(config.allow_past_end);
    }

    #[test]
    fn calculate_slice_count() {
        let config = TwapConfig {
            duration_minutes: 60,
            slice_interval_seconds: 60,
            slice_type: SliceType::Limit,
            allow_past_end: false,
        };

        assert_eq!(config.calculate_slice_count(), 60);
    }

    #[test]
    fn calculate_slice_count_short_window() {
        let config = TwapConfig {
            duration_minutes: 10,
            slice_interval_seconds: 120,
            slice_type: SliceType::Limit,
            allow_past_end: false,
        };

        assert_eq!(config.calculate_slice_count(), 5);
    }

    #[test]
    fn calculate_slice_quantity() {
        let config = TwapConfig {
            duration_minutes: 60,
            slice_interval_seconds: 60,
            slice_type: SliceType::Limit,
            allow_past_end: false,
        };

        let total_quantity = Decimal::new(1000, 0);
        let slice_quantity = config.calculate_slice_quantity(total_quantity);

        assert_eq!(slice_quantity, Decimal::new(1000, 0) / Decimal::from(60));
    }

    #[test]
    fn calculate_schedule() {
        let config = TwapConfig {
            duration_minutes: 1,
            slice_interval_seconds: 20,
            slice_type: SliceType::Limit,
            allow_past_end: false,
        };

        let start_time = Utc::now();
        let schedule = config.calculate_schedule(start_time);

        assert_eq!(schedule.len(), 3);
        assert_eq!(schedule[0], start_time);
        assert_eq!(schedule[1], start_time + TimeDelta::seconds(20));
        assert_eq!(schedule[2], start_time + TimeDelta::seconds(40));
    }

    #[test]
    fn is_window_ended_false_when_fresh() {
        let config = TwapConfig::default();
        let start_time = Utc::now();

        assert!(!config.is_window_ended(start_time));
    }

    #[test]
    fn twap_config_serde() {
        let config = TwapConfig::new(30, 30, SliceType::Market, true);
        let json = serde_json::to_string(&config).unwrap();
        let parsed: TwapConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, config);
    }
}
