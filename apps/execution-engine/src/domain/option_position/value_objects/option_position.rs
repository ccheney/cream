//! Option Position Value Object

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::{OptionSpread, SpreadType};
use crate::domain::risk_management::value_objects::Greeks;
use crate::domain::shared::{OrderId, Timestamp};

/// Option position tracking.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OptionPosition {
    /// Position ID.
    position_id: OrderId,
    /// The spread configuration.
    spread: OptionSpread,
    /// Entry timestamp.
    entry_time: Timestamp,
    /// Average entry price (premium paid/received).
    avg_entry_price: Decimal,
    /// Current market price (mark).
    current_price: Decimal,
    /// Whether position is open.
    is_open: bool,
}

impl OptionPosition {
    /// Create a new option position.
    #[must_use]
    pub fn new(position_id: OrderId, spread: OptionSpread, avg_entry_price: Decimal) -> Self {
        Self {
            position_id,
            spread,
            entry_time: Timestamp::now(),
            avg_entry_price,
            current_price: avg_entry_price,
            is_open: true,
        }
    }

    /// Get the position ID.
    #[must_use]
    pub fn position_id(&self) -> &OrderId {
        &self.position_id
    }

    /// Get the spread.
    #[must_use]
    pub fn spread(&self) -> &OptionSpread {
        &self.spread
    }

    /// Get mutable spread.
    pub fn spread_mut(&mut self) -> &mut OptionSpread {
        &mut self.spread
    }

    /// Get the entry time.
    #[must_use]
    pub const fn entry_time(&self) -> Timestamp {
        self.entry_time
    }

    /// Get the average entry price.
    #[must_use]
    pub const fn avg_entry_price(&self) -> Decimal {
        self.avg_entry_price
    }

    /// Get the current market price.
    #[must_use]
    pub const fn current_price(&self) -> Decimal {
        self.current_price
    }

    /// Check if position is open.
    #[must_use]
    pub const fn is_open(&self) -> bool {
        self.is_open
    }

    /// Update the current market price.
    pub fn update_price(&mut self, price: Decimal) {
        self.current_price = price;
    }

    /// Close the position.
    pub fn close(&mut self) {
        self.is_open = false;
    }

    /// Get the spread type.
    #[must_use]
    pub fn spread_type(&self) -> SpreadType {
        self.spread.spread_type()
    }

    /// Get the underlying symbol.
    #[must_use]
    pub fn underlying(&self) -> &str {
        self.spread.underlying()
    }

    /// Get aggregate position Greeks.
    #[must_use]
    pub fn greeks(&self) -> Greeks {
        self.spread.aggregate_greeks()
    }

    /// Calculate unrealized P&L.
    #[must_use]
    pub fn unrealized_pnl(&self) -> Decimal {
        self.current_price - self.avg_entry_price
    }

    /// Calculate unrealized P&L as percentage.
    #[must_use]
    pub fn unrealized_pnl_pct(&self) -> Option<Decimal> {
        if self.avg_entry_price == Decimal::ZERO {
            return None;
        }
        Some((self.unrealized_pnl() / self.avg_entry_price.abs()) * Decimal::ONE_HUNDRED)
    }

