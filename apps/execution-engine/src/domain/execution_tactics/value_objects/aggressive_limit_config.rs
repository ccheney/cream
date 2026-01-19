//! Aggressive Limit Tactic Configuration

use chrono::{DateTime, TimeDelta, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

/// Configuration for `AGGRESSIVE_LIMIT` tactic.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AggressiveLimitConfig {
    /// Basis points past NBBO.
    pub cross_bps: u32,
    /// Time before re-pricing (seconds).
    pub timeout_seconds: u32,
}

impl Default for AggressiveLimitConfig {
    fn default() -> Self {
        Self {
            cross_bps: 5,
            timeout_seconds: 30,
        }
    }
}

impl AggressiveLimitConfig {
    /// Create a new aggressive limit configuration.
    #[must_use]
    pub const fn new(cross_bps: u32, timeout_seconds: u32) -> Self {
        Self {
            cross_bps,
            timeout_seconds,
        }
    }

    /// Calculate the limit price for a buy order (crosses the spread).
    ///
    /// Returns ask price + `cross_bps`.
    #[must_use]
    pub fn calculate_buy_price(&self, ask: Decimal) -> Decimal {
        let offset = Decimal::from(self.cross_bps) / Decimal::from(10000);
        ask + (ask * offset)
    }

    /// Calculate the limit price for a sell order (crosses the spread).
    ///
    /// Returns bid price - `cross_bps`.
    #[must_use]
    pub fn calculate_sell_price(&self, bid: Decimal) -> Decimal {
        let offset = Decimal::from(self.cross_bps) / Decimal::from(10000);
        bid - (bid * offset)
    }

    /// Check if the order should be re-priced.
    #[must_use]
    pub fn should_reprice(&self, submitted_at: DateTime<Utc>) -> bool {
        Utc::now() - submitted_at >= TimeDelta::seconds(i64::from(self.timeout_seconds))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aggressive_limit_config_default() {
        let config = AggressiveLimitConfig::default();
        assert_eq!(config.cross_bps, 5);
        assert_eq!(config.timeout_seconds, 30);
    }

    #[test]
    fn aggressive_limit_config_new() {
        let config = AggressiveLimitConfig::new(10, 60);
        assert_eq!(config.cross_bps, 10);
        assert_eq!(config.timeout_seconds, 60);
    }

    #[test]
    fn calculate_buy_price_crosses_spread() {
        let config = AggressiveLimitConfig::default();
        let ask = Decimal::new(101, 0);

        let price = config.calculate_buy_price(ask);
        // offset = 5/10000 = 0.0005
        // price = 101 + (101 * 0.0005) = 101.0505
        assert!(price > ask);
    }

    #[test]
    fn calculate_sell_price_crosses_spread() {
        let config = AggressiveLimitConfig::default();
        let bid = Decimal::new(100, 0);

        let price = config.calculate_sell_price(bid);
        // offset = 5/10000 = 0.0005
        // price = 100 - (100 * 0.0005) = 99.95
        assert!(price < bid);
    }

    #[test]
    fn should_reprice_false_when_fresh() {
        let config = AggressiveLimitConfig::default();
        let submitted_at = Utc::now();

        assert!(!config.should_reprice(submitted_at));
    }

    #[test]
    fn aggressive_limit_config_serde() {
        let config = AggressiveLimitConfig::new(10, 60);
        let json = serde_json::to_string(&config).unwrap();
        let parsed: AggressiveLimitConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, config);
    }
}
