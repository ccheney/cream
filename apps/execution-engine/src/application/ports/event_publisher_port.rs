//! Event Publisher Port (Driven Port)
//!
//! Interface for publishing domain events to external systems.

use async_trait::async_trait;

use crate::domain::order_execution::events::OrderEvent;

/// Event publishing error.
#[derive(Debug, Clone, thiserror::Error)]
pub enum EventPublishError {
    /// Connection error.
    #[error("Event publish connection error: {message}")]
    ConnectionError { message: String },

    /// Serialization error.
    #[error("Event serialization error: {message}")]
    SerializationError { message: String },

    /// Publishing failed.
    #[error("Event publish failed: {message}")]
    PublishFailed { message: String },
}

/// Port for publishing domain events.
#[async_trait]
pub trait EventPublisherPort: Send + Sync {
    /// Publish order events.
    async fn publish_order_events(&self, events: Vec<OrderEvent>) -> Result<(), EventPublishError>;

    /// Publish a single order event.
    async fn publish_order_event(&self, event: OrderEvent) -> Result<(), EventPublishError> {
        self.publish_order_events(vec![event]).await
    }
}

/// No-op event publisher for testing.
#[derive(Debug, Clone, Default)]
pub struct NoOpEventPublisher;

#[async_trait]
impl EventPublisherPort for NoOpEventPublisher {
    async fn publish_order_events(
        &self,
        _events: Vec<OrderEvent>,
    ) -> Result<(), EventPublishError> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::order_execution::events::{OrderEvent, OrderSubmitted};
    use crate::domain::order_execution::value_objects::OrderSide;
    use crate::domain::shared::{OrderId, Quantity, Symbol, Timestamp};

    #[tokio::test]
    async fn no_op_publisher_succeeds() {
        let publisher = NoOpEventPublisher;

        let event = OrderEvent::Submitted(OrderSubmitted {
            order_id: OrderId::new("order-1"),
            symbol: Symbol::new("AAPL"),
            side: OrderSide::Buy,
            quantity: Quantity::from_i64(100),
            limit_price: None,
            occurred_at: Timestamp::now(),
        });

        let result = publisher.publish_order_event(event).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn no_op_publisher_multiple_events() {
        let publisher = NoOpEventPublisher;

        let events = vec![
            OrderEvent::Submitted(OrderSubmitted {
                order_id: OrderId::new("order-1"),
                symbol: Symbol::new("AAPL"),
                side: OrderSide::Buy,
                quantity: Quantity::from_i64(100),
                limit_price: None,
                occurred_at: Timestamp::now(),
            }),
            OrderEvent::Submitted(OrderSubmitted {
                order_id: OrderId::new("order-2"),
                symbol: Symbol::new("GOOGL"),
                side: OrderSide::Sell,
                quantity: Quantity::from_i64(50),
                limit_price: None,
                occurred_at: Timestamp::now(),
            }),
        ];

        let result = publisher.publish_order_events(events).await;
        assert!(result.is_ok());
    }
}
