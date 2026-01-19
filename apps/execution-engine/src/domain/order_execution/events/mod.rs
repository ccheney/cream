//! Domain events for order execution.
//!
//! Events capture state transitions and enable event-driven architectures.

use serde::{Deserialize, Serialize};

use super::value_objects::{CancelReason, OrderSide, RejectReason};
use crate::domain::shared::{BrokerId, Money, OrderId, Quantity, Symbol, Timestamp};

/// All possible order events.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OrderEvent {
    /// Order submitted for execution.
    Submitted(OrderSubmitted),
    /// Order accepted by broker.
    Accepted(OrderAccepted),
    /// Order partially filled.
    PartiallyFilled(OrderPartiallyFilled),
    /// Order completely filled.
    Filled(OrderFilled),
    /// Order canceled.
    Canceled(OrderCanceled),
    /// Order rejected by broker.
    Rejected(OrderRejected),
}

impl OrderEvent {
    /// Get the order ID for this event.
    #[must_use]
    pub fn order_id(&self) -> &OrderId {
        match self {
            Self::Submitted(e) => &e.order_id,
            Self::Accepted(e) => &e.order_id,
            Self::PartiallyFilled(e) => &e.order_id,
            Self::Filled(e) => &e.order_id,
            Self::Canceled(e) => &e.order_id,
            Self::Rejected(e) => &e.order_id,
        }
    }

    /// Get the timestamp when this event occurred.
    #[must_use]
    pub fn occurred_at(&self) -> Timestamp {
        match self {
            Self::Submitted(e) => e.occurred_at,
            Self::Accepted(e) => e.occurred_at,
            Self::PartiallyFilled(e) => e.occurred_at,
            Self::Filled(e) => e.occurred_at,
            Self::Canceled(e) => e.occurred_at,
            Self::Rejected(e) => e.occurred_at,
        }
    }

    /// Get the event type name.
    #[must_use]
    pub const fn event_type(&self) -> &'static str {
        match self {
            Self::Submitted(_) => "ORDER_SUBMITTED",
            Self::Accepted(_) => "ORDER_ACCEPTED",
            Self::PartiallyFilled(_) => "ORDER_PARTIALLY_FILLED",
            Self::Filled(_) => "ORDER_FILLED",
            Self::Canceled(_) => "ORDER_CANCELED",
            Self::Rejected(_) => "ORDER_REJECTED",
        }
    }
}

/// Event: Order submitted for execution.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OrderSubmitted {
    /// Order ID.
    pub order_id: OrderId,
    /// Symbol.
    pub symbol: Symbol,
    /// Side.
    pub side: OrderSide,
    /// Quantity.
    pub quantity: Quantity,
    /// Limit price (if applicable).
    pub limit_price: Option<Money>,
    /// When the event occurred.
    pub occurred_at: Timestamp,
}

/// Event: Order accepted by broker.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OrderAccepted {
    /// Order ID.
    pub order_id: OrderId,
    /// Broker's order ID.
    pub broker_order_id: BrokerId,
    /// When the event occurred.
    pub occurred_at: Timestamp,
}

/// Event: Order partially filled.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OrderPartiallyFilled {
    /// Order ID.
    pub order_id: OrderId,
    /// Fill quantity for this execution.
    pub fill_quantity: Quantity,
    /// Fill price for this execution.
    pub fill_price: Money,
    /// Cumulative quantity filled.
    pub cumulative_quantity: Quantity,
    /// Remaining quantity to fill.
    pub leaves_quantity: Quantity,
    /// Volume-weighted average price.
    pub vwap: Money,
    /// When the event occurred.
    pub occurred_at: Timestamp,
}

/// Event: Order completely filled.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OrderFilled {
    /// Order ID.
    pub order_id: OrderId,
    /// Total quantity filled.
    pub total_quantity: Quantity,
    /// Average fill price (VWAP).
    pub average_price: Money,
    /// When the event occurred.
    pub occurred_at: Timestamp,
}

/// Event: Order canceled.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OrderCanceled {
    /// Order ID.
    pub order_id: OrderId,
    /// Reason for cancellation.
    pub reason: CancelReason,
    /// Quantity that was filled before cancellation.
    pub filled_quantity: Quantity,
    /// When the event occurred.
    pub occurred_at: Timestamp,
}

/// Event: Order rejected by broker.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OrderRejected {
    /// Order ID.
    pub order_id: OrderId,
    /// Reason for rejection.
    pub reason: RejectReason,
    /// When the event occurred.
    pub occurred_at: Timestamp,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn order_event_order_id() {
        let event = OrderEvent::Submitted(OrderSubmitted {
            order_id: OrderId::new("ord-123"),
            symbol: Symbol::new("AAPL"),
            side: OrderSide::Buy,
            quantity: Quantity::from_i64(100),
            limit_price: Some(Money::usd(150.00)),
            occurred_at: Timestamp::now(),
        });

        assert_eq!(event.order_id().as_str(), "ord-123");
    }

    #[test]
    fn order_event_type() {
        let event = OrderEvent::Filled(OrderFilled {
            order_id: OrderId::new("ord-123"),
            total_quantity: Quantity::from_i64(100),
            average_price: Money::usd(150.00),
            occurred_at: Timestamp::now(),
        });

        assert_eq!(event.event_type(), "ORDER_FILLED");
    }

    #[test]
    fn order_event_serde() {
        let event = OrderEvent::Accepted(OrderAccepted {
            order_id: OrderId::new("ord-123"),
            broker_order_id: BrokerId::new("broker-456"),
            occurred_at: Timestamp::now(),
        });

        let json = serde_json::to_string(&event).unwrap();
        // Serde's rename_all = "SCREAMING_SNAKE_CASE" produces "ACCEPTED" for the variant
        assert!(json.contains("ACCEPTED"));

        let parsed: OrderEvent = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.order_id().as_str(), "ord-123");
    }

    #[test]
    fn order_submitted_event() {
        let event = OrderSubmitted {
            order_id: OrderId::new("ord-123"),
            symbol: Symbol::new("AAPL"),
            side: OrderSide::Buy,
            quantity: Quantity::from_i64(100),
            limit_price: None,
            occurred_at: Timestamp::now(),
        };

        assert_eq!(event.symbol.as_str(), "AAPL");
        assert_eq!(event.side, OrderSide::Buy);
    }

    #[test]
    fn order_partially_filled_event() {
        let event = OrderPartiallyFilled {
            order_id: OrderId::new("ord-123"),
            fill_quantity: Quantity::from_i64(50),
            fill_price: Money::usd(150.00),
            cumulative_quantity: Quantity::from_i64(50),
            leaves_quantity: Quantity::from_i64(50),
            vwap: Money::usd(150.00),
            occurred_at: Timestamp::now(),
        };

        assert_eq!(event.fill_quantity, Quantity::from_i64(50));
        assert_eq!(event.leaves_quantity, Quantity::from_i64(50));
    }

    #[test]
    fn order_canceled_event() {
        let event = OrderCanceled {
            order_id: OrderId::new("ord-123"),
            reason: CancelReason::user_requested(),
            filled_quantity: Quantity::from_i64(25),
            occurred_at: Timestamp::now(),
        };

        assert_eq!(event.reason.code, "USER_REQUESTED");
    }

    #[test]
    fn order_rejected_event() {
        let event = OrderRejected {
            order_id: OrderId::new("ord-123"),
            reason: RejectReason::insufficient_buying_power(),
            occurred_at: Timestamp::now(),
        };

        assert_eq!(event.reason.code, "INSUFFICIENT_BUYING_POWER");
    }
}
