//! Broker Port (Driven Port)
//!
//! Interface for interacting with a brokerage for order execution.

use async_trait::async_trait;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::domain::order_execution::value_objects::{
    OrderSide, OrderStatus, OrderType, TimeInForce,
};
use crate::domain::shared::{BrokerId, InstrumentId, OrderId, Symbol};

/// Request to submit an order to the broker.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubmitOrderRequest {
    /// Client order ID.
    pub client_order_id: OrderId,
    /// Symbol to trade.
    pub symbol: Symbol,
    /// Order side.
    pub side: OrderSide,
    /// Order type.
    pub order_type: OrderType,
    /// Quantity.
    pub quantity: Decimal,
    /// Limit price (for limit orders).
    pub limit_price: Option<Decimal>,
    /// Stop price (for stop orders).
    pub stop_price: Option<Decimal>,
    /// Time in force.
    pub time_in_force: TimeInForce,
    /// Extended hours trading.
    pub extended_hours: bool,
}

impl SubmitOrderRequest {
    /// Create a market order request.
    #[must_use]
    pub const fn market(
        client_order_id: OrderId,
        symbol: Symbol,
        side: OrderSide,
        quantity: Decimal,
    ) -> Self {
        Self {
            client_order_id,
            symbol,
            side,
            order_type: OrderType::Market,
            quantity,
            limit_price: None,
            stop_price: None,
            time_in_force: TimeInForce::Day,
            extended_hours: false,
        }
    }

    /// Create a limit order request.
    #[must_use]
    pub const fn limit(
        client_order_id: OrderId,
        symbol: Symbol,
        side: OrderSide,
        quantity: Decimal,
        limit_price: Decimal,
    ) -> Self {
        Self {
            client_order_id,
            symbol,
            side,
            order_type: OrderType::Limit,
            quantity,
            limit_price: Some(limit_price),
            stop_price: None,
            time_in_force: TimeInForce::Day,
            extended_hours: false,
        }
    }

    /// Set time in force.
    #[must_use]
    pub const fn with_time_in_force(mut self, tif: TimeInForce) -> Self {
        self.time_in_force = tif;
        self
    }

    /// Enable extended hours.
    #[must_use]
    pub const fn with_extended_hours(mut self) -> Self {
        self.extended_hours = true;
        self
    }
}

/// Request to cancel an order.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CancelOrderRequest {
    /// Broker order ID (primary).
    pub broker_order_id: Option<BrokerId>,
    /// Client order ID (fallback).
    pub client_order_id: Option<OrderId>,
}

impl CancelOrderRequest {
    /// Create a cancel request by broker ID.
    #[must_use]
    pub const fn by_broker_id(broker_order_id: BrokerId) -> Self {
        Self {
            broker_order_id: Some(broker_order_id),
            client_order_id: None,
        }
    }

    /// Create a cancel request by client ID.
    #[must_use]
    pub const fn by_client_id(client_order_id: OrderId) -> Self {
        Self {
            broker_order_id: None,
            client_order_id: Some(client_order_id),
        }
    }
}

/// Acknowledgment from broker after order submission.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderAck {
    /// Broker-assigned order ID.
    pub broker_order_id: BrokerId,
    /// Client order ID echoed back.
    pub client_order_id: OrderId,
    /// Current status.
    pub status: OrderStatus,
    /// Filled quantity (if any).
    pub filled_qty: Decimal,
    /// Average fill price (if any).
    pub avg_fill_price: Option<Decimal>,
}

/// Broker port error.
#[derive(Debug, Clone, thiserror::Error)]
pub enum BrokerError {
    /// Connection error.
    #[error("Broker connection error: {message}")]
    ConnectionError {
        /// Error details.
        message: String,
    },

    /// Order rejected by broker.
    #[error("Order rejected: {reason}")]
    OrderRejected {
        /// Rejection reason.
        reason: String,
    },

    /// Order not found.
    #[error("Order not found: {order_id}")]
    OrderNotFound {
        /// The missing order ID.
        order_id: String,
    },

    /// Insufficient funds.
    #[error("Insufficient buying power")]
    InsufficientFunds,

    /// Rate limited.
    #[error("Rate limited by broker")]
    RateLimited,

    /// Unknown error.
    #[error("Broker error: {message}")]
    Unknown {
        /// Error details.
        message: String,
    },
}

/// Port for broker interactions.
#[async_trait]
pub trait BrokerPort: Send + Sync {
    /// Submit an order to the broker.
    async fn submit_order(&self, request: SubmitOrderRequest) -> Result<OrderAck, BrokerError>;

    /// Cancel an order.
    async fn cancel_order(&self, request: CancelOrderRequest) -> Result<(), BrokerError>;

    /// Get order status.
    async fn get_order(&self, broker_order_id: &BrokerId) -> Result<OrderAck, BrokerError>;

    /// Get all open orders.
    async fn get_open_orders(&self) -> Result<Vec<OrderAck>, BrokerError>;

    /// Get account buying power.
    async fn get_buying_power(&self) -> Result<Decimal, BrokerError>;

    /// Get current position for an instrument.
    async fn get_position(
        &self,
        instrument_id: &InstrumentId,
    ) -> Result<Option<Decimal>, BrokerError>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn submit_order_request_market() {
        let request = SubmitOrderRequest::market(
            OrderId::new("order-1"),
            Symbol::new("AAPL"),
            OrderSide::Buy,
            Decimal::new(100, 0),
        );

        assert_eq!(request.order_type, OrderType::Market);
        assert!(request.limit_price.is_none());
        assert_eq!(request.time_in_force, TimeInForce::Day);
    }

    #[test]
    fn submit_order_request_limit() {
        let request = SubmitOrderRequest::limit(
            OrderId::new("order-1"),
            Symbol::new("AAPL"),
            OrderSide::Buy,
            Decimal::new(100, 0),
            Decimal::new(150, 0),
        );

        assert_eq!(request.order_type, OrderType::Limit);
        assert_eq!(request.limit_price, Some(Decimal::new(150, 0)));
    }

    #[test]
    fn submit_order_request_with_tif() {
        let request = SubmitOrderRequest::market(
            OrderId::new("order-1"),
            Symbol::new("AAPL"),
            OrderSide::Buy,
            Decimal::new(100, 0),
        )
        .with_time_in_force(TimeInForce::Gtc);

        assert_eq!(request.time_in_force, TimeInForce::Gtc);
    }

    #[test]
    fn submit_order_request_with_extended_hours() {
        let request = SubmitOrderRequest::market(
            OrderId::new("order-1"),
            Symbol::new("AAPL"),
            OrderSide::Buy,
            Decimal::new(100, 0),
        )
        .with_extended_hours();

        assert!(request.extended_hours);
    }

    #[test]
    fn cancel_order_request_by_broker_id() {
        let request = CancelOrderRequest::by_broker_id(BrokerId::new("broker-123"));
        assert!(request.broker_order_id.is_some());
        assert!(request.client_order_id.is_none());
    }

    #[test]
    fn cancel_order_request_by_client_id() {
        let request = CancelOrderRequest::by_client_id(OrderId::new("order-1"));
        assert!(request.broker_order_id.is_none());
        assert!(request.client_order_id.is_some());
    }
}
