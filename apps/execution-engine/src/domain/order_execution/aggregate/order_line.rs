//! Order line for multi-leg orders.

use serde::{Deserialize, Serialize};

use crate::domain::order_execution::value_objects::{OrderSide, OrderStatus};
use crate::domain::shared::{InstrumentId, Money, Quantity};

/// State of a single order leg (for multi-leg orders).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OrderLine {
    /// Leg index (0-based).
    leg_index: u32,
    /// Instrument ID for this leg.
    instrument_id: InstrumentId,
    /// Side for this leg.
    side: OrderSide,
    /// Quantity for this leg.
    quantity: Quantity,
    /// Filled quantity.
    filled_quantity: Quantity,
    /// Average fill price.
    avg_fill_price: Money,
    /// Leg-specific status.
    status: OrderStatus,
}

impl OrderLine {
    /// Create a new order line.
    #[must_use]
    pub const fn new(
        leg_index: u32,
        instrument_id: InstrumentId,
        side: OrderSide,
        quantity: Quantity,
    ) -> Self {
        Self {
            leg_index,
            instrument_id,
            side,
            quantity,
            filled_quantity: Quantity::ZERO,
            avg_fill_price: Money::ZERO,
            status: OrderStatus::New,
        }
    }

    /// Get the leg index.
    #[must_use]
    pub const fn leg_index(&self) -> u32 {
        self.leg_index
    }

    /// Get the instrument ID.
    #[must_use]
    pub const fn instrument_id(&self) -> &InstrumentId {
        &self.instrument_id
    }

    /// Get the side.
    #[must_use]
    pub const fn side(&self) -> OrderSide {
        self.side
    }

    /// Get the quantity.
    #[must_use]
    pub const fn quantity(&self) -> Quantity {
        self.quantity
    }

    /// Get the filled quantity.
    #[must_use]
    pub const fn filled_quantity(&self) -> Quantity {
        self.filled_quantity
    }

    /// Get the average fill price.
    #[must_use]
    pub const fn avg_fill_price(&self) -> Money {
        self.avg_fill_price
    }

    /// Get the status.
    #[must_use]
    pub const fn status(&self) -> OrderStatus {
        self.status
    }

    /// Update the filled quantity and price.
    pub fn apply_fill(&mut self, fill_qty: Quantity, fill_price: Money) {
        let new_filled = self.filled_quantity + fill_qty;
        if new_filled.amount() > rust_decimal::Decimal::ZERO {
            let old_value = self.avg_fill_price.amount() * self.filled_quantity.amount();
            let fill_value = fill_price.amount() * fill_qty.amount();
            let new_avg = (old_value + fill_value) / new_filled.amount();
            self.avg_fill_price = Money::new(new_avg);
        }
        self.filled_quantity = new_filled;

        if self.filled_quantity >= self.quantity {
            self.status = OrderStatus::Filled;
        } else if self.filled_quantity.amount() > rust_decimal::Decimal::ZERO {
            self.status = OrderStatus::PartiallyFilled;
        }
    }

    /// Mark the leg as accepted.
    pub const fn accept(&mut self) {
        self.status = OrderStatus::Accepted;
    }

    /// Mark the leg as canceled.
    pub const fn cancel(&mut self) {
        self.status = OrderStatus::Canceled;
    }

    /// Mark the leg as rejected.
    pub const fn reject(&mut self) {
        self.status = OrderStatus::Rejected;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn order_line_new() {
        let line = OrderLine::new(
            0,
            InstrumentId::new("AAPL250117P00190000"),
            OrderSide::Buy,
            Quantity::from_i64(10),
        );

        assert_eq!(line.leg_index(), 0);
        assert_eq!(line.instrument_id().as_str(), "AAPL250117P00190000");
        assert_eq!(line.side(), OrderSide::Buy);
        assert_eq!(line.quantity(), Quantity::from_i64(10));
        assert_eq!(line.filled_quantity(), Quantity::ZERO);
        assert_eq!(line.status(), OrderStatus::New);
    }

    #[test]
    fn order_line_apply_fill() {
        let mut line = OrderLine::new(
            0,
            InstrumentId::new("AAPL"),
            OrderSide::Buy,
            Quantity::from_i64(100),
        );

        line.apply_fill(Quantity::from_i64(50), Money::usd(150.00));
        assert_eq!(line.filled_quantity(), Quantity::from_i64(50));
        assert_eq!(line.avg_fill_price(), Money::usd(150.00));
        assert_eq!(line.status(), OrderStatus::PartiallyFilled);

        line.apply_fill(Quantity::from_i64(50), Money::usd(151.00));
        assert_eq!(line.filled_quantity(), Quantity::from_i64(100));
        assert_eq!(line.status(), OrderStatus::Filled);
    }

    #[test]
    fn order_line_accept() {
        let mut line = OrderLine::new(
            0,
            InstrumentId::new("AAPL"),
            OrderSide::Buy,
            Quantity::from_i64(100),
        );

        line.accept();
        assert_eq!(line.status(), OrderStatus::Accepted);
    }

    #[test]
    fn order_line_cancel() {
        let mut line = OrderLine::new(
            0,
            InstrumentId::new("AAPL"),
            OrderSide::Buy,
            Quantity::from_i64(100),
        );

        line.accept();
        line.cancel();
        assert_eq!(line.status(), OrderStatus::Canceled);
    }

    #[test]
    fn order_line_serde() {
        let line = OrderLine::new(
            0,
            InstrumentId::new("AAPL"),
            OrderSide::Buy,
            Quantity::from_i64(100),
        );

        let json = serde_json::to_string(&line).unwrap();
        let parsed: OrderLine = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.instrument_id(), line.instrument_id());
    }
}
