//! Simulated order types for backtest simulation.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::triggers::PositionDirection;
use crate::models::{
    OrderPurpose, OrderSide, OrderStatus, OrderType, PartialFillState, TimeInForce,
};

/// Order lifecycle state in backtest simulation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SimOrderState {
    /// Order created but not yet submitted.
    New,
    /// Order submitted and pending fill.
    Pending,
    /// Order partially filled.
    PartiallyFilled,
    /// Order completely filled.
    Filled,
    /// Order rejected.
    Rejected,
    /// Order cancelled.
    Cancelled,
    /// Order expired.
    Expired,
}

impl From<SimOrderState> for OrderStatus {
    fn from(state: SimOrderState) -> Self {
        match state {
            SimOrderState::New => Self::New,
            SimOrderState::Pending => Self::Accepted,
            SimOrderState::PartiallyFilled => Self::PartiallyFilled,
            SimOrderState::Filled => Self::Filled,
            SimOrderState::Rejected => Self::Rejected,
            SimOrderState::Cancelled => Self::Canceled,
            SimOrderState::Expired => Self::Expired,
        }
    }
}

/// Simulated order in backtest.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimOrder {
    /// Unique order ID.
    pub order_id: String,
    /// Instrument ID.
    pub instrument_id: String,
    /// Order side.
    pub side: OrderSide,
    /// Order type.
    pub order_type: OrderType,
    /// Time in force.
    pub time_in_force: TimeInForce,
    /// Requested quantity.
    pub quantity: Decimal,
    /// Limit price (for limit orders).
    pub limit_price: Option<Decimal>,
    /// Stop price (for stop orders).
    pub stop_price: Option<Decimal>,
    /// Order state.
    pub state: SimOrderState,
    /// Partial fill tracking.
    pub partial_fill_state: Option<PartialFillState>,
    /// Order purpose (for timeout handling).
    pub purpose: OrderPurpose,
    /// Submission timestamp (ISO 8601).
    pub submitted_at: String,
    /// Last update timestamp (ISO 8601).
    pub updated_at: String,
    /// Position direction (for stop/target orders).
    pub position_direction: Option<PositionDirection>,
}

impl SimOrder {
    /// Create a new simulated order.
    #[must_use]
    pub fn new(
        order_id: &str,
        instrument_id: &str,
        side: OrderSide,
        order_type: OrderType,
        quantity: Decimal,
        purpose: OrderPurpose,
    ) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            order_id: order_id.to_string(),
            instrument_id: instrument_id.to_string(),
            side,
            order_type,
            time_in_force: TimeInForce::Day,
            quantity,
            limit_price: None,
            stop_price: None,
            state: SimOrderState::New,
            partial_fill_state: None,
            purpose,
            submitted_at: now.clone(),
            updated_at: now,
            position_direction: None,
        }
    }

    /// Set limit price.
    #[must_use]
    pub const fn with_limit_price(mut self, price: Decimal) -> Self {
        self.limit_price = Some(price);
        self
    }

    /// Set stop price.
    #[must_use]
    pub const fn with_stop_price(mut self, price: Decimal) -> Self {
        self.stop_price = Some(price);
        self
    }

    /// Set time in force.
    #[must_use]
    pub const fn with_time_in_force(mut self, tif: TimeInForce) -> Self {
        self.time_in_force = tif;
        self
    }

    /// Set position direction (for protective orders).
    #[must_use]
    pub const fn with_position_direction(mut self, direction: PositionDirection) -> Self {
        self.position_direction = Some(direction);
        self
    }

    /// Check if order is in terminal state.
    #[must_use]
    pub const fn is_terminal(&self) -> bool {
        matches!(
            self.state,
            SimOrderState::Filled
                | SimOrderState::Rejected
                | SimOrderState::Cancelled
                | SimOrderState::Expired
        )
    }

    /// Get filled quantity.
    #[must_use]
    pub fn filled_quantity(&self) -> Decimal {
        self.partial_fill_state
            .as_ref()
            .map_or(Decimal::ZERO, |s| s.cum_qty)
    }

    /// Get remaining quantity.
    #[must_use]
    pub fn remaining_quantity(&self) -> Decimal {
        self.partial_fill_state
            .as_ref()
            .map_or(self.quantity, |s| s.leaves_qty)
    }

    /// Get average fill price.
    #[must_use]
    pub fn avg_fill_price(&self) -> Decimal {
        self.partial_fill_state
            .as_ref()
            .map_or(Decimal::ZERO, |s| s.avg_px)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::OrderStatus;

    #[test]
    fn test_sim_order_state_conversion() {
        assert_eq!(OrderStatus::from(SimOrderState::New), OrderStatus::New);
        assert_eq!(
            OrderStatus::from(SimOrderState::Pending),
            OrderStatus::Accepted
        );
        assert_eq!(
            OrderStatus::from(SimOrderState::Filled),
            OrderStatus::Filled
        );
        assert_eq!(
            OrderStatus::from(SimOrderState::Rejected),
            OrderStatus::Rejected
        );
    }
}
