//! Dependency Injection Container
//!
//! Manages creation and wiring of all application components.

use std::sync::Arc;

use crate::application::ports::{
    BrokerPort, EventPublisherPort, PriceFeedPort, RiskRepositoryPort,
};
use crate::application::use_cases::{
    CancelOrdersUseCase, MonitorStopsUseCase, ReconcileUseCase, SubmitOrdersUseCase,
    ValidateRiskUseCase,
};
use crate::domain::order_execution::repository::OrderRepository;

/// Dependency injection container.
///
/// Holds all wired dependencies for the application. Use `Container::builder()`
/// to construct with specific implementations.
pub struct Container<B, R, O, E, P>
where
    B: BrokerPort + 'static,
    R: RiskRepositoryPort + 'static,
    O: OrderRepository + 'static,
    E: EventPublisherPort + 'static,
    P: PriceFeedPort + 'static,
{
    // Ports
    broker: Arc<B>,
    risk_repo: Arc<R>,
    order_repo: Arc<O>,
    event_publisher: Arc<E>,
    price_feed: Arc<P>,
}

impl<B, R, O, E, P> Container<B, R, O, E, P>
where
    B: BrokerPort + 'static,
    R: RiskRepositoryPort + 'static,
    O: OrderRepository + 'static,
    E: EventPublisherPort + 'static,
    P: PriceFeedPort + 'static,
{
    /// Create a new container with all dependencies.
    pub fn new(
        broker: Arc<B>,
        risk_repo: Arc<R>,
        order_repo: Arc<O>,
        event_publisher: Arc<E>,
        price_feed: Arc<P>,
    ) -> Self {
        Self {
            broker,
            risk_repo,
            order_repo,
            event_publisher,
            price_feed,
        }
    }

    /// Get the broker port.
    pub fn broker(&self) -> Arc<B> {
        Arc::clone(&self.broker)
    }

    /// Get the risk repository port.
    pub fn risk_repo(&self) -> Arc<R> {
        Arc::clone(&self.risk_repo)
    }

    /// Get the order repository.
    pub fn order_repo(&self) -> Arc<O> {
        Arc::clone(&self.order_repo)
    }

    /// Get the event publisher port.
    pub fn event_publisher(&self) -> Arc<E> {
        Arc::clone(&self.event_publisher)
    }

    /// Get the price feed port.
    pub fn price_feed(&self) -> Arc<P> {
        Arc::clone(&self.price_feed)
    }

    /// Create a `SubmitOrdersUseCase`.
    pub fn submit_orders_use_case(&self) -> SubmitOrdersUseCase<B, R, O, E> {
        SubmitOrdersUseCase::new(
            Arc::clone(&self.broker),
            Arc::clone(&self.risk_repo),
            Arc::clone(&self.order_repo),
            Arc::clone(&self.event_publisher),
        )
    }

    /// Create a `ValidateRiskUseCase`.
    pub fn validate_risk_use_case(&self) -> ValidateRiskUseCase<R, O> {
        ValidateRiskUseCase::new(Arc::clone(&self.risk_repo), Arc::clone(&self.order_repo))
    }

    /// Create a `CancelOrdersUseCase`.
    pub fn cancel_orders_use_case(&self) -> CancelOrdersUseCase<B, O, E> {
        CancelOrdersUseCase::new(
            Arc::clone(&self.broker),
            Arc::clone(&self.order_repo),
            Arc::clone(&self.event_publisher),
        )
    }

    /// Create a `MonitorStopsUseCase`.
    pub fn monitor_stops_use_case(&self) -> MonitorStopsUseCase<B, P> {
        MonitorStopsUseCase::new(Arc::clone(&self.broker), Arc::clone(&self.price_feed))
    }

    /// Create a `ReconcileUseCase`.
    pub fn reconcile_use_case(&self) -> ReconcileUseCase<B, O> {
        ReconcileUseCase::new(Arc::clone(&self.broker), Arc::clone(&self.order_repo))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::ports::{
        BrokerError, InMemoryRiskRepository, NoOpEventPublisher, OrderAck, PriceFeedError, Quote,
    };
    use crate::domain::order_execution::aggregate::Order;
    use crate::domain::order_execution::errors::OrderError;
    use crate::domain::order_execution::value_objects::OrderStatus;
    use crate::domain::shared::{BrokerId, InstrumentId, OrderId, Symbol};
    use async_trait::async_trait;
    use rust_decimal::Decimal;
    use std::collections::HashMap;
    use std::sync::RwLock;

    // Mock implementations for testing
    struct MockBroker;

    #[async_trait]
    impl BrokerPort for MockBroker {
        async fn submit_order(
            &self,
            request: crate::application::ports::SubmitOrderRequest,
        ) -> Result<OrderAck, BrokerError> {
            Ok(OrderAck {
                broker_order_id: BrokerId::new("broker-123"),
                client_order_id: request.client_order_id,
                status: OrderStatus::Accepted,
                filled_qty: Decimal::ZERO,
                avg_fill_price: None,
            })
        }

        async fn cancel_order(
            &self,
            _request: crate::application::ports::CancelOrderRequest,
        ) -> Result<(), BrokerError> {
            Ok(())
        }

        async fn get_order(&self, _broker_order_id: &BrokerId) -> Result<OrderAck, BrokerError> {
            Err(BrokerError::OrderNotFound {
                order_id: "unknown".to_string(),
            })
        }

        async fn get_open_orders(&self) -> Result<Vec<OrderAck>, BrokerError> {
            Ok(vec![])
        }

        async fn get_buying_power(&self) -> Result<Decimal, BrokerError> {
            Ok(Decimal::new(100_000, 0))
        }

        async fn get_position(
            &self,
            _instrument_id: &InstrumentId,
        ) -> Result<Option<Decimal>, BrokerError> {
            Ok(None)
        }
    }

    struct MockOrderRepo {
        orders: RwLock<HashMap<String, Order>>,
    }

    impl MockOrderRepo {
        fn new() -> Self {
            Self {
                orders: RwLock::new(HashMap::new()),
            }
        }
    }

    #[async_trait]
    impl OrderRepository for MockOrderRepo {
        async fn save(&self, order: &Order) -> Result<(), OrderError> {
            let mut orders = self.orders.write().unwrap();
            orders.insert(order.id().to_string(), order.clone());
            Ok(())
        }

        async fn find_by_id(&self, id: &OrderId) -> Result<Option<Order>, OrderError> {
            let orders = self.orders.read().unwrap();
            Ok(orders.get(id.as_str()).cloned())
        }

        async fn find_by_broker_id(
            &self,
            _broker_id: &BrokerId,
        ) -> Result<Option<Order>, OrderError> {
            Ok(None)
        }

        async fn find_by_status(
            &self,
            status: crate::domain::order_execution::value_objects::OrderStatus,
        ) -> Result<Vec<Order>, OrderError> {
            let orders = self.orders.read().unwrap();
            Ok(orders
                .values()
                .filter(|o| o.status() == status)
                .cloned()
                .collect())
        }

        async fn find_active(&self) -> Result<Vec<Order>, OrderError> {
            let orders = self.orders.read().unwrap();
            Ok(orders
                .values()
                .filter(|o| !o.status().is_terminal())
                .cloned()
                .collect())
        }

        async fn exists(&self, id: &OrderId) -> Result<bool, OrderError> {
            let orders = self.orders.read().unwrap();
            Ok(orders.contains_key(id.as_str()))
        }

        async fn delete(&self, id: &OrderId) -> Result<(), OrderError> {
            let mut orders = self.orders.write().unwrap();
            orders.remove(id.as_str());
            Ok(())
        }
    }

    struct MockPriceFeed;

    #[async_trait]
    impl PriceFeedPort for MockPriceFeed {
        async fn get_quote(&self, symbol: &Symbol) -> Result<Quote, PriceFeedError> {
            Ok(Quote::new(
                symbol.clone(),
                Decimal::new(150, 0),
                Decimal::new(15001, 2),
                Decimal::new(100, 0),
                Decimal::new(100, 0),
            ))
        }

        async fn get_quotes(&self, symbols: &[Symbol]) -> Result<Vec<Quote>, PriceFeedError> {
            let mut quotes = vec![];
            for symbol in symbols {
                quotes.push(self.get_quote(symbol).await?);
            }
            Ok(quotes)
        }

        async fn subscribe(&self, _symbol: &Symbol) -> Result<(), PriceFeedError> {
            Ok(())
        }

        async fn unsubscribe(&self, _symbol: &Symbol) -> Result<(), PriceFeedError> {
            Ok(())
        }

        async fn get_last_price(
            &self,
            _instrument_id: &InstrumentId,
        ) -> Result<Decimal, PriceFeedError> {
            Ok(Decimal::new(150, 0))
        }
    }

    #[test]
    fn container_creation() {
        let broker = Arc::new(MockBroker);
        let risk_repo = Arc::new(InMemoryRiskRepository::new());
        let order_repo = Arc::new(MockOrderRepo::new());
        let event_publisher = Arc::new(NoOpEventPublisher);
        let price_feed = Arc::new(MockPriceFeed);

        let container = Container::new(broker, risk_repo, order_repo, event_publisher, price_feed);

        // Verify we can get all ports
        let _ = container.broker();
        let _ = container.risk_repo();
        let _ = container.order_repo();
        let _ = container.event_publisher();
        let _ = container.price_feed();
    }

    #[test]
    fn container_creates_use_cases() {
        let broker = Arc::new(MockBroker);
        let risk_repo = Arc::new(InMemoryRiskRepository::new());
        let order_repo = Arc::new(MockOrderRepo::new());
        let event_publisher = Arc::new(NoOpEventPublisher);
        let price_feed = Arc::new(MockPriceFeed);

        let container = Container::new(broker, risk_repo, order_repo, event_publisher, price_feed);

        // Verify use case creation doesn't panic
        let _ = container.submit_orders_use_case();
        let _ = container.validate_risk_use_case();
        let _ = container.cancel_orders_use_case();
        let _ = container.monitor_stops_use_case();
        let _ = container.reconcile_use_case();
    }
}
