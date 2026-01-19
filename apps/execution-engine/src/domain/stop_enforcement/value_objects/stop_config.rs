//! Stop Configuration Value Objects

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

/// Denomination of stop/target price levels.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RiskLevelDenomination {
    /// Levels are based on the underlying asset price.
    #[default]
    UnderlyingPrice,
    /// Levels are based on the option premium.
    OptionPrice,
}

/// Rule for determining priority when both stop and target trigger in same bar.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SameBarPriority {
    /// Stop-loss takes priority (pessimistic assumption).
    #[default]
    StopFirst,
    /// Take-profit takes priority (optimistic assumption).
    TargetFirst,
    /// Determine by candle direction (open -> high -> low -> close or open -> low -> high -> close).
    HighLowOrder,
}

/// Configuration for stops enforcement.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StopsConfig {
    /// Priority rule for same-bar stop and target triggers.
    pub same_bar_priority: SameBarPriority,
    /// Monitoring interval in milliseconds for price checks.
    pub monitoring_interval_ms: u64,
    /// Minimum profit/loss ratio required (risk-reward).
    pub min_risk_reward_ratio: Option<Decimal>,
    /// Whether to use bracket orders when available.
    pub use_bracket_orders: bool,
}

impl Default for StopsConfig {
    fn default() -> Self {
        Self {
            same_bar_priority: SameBarPriority::default(),
            monitoring_interval_ms: 100, // 100ms polling
            min_risk_reward_ratio: None,
            use_bracket_orders: true,
        }
    }
}

impl StopsConfig {
    /// Create a new stops configuration.
    #[must_use]
    pub const fn new(
        same_bar_priority: SameBarPriority,
        monitoring_interval_ms: u64,
        min_risk_reward_ratio: Option<Decimal>,
        use_bracket_orders: bool,
    ) -> Self {
        Self {
            same_bar_priority,
            monitoring_interval_ms,
            min_risk_reward_ratio,
            use_bracket_orders,
        }
    }

    /// Create a configuration for fast monitoring.
    #[must_use]
    pub const fn fast_monitoring() -> Self {
        Self {
            same_bar_priority: SameBarPriority::StopFirst,
            monitoring_interval_ms: 50,
            min_risk_reward_ratio: None,
            use_bracket_orders: true,
        }
    }

    /// Create a configuration without bracket orders.
    #[must_use]
    pub const fn no_bracket() -> Self {
        Self {
            same_bar_priority: SameBarPriority::StopFirst,
            monitoring_interval_ms: 100,
            min_risk_reward_ratio: None,
            use_bracket_orders: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn risk_level_denomination_default() {
        assert_eq!(
            RiskLevelDenomination::default(),
            RiskLevelDenomination::UnderlyingPrice
        );
    }

    #[test]
    fn risk_level_denomination_serde() {
        let denom = RiskLevelDenomination::OptionPrice;
        let json = serde_json::to_string(&denom).unwrap();
        assert_eq!(json, "\"OPTION_PRICE\"");

        let parsed: RiskLevelDenomination = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, RiskLevelDenomination::OptionPrice);
    }

    #[test]
    fn same_bar_priority_default() {
        assert_eq!(SameBarPriority::default(), SameBarPriority::StopFirst);
    }

    #[test]
    fn same_bar_priority_serde() {
        let priority = SameBarPriority::HighLowOrder;
        let json = serde_json::to_string(&priority).unwrap();
        assert_eq!(json, "\"high_low_order\"");

        let parsed: SameBarPriority = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, SameBarPriority::HighLowOrder);
    }

    #[test]
    fn stops_config_default() {
        let config = StopsConfig::default();
        assert_eq!(config.same_bar_priority, SameBarPriority::StopFirst);
        assert_eq!(config.monitoring_interval_ms, 100);
        assert!(config.min_risk_reward_ratio.is_none());
        assert!(config.use_bracket_orders);
    }

    #[test]
    fn stops_config_fast_monitoring() {
        let config = StopsConfig::fast_monitoring();
        assert_eq!(config.monitoring_interval_ms, 50);
    }

    #[test]
    fn stops_config_no_bracket() {
        let config = StopsConfig::no_bracket();
        assert!(!config.use_bracket_orders);
    }

    #[test]
    fn stops_config_serde() {
        let config = StopsConfig::default();
        let json = serde_json::to_string(&config).unwrap();
        let parsed: StopsConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, config);
    }
}
