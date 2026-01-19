//! Trigger Result Value Object

use crate::domain::shared::Timestamp;
use rust_decimal::Decimal;

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
        timestamp: Timestamp,
    },
    /// Take-profit was triggered.
    TakeProfit {
        /// Price at which target was triggered.
        price: Decimal,
        /// Timestamp of trigger.
        timestamp: Timestamp,
    },
}

impl TriggerResult {
    /// Create a stop-loss trigger.
    #[must_use]
    pub fn stop_loss(price: Decimal) -> Self {
        Self::StopLoss {
            price,
            timestamp: Timestamp::now(),
        }
    }

    /// Create a take-profit trigger.
    #[must_use]
    pub fn take_profit(price: Decimal) -> Self {
        Self::TakeProfit {
            price,
            timestamp: Timestamp::now(),
        }
    }

    /// Check if any trigger occurred.
    #[must_use]
    pub const fn is_triggered(&self) -> bool {
        !matches!(self, Self::None)
    }

    /// Check if stop-loss was triggered.
    #[must_use]
    pub const fn is_stop_loss(&self) -> bool {
        matches!(self, Self::StopLoss { .. })
    }

    /// Check if take-profit was triggered.
    #[must_use]
    pub const fn is_take_profit(&self) -> bool {
        matches!(self, Self::TakeProfit { .. })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trigger_result_none() {
        let result = TriggerResult::None;
        assert!(!result.is_triggered());
        assert!(!result.is_stop_loss());
        assert!(!result.is_take_profit());
    }

    #[test]
    fn trigger_result_stop_loss() {
        let result = TriggerResult::stop_loss(Decimal::new(95, 0));
        assert!(result.is_triggered());
        assert!(result.is_stop_loss());
        assert!(!result.is_take_profit());

        if let TriggerResult::StopLoss { price, .. } = result {
            assert_eq!(price, Decimal::new(95, 0));
        } else {
            panic!("Expected StopLoss");
        }
    }

    #[test]
    fn trigger_result_take_profit() {
        let result = TriggerResult::take_profit(Decimal::new(110, 0));
        assert!(result.is_triggered());
        assert!(!result.is_stop_loss());
        assert!(result.is_take_profit());

        if let TriggerResult::TakeProfit { price, .. } = result {
            assert_eq!(price, Decimal::new(110, 0));
        } else {
            panic!("Expected TakeProfit");
        }
    }
}