    /// Check if position is profitable.
    #[must_use]
    pub fn is_profitable(&self) -> bool {
        self.unrealized_pnl() > Decimal::ZERO
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::option_position::value_objects::{
        Leg, LegType, OptionContract, OptionRight, PositionSide,
    };
    use crate::domain::shared::Symbol;
    use chrono::NaiveDate;

    fn test_spread() -> OptionSpread {
        let contract = OptionContract::new(
            Symbol::new("AAPL  250117C00150000"),
            "AAPL",
            Decimal::new(150, 0),
            NaiveDate::from_ymd_opt(2025, 1, 17).unwrap(),
            OptionRight::Call,
        );
        let leg = Leg::new(
            contract,
            PositionSide::Long,
            Decimal::new(10, 0),
            LegType::Primary,
        );
        OptionSpread::single(leg, "AAPL")
    }

    #[test]
    fn option_position_new() {
        let position = OptionPosition::new(
            OrderId::new("pos-1"),
            test_spread(),
            Decimal::new(500, 2), // $5.00 premium
        );

        assert_eq!(position.position_id().as_str(), "pos-1");
        assert!(position.is_open());
        assert_eq!(position.avg_entry_price(), Decimal::new(500, 2));
        assert_eq!(position.current_price(), Decimal::new(500, 2));
    }

    #[test]
    fn option_position_update_price() {
        let mut position =
            OptionPosition::new(OrderId::new("pos-1"), test_spread(), Decimal::new(500, 2));

        position.update_price(Decimal::new(600, 2));
        assert_eq!(position.current_price(), Decimal::new(600, 2));
    }

    #[test]
    fn option_position_close() {
        let mut position =
            OptionPosition::new(OrderId::new("pos-1"), test_spread(), Decimal::new(500, 2));

        assert!(position.is_open());
        position.close();
        assert!(!position.is_open());
    }

    #[test]
    fn option_position_unrealized_pnl() {
        let mut position = OptionPosition::new(
            OrderId::new("pos-1"),
            test_spread(),
            Decimal::new(500, 2), // $5.00 entry
        );

        position.update_price(Decimal::new(600, 2)); // $6.00 current
        assert_eq!(position.unrealized_pnl(), Decimal::new(100, 2)); // $1.00 profit
        assert!(position.is_profitable());
    }

    #[test]
    fn option_position_unrealized_pnl_loss() {
        let mut position = OptionPosition::new(
            OrderId::new("pos-1"),
            test_spread(),
            Decimal::new(500, 2), // $5.00 entry
        );

        position.update_price(Decimal::new(400, 2)); // $4.00 current
        assert_eq!(position.unrealized_pnl(), Decimal::new(-100, 2)); // $1.00 loss
        assert!(!position.is_profitable());
    }

    #[test]
    fn option_position_unrealized_pnl_pct() {
        let mut position = OptionPosition::new(
            OrderId::new("pos-1"),
            test_spread(),
            Decimal::new(500, 2), // $5.00 entry
        );

        position.update_price(Decimal::new(600, 2)); // $6.00 current
        let pct = position.unrealized_pnl_pct().unwrap();
        // $1.00 / $5.00 * 100 = 20%
        assert_eq!(pct, Decimal::new(20, 0));
    }

    #[test]
    fn option_position_spread_type() {
        let position =
            OptionPosition::new(OrderId::new("pos-1"), test_spread(), Decimal::new(500, 2));

        assert_eq!(position.spread_type(), SpreadType::Single);
    }

    #[test]
    fn option_position_underlying() {
        let position =
            OptionPosition::new(OrderId::new("pos-1"), test_spread(), Decimal::new(500, 2));

        assert_eq!(position.underlying(), "AAPL");
    }

    #[test]
    fn option_position_serde() {
        let position =
            OptionPosition::new(OrderId::new("pos-1"), test_spread(), Decimal::new(500, 2));

        let json = serde_json::to_string(&position).unwrap();
        let parsed: OptionPosition = serde_json::from_str(&json).unwrap();
        assert_eq!(
            parsed.position_id().as_str(),
            position.position_id().as_str()
        );
    }

    #[test]
    fn option_position_spread_mut() {
        let mut position =
            OptionPosition::new(OrderId::new("pos-1"), test_spread(), Decimal::new(500, 2));

        let spread = position.spread_mut();
        assert_eq!(spread.spread_type(), SpreadType::Single);
    }

    #[test]
    fn option_position_entry_time() {
        let position =
            OptionPosition::new(OrderId::new("pos-1"), test_spread(), Decimal::new(500, 2));

        // Entry time should be recent
        assert!(position.entry_time().unix_seconds() > 0);
    }

    #[test]
    fn option_position_greeks() {
        let position =
            OptionPosition::new(OrderId::new("pos-1"), test_spread(), Decimal::new(500, 2));

        let greeks = position.greeks();
        // Default greeks should be zero
        assert_eq!(greeks.delta, Decimal::ZERO);
    }

    #[test]
    fn option_position_unrealized_pnl_pct_zero_entry() {
        let mut position = OptionPosition::new(OrderId::new("pos-1"), test_spread(), Decimal::ZERO);

        position.update_price(Decimal::new(100, 2));
        assert!(position.unrealized_pnl_pct().is_none());
    }
}
