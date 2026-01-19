//! Passive Limit Tactic Configuration

use chrono::{DateTime, TimeDelta, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

/// Configuration for `PASSIVE_LIMIT` tactic.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PassiveLimitConfig {
    /// Basis points inside NBBO (1 BPS = 0.01% = 0.0001).
    pub offset_bps: u32,
    /// Time before crossing spread (seconds).
    pub decay_seconds: u32,
    /// Maximum time before cancel (seconds).
    pub max_wait_seconds: u32,
}

impl Default for PassiveLimitConfig {
    fn default() -> Self {
        Self {
            offset_bps: 0,
            decay_seconds: 60,
            max_wait_seconds: 300,
        }
    }
}

impl PassiveLimitConfig {
    /// Create a new passive limit configuration.
    #[must_use]
    pub const fn new(offset_bps: u32, decay_seconds: u32, max_wait_seconds: u32) -> Self {
        Self {
            offset_bps,
            decay_seconds,
            max_wait_seconds,
        }
    }

    /// Calculate the limit price for a buy order.
    ///
    /// Returns bid price + `offset_bps`.
    #[must_use]
    pub fn calculate_buy_price(&self, bid: Decimal, ask: Decimal) -> Decimal {
        let offset = Decimal::from(self.offset_bps) / Decimal::from(10000);
        let mid = (bid + ask) / Decimal::from(2);
        bid + (mid * offset)
    }

    /// Calculate the limit price for a sell order.
    ///
    /// Returns ask price - `offset_bps`.
    #[must_use]
    pub fn calculate_sell_price(&self, bid: Decimal, ask: Decimal) -> Decimal {
        let offset = Decimal::from(self.offset_bps) / Decimal::from(10000);
        let mid = (bid + ask) / Decimal::from(2);
        ask - (mid * offset)
    }

    /// Check if the order should decay (move toward mid).
    #[must_use]
    pub fn should_decay(&self, submitted_at: DateTime<Utc>) -> bool {
        Utc::now() - submitted_at >= TimeDelta::seconds(i64::from(self.decay_seconds))
    }

    /// Check if the order should be canceled.
    #[must_use]
    pub fn should_cancel(&self, submitted_at: DateTime<Utc>) -> bool {
        Utc::now() - submitted_at >= TimeDelta::seconds(i64::from(self.max_wait_seconds))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn passive_limit_config_default() {
        let config = PassiveLimitConfig::default();
        assert_eq!(config.offset_bps, 0);
        assert_eq!(config.decay_seconds, 60);
        assert_eq!(config.max_wait_seconds, 300);
    }

    #[test]
    fn passive_limit_config_new() {
        let config = PassiveLimitConfig::new(5, 30, 180);
        assert_eq!(config.offset_bps, 5);
        assert_eq!(config.decay_seconds, 30);
        assert_eq!(config.max_wait_seconds, 180);
    }

    #[test]
    fn calculate_buy_price_zero_offset() {
        let config = PassiveLimitConfig::default();
        let bid = Decimal::new(100, 0);
        let ask = Decimal::new(101, 0);

        let price = config.calculate_buy_price(bid, ask);
        assert_eq!(price, bid);
    }

    #[test]
    fn calculate_buy_price_with_offset() {
        let config = PassiveLimitConfig::new(10, 60, 300); // 10 BPS
        let bid = Decimal::new(100, 0);
        let ask = Decimal::new(101, 0);

        let price = config.calculate_buy_price(bid, ask);
        // mid = 100.5, offset = 10/10000 = 0.001
        // price = 100 + (100.5 * 0.001) = 100.1005
        assert!(price > bid);
        assert!(price < ask);
    }

    #[test]
    fn calculate_sell_price_zero_offset() {
        let config = PassiveLimitConfig::default();
        let bid = Decimal::new(100, 0);
        let ask = Decimal::new(101, 0);

        let price = config.calculate_sell_price(bid, ask);
        assert_eq!(price, ask);
    }

    #[test]
    fn calculate_sell_price_with_offset() {
        let config = PassiveLimitConfig::new(10, 60, 300); // 10 BPS
        let bid = Decimal::new(100, 0);
        let ask = Decimal::new(101, 0);

        let price = config.calculate_sell_price(bid, ask);
        // mid = 100.5, offset = 10/10000 = 0.001
        // price = 101 - (100.5 * 0.001) = 100.8995
        assert!(price < ask);
        assert!(price > bid);
    }

    #[test]
    fn should_decay_false_when_fresh() {
        let config = PassiveLimitConfig::default();
        let submitted_at = Utc::now();

        assert!(!config.should_decay(submitted_at));
    }

    #[test]
    fn should_cancel_false_when_fresh() {
        let config = PassiveLimitConfig::default();
        let submitted_at = Utc::now();

        assert!(!config.should_cancel(submitted_at));
    }

    #[test]
    fn passive_limit_config_serde() {
        let config = PassiveLimitConfig::new(5, 30, 180);
        let json = serde_json::to_string(&config).unwrap();
        let parsed: PassiveLimitConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, config);
    }
}
