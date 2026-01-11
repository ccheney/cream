//! Simulated position types for backtest simulation.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::triggers::PositionDirection;

/// Simulated position in backtest.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimPosition {
    /// Instrument ID.
    pub instrument_id: String,
    /// Position quantity (positive = long, negative = short).
    pub quantity: Decimal,
    /// Average entry price.
    pub avg_entry_price: Decimal,
    /// Stop loss level.
    pub stop_loss: Option<Decimal>,
    /// Take profit level.
    pub take_profit: Option<Decimal>,
    /// Unrealized P&L.
    pub unrealized_pnl: Decimal,
    /// Realized P&L.
    pub realized_pnl: Decimal,
    /// Total commission paid.
    pub commission_paid: Decimal,
    /// Position opened timestamp.
    pub opened_at: String,
}

impl SimPosition {
    /// Create a new simulated position.
    #[must_use]
    pub fn new(instrument_id: &str, quantity: Decimal, entry_price: Decimal) -> Self {
        Self {
            instrument_id: instrument_id.to_string(),
            quantity,
            avg_entry_price: entry_price,
            stop_loss: None,
            take_profit: None,
            unrealized_pnl: Decimal::ZERO,
            realized_pnl: Decimal::ZERO,
            commission_paid: Decimal::ZERO,
            opened_at: chrono::Utc::now().to_rfc3339(),
        }
    }

    /// Get position direction.
    #[must_use]
    pub fn direction(&self) -> PositionDirection {
        if self.quantity > Decimal::ZERO {
            PositionDirection::Long
        } else {
            PositionDirection::Short
        }
    }

    /// Check if position is flat.
    #[must_use]
    pub fn is_flat(&self) -> bool {
        self.quantity == Decimal::ZERO
    }

    /// Update unrealized P&L.
    pub fn update_unrealized_pnl(&mut self, current_price: Decimal) {
        let price_diff = current_price - self.avg_entry_price;
        self.unrealized_pnl = price_diff * self.quantity;
    }
}
