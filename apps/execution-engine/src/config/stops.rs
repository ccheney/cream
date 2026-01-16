//! Stops configuration for stop-loss and take-profit enforcement.

use serde::{Deserialize, Serialize};

/// Stops configuration for stop-loss and take-profit enforcement.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StopsConfigExternal {
    /// Enable stops enforcement.
    #[serde(default = "default_stops_enabled")]
    pub enabled: bool,
    /// Priority when both stop and target trigger in same bar: `stop_first`, `target_first`, `high_low_order`.
    #[serde(default = "default_same_bar_priority")]
    pub same_bar_priority: String,
    /// Monitoring interval in milliseconds for price checks.
    #[serde(default = "default_monitoring_interval")]
    pub monitoring_interval_ms: u64,
    /// Whether to use bracket orders when available (for stocks).
    #[serde(default = "default_use_bracket_orders")]
    pub use_bracket_orders: bool,
}

impl Default for StopsConfigExternal {
    fn default() -> Self {
        Self {
            enabled: default_stops_enabled(),
            same_bar_priority: default_same_bar_priority(),
            monitoring_interval_ms: default_monitoring_interval(),
            use_bracket_orders: default_use_bracket_orders(),
        }
    }
}

impl StopsConfigExternal {
    /// Check if stops enforcement is enabled based on environment.
    ///
    /// Stops are enabled by default in all environments.
    /// In BACKTEST, uses simulation; in PAPER/LIVE, uses bracket orders or price monitoring.
    #[must_use]
    pub const fn is_enabled_for_env(&self, _env: &crate::models::Environment) -> bool {
        self.enabled
    }

    /// Convert to the internal `StopsConfig` type used by the stops module.
    #[must_use]
    pub fn to_stops_config(&self) -> crate::execution::stops::StopsConfig {
        use crate::execution::stops::SameBarPriority;

        let same_bar_priority = match self.same_bar_priority.to_lowercase().as_str() {
            "target_first" => SameBarPriority::TargetFirst,
            "high_low_order" => SameBarPriority::HighLowOrder,
            _ => SameBarPriority::StopFirst, // Default to stop first (pessimistic)
        };

        crate::execution::stops::StopsConfig {
            same_bar_priority,
            monitoring_interval_ms: self.monitoring_interval_ms,
            min_risk_reward_ratio: None,
            use_bracket_orders: self.use_bracket_orders,
        }
    }
}

const fn default_stops_enabled() -> bool {
    true
}

fn default_same_bar_priority() -> String {
    "stop_first".to_string()
}

const fn default_monitoring_interval() -> u64 {
    100 // 100ms
}

const fn default_use_bracket_orders() -> bool {
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::execution::stops::SameBarPriority;
    use crate::models::Environment;

    #[test]
    fn test_stops_config_defaults() {
        let config = StopsConfigExternal::default();
        assert!(config.enabled);
        assert_eq!(config.same_bar_priority, "stop_first");
        assert_eq!(config.monitoring_interval_ms, 100);
        assert!(config.use_bracket_orders);
    }

    #[test]
    fn test_stops_config_to_internal() {
        let config = StopsConfigExternal::default();
        let internal = config.to_stops_config();

        assert_eq!(internal.same_bar_priority, SameBarPriority::StopFirst);
        assert_eq!(internal.monitoring_interval_ms, 100);
        assert!(internal.use_bracket_orders);
    }

    #[test]
    fn test_stops_config_same_bar_priority_parsing() {
        // Test stop_first
        let config = StopsConfigExternal {
            same_bar_priority: "stop_first".to_string(),
            ..Default::default()
        };
        let internal = config.to_stops_config();
        assert_eq!(internal.same_bar_priority, SameBarPriority::StopFirst);

        // Test target_first
        let config = StopsConfigExternal {
            same_bar_priority: "target_first".to_string(),
            ..Default::default()
        };
        let internal = config.to_stops_config();
        assert_eq!(internal.same_bar_priority, SameBarPriority::TargetFirst);

        // Test high_low_order
        let config = StopsConfigExternal {
            same_bar_priority: "high_low_order".to_string(),
            ..Default::default()
        };
        let internal = config.to_stops_config();
        assert_eq!(internal.same_bar_priority, SameBarPriority::HighLowOrder);

        // Test default on unknown
        let config = StopsConfigExternal {
            same_bar_priority: "unknown".to_string(),
            ..Default::default()
        };
        let internal = config.to_stops_config();
        assert_eq!(internal.same_bar_priority, SameBarPriority::StopFirst);
    }

    #[test]
    fn test_stops_config_is_enabled_for_env() {
        let config = StopsConfigExternal::default();

        // Stops should be enabled for all environments
        assert!(config.is_enabled_for_env(&Environment::Paper));
        assert!(config.is_enabled_for_env(&Environment::Live));
        assert!(config.is_enabled_for_env(&Environment::Backtest));

        // Explicitly disabled config
        let disabled_config = StopsConfigExternal {
            enabled: false,
            ..Default::default()
        };
        assert!(!disabled_config.is_enabled_for_env(&Environment::Paper));
        assert!(!disabled_config.is_enabled_for_env(&Environment::Live));
        assert!(!disabled_config.is_enabled_for_env(&Environment::Backtest));
    }
}
