//! Stop/target type definitions.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::models::Direction;

/// Result of checking if stop or target was triggered.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TriggerResult {
    /// No trigger occurred.
    None,
    /// Stop-loss was triggered.
    StopLoss {
        /// Price at which stop was triggered.
        price: Decimal,
        /// Timestamp of trigger.
        timestamp: String,
    },
    /// Take-profit was triggered.
    TakeProfit {
        /// Price at which target was triggered.
        price: Decimal,
        /// Timestamp of trigger.
        timestamp: String,
    },
}

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

/// Stop and target level specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StopTargetLevels {
    /// Stop-loss price level.
    pub stop_loss: Decimal,
    /// Take-profit price level.
    pub take_profit: Decimal,
    /// Denomination of levels.
    pub denomination: RiskLevelDenomination,
    /// Entry price for validation.
    pub entry_price: Decimal,
    /// Position direction.
    pub direction: Direction,
}

impl StopTargetLevels {
    /// Create new stop/target levels.
    #[must_use]
    pub fn new(
        stop_loss: Decimal,
        take_profit: Decimal,
        entry_price: Decimal,
        direction: Direction,
    ) -> Self {
        Self {
            stop_loss,
            take_profit,
            denomination: RiskLevelDenomination::default(),
            entry_price,
            direction,
        }
    }

    /// Set the denomination.
    #[must_use]
    pub const fn with_denomination(mut self, denomination: RiskLevelDenomination) -> Self {
        self.denomination = denomination;
        self
    }
}

/// Configuration for stops enforcement.
#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stop_target_levels_new() {
        let levels = StopTargetLevels::new(
            Decimal::new(95, 0),
            Decimal::new(110, 0),
            Decimal::new(100, 0),
            Direction::Long,
        );
        assert_eq!(levels.stop_loss, Decimal::new(95, 0));
        assert_eq!(levels.take_profit, Decimal::new(110, 0));
        assert_eq!(levels.entry_price, Decimal::new(100, 0));
        assert_eq!(levels.denomination, RiskLevelDenomination::UnderlyingPrice);
    }

    #[test]
    fn test_stop_target_levels_with_denomination() {
        let levels = StopTargetLevels::new(
            Decimal::new(95, 0),
            Decimal::new(110, 0),
            Decimal::new(100, 0),
            Direction::Long,
        )
        .with_denomination(RiskLevelDenomination::OptionPrice);

        assert_eq!(levels.denomination, RiskLevelDenomination::OptionPrice);
    }

    #[test]
    fn test_stops_config_default() {
        let config = StopsConfig::default();
        assert_eq!(config.same_bar_priority, SameBarPriority::StopFirst);
        assert_eq!(config.monitoring_interval_ms, 100);
        assert!(config.min_risk_reward_ratio.is_none());
        assert!(config.use_bracket_orders);
    }
}
