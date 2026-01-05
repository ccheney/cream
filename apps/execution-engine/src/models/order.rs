//! Order-related types for execution tracking.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::{DecisionPlan, Environment};

/// Order side (buy or sell).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OrderSide {
    /// Buy order.
    Buy,
    /// Sell order.
    Sell,
}

/// Order type (market, limit, etc.).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OrderType {
    /// Market order - execute at best available price.
    Market,
    /// Limit order - execute at specified price or better.
    Limit,
    /// Stop order - becomes market order when stop price is reached.
    Stop,
    /// Stop-limit order - becomes limit order when stop price is reached.
    StopLimit,
}

/// Time in force for orders.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TimeInForce {
    /// Valid for current trading day only.
    Day,
    /// Good-til-canceled (broker-specific limit: typically 30-90 days).
    Gtc,
    /// Immediate-or-cancel (fill immediately, cancel remainder).
    Ioc,
    /// Fill-or-kill (all or nothing, immediate execution required).
    Fok,
    /// Execute at market open only.
    Opg,
    /// Execute at market close only.
    Cls,
}

/// Order status in the lifecycle.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OrderStatus {
    /// Order created but not yet submitted.
    New,
    /// Order accepted by broker.
    Accepted,
    /// Order partially filled.
    PartiallyFilled,
    /// Order completely filled.
    Filled,
    /// Order canceled.
    Canceled,
    /// Order rejected by broker.
    Rejected,
    /// Order expired.
    Expired,
}

impl OrderStatus {
    /// Returns true if the order is in a terminal state.
    #[must_use]
    pub const fn is_terminal(&self) -> bool {
        matches!(
            self,
            Self::Filled | Self::Canceled | Self::Rejected | Self::Expired
        )
    }

    /// Returns true if the order is still active (can be filled or canceled).
    #[must_use]
    pub const fn is_active(&self) -> bool {
        matches!(self, Self::New | Self::Accepted | Self::PartiallyFilled)
    }
}

/// State of a single order leg (for multi-leg orders).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderLegState {
    /// Leg index (0-based).
    pub leg_index: u32,
    /// Instrument ID for this leg.
    pub instrument_id: String,
    /// Side for this leg.
    pub side: OrderSide,
    /// Quantity for this leg.
    pub quantity: Decimal,
    /// Filled quantity.
    pub filled_quantity: Decimal,
    /// Average fill price.
    pub avg_fill_price: Decimal,
    /// Leg-specific status.
    pub status: OrderStatus,
}

/// Complete order state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderState {
    /// Cream internal order ID.
    pub order_id: String,
    /// Broker's order ID.
    pub broker_order_id: String,
    /// Whether this is a multi-leg order.
    pub is_multi_leg: bool,
    /// Instrument ID (for single-leg orders).
    pub instrument_id: String,
    /// Order status.
    pub status: OrderStatus,
    /// Order side.
    pub side: OrderSide,
    /// Order type.
    pub order_type: OrderType,
    /// Time in force.
    pub time_in_force: TimeInForce,
    /// Requested quantity.
    pub requested_quantity: Decimal,
    /// Filled quantity.
    pub filled_quantity: Decimal,
    /// Average fill price.
    pub avg_fill_price: Decimal,
    /// Limit price (if applicable).
    pub limit_price: Option<Decimal>,
    /// Stop price (if applicable).
    pub stop_price: Option<Decimal>,
    /// Submission timestamp (ISO 8601).
    pub submitted_at: String,
    /// Last update timestamp (ISO 8601).
    pub last_update_at: String,
    /// Status message from broker.
    pub status_message: String,
    /// Legs for multi-leg orders.
    pub legs: Vec<OrderLegState>,
}

/// Request to submit orders.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubmitOrdersRequest {
    /// Trading cycle ID.
    pub cycle_id: String,
    /// Target environment.
    pub environment: Environment,
    /// Decision plan to execute.
    pub plan: DecisionPlan,
}

/// Execution acknowledgment response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionAck {
    /// Cycle ID.
    pub cycle_id: String,
    /// Environment.
    pub environment: Environment,
    /// Acknowledgment timestamp (ISO 8601).
    pub ack_time: String,
    /// Order states.
    pub orders: Vec<OrderState>,
    /// Execution errors.
    pub errors: Vec<ExecutionError>,
}

/// Execution error details.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionError {
    /// Error code.
    pub code: String,
    /// Error message.
    pub message: String,
    /// Related instrument ID (if applicable).
    pub instrument_id: String,
    /// Related order ID (if applicable).
    pub order_id: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_order_status_terminal() {
        assert!(OrderStatus::Filled.is_terminal());
        assert!(OrderStatus::Canceled.is_terminal());
        assert!(OrderStatus::Rejected.is_terminal());
        assert!(!OrderStatus::New.is_terminal());
        assert!(!OrderStatus::Accepted.is_terminal());
    }

    #[test]
    fn test_order_status_active() {
        assert!(OrderStatus::New.is_active());
        assert!(OrderStatus::Accepted.is_active());
        assert!(OrderStatus::PartiallyFilled.is_active());
        assert!(!OrderStatus::Filled.is_active());
    }
}
