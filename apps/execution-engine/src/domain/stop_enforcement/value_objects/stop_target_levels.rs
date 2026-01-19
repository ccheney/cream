//! Stop Target Levels Value Object

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::RiskLevelDenomination;
use crate::domain::order_execution::value_objects::OrderSide;

/// Position direction for stop/target calculation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PositionDirection {
    /// Long position (buy to open).
    Long,
    /// Short position (sell to open).
    Short,
}

impl From<OrderSide> for PositionDirection {
    fn from(side: OrderSide) -> Self {
        match side {
            OrderSide::Buy => Self::Long,
            OrderSide::Sell => Self::Short,
        }
    }
}

/// Stop and target level specification.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
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
    pub direction: PositionDirection,
}

impl StopTargetLevels {
    /// Create new stop/target levels.
    #[must_use]
    pub fn new(
        stop_loss: Decimal,
        take_profit: Decimal,
        entry_price: Decimal,
        direction: PositionDirection,
    ) -> Self {
        Self {
            stop_loss,
            take_profit,
            denomination: RiskLevelDenomination::default(),
            entry_price,
            direction,
        }
    }

    /// Create levels for a long position.
    #[must_use]
    pub fn for_long(entry_price: Decimal, stop_loss: Decimal, take_profit: Decimal) -> Self {
        Self::new(stop_loss, take_profit, entry_price, PositionDirection::Long)
    }

    /// Create levels for a short position.
    #[must_use]
    pub fn for_short(entry_price: Decimal, stop_loss: Decimal, take_profit: Decimal) -> Self {
        Self::new(
            stop_loss,
            take_profit,
            entry_price,
            PositionDirection::Short,
        )
    }

    /// Set the denomination.
    #[must_use]
    pub const fn with_denomination(mut self, denomination: RiskLevelDenomination) -> Self {
        self.denomination = denomination;
        self
    }

    /// Calculate risk (distance to stop in price).
    #[must_use]
    pub fn risk(&self) -> Decimal {
        match self.direction {
            PositionDirection::Long => self.entry_price - self.stop_loss,
            PositionDirection::Short => self.stop_loss - self.entry_price,
        }
    }

    /// Calculate reward (distance to target in price).
    #[must_use]
    pub fn reward(&self) -> Decimal {
        match self.direction {
            PositionDirection::Long => self.take_profit - self.entry_price,
            PositionDirection::Short => self.entry_price - self.take_profit,
        }
    }

    /// Calculate risk/reward ratio.
    #[must_use]
    pub fn risk_reward_ratio(&self) -> Option<Decimal> {
        let risk = self.risk();
        if risk == Decimal::ZERO {
            return None;
        }
        Some(self.reward() / risk)
    }

    /// Validate that levels are sensible for the direction.
    #[must_use]
    pub fn is_valid(&self) -> bool {
        match self.direction {
            PositionDirection::Long => {
                self.stop_loss < self.entry_price && self.take_profit > self.entry_price
            }
            PositionDirection::Short => {
                self.stop_loss > self.entry_price && self.take_profit < self.entry_price
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stop_target_levels_new() {
        let levels = StopTargetLevels::new(
            Decimal::new(95, 0),
            Decimal::new(110, 0),
            Decimal::new(100, 0),
            PositionDirection::Long,
        );
        assert_eq!(levels.stop_loss, Decimal::new(95, 0));
        assert_eq!(levels.take_profit, Decimal::new(110, 0));
        assert_eq!(levels.entry_price, Decimal::new(100, 0));
        assert_eq!(levels.denomination, RiskLevelDenomination::UnderlyingPrice);
    }

    #[test]
    fn stop_target_levels_for_long() {
        let levels = StopTargetLevels::for_long(
            Decimal::new(100, 0),
            Decimal::new(95, 0),
            Decimal::new(110, 0),
        );
        assert_eq!(levels.direction, PositionDirection::Long);
    }

    #[test]
    fn stop_target_levels_for_short() {
        let levels = StopTargetLevels::for_short(
            Decimal::new(100, 0),
            Decimal::new(105, 0),
            Decimal::new(90, 0),
        );
        assert_eq!(levels.direction, PositionDirection::Short);
    }

    #[test]
    fn stop_target_levels_with_denomination() {
        let levels = StopTargetLevels::for_long(
            Decimal::new(100, 0),
            Decimal::new(95, 0),
            Decimal::new(110, 0),
        )
        .with_denomination(RiskLevelDenomination::OptionPrice);

        assert_eq!(levels.denomination, RiskLevelDenomination::OptionPrice);
    }

    #[test]
    fn stop_target_levels_risk_long() {
        let levels = StopTargetLevels::for_long(
            Decimal::new(100, 0),
            Decimal::new(95, 0),
            Decimal::new(110, 0),
        );

        assert_eq!(levels.risk(), Decimal::new(5, 0));
    }

    #[test]
    fn stop_target_levels_reward_long() {
        let levels = StopTargetLevels::for_long(
            Decimal::new(100, 0),
            Decimal::new(95, 0),
            Decimal::new(110, 0),
        );

        assert_eq!(levels.reward(), Decimal::new(10, 0));
    }

    #[test]
    fn stop_target_levels_risk_reward_ratio() {
        let levels = StopTargetLevels::for_long(
            Decimal::new(100, 0),
            Decimal::new(95, 0),
            Decimal::new(110, 0),
        );

        let ratio = levels.risk_reward_ratio().unwrap();
        assert_eq!(ratio, Decimal::new(2, 0)); // 10/5 = 2
    }

    #[test]
    fn stop_target_levels_is_valid_long() {
        let valid = StopTargetLevels::for_long(
            Decimal::new(100, 0),
            Decimal::new(95, 0),
            Decimal::new(110, 0),
        );
        assert!(valid.is_valid());

        let invalid_stop = StopTargetLevels::for_long(
            Decimal::new(100, 0),
            Decimal::new(105, 0), // Stop above entry
            Decimal::new(110, 0),
        );
        assert!(!invalid_stop.is_valid());
    }

    #[test]
    fn stop_target_levels_is_valid_short() {
        let valid = StopTargetLevels::for_short(
            Decimal::new(100, 0),
            Decimal::new(105, 0),
            Decimal::new(90, 0),
        );
        assert!(valid.is_valid());

        let invalid_stop = StopTargetLevels::for_short(
            Decimal::new(100, 0),
            Decimal::new(95, 0), // Stop below entry for short
            Decimal::new(90, 0),
        );
        assert!(!invalid_stop.is_valid());
    }

    #[test]
    fn stop_target_levels_serde() {
        let levels = StopTargetLevels::for_long(
            Decimal::new(100, 0),
            Decimal::new(95, 0),
            Decimal::new(110, 0),
        );
        let json = serde_json::to_string(&levels).unwrap();
        let parsed: StopTargetLevels = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, levels);
    }

    #[test]
    fn position_direction_from_order_side() {
        assert_eq!(
            PositionDirection::from(OrderSide::Buy),
            PositionDirection::Long
        );
        assert_eq!(
            PositionDirection::from(OrderSide::Sell),
            PositionDirection::Short
        );
    }
}
